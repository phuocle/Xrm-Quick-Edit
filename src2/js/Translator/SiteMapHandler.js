(function (SiteMapHandler, undefined) {
    "use strict";

    var siteMapData = [];
    var idSeparator = "|";

    function getDirectChildren(parent, tagName) {
        var results = [];
        if (!parent) {
            return results;
        }

        for (var i = 0; i < parent.childNodes.length; i++) {
            var child = parent.childNodes[i];
            if (child.nodeType === 1 && child.nodeName === tagName) {
                results.push(child);
            }
        }
        return results;
    }

    function extractLabels(node, containerTag, itemTag, attrName) {
        var labels = [];
        var containers = getDirectChildren(node, containerTag);
        if (containers.length > 0) {
            var items = containers[0].getElementsByTagName(itemTag);
            for (var i = 0; i < items.length; i++) {
                labels.push({
                    lcid: items[i].getAttribute("LCID"),
                    text: items[i].getAttribute(attrName)
                });
            }
        }
        return labels;
    }

    function ParseSiteMapXml(xmlString) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(xmlString, "text/xml");
        var results = [];

        var areas = doc.getElementsByTagName("Area");
        for (var a = 0; a < areas.length; a++) {
            var area = areas[a];
            var areaId = area.getAttribute("Id");
            results.push({
                id: areaId,
                compositeId: areaId,
                nodeType: "Area",
                type: "Area",
                defaultTitle: area.getAttribute("Title") || "",
                titles: extractLabels(area, "Titles", "Title", "Title"),
                descriptions: extractLabels(area, "Descriptions", "Description", "Description")
            });

            var groups = getDirectChildren(area, "Group");
            for (var g = 0; g < groups.length; g++) {
                var group = groups[g];
                var groupId = group.getAttribute("Id");
                results.push({
                    id: groupId,
                    compositeId: areaId + idSeparator + groupId,
                    nodeType: "Group",
                    type: "Group",
                    defaultTitle: group.getAttribute("Title") || "",
                    titles: extractLabels(group, "Titles", "Title", "Title"),
                    descriptions: extractLabels(group, "Descriptions", "Description", "Description")
                });

                var subAreas = getDirectChildren(group, "SubArea");
                for (var s = 0; s < subAreas.length; s++) {
                    var subArea = subAreas[s];
                    var subAreaId = subArea.getAttribute("Id");
                    results.push({
                        id: subAreaId,
                        compositeId: areaId + idSeparator + groupId + idSeparator + subAreaId,
                        nodeType: "SubArea",
                        type: "SubArea",
                        defaultTitle: subArea.getAttribute("Title") || "",
                        entity: subArea.getAttribute("Entity") || "",
                        titles: extractLabels(subArea, "Titles", "Title", "Title"),
                        descriptions: extractLabels(subArea, "Descriptions", "Description", "Description")
                    });
                }
            }
        }

        return results;
    }

    function findDirectChildById(parent, tagName, id) {
        var children = getDirectChildren(parent, tagName);
        for (var i = 0; i < children.length; i++) {
            if (children[i].getAttribute("Id") === id) {
                return children[i];
            }
        }

        return null;
    }

    function findSiteMapNodeByCompositeId(doc, update) {
        if (!update.compositeId) {
            return null;
        }

        var parts = String(update.compositeId).split(idSeparator);
        var area = findDirectChildById(doc.documentElement, "Area", parts[0]);
        if (!area || update.nodeType === "Area") {
            return area;
        }

        var group = findDirectChildById(area, "Group", parts[1]);
        if (!group || update.nodeType === "Group") {
            return group;
        }

        return findDirectChildById(group, "SubArea", parts[2]);
    }

    function findSiteMapNodeById(doc, update) {
        var allNodes = doc.getElementsByTagName(update.nodeType);

        for (var n = 0; n < allNodes.length; n++) {
            if (allNodes[n].getAttribute("Id") === update.id) {
                return allNodes[n];
            }
        }

        return null;
    }

    function findSiteMapNode(doc, update) {
        return findSiteMapNodeByCompositeId(doc, update) || findSiteMapNodeById(doc, update);
    }

    function ApplyXmlUpdates(xmlString, updates) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(xmlString, "text/xml");
        var serializer = new XMLSerializer();
        var component = XrmTranslator.GetComponent();

        for (var u = 0; u < updates.length; u++) {
            var update = updates[u];
            var node = findSiteMapNode(doc, update);
            if (!node) {
                continue;
            }

            var isTitle = component === "DisplayName";
            var containerTag = isTitle ? "Titles" : "Descriptions";
            var itemTag = isTitle ? "Title" : "Description";
            var attrName = isTitle ? "Title" : "Description";

            var containers = getDirectChildren(node, containerTag);
            var container = containers.length > 0 ? containers[0] : null;
            if (!container) {
                container = doc.createElement(containerTag);
                node.insertBefore(container, node.firstChild);
            }

            for (var l = 0; l < update.labels.length; l++) {
                var label = update.labels[l];
                var existing = null;
                var elements = container.getElementsByTagName(itemTag);
                for (var e = 0; e < elements.length; e++) {
                    if (elements[e].getAttribute("LCID") === label.lcid) {
                        existing = elements[e];
                        break;
                    }
                }
                if (existing) {
                    existing.setAttribute(attrName, label.text);
                } else {
                    var newEl = doc.createElement(itemTag);
                    newEl.setAttribute("LCID", label.lcid);
                    newEl.setAttribute(attrName, label.text);
                    container.appendChild(newEl);
                }
            }
        }

        return serializer.serializeToString(doc);
    }

    function getSiteMapRecordId(sitemapId, compositeId) {
        return sitemapId + idSeparator + compositeId;
    }

    function FillSiteMapNodeRecord(record, node, component) {
        var labels = component === "DisplayName" ? node.titles : node.descriptions;
        if (labels && labels.length > 0) {
            for (var l = 0; l < labels.length; l++) {
                record[labels[l].lcid] = labels[l].text;
            }
        } else if (component === "DisplayName" && node.entityLabels) {
            var installedLangs = XrmTranslator.installedLanguages.LocaleIds;
            for (var il = 0; il < installedLangs.length; il++) {
                var langStr = installedLangs[il].toString();
                if (node.entityLabels[langStr]) {
                    record[langStr] = node.entityLabels[langStr];
                }
            }
        } else if (component === "DisplayName" && node.defaultTitle) {
            var defaultLangs = XrmTranslator.installedLanguages.LocaleIds;
            for (var dl = 0; dl < defaultLangs.length; dl++) {
                record[defaultLangs[dl].toString()] = node.defaultTitle;
            }
        }
    }

    function FillTable() {
        var grid = XrmTranslator.GetGrid();
        grid.clear();
        var records = [];
        var component = XrmTranslator.GetComponent();

        if (!siteMapData || siteMapData.length === 0) {
            grid.unlock();
            return;
        }

        for (var sm = 0; sm < siteMapData.length; sm++) {
            var currentSiteMap = siteMapData[sm];
            var parent = {
                recid: currentSiteMap.sitemapid,
                schemaName: GetSiteMapDisplayName(currentSiteMap),
                _isGroupNode: true,
                w2ui: {
                    editable: false,
                    children: []
                }
            };

            var nodes = currentSiteMap.nodes || [];

            for (var n = 0; n < nodes.length; n++) {
                var node = nodes[n];
                var record = {
                    recid: getSiteMapRecordId(currentSiteMap.sitemapid, node.compositeId),
                    schemaName: "[" + node.type + "] " + node.id + (node.entity ? " (" + node.entity + ")" : ""),
                    _siteMapId: currentSiteMap.sitemapid,
                    _siteMapCompositeId: node.compositeId
                };

                FillSiteMapNodeRecord(record, node, component);
                parent.w2ui.children.push(record);
            }

            records.push(parent);
        }

        XrmTranslator.AddSummary(records);
        grid.add(records);
        grid.unlock();
    }

    function BuildSiteMapData(sitemaps) {
        var parsedSitemaps = [];
        var entityNames = [];

        for (var i = 0; i < sitemaps.length; i++) {
            var sm = sitemaps[i];
            if (!sm || !sm.sitemapxml) {
                continue;
            }

            var nodes = [];
            try {
                nodes = ParseSiteMapXml(sm.sitemapxml);
            } catch (e) {
                continue;
            }

            for (var n = 0; n < nodes.length; n++) {
                if (nodes[n].entity && entityNames.indexOf(nodes[n].entity) === -1) {
                    entityNames.push(nodes[n].entity);
                }
            }

            parsedSitemaps.push({
                sitemapid: sm.sitemapid,
                sitemapname: sm.sitemapname,
                sitemapxml: sm.sitemapxml,
                nodes: nodes
            });
        }

        siteMapData = parsedSitemaps;

        if (entityNames.length === 0) {
            FillTable();
            return WebApiClient.Promise.resolve();
        }

        var filterParts = entityNames.map(function (name) {
            return "LogicalName eq '" + name + "'";
        });

        return WebApiClient.Retrieve({
            overriddenSetName: "EntityDefinitions",
            queryParams: "?$select=LogicalName,DisplayName&$filter=" + filterParts.join(" or ")
        })
        .then(function (response) {
            var entityMap = {};
            var entities = response.value || [];
            for (var e = 0; e < entities.length; e++) {
                var ent = entities[e];
                if (ent.DisplayName && ent.DisplayName.LocalizedLabels) {
                    var labels = {};
                    for (var l = 0; l < ent.DisplayName.LocalizedLabels.length; l++) {
                        var ll = ent.DisplayName.LocalizedLabels[l];
                        labels[ll.LanguageCode.toString()] = ll.Label;
                    }
                    entityMap[ent.LogicalName] = labels;
                }
            }

            for (var sm = 0; sm < siteMapData.length; sm++) {
                for (var i = 0; i < siteMapData[sm].nodes.length; i++) {
                    var node = siteMapData[sm].nodes[i];
                    if (node.entity && entityMap[node.entity]) {
                        node.entityLabels = entityMap[node.entity];
                    }
                }
            }

            FillTable();
        })
        .catch(function () {
            FillTable();
        });
    }

    function GetCleanText(value) {
        if (value === null || typeof value === "undefined") {
            return "";
        }

        return String(value).trim();
    }

    function GetNodeDisplayValue(node) {
        return GetCleanText(node.getAttribute("Title")) ||
            GetCleanText(node.getAttribute("Id")) ||
            GetCleanText(node.getAttribute("ResourceId")) ||
            GetCleanText(node.getAttribute("Entity"));
    }

    function GetSiteMapLogicalName(sitemap) {
        if (!sitemap || !sitemap.sitemapxml) {
            return "";
        }

        try {
            var doc = new DOMParser().parseFromString(sitemap.sitemapxml, "application/xml");
            var areas = doc.getElementsByTagName("Area");
            var names = [];

            for (var i = 0; i < areas.length && names.length < 3; i++) {
                var name = GetNodeDisplayValue(areas[i]);

                if (name && names.indexOf(name) === -1) {
                    names.push(name);
                }
            }

            if (names.length > 0) {
                return names.join(", ");
            }
        }
        catch (e) {
            return "";
        }

        return "";
    }

    function GetSiteMapDisplayName(sitemap) {
        return GetCleanText(sitemap.sitemapname) ||
            GetSiteMapLogicalName(sitemap) ||
            "Unnamed SiteMap";
    }

    SiteMapHandler.Load = function () {
        siteMapData = [];
        SiteMapHandler.lastId = null;

        var solutionId = XrmTranslator.GetSolution();

        var sitemapPromise;

        if (solutionId && solutionId !== "all") {
            // Get sitemaps from solution components
            sitemapPromise = WebApiClient.Retrieve({
                overriddenSetName: "solutioncomponents",
                queryParams: "?$select=objectid&$filter=_solutionid_value eq " + solutionId + " and componenttype eq 62"
            })
            .then(function (response) {
                var componentIds = (response.value || []).map(function (c) { return c.objectid; });
                if (componentIds.length === 0) {
                    return { value: [] };
                }

                var filterParts = componentIds.map(function (id) { return "sitemapid eq " + id; });
                return WebApiClient.Retrieve({
                    entityName: "sitemap",
                    queryParams: "?$select=sitemapid,sitemapname,sitemapxml&$filter=" + filterParts.join(" or ")
                });
            });
        } else {
            // No solution selected — load all sitemaps
            XrmTranslator.UnlockGrid();
            return DialogHelper.alert("Please select a solution before loading sitemaps.");
        }

        return sitemapPromise
            .then(function (response) {
                var sitemaps = response.value || [];

                if (sitemaps.length === 0) {
                    XrmTranslator.UnlockGrid();
                    return DialogHelper.alert("No sitemaps found" + (solutionId && solutionId !== "all" ? " in the selected solution." : "."));
                }

                return BuildSiteMapData(sitemaps);
            })
            .catch(XrmTranslator.errorHandler);
    };

    function GetLoadedSiteMapData(siteMapId) {
        for (var i = 0; i < siteMapData.length; i++) {
            if (siteMapData[i].sitemapid === siteMapId) {
                return siteMapData[i];
            }
        }

        return null;
    }

    function GetLoadedSiteMapNode(siteMap, compositeId) {
        if (!siteMap || !siteMap.nodes) {
            return null;
        }

        for (var i = 0; i < siteMap.nodes.length; i++) {
            if (siteMap.nodes[i].compositeId === compositeId) {
                return siteMap.nodes[i];
            }
        }

        return null;
    }

    SiteMapHandler.Save = function () {
        XrmTranslator.LockGrid("Saving");

        if (!siteMapData || siteMapData.length === 0) {
            XrmTranslator.UnlockGrid();
            return;
        }

        var records = XrmTranslator.GetAllRecords();
        var updatesBySiteMap = {};
        var processedRecords = {};

        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            if (!record._siteMapId || !record.w2ui || !record.w2ui.changes || processedRecords[record.recid]) {
                continue;
            }

            processedRecords[record.recid] = true;

            var siteMap = GetLoadedSiteMapData(record._siteMapId);
            var nodeInfo = GetLoadedSiteMapNode(siteMap, record._siteMapCompositeId);
            if (!siteMap || !nodeInfo) {
                continue;
            }

            var changes = record.w2ui.changes;
            var installedLangs = XrmTranslator.installedLanguages.LocaleIds;
            var labels = [];

            // Include all language values (original + changed) so defaults are saved too.
            for (var il = 0; il < installedLangs.length; il++) {
                var lang = installedLangs[il].toString();
                var text = changes.hasOwnProperty(lang) ? changes[lang] : record[lang];
                if (text) {
                    labels.push({ lcid: lang, text: text });
                }
            }

            if (labels.length > 0) {
                if (!updatesBySiteMap[siteMap.sitemapid]) {
                    updatesBySiteMap[siteMap.sitemapid] = [];
                }

                updatesBySiteMap[siteMap.sitemapid].push({
                    id: nodeInfo.id,
                    compositeId: nodeInfo.compositeId,
                    nodeType: nodeInfo.nodeType,
                    labels: labels
                });
            }
        }

        var updatedSiteMapIds = Object.keys(updatesBySiteMap);
        if (updatedSiteMapIds.length === 0) {
            XrmTranslator.UnlockGrid();
            return;
        }

        var saveChain = WebApiClient.Promise.resolve();

        for (var s = 0; s < updatedSiteMapIds.length; s++) {
            (function(siteMapId, index) {
                saveChain = saveChain.then(function() {
                    var currentSiteMap = GetLoadedSiteMapData(siteMapId);
                    var updatedXml = ApplyXmlUpdates(currentSiteMap.sitemapxml, updatesBySiteMap[siteMapId]);

                    XrmTranslator.LockGridProgress("Saving sitemaps", index + 1, updatedSiteMapIds.length);

                    return WebApiClient.Update({
                        entityName: "sitemap",
                        entityId: currentSiteMap.sitemapid,
                        entity: {
                            sitemapxml: updatedXml
                        }
                    })
                    .then(function() {
                        currentSiteMap.sitemapxml = updatedXml;
                    });
                });
            })(updatedSiteMapIds[s], s);
        }

        return saveChain
        .then(function () {
            XrmTranslator.LockGrid("Publishing");
            return XrmTranslator.RunAsBaseLanguage(function () {
                return WebApiClient.Execute(WebApiClient.Requests.PublishAllXmlRequest);
            });
        })
        .then(function () {
            return XrmTranslator.AddToSolution(
                updatedSiteMapIds,
                XrmTranslator.ComponentType.SiteMap
            );
        })
        .then(function () {
            XrmTranslator.LockGrid("Reloading");
            return SiteMapHandler.Load();
        })
        .catch(XrmTranslator.errorHandler);
    };

}(window.SiteMapHandler = window.SiteMapHandler || {}));

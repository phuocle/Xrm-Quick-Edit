(function (SiteMapHandler, undefined) {
    "use strict";

    var siteMapData = null; // selected sitemap data
    var idSeparator = "|";

    function getDirectChildren(parent, tagName) {
        var results = [];
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

    function ApplyXmlUpdates(xmlString, updates) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(xmlString, "text/xml");
        var serializer = new XMLSerializer();
        var component = XrmTranslator.GetComponent();

        for (var u = 0; u < updates.length; u++) {
            var update = updates[u];
            var allNodes = doc.getElementsByTagName(update.nodeType);
            var node = null;

            for (var n = 0; n < allNodes.length; n++) {
                if (allNodes[n].getAttribute("Id") === update.id) {
                    node = allNodes[n];
                    break;
                }
            }
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

    function FillTable() {
        var grid = XrmTranslator.GetGrid();
        grid.clear();
        var records = [];
        var component = XrmTranslator.GetComponent();

        if (!siteMapData) {
            grid.unlock();
            return;
        }

        var nodes = siteMapData.nodes || [];

        for (var n = 0; n < nodes.length; n++) {
            var node = nodes[n];
            var record = {
                recid: node.compositeId,
                schemaName: "[" + node.type + "] " + node.id + (node.entity ? " (" + node.entity + ")" : "")
            };

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
                var installedLangs = XrmTranslator.installedLanguages.LocaleIds;
                for (var il = 0; il < installedLangs.length; il++) {
                    record[installedLangs[il].toString()] = node.defaultTitle;
                }
            }

            records.push(record);
        }

        XrmTranslator.AddSummary(records);
        grid.add(records);
        grid.unlock();
    }

    function ProcessSelection(sitemapId, sitemaps) {
        var sm = null;
        for (var i = 0; i < sitemaps.length; i++) {
            if (sitemaps[i].sitemapid === sitemapId) {
                sm = sitemaps[i];
                break;
            }
        }

        if (!sm || !sm.sitemapxml) {
            XrmTranslator.UnlockGrid();
            return;
        }

        var nodes = [];
        try {
            nodes = ParseSiteMapXml(sm.sitemapxml);
        } catch (e) {
            // Skip unparseable sitemaps
        }

        siteMapData = {
            sitemapid: sm.sitemapid,
            sitemapname: sm.sitemapname,
            sitemapxml: sm.sitemapxml,
            nodes: nodes
        };

        SiteMapHandler.lastId = sitemapId;

        // Collect unique entity names from SubAreas to fetch display names
        var entityNames = [];
        for (var n = 0; n < nodes.length; n++) {
            if (nodes[n].entity && entityNames.indexOf(nodes[n].entity) === -1) {
                entityNames.push(nodes[n].entity);
            }
        }

        if (entityNames.length === 0) {
            FillTable();
            return;
        }

        var filterParts = entityNames.map(function (name) {
            return "LogicalName eq '" + name + "'";
        });

        WebApiClient.Retrieve({
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

            for (var i = 0; i < siteMapData.nodes.length; i++) {
                var node = siteMapData.nodes[i];
                if (node.entity && entityMap[node.entity]) {
                    node.entityLabels = entityMap[node.entity];
                }
            }

            FillTable();
        })
        .catch(function () {
            FillTable();
        });
    }

    function ShowSiteMapSelection(sitemaps) {
        if (!w2ui.siteMapSelectionPrompt) {
            $().w2form({
                name: 'siteMapSelectionPrompt',
                style: 'border: 0px; background-color: transparent;',
                formHTML:
                    '<div class="w2ui-page page-0" style="padding: 20px 25px;">' +
                    '    <div style="display: flex; align-items: center;">' +
                    '        <label style="margin-right: 10px; white-space: nowrap;">SiteMap: <span style="color: red;">*</span></label>' +
                    '        <input name="siteMapSelection" type="list" style="flex: 1; width: 100%;" />' +
                    '    </div>' +
                    '</div>' +
                    '<div class="w2ui-buttons">' +
                    '    <button class="w2ui-btn" name="cancel">Cancel</button>' +
                    '    <button class="w2ui-btn" name="ok">Ok</button>' +
                    '</div>',
                fields: [
                    { field: 'siteMapSelection', type: 'list', required: true, html: { attr: 'style="width: 100%"' } }
                ],
                actions: {
                    "ok": function () {
                        var errors = this.validate();
                        if (errors.length > 0 || !this.record.siteMapSelection) {
                            return;
                        }
                        ProcessSelection(this.record.siteMapSelection.id, SiteMapHandler._sitemaps);
                        w2popup.close();
                    },
                    "cancel": function () {
                        XrmTranslator.UnlockGrid();
                        w2popup.close();
                    }
                }
            });
        }

        var items = [];
        for (var i = 0; i < sitemaps.length; i++) {
            items.push({
                id: sitemaps[i].sitemapid,
                text: sitemaps[i].sitemapname || sitemaps[i].sitemapid
            });
        }

        SiteMapHandler._sitemaps = sitemaps;
        w2ui.siteMapSelectionPrompt.record.siteMapSelection = null;
        w2ui.siteMapSelectionPrompt.fields[0].options = { items: items };

        $().w2popup('open', {
            title: 'Choose SiteMap',
            name: 'siteMapSelectionPopup',
            body: '<div id="form" style="width: 100%; height: 100%;"></div>',
            style: 'padding: 15px 0px 0px 0px',
            width: 650,
            height: 250,
            showMax: true,
            onOpen: function (event) {
                event.onComplete = function () {
                    $('#w2ui-popup #form').w2render('siteMapSelectionPrompt');
                };
            },
            onClose: function () {
                XrmTranslator.UnlockGrid();
            }
        });
    }

    SiteMapHandler.Load = function () {
        siteMapData = null;
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
            sitemapPromise = WebApiClient.Retrieve({
                entityName: "sitemap",
                queryParams: "?$select=sitemapid,sitemapname,sitemapxml"
            });
        }

        return sitemapPromise
            .then(function (response) {
                var sitemaps = response.value || [];

                if (sitemaps.length === 0) {
                    XrmTranslator.UnlockGrid();
                    return DialogHelper.alert("No sitemaps found" + (solutionId && solutionId !== "all" ? " in the selected solution." : "."));
                }

                ShowSiteMapSelection(sitemaps);
            })
            .catch(XrmTranslator.errorHandler);
    };

    SiteMapHandler.Save = function () {
        XrmTranslator.LockGrid("Saving");

        if (!siteMapData) {
            XrmTranslator.UnlockGrid();
            return;
        }

        var records = XrmTranslator.GetGrid().records;
        var updates = [];

        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            if (!record.w2ui || !record.w2ui.changes) {
                continue;
            }

            var nodeId = record.recid;
            var nodeInfo = null;
            for (var y = 0; y < siteMapData.nodes.length; y++) {
                if (siteMapData.nodes[y].compositeId === nodeId) {
                    nodeInfo = siteMapData.nodes[y];
                    break;
                }
            }

            var changes = record.w2ui.changes;
            var installedLangs = XrmTranslator.installedLanguages.LocaleIds;
            var labels = [];

            // Include all language values (original + changed) so defaults are saved too
            for (var il = 0; il < installedLangs.length; il++) {
                var lang = installedLangs[il].toString();
                var text = changes.hasOwnProperty(lang) ? changes[lang] : record[lang];
                if (text) {
                    labels.push({ lcid: lang, text: text });
                }
            }

            if (labels.length > 0) {
                updates.push({
                    id: nodeInfo ? nodeInfo.id : nodeId,
                    nodeType: nodeInfo ? nodeInfo.nodeType : "SubArea",
                    labels: labels
                });
            }
        }

        if (updates.length === 0) {
            XrmTranslator.UnlockGrid();
            return;
        }

        var updatedXml = ApplyXmlUpdates(siteMapData.sitemapxml, updates);

        return WebApiClient.Update({
            entityName: "sitemap",
            entityId: siteMapData.sitemapid,
            entity: {
                sitemapxml: updatedXml
            }
        })
        .then(function () {
            XrmTranslator.LockGrid("Publishing");
            return XrmTranslator.RunAsBaseLanguage(function () {
                return WebApiClient.Execute(WebApiClient.Requests.PublishAllXmlRequest);
            });
        })
        .then(function () {
            return XrmTranslator.AddToSolution(
                [siteMapData.sitemapid],
                XrmTranslator.ComponentType.SiteMap
            );
        })
        .then(function () {
            return XrmTranslator.ReleaseLockAndPrompt();
        })
        .then(function () {
            XrmTranslator.LockGrid("Reloading");

            // Reload the same sitemap by id to avoid GUID filter formatting issues.
            return WebApiClient.Retrieve({
                entityName: "sitemap",
                entityId: siteMapData.sitemapid,
                queryParams: "?$select=sitemapid,sitemapname,sitemapxml"
            })
            .then(function (response) {
                if (response && response.sitemapid) {
                    ProcessSelection(response.sitemapid, [response]);
                } else {
                    XrmTranslator.UnlockGrid();
                }
            });
        })
        .catch(XrmTranslator.errorHandler);
    };

}(window.SiteMapHandler = window.SiteMapHandler || {}));

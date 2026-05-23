/* @preserve
 * MIT License
 *
 * Copyright (c) 2017 Florian Krönert
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
*/
(function (WebResourceHandler, undefined) {
    "use strict";

    var idSeparator = "|";
    var localizedFileRegex = /([0-9]+)\.(js|resx)$/i;
    var localizedNameRegex = /([0-9]+)$/i;
    var webResourceType = {
        script: 3,
        resx: 12
    };

    function GetGroupKey (id) {
        var separatorIndex = id.indexOf(idSeparator);

        if (separatorIndex === -1) {
            return id;
        }

        return id.substring(0, separatorIndex);
    }

    function GetCreatedIdFromResponse(response) {
        if (!response || !response.headers) {
            return null;
        }

        var entityId = response.headers["OData-EntityId"] || response.headers["OData-EntityID"] || response.headers["odata-entityid"];
        var match = entityId && /\(([^)]+)\)/.exec(entityId);

        return match ? match[1] : null;
    }

    function EscapeODataString(value) {
        return String(value || "").replace(/'/g, "''");
    }

    function IsResxResource(resource) {
        var type = resource ? resource.webresourcetype : null;

        return type === webResourceType.resx || String(type || "").toLowerCase().indexOf("resx") !== -1;
    }

    function MatchLocalizedResource(resource) {
        var name = resource ? resource.name : "";
        var displayName = resource ? resource.displayname : "";
        var candidates = [name, displayName];
        var i;
        var matches;

        for (i = 0; i < candidates.length; i++) {
            matches = candidates[i] ? candidates[i].match(localizedFileRegex) : null;

            if (matches && matches.length > 2) {
                return {
                    lcid: matches[1],
                    format: matches[2].toLowerCase()
                };
            }
        }

        if (!IsResxResource(resource)) {
            return null;
        }

        for (i = 0; i < candidates.length; i++) {
            matches = candidates[i] ? candidates[i].match(localizedNameRegex) : null;

            if (matches && matches.length > 1) {
                return {
                    lcid: matches[1],
                    format: "resx"
                };
            }
        }

        return null;
    }

    function GetResourceLcid(resource) {
        var match = MatchLocalizedResource(resource);

        return match ? match.lcid : undefined;
    }

    function GetResourceFormat(resource) {
        var match = MatchLocalizedResource(resource);

        return match ? match.format : undefined;
    }

    function IsLocalizableResource(resource, baseLanguage) {
        var match = MatchLocalizedResource(resource);

        return !!match && match.lcid == baseLanguage && (match.format === "js" || match.format === "resx");
    }

    function GetResourceType(format) {
        return format === "resx" ? webResourceType.resx : webResourceType.script;
    }

    function GetResourceGroupingKey(resource, lcid) {
        var name = resource.name || "";
        var index = name.indexOf(lcid);

        if (index !== -1) {
            return name.substr(0, index);
        }

        var displayName = resource.displayname || "";
        index = displayName.indexOf(lcid);

        return index !== -1 ? displayName.substr(0, index) : name || displayName;
    }

    function ReplaceResourceLcid(value, currentLcid, nextLcid) {
        return value ? value.replace(currentLcid, nextLcid) : value;
    }

    function ParseResxContent(xml) {
        var doc = new DOMParser().parseFromString(xml, "application/xml");

        if (doc.getElementsByTagName("parsererror").length > 0) {
            throw new Error("Invalid RESX XML.");
        }

        var content = {};
        var dataNodes = doc.getElementsByTagName("data");

        for (var i = 0; i < dataNodes.length; i++) {
            var dataNode = dataNodes[i];
            var name = dataNode.getAttribute("name");
            var valueNodes = dataNode.getElementsByTagName("value");

            if (!name || valueNodes.length === 0) {
                continue;
            }

            content[name] = valueNodes[0].textContent || "";
        }

        return content;
    }

    function SerializeResxContent(xml, content) {
        var doc = new DOMParser().parseFromString(xml, "application/xml");
        var dataNodes = doc.getElementsByTagName("data");
        var existingNames = {};

        for (var i = 0; i < dataNodes.length; i++) {
            var dataNode = dataNodes[i];
            var name = dataNode.getAttribute("name");
            var valueNodes = dataNode.getElementsByTagName("value");

            if (!name || valueNodes.length === 0) {
                continue;
            }

            existingNames[name] = true;

            if (Object.prototype.hasOwnProperty.call(content, name)) {
                valueNodes[0].textContent = content[name] || "";
            }
        }

        var root = doc.documentElement;
        for (var key in content) {
            if (!Object.prototype.hasOwnProperty.call(content, key) || existingNames[key]) {
                continue;
            }

            var newData = doc.createElement("data");
            newData.setAttribute("name", key);
            newData.setAttribute("xml:space", "preserve");

            var newValue = doc.createElement("value");
            newValue.textContent = content[key] || "";
            newData.appendChild(newValue);
            root.appendChild(newData);
        }

        return new XMLSerializer().serializeToString(doc);
    }

    function ParseWebResource(resource) {
        var format = GetResourceFormat(resource);
        var rawContent = b64DecodeUnicode(resource.content || "");
        var parsedContent;

        if (format === "resx") {
            parsedContent = ParseResxContent(rawContent);
        }
        else {
            parsedContent = JSON.parse(rawContent);
        }

        return Object.assign(resource, {
            content: parsedContent,
            __format: format === "resx" ? "resx" : "json",
            __rawContent: rawContent,
            __lcid: GetResourceLcid(resource)
        });
    }

    function EncodeWebResourceContent(webresource) {
        if (webresource.__format === "resx") {
            return b64EncodeUnicode(SerializeResxContent(webresource.__rawContent, webresource.content));
        }

        return b64EncodeUnicode(JSON.stringify(webresource.content));
    }

    function GetSelectedSolutionWebResourceIds() {
        var solutionId = XrmTranslator.GetSolution();

        if (!solutionId || solutionId === "all") {
            return Promise.resolve(null);
        }

        return WebApiClient.Retrieve({
            entityName: "solutioncomponent",
            queryParams: "?$select=objectid&$filter=_solutionid_value eq " + solutionId + " and componenttype eq " + XrmTranslator.ComponentType.WebResource
        })
        .then(function(response) {
            return response.value.map(function(component) {
                return component.objectid;
            });
        });
    }

    function RetrieveWebResource(id) {
        return WebApiClient.Retrieve({
            overriddenSetName: "webresourceset",
            entityId: id,
            queryParams: "?$select=webresourceid,name,displayname,content,webresourcetype"
        });
    }

    function RetrieveBaseLanguageResources(baseLanguage) {
        return GetSelectedSolutionWebResourceIds()
        .then(function(ids) {
            if (ids) {
                return WebApiClient.Promise.all(ids.map(RetrieveWebResource))
                    .then(function(resources) {
                        return resources.filter(function(resource) {
                            return IsLocalizableResource(resource, baseLanguage);
                        });
                    });
            }

            return WebApiClient.Retrieve({
                overriddenSetName: "webresourceset",
                queryParams: "?$select=webresourceid,name,displayname,content,webresourcetype&$filter=contains(name, '" + EscapeODataString(baseLanguage) + "') or contains(displayname, '" + EscapeODataString(baseLanguage) + "')"
            })
            .then(function(response) {
                return response.value.filter(function(resource) {
                    return IsLocalizableResource(resource, baseLanguage);
                });
            });
        });
    }

    function GetUpdates(records) {
        var updates = [];

        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            var groupKey = GetGroupKey(record.recid);

            if (record.w2ui && record.w2ui.changes) {
                var group = XrmTranslator.metadata[groupKey];
                var property = record.schemaName;
                
                var changes = record.w2ui.changes;

                for (var change in changes) {
                    if (!changes.hasOwnProperty(change)) {
                        continue;
                    }

                    var updateRecord = group.find(function(w) { return w.__lcid === change }) || updates.find(function(w) { return w.__lcid === change });
                    
                    // In this case, we need to create a new web resource
                    if (!updateRecord) {
                        var baseLanguageRecord = group.find(function(w) { return w.__lcid == XrmTranslator.baseLanguage });
                        var newName = baseLanguageRecord ? ReplaceResourceLcid(baseLanguageRecord.name, baseLanguageRecord.__lcid, change) : groupKey + change + ".js";

                        updateRecord = {
                            __lcid: change,
                            webresourceid: undefined,
                            name: newName,
                            displayname: baseLanguageRecord ? ReplaceResourceLcid(baseLanguageRecord.displayname || baseLanguageRecord.name, baseLanguageRecord.__lcid, change) : newName,
                            content: baseLanguageRecord ? Object.keys(baseLanguageRecord.content).reduce(function(all, cur) { all[cur] = null; return all; }, {}) : { },
                            __format: baseLanguageRecord ? baseLanguageRecord.__format : "json",
                            __rawContent: baseLanguageRecord ? baseLanguageRecord.__rawContent : "{}",
                            webresourcetype: baseLanguageRecord ? GetResourceType(baseLanguageRecord.__format) : webResourceType.script
                        }
                    }

                    var value = changes[change];
                    updateRecord.content[property] = w2utils.decodeTags(value);

                    if (updates.indexOf(updateRecord) === -1) {
                        updates.push(updateRecord);
                    }
                }
            }
        }

        return updates;
    }

    function FillKey(record, property, group) {
        var keyRecord = {
            recid: record.recid + idSeparator + property,
            schemaName: property
        };

        for (var i = 0; i < group.length; i++) {
            var resource = group[i];

            var value = resource.content[property];

            if (!resource.__lcid) {
                continue;
            }
            
            keyRecord[resource.__lcid] = value === null || typeof value === "undefined" ? "" : w2utils.encodeTags(value);
        }

        record.w2ui.children.push(keyRecord);
    }

    function FillTable () {
        var grid = XrmTranslator.GetGrid();
        grid.clear();

        var records = [];

        var groups = Object.keys(XrmTranslator.metadata);

        for (var i = 0; i < groups.length; i++) {
            var key = groups[i];
            var group = XrmTranslator.metadata[key];

            var record = {
                recid: key,
                schemaName: key,
                w2ui: {
                    editable: false,
                    children: []
                }
            };

            var properties = Array.from(new Set(group.map(function(g) { return Object.keys(g.content); }).reduce(function(all, cur) { return all.concat(cur); }, [])));

            for (var j = 0; j < properties.length; j++) {
                var property = properties[j];

                FillKey(record, property, group);
            }

            records.push(record);
        }

        XrmTranslator.AddSummary(records);
        grid.add(records);
        grid.unlock();
    }

    // https://stackoverflow.com/a/30106551
    function b64EncodeUnicode(str) {
        // first we use encodeURIComponent to get percent-encoded UTF-8,
        // then we convert the percent encodings into raw bytes which
        // can be fed into btoa.
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
            function toSolidBytes(match, p1) {
                return String.fromCharCode('0x' + p1);
        }));
    }

    // https://stackoverflow.com/a/30106551
    function b64DecodeUnicode(str) {
        // Going backwards: from bytestream, to percent-encoding, to original string.
        return decodeURIComponent(atob(str).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    }

    WebResourceHandler.Load = function() {
        XrmTranslator.GetBaseLanguage()
        .then(function(baseLanguage) {
            return WebApiClient.Promise.all([baseLanguage, RetrieveBaseLanguageResources(baseLanguage)]);
        })
        .then(function(r) {
            var baseLanguage = r[0];
            var records = r[1];

            return WebApiClient.Promise.all(records.map(function(rec) {
                var groupingKey = GetResourceGroupingKey(rec, baseLanguage);
                var escapedGroupingKey = EscapeODataString(groupingKey);
                
                return WebApiClient.Retrieve({ overriddenSetName: "webresourceset", queryParams: "?$select=webresourceid,name,displayname,content,webresourcetype&$filter=contains(name, '" + escapedGroupingKey + "') or contains(displayname, '" + escapedGroupingKey + "')"})
                .then(function (g) {
                    return { 
                        key: groupingKey,
                        value: g.value.filter(function(w) {
                            return MatchLocalizedResource(w);
                        }).map(function(w) {
                            try {
                                return ParseWebResource(w);
                            }
                            catch {
                                return {};
                            }
                        }) 
                    };
                });
            }));
        })
        .then(function(responses) {
            var groupedResponses = responses.reduce(function(all, cur) {
                // Filter out resources that could not be parsed
                var resources = cur.value.filter(function(g) { return g.content && typeof(g.content) === "object" });
                
                if (resources.length > 0) {
                    all[cur.key] = resources;
                }

                return all;
            }, {});

            XrmTranslator.metadata = groupedResponses;

            FillTable();
        })
        .catch(XrmTranslator.errorHandler);
    }

    WebResourceHandler.Save = function() {
        XrmTranslator.LockGrid("Saving");

        var records = XrmTranslator.GetAllRecords();
        var updates = GetUpdates(records);

        var createdContentIds = {};
        var existingIds = updates
            .filter(function(webresource) { return !!webresource.webresourceid; })
            .map(function(webresource) { return webresource.webresourceid; });

        return XrmTranslator.ExecuteChangeSetBatches(updates, {
            progressLabel: "Saving web resource batches",
            batchNamePrefix: "batch_savewebresources",
            changeSetNamePrefix: "changeset_savewebresources",
            buildRequest: function(webresource, context) {
                var content = EncodeWebResourceContent(webresource);

                if (webresource.webresourceid) {
                    return WebApiClient.Update({
                        overriddenSetName: "webresourceset",
                        entityId: webresource.webresourceid,
                        entity: {
                            content: content
                        },
                        asBatch: true
                    });
                }

                createdContentIds[String(context.contentId)] = true;

                return WebApiClient.Create({
                    overriddenSetName: "webresourceset",
                    entity: {
                        name: webresource.name,
                        displayname: webresource.displayname || webresource.name,
                        content: content,
                        webresourcetype: GetResourceType(webresource.__format)
                    },
                    asBatch: true
                });
            }
        })
        .then(function(responses) {
            var createdIds = [];

            for (var i = 0; i < responses.length; i++) {
                var response = responses[i];

                if (!createdContentIds[String(response.contentId)]) {
                    continue;
                }

                var id = GetCreatedIdFromResponse(response);
                if (id) {
                    createdIds.push(id);
                }
            }

            return existingIds.concat(createdIds);
        })
        .then(function (ids){
            XrmTranslator.LockGrid("Publishing");

            return XrmTranslator.PublishWebResources(ids)
            .then(function() {
                return ids;
            });
        })
        .then(function(ids) {
            // WebResources can't be added with defined componenent settings or DoNotIncludeSubcomponents flag set to true
            return XrmTranslator.AddToSolution(ids, XrmTranslator.ComponentType.WebResource, true, true);
        })
        .then(function (response) {
            XrmTranslator.LockGrid("Reloading");

            return WebResourceHandler.Load();
        })
        .catch(XrmTranslator.errorHandler);
    }
} (window.WebResourceHandler = window.WebResourceHandler || {}));

/* @preserve
 * MIT License
 *
 * Copyright (c) 2017 Florian Kroenert
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
(function (TranslationDictionaryService, undefined) {
    "use strict";

    var BASE_SOLUTION_UNIQUE_NAME = "XrmQuickEdit";
    var DATA_SOLUTION_DISPLAY_NAME = "Xrm Quick Translate Data";
    var DATA_SOLUTION_UNIQUE_NAME = "XrmQuickEditData";
    var DICTIONARY_WEBRESOURCE_UNIQUE_NAME = "oss_XrmQuickEdit/data/TranslationDictionary.xml";
    var DICTIONARY_WEBRESOURCE_DISPLAY_NAME = "Xrm Quick Translate Translation Dictionary";
    var DICTIONARY_WEBRESOURCE_DESCRIPTION = "Stores customer dictionary whitelist for Xrm Quick Translate translation.";
    var CACHE_KEY = "XrmQuickEdit_DictionaryStorage_v1";

    var storageInfo = null;
    var initPromise = null;
    var dictionaryModelCache = null;
    var dictionaryGridContext = null;
    var dictionaryBaselineSignature = null;
    var dictionaryAllowCloseWithoutPrompt = false;

    function logWarn(message, error) {
        return;
    }

    function logDebug(message, payload) {
        return;
    }

    function getOrgUrl() {
        try {
            if (window.Xrm && Xrm.Page && Xrm.Page.context && Xrm.Page.context.getClientUrl) {
                return Xrm.Page.context.getClientUrl().toLowerCase();
            }
        } catch (e) {
            logWarn("Failed to read org URL from Xrm.Page context", e);
        }

        return "";
    }

    function escapeODataString(value) {
        return String(value || "").replace(/'/g, "''");
    }

    function b64EncodeUnicode(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    function b64DecodeUnicode(str) {
        return decodeURIComponent(escape(atob(str || "")));
    }

    function parseGuidFromCreateResponse(createResponse) {
        if (!createResponse) {
            return null;
        }

        if (typeof createResponse === "string") {
            var match = createResponse.match(/[0-9a-fA-F-]{36}/);
            return match ? match[0] : null;
        }

        if (createResponse.id) {
            return createResponse.id;
        }

        return null;
    }

    function normalizePublisherPrefix(prefix) {
        var sanitized = String(prefix || "new")
            .replace(/[^A-Za-z0-9]/g, "")
            .toLowerCase();

        if (!sanitized) {
            return "new";
        }

        return sanitized.substring(0, 8);
    }

    function buildPublisherPrefixCandidates(basePrefix) {
        var primary = normalizePublisherPrefix(basePrefix);
        var secondary = normalizePublisherPrefix(primary + "d");

        if (primary === secondary) {
            return [primary];
        }

        return [primary, secondary];
    }

    function toWebResourcePrefix(publisherPrefix) {
        var prefix = String(publisherPrefix || "new")
            .replace(/[^A-Za-z0-9_]/g, "")
            .toLowerCase();

        if (!prefix) {
            prefix = "new";
        }

        if (prefix.charAt(prefix.length - 1) !== "_") {
            prefix += "_";
        }

        return prefix;
    }

    function loadCache() {
        try {
            var value = localStorage.getItem(CACHE_KEY);
            return value ? JSON.parse(value) : null;
        } catch (e) {
            logWarn("Failed to parse dictionary cache", e);
            return null;
        }
    }

    function saveCache(info) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(info));
    }

    function getDefaultDictionaryXml() {
        return [
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
            "<dictionary version=\"2.0\" sourceLcid=\"\">",
            "  <entries>",
            "  </entries>",
            "</dictionary>"
        ].join("\n");
    }

    function findBaseSolution() {
        return WebApiClient.Retrieve({
            entityName: "solution",
            queryParams: "?$select=solutionid,uniquename,friendlyname,_publisherid_value&$filter=uniquename eq '" + BASE_SOLUTION_UNIQUE_NAME + "'"
        })
        .then(function (response) {
            if (!response || !response.value || response.value.length === 0) {
                throw new Error("Base solution " + BASE_SOLUTION_UNIQUE_NAME + " not found.");
            }

            return response.value[0];
        });
    }

    function findPublisherByUniqueName(uniqueName) {
        return WebApiClient.Retrieve({
            entityName: "publisher",
            queryParams: "?$select=publisherid,uniquename,friendlyname,customizationprefix&$filter=uniquename eq '" + escapeODataString(uniqueName) + "'"
        })
        .then(function (response) {
            if (response && response.value && response.value.length > 0) {
                return response.value[0];
            }

            return null;
        });
    }

    function getPublisherById(publisherId) {
        return WebApiClient.Retrieve({
            entityName: "publisher",
            entityId: publisherId,
            queryParams: "?$select=publisherid,uniquename,friendlyname,customizationprefix"
        });
    }

    function tryCreateDataPublisher(uniqueName, friendlyName, prefixCandidates, index) {
        if (index >= prefixCandidates.length) {
            throw new Error("Failed to create data publisher for dictionary storage.");
        }

        return WebApiClient.Create({
            entityName: "publisher",
            entity: {
                uniquename: uniqueName,
                friendlyname: friendlyName,
                customizationprefix: prefixCandidates[index]
            }
        })
        .then(function (createResponse) {
            var publisherId = parseGuidFromCreateResponse(createResponse);
            if (!publisherId) {
                return findPublisherByUniqueName(uniqueName);
            }

            return getPublisherById(publisherId);
        })
        .catch(function () {
            return tryCreateDataPublisher(uniqueName, friendlyName, prefixCandidates, index + 1);
        });
    }

    function ensureDataPublisher(basePublisher) {
        var dataPublisherUniqueName = (basePublisher.uniquename || BASE_SOLUTION_UNIQUE_NAME) + "Data";
        var dataPublisherFriendlyName = (basePublisher.friendlyname || BASE_SOLUTION_UNIQUE_NAME) + " Data";

        return findPublisherByUniqueName(dataPublisherUniqueName)
        .then(function (existingPublisher) {
            if (existingPublisher) {
                return existingPublisher;
            }

            var prefixCandidates = buildPublisherPrefixCandidates(basePublisher.customizationprefix);
            return tryCreateDataPublisher(dataPublisherUniqueName, dataPublisherFriendlyName, prefixCandidates, 0);
        });
    }

    function findDataSolution() {
        return WebApiClient.Retrieve({
            entityName: "solution",
            queryParams: "?$select=solutionid,uniquename,friendlyname,_publisherid_value,version&$filter=uniquename eq '" + DATA_SOLUTION_UNIQUE_NAME + "'"
        })
        .then(function (response) {
            if (response && response.value && response.value.length > 0) {
                return response.value[0];
            }

            return null;
        });
    }

    function createDataSolution(publisherId) {
        return WebApiClient.Create({
            entityName: "solution",
            entity: {
                friendlyname: DATA_SOLUTION_DISPLAY_NAME,
                uniquename: DATA_SOLUTION_UNIQUE_NAME,
                version: "1.0.0.0",
                "publisherid@odata.bind": "/publishers(" + publisherId + ")"
            }
        })
        .then(function () {
            return findDataSolution();
        });
    }

    function ensureDataSolution(publisherId) {
        return findDataSolution()
        .then(function (solution) {
            if (solution) {
                return solution;
            }

            return createDataSolution(publisherId);
        });
    }

    function getDictionaryWebResourceName(basePublisherPrefix) {
        return DICTIONARY_WEBRESOURCE_UNIQUE_NAME;
    }

    function findWebResourceByName(webResourceName) {
        return WebApiClient.Retrieve({
            overriddenSetName: "webresourceset",
            queryParams: "?$select=webresourceid,name,content,modifiedon&$filter=name eq '" + escapeODataString(webResourceName) + "'"
        })
        .then(function (response) {
            if (response && response.value && response.value.length > 0) {
                return response.value[0];
            }

            return null;
        });
    }

    function getWebResourceById(webResourceId) {
        return WebApiClient.Retrieve({
            overriddenSetName: "webresourceset",
            entityId: webResourceId,
            queryParams: "?$select=webresourceid,name,content,modifiedon"
        });
    }

    function findDictionaryWebResourceCandidates() {
        return WebApiClient.Retrieve({
            overriddenSetName: "webresourceset",
            queryParams: "?$select=webresourceid,name,content,modifiedon&$filter=contains(name,'TranslationDictionary.xml')&$orderby=modifiedon desc"
        })
        .then(function (response) {
            return response && response.value ? response.value : [];
        });
    }

    function createDictionaryWebResource(webResourceName) {
        return WebApiClient.Create({
            overriddenSetName: "webresourceset",
            entity: {
                name: webResourceName,
                displayname: DICTIONARY_WEBRESOURCE_DISPLAY_NAME,
                description: DICTIONARY_WEBRESOURCE_DESCRIPTION,
                webresourcetype: 4,
                content: b64EncodeUnicode(getDefaultDictionaryXml())
            }
        })
        .then(function (createResponse) {
            var webResourceId = parseGuidFromCreateResponse(createResponse);
            if (!webResourceId) {
                return findWebResourceByName(webResourceName);
            }

            return getWebResourceById(webResourceId);
        });
    }

    function ensureDictionaryWebResource(webResourceName) {
        return findWebResourceByName(webResourceName)
        .then(function (existing) {
            if (existing) {
                return existing;
            }

            return createDictionaryWebResource(webResourceName);
        });
    }

    function isWebResourceInSolution(solutionId, webResourceId) {
        return WebApiClient.Retrieve({
            entityName: "solutioncomponent",
            queryParams: "?$select=solutioncomponentid&$filter=_solutionid_value eq " + solutionId + " and componenttype eq 61 and objectid eq " + webResourceId
        })
        .then(function (response) {
            return !!(response && response.value && response.value.length > 0);
        });
    }

    function addWebResourceToSolution(solutionUniqueName, webResourceId) {
        var request = WebApiClient.Requests.AddSolutionComponentRequest.with({
            payload: {
                ComponentId: webResourceId,
                ComponentType: 61,
                SolutionUniqueName: solutionUniqueName,
                AddRequiredComponents: false,
                IncludedComponentSettingsValues: null,
                DoNotIncludeSubcomponents: false
            }
        });

        return WebApiClient.Execute(request);
    }

    function ensureWebResourceInSolution(solution, webResourceId) {
        return isWebResourceInSolution(solution.solutionid, webResourceId)
        .then(function (isAdded) {
            if (isAdded) {
                return null;
            }

            return addWebResourceToSolution(solution.uniquename, webResourceId);
        });
    }

    function bootstrapStorage() {
        var result = {};

        return findBaseSolution()
        .then(function (baseSolution) {
            result.baseSolution = baseSolution;
            return getPublisherById(baseSolution._publisherid_value);
        })
        .then(function (basePublisher) {
            result.basePublisher = basePublisher;
            return ensureDataPublisher(basePublisher);
        })
        .then(function (dataPublisher) {
            result.dataPublisher = dataPublisher;
            return ensureDataSolution(dataPublisher.publisherid);
        })
        .then(function (dataSolution) {
            result.dataSolution = dataSolution;
            result.webResourceName = getDictionaryWebResourceName(result.basePublisher.customizationprefix);
            return ensureDictionaryWebResource(result.webResourceName);
        })
        .then(function (webResource) {
            result.webResource = webResource;
            return ensureWebResourceInSolution(result.dataSolution, webResource.webresourceid);
        })
        .then(function () {
            return {
                orgUrl: getOrgUrl(),
                solutionUniqueName: DATA_SOLUTION_UNIQUE_NAME,
                solutionId: result.dataSolution.solutionid,
                publisherId: result.dataPublisher.publisherid,
                webResourceId: result.webResource.webresourceid,
                webResourceName: result.webResource.name,
                initializedOn: new Date().toISOString(),
                schemaVersion: 1
            };
        });
    }

    function validateCachedStorage(cachedInfo) {
        if (!cachedInfo || !cachedInfo.webResourceId) {
            return Promise.resolve(false);
        }

        if (cachedInfo.orgUrl !== getOrgUrl()) {
            return Promise.resolve(false);
        }

        return getWebResourceById(cachedInfo.webResourceId)
        .then(function () {
            return true;
        })
        .catch(function () {
            return false;
        });
    }

    function runEnsureInitialized(forceRefresh) {
        if (storageInfo && !forceRefresh) {
            return Promise.resolve(storageInfo);
        }

        return Promise.resolve()
        .then(function () {
            if (forceRefresh) {
                return null;
            }

            var cachedInfo = loadCache();
            if (!cachedInfo) {
                return null;
            }

            return validateCachedStorage(cachedInfo)
            .then(function (isValid) {
                if (isValid) {
                    storageInfo = cachedInfo;
                    return cachedInfo;
                }

                return null;
            });
        })
        .then(function (cachedInfo) {
            if (cachedInfo) {
                return cachedInfo;
            }

            return bootstrapStorage()
            .then(function (createdInfo) {
                storageInfo = createdInfo;
                saveCache(createdInfo);
                return createdInfo;
            });
        });
    }

    function ensureInitialized(forceRefresh) {
        if (initPromise && !forceRefresh) {
            return initPromise;
        }

        initPromise = runEnsureInitialized(forceRefresh)
        .then(function (info) {
            initPromise = null;
            return info;
        }, function (error) {
            initPromise = null;
            throw error;
        });

        return initPromise;
    }

    function readTagValue(entryNode, tagName) {
        var tags = entryNode.getElementsByTagName(tagName);
        if (!tags || !tags.length) {
            return "";
        }

        return tags[0].textContent || "";
    }

    function parseBoolean(value, defaultValue) {
        if (value == null || value === "") {
            return defaultValue;
        }

        var normalized = String(value).toLowerCase().trim();
        return !(normalized === "false" || normalized === "0" || normalized === "no");
    }

    function extractLanguageDisplayName(caption) {
        var text = String(caption || "").trim();
        var index = text.lastIndexOf(" (");

        if (index > 0) {
            return text.substring(0, index);
        }

        return text;
    }

    function getLanguageNameByLcid(lcid) {
        var lookup = String(lcid || "");

        if (window.XrmTranslator && XrmTranslator.GetGrid) {
            var columns = XrmTranslator.GetGrid().columns || [];

            for (var i = 0; i < columns.length; i++) {
                var column = columns[i];
                if (String(column.field) === lookup) {
                    return extractLanguageDisplayName(column.text || column.caption || column.label) || lookup;
                }
            }
        }

        return lookup;
    }

    function buildTargetFieldName(lcid) {
        return "target_" + String(lcid);
    }

    function buildDictionaryGridContext() {
        return XrmTranslator.GetBaseLanguage()
        .then(function (baseLanguage) {
            var baseLcid = String(baseLanguage);
            var localeIds = [];

            if (XrmTranslator.installedLanguages && XrmTranslator.installedLanguages.LocaleIds) {
                localeIds = XrmTranslator.installedLanguages.LocaleIds.map(function (lcid) {
                    return String(lcid);
                });
            }
            else {
                var gridColumns = XrmTranslator.GetColumns(false);
                localeIds = gridColumns.filter(function (field) {
                    return /^\d+$/.test(String(field));
                }).map(function (field) { return String(field); });
            }

            if (localeIds.indexOf(baseLcid) === -1) {
                localeIds.unshift(baseLcid);
            }

            var uniqueLcids = [];
            for (var i = 0; i < localeIds.length; i++) {
                if (uniqueLcids.indexOf(localeIds[i]) === -1) {
                    uniqueLcids.push(localeIds[i]);
                }
            }

            var targetLanguages = uniqueLcids
                .filter(function (lcid) {
                    return lcid !== baseLcid;
                })
                .map(function (lcid) {
                    return {
                        lcid: lcid,
                        name: getLanguageNameByLcid(lcid),
                        field: buildTargetFieldName(lcid)
                    };
                });

            return {
                baseLcid: baseLcid,
                baseName: getLanguageNameByLcid(baseLcid),
                targetLanguages: targetLanguages
            };
        });
    }

    function parseDictionaryXml(xmlContent, context) {
        var model = {
            sourceLcid: String((context && context.baseLcid) || ""),
            entries: []
        };

        logDebug("parseDictionaryXml:start", {
            sourceLcid: model.sourceLcid,
            xmlLength: (xmlContent || "").length
        });

        if (!xmlContent) {
            return model;
        }

        try {
            var parser = new DOMParser();
            var xml = parser.parseFromString(xmlContent, "application/xml");

            if (xml.getElementsByTagName("parsererror").length > 0) {
                logDebug("parseDictionaryXml:parsererror", String(xmlContent || "").substring(0, 500));
                throw new Error("Invalid dictionary XML format.");
            }

            var dictionaryNode = xml.getElementsByTagName("dictionary")[0];
            if (dictionaryNode && dictionaryNode.getAttribute("sourceLcid")) {
                model.sourceLcid = String(dictionaryNode.getAttribute("sourceLcid"));
            }

            var entriesBySource = {};
            var entryOrder = [];
            var nodes = xml.getElementsByTagName("entry");

            function getOrCreateEntry(sourceText, isActive) {
                var key = String(sourceText);

                if (!entriesBySource[key]) {
                    entriesBySource[key] = {
                        sourceText: sourceText,
                        isActive: isActive,
                        targets: {}
                    };
                    entryOrder.push(key);
                }
                else {
                    entriesBySource[key].isActive = entriesBySource[key].isActive || isActive;
                }

                return entriesBySource[key];
            }

            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                var sourceText = readTagValue(node, "sourceText").trim();

                if (!sourceText) {
                    continue;
                }

                var isActive = parseBoolean(node.getAttribute("active"), parseBoolean(readTagValue(node, "isActive"), true));
                var entry = getOrCreateEntry(sourceText, isActive);

                var targetNodes = node.getElementsByTagName("target");

                if (targetNodes && targetNodes.length > 0) {
                    for (var t = 0; t < targetNodes.length; t++) {
                        var targetNode = targetNodes[t];
                        var targetLcid = String(targetNode.getAttribute("lcid") || "").trim();
                        var targetText = targetNode.textContent || "";

                        if (targetLcid) {
                            entry.targets[targetLcid] = targetText;
                        }
                    }
                }
                else {
                    // Backward compatibility with v1 schema (source/target LCID per row).
                    var legacySourceLcid = String(readTagValue(node, "sourceLcid") || "").trim();
                    var legacyTargetLcid = String(readTagValue(node, "targetLcid") || "").trim();
                    var legacyTargetText = readTagValue(node, "targetText");

                    if (!model.sourceLcid && legacySourceLcid) {
                        model.sourceLcid = legacySourceLcid;
                    }

                    if (legacyTargetLcid) {
                        entry.targets[legacyTargetLcid] = legacyTargetText;
                    }
                }
            }

            model.entries = entryOrder.map(function (key) {
                return entriesBySource[key];
            });

            logDebug("parseDictionaryXml:done", {
                sourceLcid: model.sourceLcid,
                entries: model.entries.length,
                sample: model.entries.length ? model.entries[0] : null
            });

            return model;
        } catch (e) {
            logWarn("Failed to parse dictionary XML, starting with empty dictionary.", e);
            return model;
        }
    }

    function xmlEscape(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }

    function serializeDictionaryXml(model) {
        var sourceLcid = String((model && model.sourceLcid) || "");
        var entries = (model && model.entries) || [];

        var xml = [
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
            "<dictionary version=\"2.0\" sourceLcid=\"" + xmlEscape(sourceLcid) + "\">",
            "  <entries>"
        ];

        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            var targets = entry.targets || {};
            var targetLcids = Object.keys(targets);

            xml.push("    <entry active=\"" + (entry.isActive ? "true" : "false") + "\">");
            xml.push("      <sourceText>" + xmlEscape(entry.sourceText) + "</sourceText>");
            xml.push("      <targets>");

            for (var j = 0; j < targetLcids.length; j++) {
                var targetLcid = targetLcids[j];
                var targetText = targets[targetLcid];
                xml.push("        <target lcid=\"" + xmlEscape(targetLcid) + "\">" + xmlEscape(targetText) + "</target>");
            }

            xml.push("      </targets>");
            xml.push("    </entry>");
        }

        xml.push("  </entries>");
        xml.push("</dictionary>");

        return xml.join("\n");
    }

    function sanitizeDictionaryModel(records, context) {
        var entries = [];
        var targets = (context && context.targetLanguages) || [];

        for (var i = 0; i < records.length; i++) {
            var record = records[i];

            if (record.w2ui && record.w2ui.summary) {
                continue;
            }

            var sourceText = String(getDictionaryRecordFieldValue(record, "sourceText") || "").trim();

            if (!sourceText) {
                continue;
            }

            var entry = {
                sourceText: sourceText,
                isActive: getDictionaryRecordFieldValue(record, "isActive") !== false,
                targets: {}
            };

            for (var t = 0; t < targets.length; t++) {
                var target = targets[t];
                var targetValue = String(getDictionaryRecordFieldValue(record, target.field) || "").trim();

                if (targetValue) {
                    entry.targets[target.lcid] = targetValue;
                }
            }

            entries.push(entry);
        }

        return {
            sourceLcid: String((context && context.baseLcid) || ""),
            entries: entries
        };
    }

    function getDictionaryRecordFieldValue(record, fieldName) {
        if (record && record.w2ui && record.w2ui.changes && Object.prototype.hasOwnProperty.call(record.w2ui.changes, fieldName)) {
            return record.w2ui.changes[fieldName];
        }

        return record ? record[fieldName] : null;
    }

    function createDictionaryInputRow(context) {
        var record = {
            recid: "new_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
            sourceText: "",
            isActive: true
        };

        var targets = (context && context.targetLanguages) || [];
        for (var i = 0; i < targets.length; i++) {
            record[targets[i].field] = "";
        }

        return record;
    }

    function isDictionaryInputRowEmpty(record, context) {
        if (!record || (record.w2ui && record.w2ui.summary)) {
            return false;
        }

        var sourceText = String(getDictionaryRecordFieldValue(record, "sourceText") || "").trim();
        if (sourceText) {
            return false;
        }

        var targets = (context && context.targetLanguages) || [];
        for (var i = 0; i < targets.length; i++) {
            var value = String(getDictionaryRecordFieldValue(record, targets[i].field) || "").trim();
            if (value) {
                return false;
            }
        }

        return true;
    }

    function ensureDictionaryInputRow(grid, context) {
        if (!grid) {
            return;
        }

        var records = grid.records || [];
        var emptyRows = [];

        for (var i = 0; i < records.length; i++) {
            if (isDictionaryInputRowEmpty(records[i], context)) {
                emptyRows.push(records[i].recid);
            }
        }

        if (!emptyRows.length) {
            grid.add(createDictionaryInputRow(context));
            return;
        }

        if (emptyRows.length > 1) {
            var extraRows = emptyRows.slice(1);
            grid.remove.apply(grid, extraRows);
        }
    }

    function createDictionarySignature(model) {
        var normalizedEntries = ((model && model.entries) || []).map(function (entry) {
            var targetKeys = Object.keys(entry.targets || {}).sort();
            var normalizedTargets = {};

            for (var i = 0; i < targetKeys.length; i++) {
                var key = targetKeys[i];
                normalizedTargets[key] = entry.targets[key];
            }

            return {
                sourceText: String(entry.sourceText || "").trim(),
                isActive: entry.isActive !== false,
                targets: normalizedTargets
            };
        })
        .filter(function (entry) {
            return !!entry.sourceText;
        })
        .sort(function (a, b) {
            return a.sourceText.localeCompare(b.sourceText);
        });

        return JSON.stringify({
            sourceLcid: String((model && model.sourceLcid) || ""),
            entries: normalizedEntries
        });
    }

    function getCurrentDictionaryGridModel() {
        if (!w2ui.translationDictionaryGrid || !dictionaryGridContext) {
            return {
                sourceLcid: String((dictionaryGridContext && dictionaryGridContext.baseLcid) || ""),
                entries: []
            };
        }

        return sanitizeDictionaryModel(w2ui.translationDictionaryGrid.records, dictionaryGridContext);
    }

    function hasDictionaryUnsavedChanges() {
        if (!dictionaryBaselineSignature || !dictionaryGridContext || !w2ui.translationDictionaryGrid) {
            return false;
        }

        var currentModel = getCurrentDictionaryGridModel();
        var currentSignature = createDictionarySignature(currentModel);

        return currentSignature !== dictionaryBaselineSignature;
    }

    function cleanupDictionaryPromptState() {
        dictionaryGridContext = null;
        dictionaryBaselineSignature = null;
        dictionaryAllowCloseWithoutPrompt = false;
    }

    function refreshDictionaryCacheFromWebResource(context) {
        return loadDictionaryModel(true, context || {})
        .then(function (latestModel) {
            dictionaryModelCache = latestModel;

            logDebug("refreshDictionaryCacheFromWebResource:done", {
                sourceLcid: latestModel && latestModel.sourceLcid,
                entries: latestModel && latestModel.entries ? latestModel.entries.length : 0
            });

            return latestModel;
        })
        .catch(function (error) {
            logWarn("Failed to refresh dictionary cache from web resource on close.", error);
            return null;
        });
    }

    function promptDictionaryCloseWithUnsavedChanges() {
        function askConfirm(message) {
            return new Promise(function (resolve) {
                if (window.w2confirm) {
                    w2confirm(message, function (answer) {
                        resolve(answer === "Yes");
                    });
                    return;
                }

                resolve(window.confirm(message));
            });
        }

        return askConfirm("You have unsaved dictionary changes. Save before closing?")
        .then(function (saveBeforeClose) {
            if (saveBeforeClose) {
                return TranslationDictionaryService.SaveFromGrid();
            }

            return askConfirm("Discard unsaved dictionary changes and close?")
            .then(function (discardChanges) {
                if (discardChanges) {
                    dictionaryAllowCloseWithoutPrompt = true;
                    w2popup.close();
                }

                return null;
            });
        });
    }

    function loadDictionaryModel(forceRefresh, context) {
        if (dictionaryModelCache && !forceRefresh) {
            logDebug("loadDictionaryModel:cache-hit", {
                forceRefresh: forceRefresh,
                entries: dictionaryModelCache.entries ? dictionaryModelCache.entries.length : 0
            });
            return Promise.resolve(dictionaryModelCache);
        }

        function tryDecodeContent(rawContent) {
            if (!rawContent) {
                logDebug("loadDictionaryModel:empty-content", null);
                return getDefaultDictionaryXml();
            }

            try {
                var decoded = b64DecodeUnicode(rawContent);
                logDebug("loadDictionaryModel:decoded-base64", {
                    rawLength: String(rawContent).length,
                    decodedLength: decoded.length,
                    decodedPreview: decoded.substring(0, 400)
                });
                return decoded;
            } catch (decodeError) {
                // Some orgs may return plain XML content.
                logWarn("Could not decode base64 content, using raw XML content.", decodeError);
                var fallback = String(rawContent);
                logDebug("loadDictionaryModel:raw-content", {
                    rawLength: fallback.length,
                    rawPreview: fallback.substring(0, 400)
                });
                return fallback;
            }
        }

        function tryParseWithFallbacks(content, parseContext) {
            var parsed = parseDictionaryXml(content, parseContext);

            logDebug("loadDictionaryModel:parse-primary", {
                entries: parsed.entries ? parsed.entries.length : 0,
                sourceLcid: parsed.sourceLcid
            });

            if (parsed.entries && parsed.entries.length > 0) {
                return parsed;
            }

            var unescaped = String(content || "")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, "\"")
                .replace(/&apos;/g, "'")
                .replace(/&amp;/g, "&");

            if (unescaped !== content) {
                var reparsed = parseDictionaryXml(unescaped, parseContext);
                logDebug("loadDictionaryModel:parse-unescaped", {
                    entries: reparsed.entries ? reparsed.entries.length : 0,
                    sourceLcid: reparsed.sourceLcid
                });
                if (reparsed.entries && reparsed.entries.length > 0) {
                    return reparsed;
                }
            }

            return parsed;
        }

        return ensureInitialized(false)
        .then(function (info) {
            logDebug("loadDictionaryModel:storage", info);

            // Always use fixed dictionary webresource name as source of truth.
            return findWebResourceByName(DICTIONARY_WEBRESOURCE_UNIQUE_NAME)
            .then(function (webResourceByName) {
                if (!webResourceByName) {
                    logWarn("Dictionary webresource not found by fixed name.", DICTIONARY_WEBRESOURCE_UNIQUE_NAME);
                    return {
                        info: info,
                        webResource: null
                    };
                }

                if (info && (String(info.webResourceId) !== String(webResourceByName.webresourceid) || String(info.webResourceName) !== String(webResourceByName.name))) {
                    logWarn("Storage cache remapped from fixed dictionary webresource name.", {
                        previousId: info.webResourceId,
                        previousName: info.webResourceName,
                        newId: webResourceByName.webresourceid,
                        newName: webResourceByName.name
                    });

                    info.webResourceId = webResourceByName.webresourceid;
                    info.webResourceName = webResourceByName.name;
                    storageInfo = info;
                    saveCache(info);
                }

                return {
                    info: info,
                    webResource: webResourceByName
                };
            });
        })
        .then(function (loadResult) {
            var webResource = loadResult.webResource;

            logDebug("loadDictionaryModel:webresource", {
                id: webResource && webResource.webresourceid,
                name: webResource && webResource.name,
                contentLength: webResource && webResource.content ? String(webResource.content).length : 0
            });

            var content = webResource && webResource.content ? tryDecodeContent(webResource.content) : getDefaultDictionaryXml();
            var primaryModel = tryParseWithFallbacks(content, context || {});
            dictionaryModelCache = primaryModel;
            return dictionaryModelCache;
        })
        .then(function (finalModel) {
            logDebug("loadDictionaryModel:final-model", {
                sourceLcid: finalModel.sourceLcid,
                entries: finalModel.entries ? finalModel.entries.length : 0,
                mode: forceRefresh ? "force-refresh-fixed-name" : "normal-fixed-name"
            });

            return finalModel;
        });
    }

    function saveDictionaryModel(records, context) {
        var model = sanitizeDictionaryModel(records, context || {});
        var xml = serializeDictionaryXml(model);

        logDebug("saveDictionaryModel:input", {
            recordCount: records ? records.length : 0,
            sourceLcid: model.sourceLcid,
            entries: model.entries ? model.entries.length : 0,
            firstEntry: model.entries && model.entries.length ? model.entries[0] : null,
            xmlLength: xml.length,
            xmlPreview: xml.substring(0, 400)
        });

        return ensureInitialized(false)
        .then(function (info) {
            logDebug("saveDictionaryModel:storage", info);

            function publishDictionaryWebResource(webResourceId) {
                if (!webResourceId) {
                    return Promise.resolve(null);
                }

                if (window.XrmTranslator && typeof XrmTranslator.PublishWebResources === "function") {
                    return XrmTranslator.PublishWebResources([webResourceId]);
                }

                var xmlPayload = "<importexportxml><webresources><webresource>" + webResourceId + "</webresource></webresources></importexportxml>";
                var request = WebApiClient.Requests.PublishXmlRequest.with({
                    payload: {
                        ParameterXml: xmlPayload
                    }
                });

                return WebApiClient.Execute(request);
            }

            return findWebResourceByName(DICTIONARY_WEBRESOURCE_UNIQUE_NAME)
            .then(function (webResourceByName) {
                if (!webResourceByName) {
                    throw new Error("Dictionary webresource not found by fixed name: " + DICTIONARY_WEBRESOURCE_UNIQUE_NAME);
                }

                if (info && (String(info.webResourceId) !== String(webResourceByName.webresourceid) || String(info.webResourceName) !== String(webResourceByName.name))) {
                    info.webResourceId = webResourceByName.webresourceid;
                    info.webResourceName = webResourceByName.name;
                    storageInfo = info;
                    saveCache(info);
                }

                return webResourceByName;
            })
            .then(function (targetWebResource) {
                var targetId = targetWebResource.webresourceid;

                return WebApiClient.Update({
                    overriddenSetName: "webresourceset",
                    entityId: targetId,
                    entity: {
                        content: b64EncodeUnicode(xml)
                    }
                })
                .then(function () {
                    return publishDictionaryWebResource(targetId);
                })
                .then(function () {
                    return getWebResourceById(targetId)
                    .then(function (updatedWebResource) {
                        var readback = "";

                        try {
                            readback = b64DecodeUnicode((updatedWebResource && updatedWebResource.content) || "");
                        } catch (decodeError) {
                            logWarn("Post-save readback decode failed.", decodeError);
                            readback = String((updatedWebResource && updatedWebResource.content) || "");
                        }

                        logDebug("saveDictionaryModel:readback", {
                            id: updatedWebResource && updatedWebResource.webresourceid,
                            name: updatedWebResource && updatedWebResource.name,
                            contentLength: updatedWebResource && updatedWebResource.content ? String(updatedWebResource.content).length : 0,
                            decodedLength: readback.length,
                            decodedPreview: readback.substring(0, 400)
                        });
                    });
                });
            });
        })
        .then(function () {
            dictionaryModelCache = model;
            return model;
        });
    }

    function flushActiveDictionaryCellEdit() {
        try {
            var grid = w2ui.translationDictionaryGrid;
            if (!grid || !grid.box) {
                return;
            }

            var active = document.activeElement;
            if (active && typeof active.blur === "function" && grid.box.contains(active)) {
                active.blur();
            }
        } catch (e) {
            logWarn("Could not flush active dictionary editor before save.", e);
        }
    }

    function ensureDictionaryGrid(context) {
        if (w2ui.translationDictionaryGrid) {
            w2ui.translationDictionaryGrid.destroy();
        }

        var targetCount = context.targetLanguages.length;
        var sourceSize = targetCount > 0 ? 35 : 80;
        var activeSize = 10;
        var targetSize = targetCount > 0 ? (100 - sourceSize - activeSize) / targetCount : 0;

        var columns = [
            { field: "sourceText", text: "Source " + context.baseName, size: sourceSize + "%", sortable: true, editable: { type: "text" } }
        ];

        for (var i = 0; i < context.targetLanguages.length; i++) {
            var target = context.targetLanguages[i];
            columns.push({
                field: target.field,
                text: "Target " + target.name,
                size: targetSize.toFixed(2) + "%",
                sortable: true,
                editable: { type: "text" }
            });
        }

        columns.push({ field: "isActive", text: "Active", size: activeSize + "%", sortable: true, editable: { type: "checkbox" } });

        new w2grid({
            name: "translationDictionaryGrid",
            show: {
                toolbar: true,
                footer: true,
                selectColumn: true
            },
            multiSelect: true,
            toolbar: {
                items: [
                    { id: "delete", type: "button", text: "Delete", icon: "w2ui-icon-cross" },
                    { type: "spacer" },
                    { id: "save", type: "button", text: "Save", icon: "w2ui-icon-check" },
                    { id: "close", type: "button", text: "Close", icon: "w2ui-icon-cross" }
                ],
                onClick: function (event) {
                    if (event.target === "delete") {
                        var selected = w2ui.translationDictionaryGrid.getSelection();
                        if (selected && selected.length > 0) {
                            w2ui.translationDictionaryGrid.remove.apply(w2ui.translationDictionaryGrid, selected);
                            ensureDictionaryInputRow(w2ui.translationDictionaryGrid, dictionaryGridContext);
                        }
                    }

                    if (event.target === "save") {
                        TranslationDictionaryService.SaveFromGrid();
                    }

                    if (event.target === "close") {
                        w2popup.close();
                    }
                }
            },
            onChange: function (event) {
                event.onComplete = function () {
                    ensureDictionaryInputRow(w2ui.translationDictionaryGrid, dictionaryGridContext);
                };
            },
            columns: columns,
            records: []
        });

        return w2ui.translationDictionaryGrid;
    }

    function toGridRecords(model, context) {
        var entries = (model && model.entries) || [];

        return entries.map(function (entry, index) {
            var record = {
                recid: index + 1,
                sourceText: entry.sourceText,
                isActive: entry.isActive !== false
            };

            for (var i = 0; i < context.targetLanguages.length; i++) {
                var target = context.targetLanguages[i];
                record[target.field] = (entry.targets && entry.targets[target.lcid]) || "";
            }

            return record;
        });
    }

    function normalizeLookupText(value) {
        return String(value || "").trim();
    }

    function getRecordValue(record, lcid) {
        if (record.w2ui && record.w2ui.changes && Object.prototype.hasOwnProperty.call(record.w2ui.changes, lcid)) {
            return record.w2ui.changes[lcid];
        }

        return record[lcid] || record[String(lcid)] || "";
    }

    function buildLookupKey(sourceText) {
        return normalizeLookupText(sourceText);
    }

    TranslationDictionaryService.EnsureInitialized = function (forceRefresh) {
        return ensureInitialized(!!forceRefresh);
    };

    TranslationDictionaryService.PreloadCache = function () {
        return buildDictionaryGridContext()
        .then(function (context) {
            return loadDictionaryModel(true, context)
            .then(function (model) {
                dictionaryModelCache = model;
                return model;
            });
        });
    };

    TranslationDictionaryService.GetStorageInfo = function () {
        return storageInfo;
    };

    TranslationDictionaryService.ShowDictionaryPrompt = function () {
        XrmTranslator.LockGrid("Loading dictionary ...");
        logDebug("ShowDictionaryPrompt:start", null);

        return buildDictionaryGridContext()
        .then(function (context) {
            logDebug("ShowDictionaryPrompt:context", context);
            return loadDictionaryModel(true, context)
            .then(function (model) {
                logDebug("ShowDictionaryPrompt:model", {
                    sourceLcid: model.sourceLcid,
                    entries: model.entries ? model.entries.length : 0,
                    sample: model.entries && model.entries.length ? model.entries[0] : null
                });

                var modelSourceLcid = String(model.sourceLcid || context.baseLcid);
                if (modelSourceLcid !== context.baseLcid) {
                    context.baseLcid = modelSourceLcid;
                    context.baseName = getLanguageNameByLcid(modelSourceLcid);
                    context.targetLanguages = context.targetLanguages.filter(function (target) {
                        return target.lcid !== modelSourceLcid;
                    });
                }

                dictionaryGridContext = context;
                dictionaryBaselineSignature = createDictionarySignature(model);
                dictionaryAllowCloseWithoutPrompt = false;

                var grid = ensureDictionaryGrid(context);
                grid.clear();
                var gridRecords = toGridRecords(model, context);
                logDebug("ShowDictionaryPrompt:grid-bind", {
                    columns: grid.columns ? grid.columns.map(function (c) { return c.field; }) : [],
                    recordCount: gridRecords.length,
                    firstRecord: gridRecords.length ? gridRecords[0] : null
                });

                grid.add(gridRecords);
                ensureDictionaryInputRow(grid, context);
                XrmTranslator.UnlockGrid();

                w2popup.open({
                    title: "Dictionary",
                    buttons: "",
                    width: 1000,
                    height: 640,
                    showClose: false,
                    showMax: false,
                    modal: true,
                    keyboard: false,
                    body: '<div id="dictionary-main" style="position: absolute; left: 5px; top: 5px; right: 5px; bottom: 5px;"></div>',
                    onOpen: function (event) {
                        event.onComplete = function () {
                            w2ui.translationDictionaryGrid.render("#w2ui-popup #dictionary-main");
                            setTimeout(function () { w2popup.max(); }, 100);
                        };
                    },
                    onToggle: function (event) {
                        w2ui.translationDictionaryGrid.box.style.display = 'none';
                        event.onComplete = function () {
                            w2ui.translationDictionaryGrid.box.style.display = '';
                            w2ui.translationDictionaryGrid.resize();
                        };
                    },
                    onClose: function (event) {
                        if (dictionaryAllowCloseWithoutPrompt) {
                            var finalContext = dictionaryGridContext ? {
                                baseLcid: dictionaryGridContext.baseLcid,
                                baseName: dictionaryGridContext.baseName,
                                targetLanguages: dictionaryGridContext.targetLanguages
                            } : {};

                            cleanupDictionaryPromptState();
                            refreshDictionaryCacheFromWebResource(finalContext);
                            return;
                        }

                        if (!hasDictionaryUnsavedChanges()) {
                            var cleanContext = dictionaryGridContext ? {
                                baseLcid: dictionaryGridContext.baseLcid,
                                baseName: dictionaryGridContext.baseName,
                                targetLanguages: dictionaryGridContext.targetLanguages
                            } : {};

                            dictionaryAllowCloseWithoutPrompt = true;
                            cleanupDictionaryPromptState();
                            refreshDictionaryCacheFromWebResource(cleanContext);
                            return;
                        }

                        event.preventDefault();
                        promptDictionaryCloseWithUnsavedChanges();
                    }
                });
            });
        })
        .catch(function (error) {
            XrmTranslator.UnlockGrid();
            XrmTranslator.errorHandler(error);
        });
    };

    TranslationDictionaryService.SaveFromGrid = function () {
        if (!w2ui.translationDictionaryGrid || !dictionaryGridContext) {
            return;
        }

        flushActiveDictionaryCellEdit();

        return Promise.resolve()
        .then(function () {
            // Let blur/change handlers flush active cell value into grid changes.
            return new Promise(function (resolve) {
                setTimeout(resolve, 0);
            });
        })
        .then(function () {
            logDebug("SaveFromGrid:start", {
                gridRecordCount: w2ui.translationDictionaryGrid.records ? w2ui.translationDictionaryGrid.records.length : 0,
                firstGridRecord: w2ui.translationDictionaryGrid.records && w2ui.translationDictionaryGrid.records.length ? w2ui.translationDictionaryGrid.records[0] : null,
                gridChanges: w2ui.translationDictionaryGrid.getChanges ? w2ui.translationDictionaryGrid.getChanges() : null,
                context: dictionaryGridContext
            });

            w2popup.lock("Saving ......", true);

            return saveDictionaryModel(w2ui.translationDictionaryGrid.records, dictionaryGridContext);
        })
        .then(function (savedModel) {
            dictionaryBaselineSignature = createDictionarySignature(savedModel);
            w2popup.unlock();
            return null;
        })
        .catch(function (error) {
            w2popup.unlock();

            var errorMessage = error && error.message ? error.message : String(error);
            if (window.DialogHelper && DialogHelper.alert) {
                return DialogHelper.alert(errorMessage, { title: "Dictionary" });
            }

            w2alert(errorMessage);
            return null;
        });
    };

    TranslationDictionaryService.SplitRecordsByDictionary = function (fromLcid, targetLcid, records) {
        return buildDictionaryGridContext()
        .then(function (context) {
            return loadDictionaryModel(false, context)
            .then(function (model) {
                var sourceLcid = String(model.sourceLcid || context.baseLcid || "");
                if (String(fromLcid) !== sourceLcid) {
                    return {
                        matchedResults: [],
                        unmatchedRecords: records
                    };
                }

                var lookup = {};
                var entries = model.entries || [];

                for (var i = 0; i < entries.length; i++) {
                    var entry = entries[i];

                    if (!entry || !entry.isActive) {
                        continue;
                    }

                    var targetText = entry.targets ? entry.targets[String(targetLcid)] : null;
                    if (!targetText) {
                        continue;
                    }

                    var sourceKey = buildLookupKey(entry.sourceText);
                    if (!lookup[sourceKey]) {
                        lookup[sourceKey] = targetText;
                    }
                }

                var matchedResults = [];
                var unmatchedRecords = [];

                for (var j = 0; j < records.length; j++) {
                    var record = records[j];
                    var source = w2utils.decodeTags(getRecordValue(record, fromLcid));
                    var sourceLookupKey = buildLookupKey(source);
                    var matchedTarget = lookup[sourceLookupKey];

                    if (matchedTarget) {
                        matchedResults.push({
                            recid: record.recid,
                            schemaName: record.schemaName,
                            column: targetLcid,
                            source: source,
                            translation: w2utils.encodeTags(matchedTarget),
                            fromDictionary: true
                        });
                    }
                    else {
                        unmatchedRecords.push(record);
                    }
                }

                return {
                    matchedResults: matchedResults,
                    unmatchedRecords: unmatchedRecords
                };
            });
        })
        .catch(function (error) {
            logWarn("Dictionary lookup failed, fallback to AI only.", error);
            return {
                matchedResults: [],
                unmatchedRecords: records
            };
        });
    };

}(window.TranslationDictionaryService = window.TranslationDictionaryService || {}));

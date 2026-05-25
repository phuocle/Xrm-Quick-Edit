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
(function (TranslationHandler, undefined) {
    "use strict";

    var locales = null;
    var GEMINI_CONFIG_KEY = "XrmQuickTranslate_GeminiConfig";
    var GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    var OPENAI_CONFIG_KEY = "XrmQuickTranslate_OpenAIConfig";
    var OMNIROUTE_CONFIG_KEY = "XrmQuickTranslate_OmniRouteConfig";
    var AZURE_FOUNDRY_CONFIG_KEY = "XrmQuickTranslate_AzureFoundryConfig";
    var AI_PROVIDER_VISIBILITY = {
        azureFoundry: true,
        gemini: true,
        omniRoute: true,
        openAI: false
    };
    var TRANSLATION_PROMPT_KEY = "XrmQuickTranslate_TranslationPrompt";
    var translationProviders = [];

    function GetCurrentGridValue(record, lcid) {
        if (!record) {
            return "";
        }

        if (record.w2ui && record.w2ui.changes && Object.prototype.hasOwnProperty.call(record.w2ui.changes, lcid)) {
            return record.w2ui.changes[lcid];
        }

        return record[lcid] || record[String(lcid)] || "";
    }

    function GetTranslationResultValue(result) {
        if (result.w2ui && result.w2ui.changes && Object.prototype.hasOwnProperty.call(result.w2ui.changes, "translation")) {
            return result.w2ui.changes.translation;
        }

        return result.translation;
    }

    function NormalizeTranslationText(value) {
        if (value === null || typeof value === "undefined") {
            return "";
        }

        return String(value)
            .replace(/&nbsp;/gi, " ")
            .replace(/\u00a0/g, " ")
            .replace(/<[^>]*>/g, "")
            .trim();
    }

    function HasTranslationText(value) {
        return NormalizeTranslationText(value).length > 0;
    }

    function GetSavedTranslationPrompt() {
        try {
            var stored = localStorage.getItem(TRANSLATION_PROMPT_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch(e) {
            return null;
        }
    }

    function SaveTranslationPrompt(values) {
        localStorage.setItem(TRANSLATION_PROMPT_KEY, JSON.stringify(values));
    }

    function CreateEmptyAIConfig() {
        return {
            baseUrl: "",
            apiKey: "",
            modelName: "",
            customPrompt: ""
        };
    }

    function GetStoredAIConfig(storageKey, defaults) {
        try {
            var stored = localStorage.getItem(storageKey);
            var parsed = stored ? JSON.parse(stored) : {};
            return Object.assign(CreateEmptyAIConfig(), defaults || {}, parsed || {});
        } catch(e) {
            return Object.assign(CreateEmptyAIConfig(), defaults || {});
        }
    }

    function SaveStoredAIConfig(storageKey, config, defaults) {
        localStorage.setItem(storageKey, JSON.stringify(Object.assign(CreateEmptyAIConfig(), defaults || {}, config || {})));
    }

    function GetGeminiConfig() {
        var config = GetStoredAIConfig(GEMINI_CONFIG_KEY, { baseUrl: GEMINI_DEFAULT_BASE_URL });
        config.baseUrl = config.baseUrl || GEMINI_DEFAULT_BASE_URL;
        return config;
    }

    function SaveGeminiConfig(config) {
        var geminiConfig = Object.assign({}, config || {});
        geminiConfig.baseUrl = geminiConfig.baseUrl || GEMINI_DEFAULT_BASE_URL;
        SaveStoredAIConfig(GEMINI_CONFIG_KEY, geminiConfig, { baseUrl: GEMINI_DEFAULT_BASE_URL });
    }

    function GetOpenAIConfig() {
        return GetStoredAIConfig(OPENAI_CONFIG_KEY);
    }

    function SaveOpenAIConfig(config) {
        SaveStoredAIConfig(OPENAI_CONFIG_KEY, config);
    }

    function GetOmniRouteConfig() {
        return GetStoredAIConfig(OMNIROUTE_CONFIG_KEY);
    }

    function SaveOmniRouteConfig(config) {
        SaveStoredAIConfig(OMNIROUTE_CONFIG_KEY, config);
    }

    function GetAzureFoundryConfig() {
        return GetStoredAIConfig(AZURE_FOUNDRY_CONFIG_KEY);
    }

    function SaveAzureFoundryConfig(config) {
        SaveStoredAIConfig(AZURE_FOUNDRY_CONFIG_KEY, config);
    }

    function normalizeBoolean(value, defaultValue) {
        if (value === undefined || value === null || value === "") {
            return defaultValue;
        }

        if (typeof value === "boolean") {
            return value;
        }

        var normalized = String(value).trim().toLowerCase();
        if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
            return false;
        }

        if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
            return true;
        }

        return defaultValue;
    }

    function IsConfiguredProviderEnabled(providerKey) {
        return AI_PROVIDER_VISIBILITY[providerKey] === true;
    }

    function IsOpenAIEnabled() {
        return IsConfiguredProviderEnabled("openAI");
    }

    function IsOmniRouteEnabled() {
        return IsConfiguredProviderEnabled("omniRoute");
    }

    function IsAzureFoundryEnabled() {
        return IsConfiguredProviderEnabled("azureFoundry");
    }

    function IsProviderEnabled(provider) {
        return !provider.enabled || provider.enabled();
    }

    function NormalizeBaseUrl(baseUrl) {
        return String(baseUrl || "").trim().replace(/\/+$/, "");
    }

    function PostJson(url, headers, body) {
        return fetch(url, {
            method: "POST",
            headers: Object.assign({ "Content-Type": "application/json" }, headers || {}),
            body: JSON.stringify(body)
        })
        .then(function(response) {
            return response.text()
            .then(function(text) {
                var data = text ? JSON.parse(text) : {};

                if (!response.ok) {
                    var errorMessage = (data && data.error && data.error.message) || response.statusText || "Request failed";
                    throw new Error(errorMessage);
                }

                return data;
            });
        })
        .catch(function(error) {
            if (error instanceof TypeError) {
                throw new Error("Network request failed. Check that the AI endpoint is reachable from this browser, uses HTTPS when the app is loaded over HTTPS, and allows CORS for this Dynamics origin.");
            }

            throw error;
        });
    }

    function GetLanguageIsoByLcid (lcid) {
        var locByLocales = locales.find(function(loc) { return loc.localeid === lcid; });

        if (locByLocales) {
            return locByLocales.code.substr(0, 2);
        }

        var locByColumns = XrmTranslator.GetGrid().columns.find(function(c) { return c.field === lcid});

        if (locByColumns) {
            return GetColumnDisplayText(locByColumns).substr(0, 2);
        }

        return null;
    }

    function RegisterTranslationProvider(provider) {
        if (!provider || !provider.id || typeof(provider.create) !== "function") {
            return;
        }

        translationProviders.push(provider);
    }

    function GetTranslationProvider(providerId) {
        var normalized = String(providerId || "").trim().toLowerCase();

        for (var i = 0; i < translationProviders.length; i++) {
            var provider = translationProviders[i];
            if (IsProviderEnabled(provider) && String(provider.id).toLowerCase() === normalized) {
                return provider;
            }
        }

        return null;
    }

    function GetDefaultTranslationProvider() {
        for (var i = 0; i < translationProviders.length; i++) {
            if (IsProviderEnabled(translationProviders[i])) {
                return translationProviders[i];
            }
        }

        return null;
    }

    function GetTranslationProviderItems() {
        return translationProviders.filter(IsProviderEnabled).map(function(provider) {
            return {
                id: provider.id,
                text: provider.text
            };
        });
    }

    function GetColumnDisplayText(column) {
        if (!column) {
            return "";
        }

        return column.text || column.caption || column.label || String(column.field || "");
    }

    const geminiTranslator = function (baseUrl, apiKey, modelName, customPrompt) {
        var apiUrl = NormalizeBaseUrl(baseUrl || GEMINI_DEFAULT_BASE_URL) + "/models/" +
            encodeURIComponent(modelName) + ":generateContent";

        this.GetBatchTranslations = function(fromLanguage, destLanguage, phrases) {
            var systemInstructions = "You are a professional translator for a Microsoft Dynamics CRM / Dataverse system. " +
                "Translate the following labels from " + fromLanguage + " to " + destLanguage + ". " +
                (customPrompt ? customPrompt + " " : "") +
                "Return ONLY a valid JSON array of translated strings in the exact same order as provided. " +
                "Do not add any explanation, markdown formatting, or code fences. " +
                "The array must have exactly " + phrases.length + " elements.";

            var userMessage = JSON.stringify(phrases);

            var requestBody = {
                contents: [{
                    role: "user",
                    parts: [{ text: systemInstructions + "\n\nLabels to translate:\n" + userMessage }]
                }]
            };

            return PostJson(apiUrl + "?key=" + encodeURIComponent(apiKey), null, requestBody)
            .then(function(response) {
                if (!response || !response.candidates || !response.candidates[0] ||
                    !response.candidates[0].content || !response.candidates[0].content.parts ||
                    !response.candidates[0].content.parts[0] || !response.candidates[0].content.parts[0].text) {
                    var errorMsg = (response && response.error && response.error.message) || "No translation returned";
                    throw new Error("Gemini API error: " + errorMsg);
                }
                var text = response.candidates[0].content.parts[0].text;
                text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

                var translations = JSON.parse(text);

                if (!Array.isArray(translations) || translations.length !== phrases.length) {
                    throw new Error("Gemini returned " + (translations ? translations.length : 0) +
                        " translations but " + phrases.length + " were expected.");
                }

                return translations;
            });
        };

        this.AddTranslations = function(fromLcid, destLcid, updateRecords, translatedPhrases) {
            var translations = [];

            for (var i = 0; i < updateRecords.length; i++) {
                var translated = translatedPhrases[i];
                var record = updateRecords[i];

                if (!translated) {
                    continue;
                }

                var translation = w2utils.encodeTags(translated);

                translations.push({
                    recid: record.recid,
                    targetRecid: record.recid,
                    location: record.location,
                    schemaName: record.schemaName,
                    column: destLcid,
                    source: record[fromLcid],
                    translation: translation,
                    fromDictionary: false
                });
            }

            return translations;
        };

        this.CanTranslate = function(fromLcid, destLcid) {
            return WebApiClient.Promise.resolve({
                [fromLcid]: true,
                [destLcid]: true
            });
        };
    };

    RegisterTranslationProvider({
        id: "gemini",
        text: "Gemini AI",
        validate: function() {
            var geminiConfig = GetGeminiConfig();

            if (!geminiConfig || !geminiConfig.apiKey) {
                return "Gemini: API Key is missing. Please configure it via AI Settings.";
            }

            if (!geminiConfig.baseUrl) {
                return "Gemini: URL is missing. Please configure it via AI Settings.";
            }

            if (!geminiConfig.modelName) {
                return "Gemini: Model Name is missing. Please configure it via AI Settings.";
            }

            return null;
        },
        create: function() {
            var geminiConfig = GetGeminiConfig();
            return new geminiTranslator(
                geminiConfig.baseUrl,
                geminiConfig.apiKey,
                geminiConfig.modelName,
                geminiConfig.customPrompt
            );
        }
    });

    function BuildOpenAICompatibleChatUrl(baseUrl) {
        var normalizedBaseUrl = NormalizeBaseUrl(baseUrl);

        if (/\/chat\/completions$/i.test(normalizedBaseUrl)) {
            return normalizedBaseUrl;
        }

        return normalizedBaseUrl + "/chat/completions";
    }

    function BuildOpenAICompatibleHeaders(apiKey, authHeaderName) {
        var normalizedAuthHeaderName = String(authHeaderName || "").trim().toLowerCase();

        if (normalizedAuthHeaderName === "api-key") {
            return { "api-key": apiKey };
        }

        return { "Authorization": "Bearer " + apiKey };
    }

    const openAICompatibleTranslator = function (providerName, baseUrl, apiKey, modelName, customPrompt, authHeaderName) {
        var apiUrl = BuildOpenAICompatibleChatUrl(baseUrl);

        this.GetBatchTranslations = function(fromLanguage, destLanguage, phrases) {
            var systemPrompt = "You are a professional translator for a Microsoft Dynamics CRM / Dataverse system. " +
                "Translate the following labels from " + fromLanguage + " to " + destLanguage + ". " +
                (customPrompt ? customPrompt + " " : "") +
                "Return ONLY a valid JSON array of translated strings in the exact same order as provided. " +
                "Do not add any explanation, markdown formatting, or code fences. " +
                "The array must have exactly " + phrases.length + " elements.";

            var userMessage = JSON.stringify(phrases);

            var requestBody = {
                model: modelName,
                stream: false,
                temperature: 0,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: "Labels to translate:\n" + userMessage }
                ]
            };

            return PostJson(apiUrl, BuildOpenAICompatibleHeaders(apiKey, authHeaderName), requestBody)
            .then(function(response) {
                if (!response || !response.choices || !response.choices[0] ||
                    !response.choices[0].message || !response.choices[0].message.content) {
                    var errorMsg = (response && response.error && response.error.message) || "No translation returned";
                    throw new Error(providerName + " API error: " + errorMsg);
                }
                var text = response.choices[0].message.content;
                text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

                var translations = JSON.parse(text);

                if (!Array.isArray(translations) || translations.length !== phrases.length) {
                    throw new Error(providerName + " returned " + (translations ? translations.length : 0) +
                        " translations but " + phrases.length + " were expected.");
                }

                return translations;
            });
        };

        this.AddTranslations = function(fromLcid, destLcid, updateRecords, translatedPhrases) {
            var translations = [];

            for (var i = 0; i < updateRecords.length; i++) {
                var translated = translatedPhrases[i];
                var record = updateRecords[i];

                if (!translated) {
                    continue;
                }

                var translation = w2utils.encodeTags(translated);

                translations.push({
                    recid: record.recid,
                    targetRecid: record.recid,
                    location: record.location,
                    schemaName: record.schemaName,
                    column: destLcid,
                    source: record[fromLcid],
                    translation: translation,
                    fromDictionary: false
                });
            }

            return translations;
        };

        this.CanTranslate = function(fromLcid, destLcid) {
            return WebApiClient.Promise.resolve({
                [fromLcid]: true,
                [destLcid]: true
            });
        };
    };

    const openAITranslator = function (baseUrl, apiKey, modelName, customPrompt) {
        return new openAICompatibleTranslator("OpenAI", baseUrl, apiKey, modelName, customPrompt);
    };

    const omniRouteTranslator = function (baseUrl, apiKey, modelName, customPrompt) {
        return new openAICompatibleTranslator("OmniRoute", baseUrl, apiKey, modelName, customPrompt);
    };

    const azureFoundryTranslator = function (baseUrl, apiKey, modelName, customPrompt) {
        return new openAICompatibleTranslator("Azure Foundry", baseUrl, apiKey, modelName, customPrompt, "api-key");
    };

    RegisterTranslationProvider({
        id: "omniroute",
        text: "OmniRoute",
        enabled: IsOmniRouteEnabled,
        validate: function() {
            var omniRouteConfig = GetOmniRouteConfig();

            if (!omniRouteConfig || !omniRouteConfig.baseUrl) {
                return "OmniRoute: URL is missing. Please configure it via AI Settings.";
            }

            if (typeof window !== "undefined" && window.location && window.location.protocol === "https:" && /^http:\/\//i.test(omniRouteConfig.baseUrl)) {
                return "OmniRoute: URL uses HTTP, but Dynamics is loaded over HTTPS. Browser blocks this mixed-content request. Please expose OmniRoute over HTTPS and update URL.";
            }

            if (!omniRouteConfig.apiKey) {
                return "OmniRoute: API Key is missing. Please configure it via AI Settings.";
            }

            if (!omniRouteConfig.modelName) {
                return "OmniRoute: Model Name is missing. Please configure it via AI Settings.";
            }

            return null;
        },
        create: function() {
            var omniRouteConfig = GetOmniRouteConfig();
            return new omniRouteTranslator(
                omniRouteConfig.baseUrl,
                omniRouteConfig.apiKey,
                omniRouteConfig.modelName,
                omniRouteConfig.customPrompt
            );
        }
    });

    RegisterTranslationProvider({
        id: "azure-foundry",
        text: "Azure Foundry",
        enabled: IsAzureFoundryEnabled,
        validate: function() {
            var azureFoundryConfig = GetAzureFoundryConfig();

            if (!azureFoundryConfig || !azureFoundryConfig.baseUrl) {
                return "Azure Foundry: URL is missing. Please configure it via AI Settings.";
            }

            if (!azureFoundryConfig.apiKey) {
                return "Azure Foundry: API Key is missing. Please configure it via AI Settings.";
            }

            if (!azureFoundryConfig.modelName) {
                return "Azure Foundry: Model Name is missing. Please configure it via AI Settings.";
            }

            return null;
        },
        create: function() {
            var azureFoundryConfig = GetAzureFoundryConfig();
            return new azureFoundryTranslator(
                azureFoundryConfig.baseUrl,
                azureFoundryConfig.apiKey,
                azureFoundryConfig.modelName,
                azureFoundryConfig.customPrompt
            );
        }
    });

    RegisterTranslationProvider({
        id: "openai",
        text: "OpenAI",
        enabled: IsOpenAIEnabled,
        validate: function() {
            var openAIConfig = GetOpenAIConfig();

            if (!openAIConfig || !openAIConfig.apiKey) {
                return "OpenAI: API Key is missing. Please configure it via AI Settings.";
            }

            if (!openAIConfig.baseUrl) {
                return "OpenAI: URL is missing. Please configure it via AI Settings.";
            }

            if (!openAIConfig.modelName) {
                return "OpenAI: Model Name is missing. Please configure it via AI Settings.";
            }

            return null;
        },
        create: function() {
            var openAIConfig = GetOpenAIConfig();
            return new openAITranslator(openAIConfig.baseUrl, openAIConfig.apiKey, openAIConfig.modelName, openAIConfig.customPrompt);
        }
    });

    TranslationHandler.ApplyTranslations = function (selected, results) {
        var grid = XrmTranslator.GetGrid();
        var gridChanged = false;

        function hasSearchValue(value) {
            return value !== null && typeof value !== "undefined" && String(value).trim() !== "";
        }

        function clearEmptySearchState() {
            var hasActiveSearch = false;
            var searchData = grid.searchData || [];

            for (var i = 0; i < searchData.length; i++) {
                if (hasSearchValue(searchData[i] && searchData[i].value)) {
                    hasActiveSearch = true;
                    break;
                }
            }

            if (!hasActiveSearch && !hasSearchValue(grid.last && grid.last.search) && typeof grid.searchReset === "function") {
                grid.searchReset(true);
                grid.refresh();
            }
        }

        var selectedResults = selected && selected.length
            ? selected.map(function(select) { return XrmTranslator.GetByRecId(results, select); }).filter(function(result) { return !!result; })
            : (results || []);

        for (var i = 0; i < selectedResults.length; i++) {
            var result = selectedResults[i];
            if (!result) {
                continue;
            }

            var targetRecid = result.targetRecid || result.recid;
            var record = XrmTranslator.GetByRecId(XrmTranslator.GetAllRecords(), targetRecid);

            if (!record) {
                continue;
            }

            if (XrmTranslator.ApplyGridChangeValue(record, result.column, GetTranslationResultValue(result))) {
                gridChanged = true;
                grid.refreshRow(record.recid);
            }
        }

        if (gridChanged) {
            XrmTranslator.SetSaveButtonDisabled(!XrmTranslator.HasPendingChanges());
            grid.refresh();
        }

        clearEmptySearchState();
    }

    TranslationHandler.ApplyDebugTranslations = function () {
        XrmTranslator.LockGrid("Applying debug translations...");

        function randomSuffix3() {
            var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
            var suffix = "";

            for (var i = 0; i < 3; i++) {
                suffix += chars.charAt(Math.floor(Math.random() * chars.length));
            }

            return suffix;
        }

        return XrmTranslator.GetBaseLanguage()
        .then(function (baseLanguage) {
            var grid = XrmTranslator.GetGrid();
            var baseLcid = String(baseLanguage);
            var languageColumns = XrmTranslator.GetColumns(false).map(function (c) { return String(c); });

            if (languageColumns.indexOf(baseLcid) === -1) {
                XrmTranslator.UnlockGrid();
                w2alert("Base language column " + baseLcid + " is not available in this grid.");
                return;
            }

            var targetColumns = languageColumns.filter(function (lcid) { return lcid !== baseLcid; });
            var records = XrmTranslator.GetAllRecords();
            var updates = 0;

            for (var i = 0; i < records.length; i++) {
                var record = records[i];

                if ((record.w2ui && record.w2ui.summary) || record._isGroupNode || (record.w2ui && record.w2ui.editable === false)) {
                    continue;
                }

                var sourceValue = null;

                if (record.w2ui && record.w2ui.changes && typeof record.w2ui.changes[baseLcid] !== "undefined") {
                    sourceValue = record.w2ui.changes[baseLcid];
                }
                else {
                    sourceValue = record[baseLcid];
                }

                if (sourceValue == null || sourceValue === "") {
                    continue;
                }

                for (var j = 0; j < targetColumns.length; j++) {
                    var targetLcid = targetColumns[j];
                    if (XrmTranslator.ApplyGridChangeValue(record, targetLcid, sourceValue + " " + targetLcid + " " + randomSuffix3())) {
                        updates++;
                    }
                }

                grid.refreshRow(record.recid);
            }

            if (updates > 0) {
                XrmTranslator.SetSaveButtonDisabled(!XrmTranslator.HasPendingChanges());
            }

            XrmTranslator.UnlockGrid();
        })
        .catch(XrmTranslator.errorHandler);
    }

    TranslationHandler.ApplyDebugEmptyTranslations = function () {
        XrmTranslator.LockGrid("Clearing debug translations...");

        return XrmTranslator.GetBaseLanguage()
        .then(function (baseLanguage) {
            var grid = XrmTranslator.GetGrid();
            var baseLcid = String(baseLanguage);
            var languageColumns = XrmTranslator.GetColumns(false).map(function (c) { return String(c); });
            var targetColumns = languageColumns.filter(function (lcid) { return lcid !== baseLcid; });
            var records = XrmTranslator.GetAllRecords();
            var updates = 0;

            for (var i = 0; i < records.length; i++) {
                var record = records[i];

                if ((record.w2ui && record.w2ui.summary) || record._isGroupNode || (record.w2ui && record.w2ui.editable === false)) {
                    continue;
                }

                for (var j = 0; j < targetColumns.length; j++) {
                    if (XrmTranslator.ApplyGridChangeValue(record, targetColumns[j], "")) {
                        updates++;
                    }
                }

                grid.refreshRow(record.recid);
            }

            if (updates > 0) {
                XrmTranslator.SetSaveButtonDisabled(!XrmTranslator.HasPendingChanges());
            }

            XrmTranslator.UnlockGrid();
        })
        .catch(XrmTranslator.errorHandler);
    }

    function ShowTranslationResults (results) {
        function getOptionSetResultLabel(result) {
            var targetRecid = result && (result.targetRecid || result.recid);
            var schemaName = result ? result.schemaName : "";
            var separatorIndex = targetRecid ? String(targetRecid).indexOf("|") : -1;

            if (separatorIndex === -1) {
                return schemaName;
            }

            var attributeId = String(targetRecid).substring(0, separatorIndex);
            var attribute = XrmTranslator.GetAttributeById(attributeId);

            if (!attribute || !attribute.LogicalName) {
                return schemaName;
            }

            return attribute.LogicalName + " | " + schemaName;
        }

        function normalizeResultRecords(rawResults) {
            var normalized = [];

            for (var i = 0; i < rawResults.length; i++) {
                var result = Object.assign({}, rawResults[i]);
                result.targetRecid = result.targetRecid || result.recid;
                result.recid = "translationResult_" + i;
                result.schemaName = getOptionSetResultLabel(result);
                normalized.push(result);
            }

            return normalized;
        }

        if (!w2ui.translationResultGrid) {
            new w2grid({
                name: 'translationResultGrid',
                show: { selectColumn: false },
                multiSelect: false,
                columns: [
                    { field: 'location', text: 'Location', size: '28%', sortable: true, searchable: true },
                    { field: 'schemaName', text: 'Schema Name', size: '18%', sortable: true, searchable: true },
                    { field: 'column', text: 'Column LCID', sortable: true, searchable: true, hidden: true },
                    { field: 'source', text: 'Source Text', size: '21%', sortable: true, searchable: true },
                    { field: 'translation', text: 'Translated Text', size: '21%', sortable: true, searchable: true, editable: { type: 'text' } },
                    {
                        field: 'fromDictionary',
                        text: 'From Dictionary',
                        size: '12%',
                        sortable: true,
                        searchable: true,
                        render: function (record) {
                            return '<input type="checkbox" disabled ' + (record.fromDictionary ? 'checked' : '') + ' />';
                        }
                    }
                ],
                records: []
            });
        }

        results = normalizeResultRecords(results || []);
        w2ui.translationResultGrid.clear();
        w2ui.translationResultGrid.add(results);

        w2popup.open({
            title   : 'Apply Translation Results',
            buttons   : '<button class="w2ui-btn" onclick="w2popup.close();">Cancel</button> '+
                        '<button class="w2ui-btn" onclick="TranslationHandler.ApplyTranslations(null, w2ui.translationResultGrid.records); w2popup.close();">Apply</button>',
            width   : 900,
            height  : 600,
            showMax : false,
            body    : '<div id="main" style="position: absolute; left: 5px; top: 5px; right: 5px; bottom: 5px;"></div>',
            onOpen  : function (event) {
                event.onComplete = function () {
                    w2ui.translationResultGrid.render('#w2ui-popup #main');
                    setTimeout(function () {
                        w2popup.max();
                        w2ui.translationResultGrid.resize();
                    }, 100);
                };
            },
            onToggle: function (event) {
                w2ui.translationResultGrid.box.style.display = 'none';
                event.onComplete = function () {
                    w2ui.translationResultGrid.box.style.display = '';
                    w2ui.translationResultGrid.resize();
                }
            }
        });
    }

    function FindTranslator(fromLcid, destLcid, apiProviderId) {
        var provider = GetTranslationProvider(apiProviderId) || GetDefaultTranslationProvider();

        if (!provider) {
            return WebApiClient.Promise.resolve([null, "No translation provider registered."]);
        }

        var validationError = provider.validate ? provider.validate() : null;
        if (validationError) {
            return WebApiClient.Promise.resolve([null, validationError]);
        }

        var translator = provider.create();
        if (!translator) {
            return WebApiClient.Promise.resolve([null, provider.text + ": Failed to initialize translator."]);
        }

        if (!translator.CanTranslate) {
            return WebApiClient.Promise.resolve([translator]);
        }

        return translator.CanTranslate(fromLcid, destLcid)
        .then(function(canTranslate) {
            if (canTranslate[fromLcid] && canTranslate[destLcid]) {
                return [translator];
            }

            return [null, provider.text + " does not support the current languages: " + fromLcid + "(" + canTranslate[fromLcid] + "), " + destLcid + "(" + canTranslate[destLcid] + ")"];
        });
    }

    TranslationHandler.ProposeTranslations = function(recordsRaw, fromLcid, destLcid, translateMissing, apiProvider, useDictionaryFirst) {
        XrmTranslator.LockGrid("Translating...");

        var useDictionaryEnabled = normalizeBoolean(useDictionaryFirst, true);

        function shouldIncludeRecord(record, mode) {
            var sourceVal = GetCurrentGridValue(record, fromLcid);
            var targetVal = GetCurrentGridValue(record, destLcid);

            if (mode === "missing") {
                return !HasTranslationText(targetVal);
            }

            if (mode === "overwrite") {
                return true;
            }

            // Backward compatibility with previously saved empty mode.
            return !HasTranslationText(targetVal);
        }

        var mode = (translateMissing || "missing").trim();
        var records = recordsRaw.filter(function (record) {
            return shouldIncludeRecord(record, mode);
        });

        var fromIso = GetLanguageIsoByLcid(fromLcid);
        var toIso = GetLanguageIsoByLcid(destLcid);

        if (!fromIso || !toIso) {
            XrmTranslator.UnlockGrid();

            w2alert("Could not find source or target language mapping, source iso:" + fromIso + ", target iso: " + toIso);

            return;
        }

        FindTranslator(fromIso, toIso, apiProvider)
        .then(function(result) {
            var translator = result[0];

            if (!translator) {
                var errorMsg = result[1] || "(No error message returned - check API response)";
                XrmTranslator.UnlockGrid();
                w2alert(errorMsg);
                return null;
            }

            var updateRecords = [];

            for (var i = 0; i < records.length; i++) {
                var record = records[i];

                // Skip records that have no source text
                var sourceText = GetCurrentGridValue(record, fromLcid);
                if (!HasTranslationText(sourceText)) {
                    continue;
                }

                var updateRecord = Object.assign({}, record);
                updateRecord[fromLcid] = sourceText;
                updateRecord[String(fromLcid)] = sourceText;
                updateRecords.push(updateRecord);
            }

            if (updateRecords.length === 0) {
                XrmTranslator.UnlockGrid();
                w2alert("No records to translate. All selected records have empty source text for the source language.");
                return null;
            }

            var splitPromise = (useDictionaryEnabled && window.TranslationDictionaryService && TranslationDictionaryService.SplitRecordsByDictionary)
                ? TranslationDictionaryService.SplitRecordsByDictionary(fromLcid, destLcid, updateRecords)
                : Promise.resolve({ matchedResults: [], unmatchedRecords: updateRecords });

            return splitPromise
            .then(function(split) {
                var dictionaryResults = (split && split.matchedResults) ? split.matchedResults : [];
                var recordsForAi = (split && split.unmatchedRecords) ? split.unmatchedRecords : updateRecords;

                if (!recordsForAi || recordsForAi.length === 0) {
                    ShowTranslationResults(dictionaryResults);
                    XrmTranslator.UnlockGrid();
                    return null;
                }

                if (translator.GetBatchTranslations) {
                    var phrases = recordsForAi.map(function(record) {
                        return w2utils.decodeTags(GetCurrentGridValue(record, fromLcid));
                    });

                    return translator.GetBatchTranslations(fromIso, toIso, phrases)
                    .then(function(translatedPhrases) {
                        var aiResults = translator.AddTranslations(fromLcid, destLcid, recordsForAi, translatedPhrases);
                        var mergedResults = dictionaryResults.concat(aiResults);
                        ShowTranslationResults(mergedResults);
                        XrmTranslator.UnlockGrid();
                    });
                }

                // Generic per-record mode for future provider extensions.
                var translationRequests = [];

                for (var i = 0; i < recordsForAi.length; i++) {
                    var record = recordsForAi[i];

                    translationRequests.push(translator.GetTranslation(fromIso, toIso, w2utils.decodeTags(GetCurrentGridValue(record, fromLcid))));
                }

                return WebApiClient.Promise.all(translationRequests)
                .then(function (responses) {
                    var aiResults = translator.AddTranslations(fromLcid, destLcid, recordsForAi, responses);
                    var mergedResults = dictionaryResults.concat(aiResults);
                    ShowTranslationResults(mergedResults);
                    XrmTranslator.UnlockGrid();
                });
            });
        })
        .catch(function(error) {
            XrmTranslator.errorHandler(error);
        });
    }

    function InitializeTranslationPrompt () {
        var languageItems = [];
        var availableLanguages = XrmTranslator.GetGrid().columns;

        for (var i = 0; i < availableLanguages.length; i++) {
            if (availableLanguages[i].field === "schemaName") {
                continue;
            }

            languageItems.push({ id: availableLanguages[i].field, text: GetColumnDisplayText(availableLanguages[i]) });
        }

        var saved = GetSavedTranslationPrompt();
        var translateMissingItems = [
            { id: "missing", text: "All Missing" },
            { id: "overwrite", text: "All Overwrite" }
        ];
        var apiProviderItems = GetTranslationProviderItems();
        var defaultApiProvider = GetDefaultTranslationProvider();
        var defaultApiProviderItem = defaultApiProvider ? findItem(apiProviderItems, defaultApiProvider.id) : null;

        function findItem(items, id) {
            if (!id) return null;
            for (var i = 0; i < items.length; i++) {
                if (String(items[i].id) === String(id)) return items[i];
            }
            return null;
        }

        var savedRecord = {};
        savedRecord.useDictionaryFirst = normalizeBoolean(saved && saved.useDictionaryFirst, true);

        if (saved) {
            var srcItem = findItem(languageItems, saved.sourceLcid);
            var tgtItem = findItem(languageItems, saved.targetLcid);
            if (srcItem) savedRecord.sourceLcid = srcItem;
            if (tgtItem) savedRecord.targetLcid = tgtItem;
            savedRecord.translateMissing = findItem(translateMissingItems, saved.translateMissing) || translateMissingItems[0];
            savedRecord.apiProvider = findItem(apiProviderItems, saved.apiProvider) || defaultApiProviderItem;
        }

        if (!savedRecord.apiProvider && defaultApiProviderItem) {
            savedRecord.apiProvider = defaultApiProviderItem;
        }

        if (!w2ui.translationPrompt)
        {
            new w2form({
                name: 'translationPrompt',
                style: 'border: 0px; background-color: transparent;',
                formHTML:
                    '<div class="w2ui-page page-0 xqt-translation-prompt-form">'+
                    '    <div class="xqt-translation-prompt-row">'+
                    '        <label class="xqt-translation-prompt-label" for="sourceLcid">Source Lcid: <span class="xqt-required">*</span></label>'+
                    '        <div class="xqt-translation-prompt-control"><input name="sourceLcid" type="list" /></div>'+
                    '    </div>'+
                    '    <div class="xqt-translation-prompt-row">'+
                    '        <label class="xqt-translation-prompt-label" for="targetLcid">Target Lcid: <span class="xqt-required">*</span></label>'+
                    '        <div class="xqt-translation-prompt-control"><input name="targetLcid" type="list" /></div>'+
                    '    </div>'+
                    '    <div class="xqt-translation-prompt-row">'+
                    '        <label class="xqt-translation-prompt-label" for="translateMissing">Translate All:</label>'+
                    '        <div class="xqt-translation-prompt-control"><input name="translateMissing" type="list" /></div>'+
                    '    </div>'+
                    '    <div class="xqt-translation-prompt-row">'+
                    '        <label class="xqt-translation-prompt-label" for="apiProvider">API Provider:</label>'+
                    '        <div class="xqt-translation-prompt-control"><input name="apiProvider" type="list" /></div>'+
                    '    </div>'+
                    '    <div class="xqt-translation-prompt-row xqt-translation-prompt-check">'+
                    '        <label class="xqt-translation-prompt-label" for="useDictionaryFirst">Use Dictionary as First Priority:</label>'+
                    '        <div class="xqt-translation-prompt-control"><input name="useDictionaryFirst" type="checkbox" /></div>'+
                    '    </div>'+
                    '</div>'+
                    '<div class="w2ui-buttons">'+
                    '    <button class="w2ui-btn" name="cancel">Cancel</button>'+
                    '    <button class="w2ui-btn" name="ok">Ok</button>'+
                    '</div>',
                fields: [
                    { field: 'targetLcid', type: 'list', required: true, options: { items: languageItems } },
                    { field: 'sourceLcid', type: 'list', required: true, options: { items: languageItems } },
                    { field: 'translateMissing', type: 'list', required: false, options: { items: translateMissingItems } },
                    { field: 'apiProvider', type: 'list', required: false, options: { items: apiProviderItems } },
                    { field: 'useDictionaryFirst', type: 'checkbox', required: false }
                ],
                record: savedRecord,
                actions: {
                    "ok": function () {
                        this.validate();
                        w2popup.close();

                        var sourceLcid = this.record.sourceLcid.id;
                        var targetLcid = this.record.targetLcid.id;
                        var translateMissingVal = this.record.translateMissing ? this.record.translateMissing.id.trim() : "";
                        var apiProviderVal = this.record.apiProvider ? this.record.apiProvider.id : (defaultApiProvider ? defaultApiProvider.id : "");
                        var useDictionaryFirstVal = normalizeBoolean(this.record.useDictionaryFirst, true);

                        SaveTranslationPrompt({
                            sourceLcid: sourceLcid,
                            targetLcid: targetLcid,
                            translateMissing: translateMissingVal,
                            apiProvider: apiProviderVal,
                            useDictionaryFirst: useDictionaryFirstVal
                        });

                        var recordFilter = null;
                        if (translateMissingVal && translateMissingVal !== "overwrite") {
                            recordFilter = function(record) {
                                var targetVal = GetCurrentGridValue(record, targetLcid);

                                // "missing" - only records without target translation
                                return !HasTranslationText(targetVal);
                            };
                        }

                        XrmTranslator.ShowRecordSelector(
                            "TranslationHandler.ProposeTranslations",
                            [sourceLcid, targetLcid, translateMissingVal, apiProviderVal, useDictionaryFirstVal],
                            (XrmTranslator.GetGrid().getSelection() || []),
                            recordFilter,
                            {
                                title: "Records to Translate",
                                sourceLcid: sourceLcid,
                                leafOnly: true,
                                includeBranchRecords: ["bpf", "forms", "dashboards", "allInOne"].indexOf(XrmTranslator.GetType()) !== -1,
                                selectAllOnly: true,
                                excludeEmptySource: translateMissingVal !== "overwrite",
                                emptyMessage: translateMissingVal === "overwrite"
                                    ? "No records with source text found for the selected source language."
                                    : "No matching records found. All records already have translations for the target language."
                            }
                        );
                    },
                    "cancel": function () {
                        w2popup.close();
                    }
                }
            });
        }
        else {
            w2ui.translationPrompt.fields[0].options.items = languageItems;
            w2ui.translationPrompt.fields[1].options.items = languageItems;
            w2ui.translationPrompt.fields[2].options.items = translateMissingItems;
            w2ui.translationPrompt.fields[3].options.items = apiProviderItems;

            if (saved) {
                w2ui.translationPrompt.record = savedRecord;
            }

            w2ui.translationPrompt.refresh();
        }

        return Promise.resolve({});
    }

    TranslationHandler.ShowTranslationPrompt = function() {
        InitializeTranslationPrompt()
        .then(function() {
            w2popup.open({
                title   : 'Choose translations source and destination',
                name    : 'translationPopup',
                body    : '<div id="form" class="xqt-translation-prompt-popup-form"></div>',
                style   : 'padding: 0px; overflow-x: hidden;',
                width   : 650,
                height  : 360,
                showMax : false,
                onToggle: function (event) {
                    w2ui.translationPrompt.box.style.display = 'none';
                    event.onComplete = function () {
                        w2ui.translationPrompt.box.style.display = '';
                        w2ui.translationPrompt.resize();
                    }
                },
                onOpen: function (event) {
                    event.onComplete = function () {
                        // specifying an onOpen handler instead is equivalent to specifying an onBeforeOpen handler, which would make this code execute too early and hence not deliver.
                        w2ui.translationPrompt.render('#w2ui-popup #form');
                    }
                }
            });
        });
    }

    function MaskApiKey(key) {
        if (!key || key.length <= 5) return key || "";
        return key.substring(0, 5) + new Array(key.length - 4).join('*');
    }

    function InitializeAISettingsForm() {
        var geminiConfig = GetGeminiConfig();
        var omniRouteConfig = GetOmniRouteConfig();
        var azureFoundryConfig = GetAzureFoundryConfig();
        var openaiConfig = GetOpenAIConfig();
        var maskedGeminiKey = MaskApiKey(geminiConfig.apiKey);
        var maskedOmniRouteKey = MaskApiKey(omniRouteConfig.apiKey);
        var maskedAzureFoundryKey = MaskApiKey(azureFoundryConfig.apiKey);
        var maskedOpenaiKey = MaskApiKey(openaiConfig.apiKey);
        var nextPageIndex = 1;
        var aiSettingsTabs = [
            { id: 'tab-google', text: 'Google' }
        ];
        var aiSettingsFormHTML =
            '<div class="w2ui-page page-0" style="padding: 15px 25px;">'+
            '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
            '        <label style="min-width: 120px; white-space: nowrap;">URL: <span style="color: red;">*</span></label>'+
            '        <input name="geminiBaseUrl" type="text" readonly="readonly" style="flex: 1; width: 100%;"/>'+
            '    </div>'+
            '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
            '        <label style="min-width: 120px; white-space: nowrap;">API Key: <span style="color: red;">*</span></label>'+
            '        <input name="geminiApiKey" type="password" style="flex: 1; width: 100%;"/>'+
            '    </div>'+
            '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
            '        <label style="min-width: 120px; white-space: nowrap;">Model Name: <span style="color: red;">*</span></label>'+
            '        <input name="geminiModelName" type="text" style="flex: 1; width: 100%;"/>'+
            '    </div>'+
            '    <div style="display: flex; align-items: flex-start; margin-bottom: 10px;">'+
            '        <label style="min-width: 120px; white-space: nowrap; padding-top: 5px;">Custom Prompt:</label>'+
            '        <textarea name="geminiCustomPrompt" style="flex: 1; width: 100%; height: 80px;"></textarea>'+
            '    </div>'+
            '</div>';
        var aiSettingsFields = [
            { field: 'geminiBaseUrl', type: 'text', html: { page: 0 } },
            { field: 'geminiApiKey', type: 'text', html: { page: 0 } },
            { field: 'geminiModelName', type: 'text', html: { page: 0 } },
            { field: 'geminiCustomPrompt', type: 'text', html: { page: 0 } }
        ];
        var aiSettingsRecord = {
            geminiBaseUrl: geminiConfig.baseUrl || GEMINI_DEFAULT_BASE_URL,
            geminiApiKey: maskedGeminiKey,
            geminiModelName: geminiConfig.modelName || "",
            geminiCustomPrompt: geminiConfig.customPrompt || ""
        };

        if (IsOmniRouteEnabled()) {
            var omniRoutePageIndex = nextPageIndex++;
            aiSettingsTabs.push({ id: 'tab-omniroute', text: 'OmniRoute' });
            aiSettingsFormHTML +=
                '<div class="w2ui-page page-' + omniRoutePageIndex + '" style="padding: 15px 25px;">'+
                '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                '        <label style="min-width: 120px; white-space: nowrap;">URL: <span style="color: red;">*</span></label>'+
                '        <input name="omniRouteBaseUrl" type="text" style="flex: 1; width: 100%;"/>'+
                '    </div>'+
                '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                '        <label style="min-width: 120px; white-space: nowrap;">API Key: <span style="color: red;">*</span></label>'+
                '        <input name="omniRouteApiKey" type="password" style="flex: 1; width: 100%;"/>'+
                '    </div>'+
                '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                '        <label style="min-width: 120px; white-space: nowrap;">Model Name: <span style="color: red;">*</span></label>'+
                '        <input name="omniRouteModelName" type="text" style="flex: 1; width: 100%;"/>'+
                '    </div>'+
                '    <div style="display: flex; align-items: flex-start; margin-bottom: 10px;">'+
                '        <label style="min-width: 120px; white-space: nowrap; padding-top: 5px;">Custom Prompt:</label>'+
                '        <textarea name="omniRouteCustomPrompt" style="flex: 1; width: 100%; height: 80px;"></textarea>'+
                '    </div>'+
                '</div>';
            aiSettingsFields.push(
                { field: 'omniRouteBaseUrl', type: 'text', html: { page: omniRoutePageIndex } },
                { field: 'omniRouteApiKey', type: 'text', html: { page: omniRoutePageIndex } },
                { field: 'omniRouteModelName', type: 'text', html: { page: omniRoutePageIndex } },
                { field: 'omniRouteCustomPrompt', type: 'text', html: { page: omniRoutePageIndex } }
            );
            aiSettingsRecord.omniRouteBaseUrl = omniRouteConfig.baseUrl || "";
            aiSettingsRecord.omniRouteApiKey = maskedOmniRouteKey;
            aiSettingsRecord.omniRouteModelName = omniRouteConfig.modelName || "";
            aiSettingsRecord.omniRouteCustomPrompt = omniRouteConfig.customPrompt || "";
        }

        if (IsAzureFoundryEnabled()) {
            var azureFoundryPageIndex = nextPageIndex++;
            aiSettingsTabs.push({ id: 'tab-azure-foundry', text: 'Azure Foundry' });
            aiSettingsFormHTML +=
                '<div class="w2ui-page page-' + azureFoundryPageIndex + '" style="padding: 15px 25px;">'+
                '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                '        <label style="min-width: 120px; white-space: nowrap;">URL: <span style="color: red;">*</span></label>'+
                '        <input name="azureFoundryBaseUrl" type="text" style="flex: 1; width: 100%;"/>'+
                '    </div>'+
                '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                '        <label style="min-width: 120px; white-space: nowrap;">API Key: <span style="color: red;">*</span></label>'+
                '        <input name="azureFoundryApiKey" type="password" style="flex: 1; width: 100%;"/>'+
                '    </div>'+
                '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                '        <label style="min-width: 120px; white-space: nowrap;">Model Name: <span style="color: red;">*</span></label>'+
                '        <input name="azureFoundryModelName" type="text" style="flex: 1; width: 100%;"/>'+
                '    </div>'+
                '    <div style="display: flex; align-items: flex-start; margin-bottom: 10px;">'+
                '        <label style="min-width: 120px; white-space: nowrap; padding-top: 5px;">Custom Prompt:</label>'+
                '        <textarea name="azureFoundryCustomPrompt" style="flex: 1; width: 100%; height: 80px;"></textarea>'+
                '    </div>'+
                '</div>';
            aiSettingsFields.push(
                { field: 'azureFoundryBaseUrl', type: 'text', html: { page: azureFoundryPageIndex } },
                { field: 'azureFoundryApiKey', type: 'text', html: { page: azureFoundryPageIndex } },
                { field: 'azureFoundryModelName', type: 'text', html: { page: azureFoundryPageIndex } },
                { field: 'azureFoundryCustomPrompt', type: 'text', html: { page: azureFoundryPageIndex } }
            );
            aiSettingsRecord.azureFoundryBaseUrl = azureFoundryConfig.baseUrl || "";
            aiSettingsRecord.azureFoundryApiKey = maskedAzureFoundryKey;
            aiSettingsRecord.azureFoundryModelName = azureFoundryConfig.modelName || "";
            aiSettingsRecord.azureFoundryCustomPrompt = azureFoundryConfig.customPrompt || "";
        }

        if (IsOpenAIEnabled()) {
            var openaiPageIndex = nextPageIndex++;
            aiSettingsTabs.push({ id: 'tab-openai', text: 'OpenAI' });
            aiSettingsFormHTML +=
                '<div class="w2ui-page page-' + openaiPageIndex + '" style="padding: 15px 25px;">'+
                '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                '        <label style="min-width: 120px; white-space: nowrap;">URL: <span style="color: red;">*</span></label>'+
                '        <input name="openaiBaseUrl" type="text" style="flex: 1; width: 100%;"/>'+
                '    </div>'+
                '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                '        <label style="min-width: 120px; white-space: nowrap;">API Key: <span style="color: red;">*</span></label>'+
                '        <input name="openaiApiKey" type="password" style="flex: 1; width: 100%;"/>'+
                '    </div>'+
                '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                '        <label style="min-width: 120px; white-space: nowrap;">Model Name: <span style="color: red;">*</span></label>'+
                '        <input name="openaiModelName" type="text" style="flex: 1; width: 100%;"/>'+
                '    </div>'+
                '    <div style="display: flex; align-items: flex-start; margin-bottom: 10px;">'+
                '        <label style="min-width: 120px; white-space: nowrap; padding-top: 5px;">Custom Prompt:</label>'+
                '        <textarea name="openaiCustomPrompt" style="flex: 1; width: 100%; height: 80px;"></textarea>'+
                '    </div>'+
                '</div>';
            aiSettingsFields.push(
                { field: 'openaiBaseUrl', type: 'text', html: { page: openaiPageIndex } },
                { field: 'openaiApiKey', type: 'text', html: { page: openaiPageIndex } },
                { field: 'openaiModelName', type: 'text', html: { page: openaiPageIndex } },
                { field: 'openaiCustomPrompt', type: 'text', html: { page: openaiPageIndex } }
            );
            aiSettingsRecord.openaiBaseUrl = openaiConfig.baseUrl || "";
            aiSettingsRecord.openaiApiKey = maskedOpenaiKey;
            aiSettingsRecord.openaiModelName = openaiConfig.modelName || "";
            aiSettingsRecord.openaiCustomPrompt = openaiConfig.customPrompt || "";
        }

        aiSettingsFormHTML +=
            '<div class="w2ui-buttons">'+
            '    <button class="w2ui-btn" name="cancel">Cancel</button>'+
            '    <button class="w2ui-btn" name="save">Save</button>'+
            '</div>';

        if (w2ui.aiSettings) {
            w2ui.aiSettings.destroy();
        }

        if (!w2ui.aiSettings) {
            new w2form({
                name: 'aiSettings',
                style: 'border: 0px; background-color: transparent;',
                tabs: aiSettingsTabs,
                formHTML: aiSettingsFormHTML,
                fields: aiSettingsFields,
                record: aiSettingsRecord,
                actions: {
                    "save": function () {
                        var currentGemini = GetGeminiConfig();
                        var geminiKeyToSave = this.record.geminiApiKey;
                        if (geminiKeyToSave && geminiKeyToSave.indexOf("*") !== -1 && currentGemini && currentGemini.apiKey) {
                            geminiKeyToSave = currentGemini.apiKey;
                        }
                        SaveGeminiConfig({
                            baseUrl: this.record.geminiBaseUrl || GEMINI_DEFAULT_BASE_URL,
                            apiKey: geminiKeyToSave || "",
                            modelName: this.record.geminiModelName || "",
                            customPrompt: this.record.geminiCustomPrompt || ""
                        });

                        if (IsOmniRouteEnabled()) {
                            var currentOmniRoute = GetOmniRouteConfig();
                            var omniRouteKeyToSave = this.record.omniRouteApiKey;
                            if (omniRouteKeyToSave && omniRouteKeyToSave.indexOf("*") !== -1 && currentOmniRoute && currentOmniRoute.apiKey) {
                                omniRouteKeyToSave = currentOmniRoute.apiKey;
                            }
                            SaveOmniRouteConfig({
                                baseUrl: this.record.omniRouteBaseUrl || "",
                                apiKey: omniRouteKeyToSave || "",
                                modelName: this.record.omniRouteModelName || "",
                                customPrompt: this.record.omniRouteCustomPrompt || ""
                            });
                        }

                        if (IsAzureFoundryEnabled()) {
                            var currentAzureFoundry = GetAzureFoundryConfig();
                            var azureFoundryKeyToSave = this.record.azureFoundryApiKey;
                            if (azureFoundryKeyToSave && azureFoundryKeyToSave.indexOf("*") !== -1 && currentAzureFoundry && currentAzureFoundry.apiKey) {
                                azureFoundryKeyToSave = currentAzureFoundry.apiKey;
                            }
                            SaveAzureFoundryConfig({
                                baseUrl: this.record.azureFoundryBaseUrl || "",
                                apiKey: azureFoundryKeyToSave || "",
                                modelName: this.record.azureFoundryModelName || "",
                                customPrompt: this.record.azureFoundryCustomPrompt || ""
                            });
                        }

                        if (IsOpenAIEnabled()) {
                            var currentOpenai = GetOpenAIConfig();
                            var openaiKeyToSave = this.record.openaiApiKey;
                            if (openaiKeyToSave && openaiKeyToSave.indexOf("*") !== -1 && currentOpenai && currentOpenai.apiKey) {
                                openaiKeyToSave = currentOpenai.apiKey;
                            }
                            SaveOpenAIConfig({
                                baseUrl: this.record.openaiBaseUrl || "",
                                apiKey: openaiKeyToSave || "",
                                modelName: this.record.openaiModelName || "",
                                customPrompt: this.record.openaiCustomPrompt || ""
                            });
                        }

                        w2popup.close();
                        w2alert("AI settings saved successfully.");
                    },
                    "cancel": function () {
                        w2popup.close();
                    }
                }
            });
        }
        else {
            w2ui.aiSettings.record = aiSettingsRecord;
            w2ui.aiSettings.refresh();
        }

        return Promise.resolve({});
    }

    TranslationHandler.ShowAISettings = function() {
        InitializeAISettingsForm()
        .then(function() {
            w2popup.open({
                title   : 'AI Translation Settings',
                name    : 'aiSettingsPopup',
                body    : '<div id="form" style="width: 100%; height: 100%;"></div>',
                style   : 'padding: 15px 0px 0px 0px',
                width   : 650,
                height  : 420,
                showMax : false,
                onOpen: function (event) {
                    event.onComplete = function () {
                        w2ui.aiSettings.render('#w2ui-popup #form');
                    }
                }
            });
        });
    }

    TranslationHandler.ShowApplyDictionaryPrompt = function() {
        var applyModeItems = [
            { id: "overwrite", text: "All Overwrite" },
            { id: "missing", text: "All Missing" }
        ];

        if (w2ui.applyDictionaryPrompt) {
            w2ui.applyDictionaryPrompt.destroy();
        }

        if (!w2ui.applyDictionaryPrompt) {
            new w2form({
                name: 'applyDictionaryPrompt',
                style: 'border: 0px; background-color: transparent;',
                formHTML:
                    '<div class="w2ui-page page-0 xqt-apply-dictionary-form">'+
                    '    <p class="xqt-apply-dictionary-description">Apply existing dictionary entries to all matching records in the current grid.</p>'+
                    '    <div class="xqt-apply-dictionary-row">'+
                    '        <label class="xqt-apply-dictionary-label" for="applyMode">Mode:</label>'+
                    '        <div class="xqt-apply-dictionary-control"><input name="applyMode" type="list" /></div>'+
                    '    </div>'+
                    '</div>'+
                    '<div class="w2ui-buttons">'+
                    '    <button class="w2ui-btn" name="cancel">Cancel</button>'+
                    '    <button class="w2ui-btn" name="ok">Ok</button>'+
                    '</div>',
                fields: [
                    { field: 'applyMode', type: 'list', required: true, options: { items: applyModeItems } }
                ],
                record: {
                    applyMode: applyModeItems[0]
                },
                actions: {
                    "ok": function () {
                        if (this.validate().length > 0) return;
                        var mode = this.record.applyMode ? this.record.applyMode.id : "overwrite";
                        w2popup.close();
                        ApplyDictionaryToGrid(mode);
                    },
                    "cancel": function () {
                        w2popup.close();
                    }
                }
            });
        }

        w2popup.open({
            title   : 'Apply Dictionary',
            name    : 'applyDictionaryPopup',
            body    : '<div id="form" class="xqt-apply-dictionary-popup-form"></div>',
            style   : 'padding: 0px; overflow-x: hidden;',
            width   : 620,
            height  : 230,
            showMax : false,
            onOpen: function (event) {
                event.onComplete = function () {
                    w2ui.applyDictionaryPrompt.render('#w2ui-popup #form');
                    w2ui.applyDictionaryPrompt.resize();
                }
            }
        });
    }

    function ApplyDictionaryToGrid(mode) {
        if (!window.TranslationDictionaryService || !TranslationDictionaryService.SplitRecordsByDictionary) {
            w2alert("Dictionary service is not available.");
            return;
        }

        XrmTranslator.LockGrid("Applying dictionary...");

        XrmTranslator.GetBaseLanguage()
        .then(function(baseLanguage) {
            var baseLcid = String(baseLanguage);
            var targetLcids = XrmTranslator.GetColumns(false).filter(function(c) { return String(c) !== baseLcid; });

            if (!targetLcids.length) {
                XrmTranslator.UnlockGrid();
                w2alert("No target language columns found.");
                return;
            }

            var allRecords = XrmTranslator.GetAllRecords();

            function getCurrentValue(record, lcid) {
                if (record.w2ui && record.w2ui.changes && Object.prototype.hasOwnProperty.call(record.w2ui.changes, lcid)) {
                    return record.w2ui.changes[lcid];
                }
                return record[lcid] || record[String(lcid)];
            }

            var promises = targetLcids.map(function(targetLcid) {
                var filteredRecords = allRecords.filter(function(record) {
                    var sourceVal = getCurrentValue(record, baseLcid);
                    var targetVal = getCurrentValue(record, targetLcid);

                    if (!HasTranslationText(sourceVal)) return false;

                    if (mode === "missing") return !HasTranslationText(targetVal);
                    return true; // overwrite
                });

                if (!filteredRecords.length) {
                    return Promise.resolve([]);
                }

                return TranslationDictionaryService.SplitRecordsByDictionary(baseLcid, targetLcid, filteredRecords)
                .then(function(split) {
                    return split.matchedResults || [];
                });
            });

            return Promise.all(promises)
            .then(function(resultsPerLang) {
                var grid = XrmTranslator.GetGrid();
                var totalApplied = 0;

                for (var i = 0; i < resultsPerLang.length; i++) {
                    var results = resultsPerLang[i];
                    for (var j = 0; j < results.length; j++) {
                        var result = results[j];
                        var record = XrmTranslator.GetByRecId(allRecords, result.recid);
                        if (!record) continue;

                        if (XrmTranslator.ApplyGridChangeValue(record, result.column, result.translation)) {
                            totalApplied++;
                            grid.refreshRow(record.recid);
                        }
                    }
                }

                XrmTranslator.SetSaveButtonDisabled(!XrmTranslator.HasPendingChanges());

                XrmTranslator.UnlockGrid();
                w2alert("Applied " + totalApplied + " dictionary translation(s).");
            });
        })
        .catch(function(error) {
            XrmTranslator.errorHandler(error);
        });
    }

    function GetLocales () {
        if (locales) {
            return Promise.resolve(locales);
        }

        return WebApiClient.Retrieve({overriddenSetName: "languagelocale", queryParams: "?$select=language,localeid,code"})
        .then(function(result) {
            locales = result.value;

            return locales;
        });
    }

    TranslationHandler.GetLanguageNamesByLcids = function(lcids) {
        return GetLocales()
        .then(function (locales) {
            return lcids.map(function (lcid) {
                var locale = locales.find(function (l) { return l.localeid == lcid }) || {};

                return {
                    lcid: lcid,
                    locale: locale.language || lcid
                };
            });
        });
    }

    function FormatLanguageColumnText(language, locale) {
        var languageName = locale.language || language;
        var localeCode = locale.code ? " (" + locale.code + ")" : "";

        return languageName + localeCode + " (" + language + ")";
    }

    TranslationHandler.FillLanguageCodes = function(languages, userSettings) {
        var grid = XrmTranslator.GetGrid();
        var languageCount = languages.length;

        // Reset schema name col
        grid.columns[0].size = XrmTranslator.defaultSchemaNameSize;

        return GetLocales()
        .then(function(locales) {
            // 100% full width, minus length of the schema name grid, divided by number of languages is space left for each language
            var columnWidth = (100 - parseInt(XrmTranslator.defaultSchemaNameSize.replace("%"))) / languageCount;

            for (var i = 0; i < languages.length; i++) {
                var language = languages[i];
                var locale = locales.find(function (l) { return l.localeid == language }) || {};

                var columnText = FormatLanguageColumnText(language, locale);

                grid.addColumn({ field: language, text: columnText, size: columnWidth + "%", sortable: true, editable: { type: 'text' } });
                grid.addSearch({ field: language, text: columnText, type: 'text' });
            }

            return languages;
        });
    }

    TranslationHandler.FillPortalLanguageCodes = function(portalLanguages) {
        var grid = XrmTranslator.GetGrid();

        // Reset schema name col
        grid.columns[0].size = XrmTranslator.defaultSchemaNameSize;

        var languages = portalLanguages
            .reduce(function(all, cur) { if (!all[cur.adx_PortalLanguageId.adx_languagecode]) { all[cur.adx_PortalLanguageId.adx_languagecode] = cur.adx_PortalLanguageId.adx_lcid.toString() } return all; }, {});

        var locales = Object.keys(languages);
        var columnWidth = (100 - parseInt(XrmTranslator.defaultSchemaNameSize.replace("%"))) / locales.length;

        for (var i = 0; i < locales.length; i++) {
            var locale = locales[i];

            var editable = { type: 'text' };

            grid.addColumn({ field: languages[locale], text: locale, size: columnWidth + "%", sortable: true, editable: editable });
            grid.addSearch({ field: languages[locale], text: locale, type: 'text' });
        }

        return languages;
    }

    /**
     * Returns object with adx_websitelanguageid as key and string lcid as value
     */
    TranslationHandler.FindPortalLanguages = function () {
        return WebApiClient.Retrieve({entityName: "adx_websitelanguage", queryParams: "?$select=_adx_websiteid_value&$expand=adx_PortalLanguageId($select=adx_lcid,adx_languagecode,adx_portallanguageid)"})
        .then(function (r) {
            const languages = r.value;
            languages.sort(function(a, b) { return ((a.adx_PortalLanguageId || {}).adx_languagecode || "").localeCompare((b.adx_PortalLanguageId || {}).adx_languagecode || "")});

            return languages;
        });
    }

    TranslationHandler.GetAvailableLanguages = function() {
        return WebApiClient.Execute(WebApiClient.Requests.RetrieveAvailableLanguagesRequest);
    }
} (window.TranslationHandler = window.TranslationHandler || {}));

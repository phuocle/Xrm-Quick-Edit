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
    var GEMINI_CONFIG_KEY = "XrmQuickEdit_GeminiConfig";
    var TRANSLATION_PROMPT_KEY = "XrmQuickEdit_TranslationPrompt";
    var translationProviders = [];

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

    function GetGeminiConfig() {
        try {
            var stored = localStorage.getItem(GEMINI_CONFIG_KEY);
            return stored ? JSON.parse(stored) : { apiKey: "", modelName: "gemini-2.0-flash", customPrompt: "" };
        } catch(e) {
            return { apiKey: "", modelName: "gemini-2.0-flash", customPrompt: "" };
        }
    }

    function SaveGeminiConfig(config) {
        localStorage.setItem(GEMINI_CONFIG_KEY, JSON.stringify(config));
    }

    TranslationHandler.GetGeminiConfig = GetGeminiConfig;

    function GetLanguageIsoByLcid (lcid) {
        var locByLocales = locales.find(function(loc) { return loc.localeid === lcid; });

        if (locByLocales) {
            return locByLocales.code.substr(0, 2);
        }

        var locByColumns = XrmTranslator.GetGrid().columns.find(function(c) { return c.field === lcid});

        if (locByColumns) {
            return locByColumns.caption.substr(0, 2);
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
            if (String(provider.id).toLowerCase() === normalized) {
                return provider;
            }
        }

        return null;
    }

    function GetDefaultTranslationProvider() {
        return translationProviders.length ? translationProviders[0] : null;
    }

    function GetTranslationProviderItems() {
        return translationProviders.map(function(provider) {
            return {
                id: provider.id,
                text: provider.text
            };
        });
    }

    const geminiTranslator = function (apiKey, modelName, customPrompt) {
        var apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" +
            encodeURIComponent(modelName) + ":generateContent";

        this.GetBatchTranslations = function(fromLanguage, destLanguage, phrases) {
            $.support.cors = true;

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

            return WebApiClient.Promise.resolve($.ajax({
                url: apiUrl + "?key=" + encodeURIComponent(apiKey),
                type: "POST",
                crossDomain: true,
                contentType: "application/json",
                dataType: "json",
                data: JSON.stringify(requestBody)
            }))
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
                    schemaName: record.schemaName,
                    column: destLcid,
                    source: record[fromLcid],
                    translation: translation
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
                return "Gemini: API Key is missing. Please configure it via the Gemini Settings button.";
            }

            return null;
        },
        create: function() {
            var geminiConfig = GetGeminiConfig();
            return new geminiTranslator(geminiConfig.apiKey, geminiConfig.modelName, geminiConfig.customPrompt);
        }
    });

    TranslationHandler.ApplyTranslations = function (selected, results) {
        var grid = XrmTranslator.GetGrid();
        var savable = false;

        for (var i = 0; i < selected.length; i++) {
            var select = selected[i];

            var result = XrmTranslator.GetByRecId(results, select);
            var record = XrmTranslator.GetByRecId(XrmTranslator.GetAllRecords(), result.recid);

            if (!record) {
                continue;
            }

            if (!record.w2ui) {
                record["w2ui"] = {};
            }

            if (!record.w2ui.changes) {
                record.w2ui["changes"] = {};
            }

            record.w2ui.changes[result.column] = (result.w2ui &&result.w2ui.changes) ? result.w2ui.changes.translation : result.translation;
            savable = true;
            grid.refreshRow(record.recid);
        }

        if (savable) {
            XrmTranslator.SetSaveButtonDisabled(false);
        }
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

                if (!record.w2ui) {
                    record.w2ui = {};
                }

                if (!record.w2ui.changes) {
                    record.w2ui.changes = {};
                }

                for (var j = 0; j < targetColumns.length; j++) {
                    var targetLcid = targetColumns[j];
                    record.w2ui.changes[targetLcid] = sourceValue + " " + targetLcid + " " + randomSuffix3();
                    updates++;
                }

                grid.refreshRow(record.recid);
            }

            if (updates > 0) {
                XrmTranslator.SetSaveButtonDisabled(false);
            }

            XrmTranslator.UnlockGrid();
        })
        .catch(XrmTranslator.errorHandler);
    }

    function ShowTranslationResults (results) {
        if (!w2ui.translationResultGrid) {
            var grid = {
                name: 'translationResultGrid',
                show: { selectColumn: true },
                multiSelect: true,
                columns: [
                    { field: 'schemaName', caption: 'Schema Name', size: '25%', sortable: true, searchable: true },
                    { field: 'column', caption: 'Column LCID', sortable: true, searchable: true, hidden: true },
                    { field: 'source', caption: 'Source Text', size: '25%', sortable: true, searchable: true },
                    { field: 'translation', caption: 'Translated Text', size: '25%', sortable: true, searchable: true, editable: { type: 'text' } }
                ],
                records: []
            };

            $(function () {
                // initialization in memory
                $().w2grid(grid);
            });
        }

        w2ui.translationResultGrid.clear();
        w2ui.translationResultGrid.add(results);

        w2popup.open({
            title   : 'Apply Translation Results',
            buttons   : '<button class="w2ui-btn" onclick="w2popup.close();">Cancel</button> '+
                        '<button class="w2ui-btn" onclick="TranslationHandler.ApplyTranslations(w2ui.translationResultGrid.getSelection(), w2ui.translationResultGrid.records); w2popup.close();">Apply</button>',
            width   : 900,
            height  : 600,
            showMax : true,
            body    : '<div id="main" style="position: absolute; left: 5px; top: 5px; right: 5px; bottom: 5px;"></div>',
            onOpen  : function (event) {
                event.onComplete = function () {
                    $('#w2ui-popup #main').w2render('translationResultGrid');
                    w2ui.translationResultGrid.selectAll();
                };
            },
            onToggle: function (event) {
                $(w2ui.translationResultGrid.box).hide();
                event.onComplete = function () {
                    $(w2ui.translationResultGrid.box).show();
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

    TranslationHandler.ProposeTranslations = function(recordsRaw, fromLcid, destLcid, translateMissing, apiProvider) {
        XrmTranslator.LockGrid("Translating...");

        function getCurrentValue(record, lcid) {
            if (record.w2ui && record.w2ui.changes && Object.prototype.hasOwnProperty.call(record.w2ui.changes, lcid)) {
                return record.w2ui.changes[lcid];
            }

            return record[lcid] || record[String(lcid)];
        }

        function shouldIncludeRecord(record, mode) {
            var sourceVal = getCurrentValue(record, fromLcid);
            var targetVal = getCurrentValue(record, destLcid);

            if (mode === "missing") {
                return !targetVal;
            }

            if (mode === "missingOrIdentical") {
                return !targetVal || sourceVal === targetVal;
            }

            if (mode === "overwrite") {
                return true;
            }

            // Backward compatibility with previously saved empty mode.
            return !targetVal;
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
                var errorMsg = result[1] || "(No error message returned - check config)";
                XrmTranslator.UnlockGrid();
                w2alert(errorMsg);
                return null;
            }

            var updateRecords = [];

            for (var i = 0; i < records.length; i++) {
                var record = records[i];

                // Skip records that have no source text
                if (!record[fromLcid]) {
                    continue;
                }

                updateRecords.push(record);
            }

            if (updateRecords.length === 0) {
                XrmTranslator.UnlockGrid();
                w2alert("No records to translate. All selected records have empty source text for the source language.");
                return null;
            }

            if (translator.GetBatchTranslations) {
                var phrases = updateRecords.map(function(record) {
                    return w2utils.decodeTags(record[fromLcid]);
                });

                return translator.GetBatchTranslations(fromIso, toIso, phrases)
                .then(function(translatedPhrases) {
                    var results = translator.AddTranslations(fromLcid, destLcid, updateRecords, translatedPhrases);
                    ShowTranslationResults(results);
                    XrmTranslator.UnlockGrid();
                });
            }

            // Generic per-record mode for future provider extensions.
            var translationRequests = [];

            for (var i = 0; i < updateRecords.length; i++) {
                var record = updateRecords[i];

                const source = XrmTranslator.config.translationExceptions && XrmTranslator.config.translationExceptions.length
                ? XrmTranslator.config.translationExceptions.reduce(function(all, cur) {
                    return (all || "").replace(new RegExp(cur, "gmi"), '<escape data="$1"/>')
                }, record[fromLcid])
                : record[fromLcid]

                translationRequests.push(translator.GetTranslation(fromIso, toIso, w2utils.decodeTags(source)));
            }

            return WebApiClient.Promise.all(translationRequests)
            .then(function (responses) {
                var results = translator.AddTranslations(fromLcid, destLcid, updateRecords, responses);
                ShowTranslationResults(results);
                XrmTranslator.UnlockGrid();
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

            languageItems.push({ id: availableLanguages[i].field, text: availableLanguages[i].caption });
        }

        var saved = GetSavedTranslationPrompt();
        var translateMissingItems = [
            { id: "missing", text: "All Missing" },
            { id: "missingOrIdentical", text: "All Missing Or Identical" },
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
            $().w2form({
                name: 'translationPrompt',
                style: 'border: 0px; background-color: transparent;',
                formHTML:
                    '<div class="w2ui-page page-0" style="padding: 15px 25px;">'+
                    '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                    '        <label style="min-width: 110px; white-space: nowrap;">Source Lcid: <span style="color: red;">*</span></label>'+
                    '        <input name="sourceLcid" type="list" style="flex: 1; width: 100%;"/>'+
                    '    </div>'+
                    '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                    '        <label style="min-width: 110px; white-space: nowrap;">Target Lcid: <span style="color: red;">*</span></label>'+
                    '        <input name="targetLcid" type="list" style="flex: 1; width: 100%;"/>'+
                    '    </div>'+
                    '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                    '        <label style="min-width: 110px; white-space: nowrap;">Translate All:</label>'+
                    '        <input name="translateMissing" type="list" style="flex: 1; width: 100%;"/>'+
                    '    </div>'+
                    '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                    '        <label style="min-width: 110px; white-space: nowrap;">API Provider:</label>'+
                    '        <input name="apiProvider" type="list" style="flex: 1; width: 100%;"/>'+
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
                    { field: 'apiProvider', type: 'list', required: false, options: { items: apiProviderItems } }
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

                        SaveTranslationPrompt({
                            sourceLcid: sourceLcid,
                            targetLcid: targetLcid,
                            translateMissing: translateMissingVal,
                            apiProvider: apiProviderVal
                        });

                        var recordFilter = null;
                        if (translateMissingVal) {
                            recordFilter = function(record) {
                                var targetVal = record[targetLcid] || record[String(targetLcid)];
                                var sourceVal = record[sourceLcid] || record[String(sourceLcid)];

                                if (translateMissingVal === "overwrite") {
                                    return true;
                                }

                                if (translateMissingVal === "missingOrIdentical") {
                                    return !targetVal || sourceVal === targetVal;
                                }

                                // "missing" - only records without target translation
                                return !targetVal;
                            };
                        }

                        XrmTranslator.ShowRecordSelector("TranslationHandler.ProposeTranslations", [sourceLcid, targetLcid, translateMissingVal, apiProviderVal], (XrmTranslator.GetGrid().getSelection() || []), recordFilter);
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
            $().w2popup('open', {
                title   : 'Choose tranlations source and destination',
                name    : 'translationPopup',
                body    : '<div id="form" style="width: 100%; height: 100%;"></div>',
                style   : 'padding: 15px 0px 0px 0px',
                width   : 650,
                height  : 320,
                showMax : true,
                onToggle: function (event) {
                    $(w2ui.translationPrompt.box).hide();
                    event.onComplete = function () {
                        $(w2ui.translationPrompt.box).show();
                        w2ui.translationPrompt.resize();
                    }
                },
                onOpen: function (event) {
                    event.onComplete = function () {
                        // specifying an onOpen handler instead is equivalent to specifying an onBeforeOpen handler, which would make this code execute too early and hence not deliver.
                        $('#w2ui-popup #form').w2render('translationPrompt');
                    }
                }
            });
        });
    }

    function MaskApiKey(key) {
        if (!key || key.length <= 5) return key || "";
        return key.substring(0, 5) + new Array(key.length - 4).join('*');
    }

    function InitializeGeminiSettingsForm() {
        var config = GetGeminiConfig();
        var maskedKey = MaskApiKey(config.apiKey);

        if (!w2ui.geminiSettings) {
            $().w2form({
                name: 'geminiSettings',
                style: 'border: 0px; background-color: transparent;',
                formHTML:
                    '<div class="w2ui-page page-0" style="padding: 15px 25px;">'+
                    '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                    '        <label style="min-width: 120px; white-space: nowrap;">API Key: <span style="color: red;">*</span></label>'+
                    '        <input name="apiKey" type="password" style="flex: 1; width: 100%;"/>'+
                    '    </div>'+
                    '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                    '        <label style="min-width: 120px; white-space: nowrap;">Model Name: <span style="color: red;">*</span></label>'+
                    '        <input name="modelName" type="text" style="flex: 1; width: 100%;"/>'+
                    '    </div>'+
                    '    <div style="display: flex; align-items: flex-start; margin-bottom: 10px;">'+
                    '        <label style="min-width: 120px; white-space: nowrap; padding-top: 5px;">Custom Prompt:</label>'+
                    '        <textarea name="customPrompt" style="flex: 1; width: 100%; height: 80px;"></textarea>'+
                    '    </div>'+
                    '</div>'+
                    '<div class="w2ui-buttons">'+
                    '    <button class="w2ui-btn" name="cancel">Cancel</button>'+
                    '    <button class="w2ui-btn" name="save">Save</button>'+
                    '</div>',
                fields: [
                    { field: 'apiKey', type: 'text', required: true },
                    { field: 'modelName', type: 'text', required: true },
                    { field: 'customPrompt', type: 'text', required: false }
                ],
                record: {
                    apiKey: maskedKey,
                    modelName: config.modelName || "gemini-2.0-flash",
                    customPrompt: config.customPrompt || ""
                },
                actions: {
                    "save": function () {
                        if (this.validate().length > 0) {
                            return;
                        }
                        var currentConfig = GetGeminiConfig();
                        var apiKeyToSave = this.record.apiKey;
                        if (apiKeyToSave.indexOf("*") !== -1 && currentConfig && currentConfig.apiKey) {
                            apiKeyToSave = currentConfig.apiKey;
                        }
                        SaveGeminiConfig({
                            apiKey: apiKeyToSave,
                            modelName: this.record.modelName,
                            customPrompt: this.record.customPrompt
                        });
                        w2popup.close();
                        w2alert("Gemini settings saved successfully.");
                    },
                    "cancel": function () {
                        w2popup.close();
                    }
                }
            });
        }
        else {
            w2ui.geminiSettings.record = {
                apiKey: maskedKey,
                modelName: config.modelName || "gemini-2.0-flash",
                customPrompt: config.customPrompt || ""
            };
            w2ui.geminiSettings.refresh();
        }

        return Promise.resolve({});
    }

    TranslationHandler.ShowGeminiSettings = function() {
        InitializeGeminiSettingsForm()
        .then(function() {
            $().w2popup('open', {
                title   : 'Gemini AI Translation Settings',
                name    : 'geminiSettingsPopup',
                body    : '<div id="form" style="width: 100%; height: 100%;"></div>',
                style   : 'padding: 15px 0px 0px 0px',
                width   : 650,
                height  : 350,
                showMax : true,
                onToggle: function (event) {
                    $(w2ui.geminiSettings.box).hide();
                    event.onComplete = function () {
                        $(w2ui.geminiSettings.box).show();
                        w2ui.geminiSettings.resize();
                    }
                },
                onOpen: function (event) {
                    event.onComplete = function () {
                        $('#w2ui-popup #form').w2render('geminiSettings');
                    }
                }
            });
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

    TranslationHandler.FillLanguageCodes = function(languages, userSettings, config) {
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

                var editable = config.lockedLanguages && config.lockedLanguages.indexOf(language) !== -1 ? null : { type: 'text' };

                grid.addColumn({ field: language, caption: `${locale.language || language} (${locale.code})`, size: columnWidth + "%", sortable: true, editable: editable });
                grid.addSearch({ field: language, caption: `${locale.language || language} (${locale.code})`, type: 'text' });

                if (config.hideLanguagesByDefault && language !== userSettings.uilanguageid) {
                    grid.hideColumn(language);
                }
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

            grid.addColumn({ field: languages[locale], caption: locale, size: columnWidth + "%", sortable: true, editable: editable });
            grid.addSearch({ field: languages[locale], caption: locale, type: 'text' });
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

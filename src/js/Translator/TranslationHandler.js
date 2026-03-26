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

    const deeplTranslator = function (authKey) {
        var baseUrl = "https://api.deepl.com/v2";
        var translationApiUrl = baseUrl + "/translate?auth_key=[auth_key]&source_lang=[source_lang]&target_lang=[target_lang]&text=[text]&tag_handling=xml";

        function BuildTranslationUrl (fromLanguage, destLanguage, phrase) {
            return translationApiUrl
                .replace("[auth_key]", authKey)
                .replace("[source_lang]", fromLanguage)
                .replace("[target_lang]", destLanguage)
                .replace("[text]", encodeURIComponent(phrase));
        }
    
        this.GetTranslation = function(fromLanguage, destLanguage, phrase) {
            $.support.cors = true;
    
            return WebApiClient.Promise.resolve($.ajax({
                url: BuildTranslationUrl(fromLanguage, destLanguage, phrase),
                type: "GET",
                crossDomain: true,
                dataType: "json"
            }));
        }
        
        this.AddTranslations = function(fromLcid, destLcid, updateRecords, responses) {
            var translations = [];
    
            for (var i = 0; i < updateRecords.length; i++) {
                var response = responses[i];
                var updateRecord = updateRecords[i];
    
                if (response.translations.length > 0) {
                    var decoded = response.translations[0].text.replace(/<escape data="(.*?(?="\/>))"\/>/gi, "$1");
                    var translation = w2utils.encodeTags(decoded);
    
                    var record = XrmTranslator.GetByRecId(updateRecords, updateRecord.recid);
    
                    if (!record) {
                        continue;
                    }
    
                    translations.push({
                        recid: record.recid,
                        schemaName: record.schemaName,
                        column: destLcid,
                        source: record[fromLcid],
                        translation: translation
                    });
                }
            }

            return translations;
        }

        this.CanTranslate = function(fromLcid, destLcid) {
            $.support.cors = true;
    
            return WebApiClient.Promise.resolve($.ajax({
                url: baseUrl + "/languages?auth_key=" + authKey,
                type: "GET",
                crossDomain: true,
                dataType: "json"
            }))
            .then(function(result) {
                const canTranslateSource = result.some(function (l) {
                    return l.language.toLowerCase() === fromLcid.toLowerCase()
                });

                const canTranslateTarget = result.some(function (l) {
                    return l.language.toLowerCase() === destLcid.toLowerCase()
                });

                return {
                    [fromLcid]: canTranslateSource,
                    [destLcid]: canTranslateTarget
                };
            });
        }
    };   

    const azureTranslator = function (authKey, region) {
        var baseUrl = "https://api.cognitive.microsofttranslator.com";
        var translationApiUrl = baseUrl + "/translate?api-version=3.0&from=[source_lang]&to=[target_lang]&textType=html";
        var languageUrl = baseUrl + "/languages?api-version=3.0";

        function BuildTranslationUrl (fromLanguage, destLanguage) {
            return translationApiUrl
                .replace("[source_lang]", fromLanguage)
                .replace("[target_lang]", destLanguage);
        }
    
        this.GetTranslation = function(fromLanguage, destLanguage, phrase) {
            $.support.cors = true;

            const headers = {
                "Ocp-Apim-Subscription-Key": authKey
            };

            if (region) {
                headers["Ocp-Apim-Subscription-Region"] = region;
            }

            return WebApiClient.Promise.resolve($.ajax({
                url: BuildTranslationUrl(fromLanguage, destLanguage),
                dataType: "json",
                contentType: "application/json",
                type: "POST",
                data: JSON.stringify([{"Text":phrase}]),
                crossDomain: true,
                dataType: "json",
                headers: headers
            }));
        }

        this.AddTranslations = function(fromLcid, destLcid, updateRecords, responses) {
            var translations = [];
    
            for (var i = 0; i < updateRecords.length; i++) {
                var response = responses[i][0];
                var updateRecord = updateRecords[i];
    
                if (!response) {
                    continue;
                }

                if (response.translations.length > 0) {
                    var decoded = response.translations[0].text.replace(/<escape data="(.*?(?="\/>))"\/>/gi, "$1");
                    var translation = w2utils.encodeTags(decoded);
    
                    var record = XrmTranslator.GetByRecId(updateRecords, updateRecord.recid);
    
                    if (!record) {
                        continue;
                    }
    
                    translations.push({
                        recid: record.recid,
                        schemaName: record.schemaName,
                        column: destLcid,
                        source: record[fromLcid],
                        translation: translation
                    });
                }
            }

            return translations;
        }

        this.CanTranslate = function(fromLcid, destLcid) {
            $.support.cors = true;
            
            return WebApiClient.Promise.resolve($.ajax({
                url: languageUrl,
                dataType: "json",
                type: "GET",
                crossDomain: true,
                headers: {
                    "Ocp-Apim-Subscription-Key": authKey
                }
            }))
            .then(function(result) {
                const canTranslateSource = !!result.translation[fromLcid.toLowerCase()];
                const canTranslateTarget = !!result.translation[destLcid.toLowerCase()];

                return {
                    [fromLcid]: canTranslateSource,
                    [destLcid]: canTranslateTarget
                };
            });
        }
    };

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

    function CreateTranslator (apiProvider, authKey, region) {
        switch ((apiProvider ||"").trim().toLowerCase()) {
            case "deepl":
                return new deeplTranslator(authKey);
            case "azure":
                return new azureTranslator(authKey, region);
            case "gemini":
                var geminiConfig = GetGeminiConfig();
                return new geminiTranslator(geminiConfig.apiKey, geminiConfig.modelName, geminiConfig.customPrompt);
            default:
                return null;
        }
    }

    function BuildError(preFallBackError, error) {
        return [preFallBackError, error]
            .filter(function(e) { return !!e })
            .join("<br />");
    }

    function FindTranslator(authKey, authProvider, region, fromLcid, destLcid, apiProvider, preFallBackError) {
        // When user explicitly selected gemini, handle it directly regardless of config provider
        if (apiProvider === "gemini") {
            var geminiConfig = GetGeminiConfig();
            if (!geminiConfig || !geminiConfig.apiKey) {
                XrmTranslator.UnlockGrid();
                return WebApiClient.Promise.resolve([null, BuildError(preFallBackError, "Gemini: API Key is missing. Please configure it via the Gemini Settings button.")]);
            }
            var translator = CreateTranslator("gemini");
            return translator.CanTranslate(fromLcid, destLcid)
            .then(function(canTranslate) {
                return [translator];
            });
        }

        if(apiProvider !== "auto" && (authProvider ||"").trim().toLowerCase() !== apiProvider) {
            return WebApiClient.Promise.resolve([null, BuildError(preFallBackError, "")]);
        }

        if ((authProvider || "").trim().toLowerCase() === "gemini") {
            var geminiConfig = GetGeminiConfig();
            if (!geminiConfig || !geminiConfig.apiKey) {
                XrmTranslator.UnlockGrid();
                return WebApiClient.Promise.resolve([null, BuildError(preFallBackError, "Gemini: API Key is missing. Please configure it via the Gemini Settings button.")]);
            }
            var translator = CreateTranslator("gemini");
            return translator.CanTranslate(fromLcid, destLcid)
            .then(function(canTranslate) {
                return [translator];
            });
        }

        if (!authKey) {
            XrmTranslator.UnlockGrid();
            return WebApiClient.Promise.resolve([null, BuildError(preFallBackError, authProvider + ": Auth Key is missing, please add one in the config web resource")]);
        }

        var translator = CreateTranslator(authProvider, authKey, region);

        if (!translator) {
            XrmTranslator.UnlockGrid();
            return WebApiClient.Promise.resolve([null, BuildError(preFallBackError, authProvider  + ": Found not supported or missing API Provider, please set one in the config web resource (currently only 'deepl' and 'azure' are supported")]);
        }

        return translator.CanTranslate(fromLcid, destLcid)
        .then(function(canTranslate) {
            if (canTranslate[fromLcid] && canTranslate[destLcid]) {
                return [translator];
            }

            const errorMsg = BuildError(preFallBackError, authProvider + " translator does not support the current languages: " + fromLcid + "(" + canTranslate[fromLcid] + "), " + destLcid + "(" + canTranslate[destLcid] + ")");

            return [null, errorMsg];
        })
    }

    TranslationHandler.ProposeTranslations = function(recordsRaw, fromLcid, destLcid, translateMissing, apiProvider) {
        XrmTranslator.LockGrid("Translating...");

        var records = !translateMissing
            ? recordsRaw
            : recordsRaw.filter(function (record) {
                // If original record had translation set and it was not cleared by pending changes, we skip this record
                if (record[destLcid] && (!record.w2ui || !record.w2ui.changes || record.w2ui.changes[destLcid]) && (translateMissing !== "missingOrIdentical" || record[fromLcid] !== record[destLcid])) {
                    return false;
                }

                return true;
            });

        var fromIso = GetLanguageIsoByLcid(fromLcid);
        var toIso = GetLanguageIsoByLcid(destLcid);

        if (!fromIso || !toIso) {
            XrmTranslator.UnlockGrid();

            w2alert("Could not find source or target language mapping, source iso:" + fromIso + ", target iso: " + toIso);

            return;
        }

        FindTranslator(XrmTranslator.config.translationApiKey, XrmTranslator.config.translationApiProvider, XrmTranslator.config.translationApiRegion, fromIso, toIso, apiProvider)
        .then(function (result) {
            if (!result[0] && XrmTranslator.config.translationApiProviderFallback) {
                return FindTranslator(XrmTranslator.config.translationApiKeyFallback, XrmTranslator.config.translationApiProviderFallback, XrmTranslator.config.translationApiRegionFallback, fromIso, toIso, apiProvider, result[1])
            }
            return result;
        })
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

            // Batch mode (Gemini AI)
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

            // Per-phrase mode (DeepL, Azure)
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
        var translateMissingItems = [{id: " ", text: " " }, { id: "missing", text: "All Missing" }, { id: "missingOrIdentical", text: "All Missing Or Identical"}];
        var apiProviderItems = [{id: "auto", text: "Auto" }, { id: "deepl", text: "DeepL" }, { id: "azure", text: "Azure"}, { id: "gemini", text: "Gemini AI"}];

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
            savedRecord.apiProvider = findItem(apiProviderItems, saved.apiProvider) || apiProviderItems[0];
        }

        if (!w2ui.translationPrompt)
        {
            $().w2form({
                name: 'translationPrompt',
                style: 'border: 0px; background-color: transparent;',
                formHTML:
                    '<div class="w2ui-page page-0">'+
                    '    <div class="w2ui-field">'+
                    '        <label>Source Lcid:</label>'+
                    '        <div>'+
                    '           <input name="sourceLcid" type="list"/>'+
                    '        </div>'+
                    '    </div>'+
                    '    <div class="w2ui-field">'+
                    '        <label>Target Lcid:</label>'+
                    '        <div>'+
                    '            <input name="targetLcid" type="list"/>'+
                    '        </div>'+
                    '    </div>'+
                    '    <div class="w2ui-field">'+
                    '        <label>Translate All:</label>'+
                    '        <div>'+
                    '            <input name="translateMissing" type="list"/>'+
                    '        </div>'+
                    '    </div>'+
                    '    <div class="w2ui-field">'+
                    '        <label>API Provider:</label>'+
                    '        <div>'+
                    '            <input name="apiProvider" type="list"/>'+
                    '        </div>'+
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
                        var apiProviderVal = this.record.apiProvider ? this.record.apiProvider.id : "";

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
                width   : 500,
                height  : 300,
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
                    '<div class="w2ui-page page-0">'+
                    '    <div class="w2ui-field">'+
                    '        <label>API Key:</label>'+
                    '        <div>'+
                    '           <input name="apiKey" type="text" style="width: 300px;"/>'+
                    '        </div>'+
                    '    </div>'+
                    '    <div class="w2ui-field">'+
                    '        <label>Model Name:</label>'+
                    '        <div>'+
                    '            <input name="modelName" type="text" style="width: 300px;"/>'+
                    '        </div>'+
                    '    </div>'+
                    '    <div class="w2ui-field">'+
                    '        <label>Custom Prompt:</label>'+
                    '        <div>'+
                    '            <textarea name="customPrompt" style="width: 300px; height: 80px;"></textarea>'+
                    '        </div>'+
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
                        if (apiKeyToSave === MaskApiKey(currentConfig.apiKey)) {
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
                width   : 500,
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

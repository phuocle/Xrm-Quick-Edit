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
(function (GlobalOptionSetHandler, undefined) {
    "use strict";

    var idSeparator = "|";

    function GetComponent() {
        var component = XrmTranslator.GetComponent();
        if (component === "DisplayName") {
            return "Label";
        }
        return component;
    }

    function GetUpdates() {
        var records = XrmTranslator.GetAllRecords();
        var updates = [];

        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            if (!record.w2ui || !record.w2ui.changes) {
                continue;
            }

            var parts = record.recid.split(idSeparator);
            var optionSetId = parts[0];
            var optionSet = XrmTranslator.GetAttributeById(optionSetId);

            if (!optionSet) {
                continue;
            }

            var optionValue = parseInt(record.schemaName);
            if (isNaN(optionValue)) {
                continue;
            }

            var changes = record.w2ui.changes;
            var labels = [];

            for (var change in changes) {
                if (!changes.hasOwnProperty(change) || !changes[change]) {
                    continue;
                }
                labels.push({ LanguageCode: change, Label: changes[change] });
            }

            if (labels.length < 1) {
                continue;
            }

            updates.push({
                Value: optionValue,
                [GetComponent()]: { LocalizedLabels: labels },
                MergeLabels: true,
                OptionSetName: optionSet.Name
            });
        }

        return updates;
    }

    function FillTable() {
        var grid = XrmTranslator.GetGrid();
        grid.clear();
        var records = [];

        for (var i = 0; i < XrmTranslator.metadata.length; i++) {
            var optionSet = XrmTranslator.metadata[i];

            var parent = {
                recid: optionSet.MetadataId,
                schemaName: optionSet.Name,
                w2ui: { editable: false, children: [] }
            };

            if (!!optionSet.TrueOption) {
                var options = [optionSet.TrueOption, optionSet.FalseOption];
                for (var j = 0; j < options.length; j++) {
                    var option = options[j];
                    var labels = option[GetComponent()].LocalizedLabels;
                    var child = {
                        recid: optionSet.MetadataId + idSeparator + option.Value,
                        schemaName: option.Value.toString()
                    };
                    for (var k = 0; k < labels.length; k++) {
                        child[labels[k].LanguageCode.toString()] = labels[k].Label;
                    }
                    parent.w2ui.children.push(child);
                }
            }
            else {
                var options = optionSet.Options;
                if (!options || options.length === 0) {
                    continue;
                }
                for (var j = 0; j < options.length; j++) {
                    var option = options[j];
                    var labels = option[GetComponent()].LocalizedLabels;
                    var child = {
                        recid: optionSet.MetadataId + idSeparator + option.Value,
                        schemaName: option.Value.toString()
                    };
                    for (var k = 0; k < labels.length; k++) {
                        child[labels[k].LanguageCode.toString()] = labels[k].Label;
                    }
                    parent.w2ui.children.push(child);
                }
            }

            records.push(parent);
        }

        XrmTranslator.AddSummary(records);
        grid.add(records);
        grid.unlock();
    }

    GlobalOptionSetHandler.Load = function () {
        var url = WebApiClient.GetApiUrl() + "GlobalOptionSetDefinitions";

        return WebApiClient.SendRequest("GET", url)
            .then(function (response) {
                var parsed = typeof response === "string" ? JSON.parse(response) : response;
                var optionSets = parsed.value.filter(function (os) {
                    return os.IsCustomizable && os.IsCustomizable.Value && os.IsGlobal;
                });

                optionSets.sort(function (a, b) {
                    return (a.Name || "").localeCompare(b.Name || "");
                });

                XrmTranslator.metadata = optionSets;
                FillTable();
            })
            .catch(XrmTranslator.errorHandler);
    };

    GlobalOptionSetHandler.Save = function () {
        XrmTranslator.LockGrid("Saving");

        var updates = GetUpdates();

        if (!updates || updates.length === 0) {
            XrmTranslator.LockGrid("Reloading");
            return GlobalOptionSetHandler.Load();
        }

        var optionSetNames = [];
        updates.forEach(function (u) {
            if (optionSetNames.indexOf(u.OptionSetName) === -1) {
                optionSetNames.push(u.OptionSetName);
            }
        });

        var optionSetIds = [];
        for (var i = 0; i < XrmTranslator.metadata.length; i++) {
            var os = XrmTranslator.metadata[i];
            if (optionSetNames.indexOf(os.Name) !== -1 && optionSetIds.indexOf(os.MetadataId) === -1) {
                optionSetIds.push(os.MetadataId);
            }
        }

        var saveIndex = 0;

        return WebApiClient.Promise.resolve(updates)
            .each(function (payload) {
                XrmTranslator.LockGridProgress("Saving global option sets", ++saveIndex, updates.length);
                return WebApiClient.SendRequest("POST", WebApiClient.GetApiUrl() + "UpdateOptionValue", payload);
            })
            .then(function () {
                XrmTranslator.LockGrid("Publishing");

                return XrmTranslator.RunAsBaseLanguage(function () {
                        var optionSetXml = optionSetNames.map(function (n) {
                            return "<optionset>" + n + "</optionset>";
                        }).join("");
                        var xml = "<importexportxml><optionsets>" + optionSetXml + "</optionsets></importexportxml>";

                        var request = WebApiClient.Requests.PublishXmlRequest.with({
                            payload: { ParameterXml: xml }
                        });
                        return WebApiClient.Execute(request);
                    });
            })
            .then(function () {
                return XrmTranslator.AddToSolution(optionSetIds, XrmTranslator.ComponentType.OptionSet, true, true);
            })
            .then(function () {
                XrmTranslator.LockGrid("Reloading");
                return GlobalOptionSetHandler.Load();
            })
            .catch(XrmTranslator.errorHandler);
    };

}(window.GlobalOptionSetHandler = window.GlobalOptionSetHandler || {}));

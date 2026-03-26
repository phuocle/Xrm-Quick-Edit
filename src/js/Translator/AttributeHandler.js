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
(function (AttributeHandler, undefined) {
    "use strict";

    function ApplyChanges(changes, labels) {
        for (var change in changes) {
            if (!changes.hasOwnProperty(change)) {
                continue;
            }

            // Skip empty labels
            if (!changes[change]) {
                continue;
            }

            for (var i = 0; i < labels.length; i++) {
                var label = labels[i];

                if (label.LanguageCode == change) {
                    label.Label = changes[change];
                    label.HasChanged = true;

                    break;
                }

                // Did not find label for this language
                if (i === labels.length - 1) {
                    labels.push({ LanguageCode: change, Label: changes[change] })
                }
            }
        }
    }

    function SanitizeForPut(obj) {
        if (obj === null || obj === undefined) {
            return obj;
        }
        if (Array.isArray(obj)) {
            for (var i = 0; i < obj.length; i++) {
                obj[i] = SanitizeForPut(obj[i]);
            }
            return obj;
        }
        if (typeof obj === "object") {
            for (var key in obj) {
                if (!obj.hasOwnProperty(key)) {
                    continue;
                }
                if (key.toLowerCase() === "versionnumber") {
                    delete obj[key];
                    continue;
                }
                obj[key] = SanitizeForPut(obj[key]);
            }
            return obj;
        }
        if (typeof obj === "number" && !Number.isSafeInteger(obj) && Number.isInteger(obj)) {
            return undefined;
        }
        return obj;
    }

    function GetUpdates() {
        var records = XrmTranslator.GetGrid().records;

        var updates = [];

        for (var i = 0; i < records.length; i++) {
            var record = records[i];

            if (record.w2ui && record.w2ui.changes) {
                var attribute = XrmTranslator.GetAttributeById (record.recid);
                var labels = attribute[XrmTranslator.GetComponent()].LocalizedLabels;

                var changes = record.w2ui.changes;

                ApplyChanges(changes, labels);
                updates.push(SanitizeForPut(JSON.parse(JSON.stringify(attribute))));
            }
        }

        return updates;
    }

    function FillTable () {
        var grid = XrmTranslator.GetGrid();
        grid.clear();

        var records = [];

        var excludedColumns = XrmTranslator.metadata.reduce(function(all, attribute) {
            // If attribute has a formula definition, it is a rollup field.
            // Their accompanying fields for date, state and base cause CRM exceptions when being translated, so we need to skip these
            if (attribute.FormulaDefinition) {
                if (attribute.AttributeType === "Money") {
                    /// Skip _Base, _Date, _State
                    all.push(attribute.SchemaName + "_Base", attribute.SchemaName + "_Date", attribute.SchemaName + "_State");
                }
                else {
                    // Skip _Date, _State
                    all.push(attribute.SchemaName + "_Date", attribute.SchemaName + "_State");
                }
            }
            // Some attributes such as versionnumber can not be renamed / translated
            else if (attribute.IsRenameable && !attribute.IsRenameable.Value) {
                all.push(attribute.SchemaName);
            }
            // BigInt attributes (e.g. versionnumber) cannot be updated via the metadata API
            else if (attribute.AttributeType === "BigInt") {
                all.push(attribute.SchemaName);
            }

            return all;
        }, []);

        for (var i = 0; i < XrmTranslator.metadata.length; i++) {
            var attribute = XrmTranslator.metadata[i];

            if (excludedColumns.indexOf(attribute.SchemaName) !== -1) {
                continue;
            }

            var displayNames = attribute[XrmTranslator.GetComponent()].LocalizedLabels;
            
            if (!displayNames || displayNames.length === 0) {
                continue;
            }

            var record = {
               recid: attribute.MetadataId,
               schemaName: attribute.SchemaName
            };

            for (var j = 0; j < displayNames.length; j++) {
                var displayName = displayNames[j];

                record[displayName.LanguageCode.toString()] = displayName.Label;
            }

            records.push(record);
        }

        XrmTranslator.AddSummary(records);
        grid.add(records);
        grid.unlock();
    }

    AttributeHandler.Load = function() {
        var entityName = XrmTranslator.GetEntity();

        var entityMetadataId = XrmTranslator.entityMetadata[entityName];

        var request = {
            entityName: "EntityDefinition",
            entityId: entityMetadataId,
            queryParams: "/Attributes?$filter=IsCustomizable/Value eq true"
        };

        return WebApiClient.Retrieve(request)
            .then(function(response) {
                var attributes = response.value.sort(XrmTranslator.SchemaNameComparer);
                XrmTranslator.metadata = attributes;

                FillTable();
            })
            .catch(XrmTranslator.errorHandler);
    }

    AttributeHandler.Save = function() {
        XrmTranslator.LockGrid("Saving");

        var updates = GetUpdates();

        var requests = [];
        var entityUrl = WebApiClient.GetApiUrl() + "EntityDefinitions(" + XrmTranslator.GetEntityId() + ")/Attributes(";

        for (var i = 0; i < updates.length; i++) {
            var update = updates[i];
            var url = entityUrl + update.MetadataId + ")";

            var request = {
                method: "PUT",
                url: url,
                attribute: update,
                headers: [{key: "MSCRM.MergeLabels", value: "true"}]
            };
            requests.push(request);
        }

        return WebApiClient.Promise.resolve(requests)
            .each(function(request) {
                return WebApiClient.SendRequest(request.method, request.url, request.attribute, request.headers);
            })
            .then(function (response){
                XrmTranslator.LockGrid("Publishing");

                return XrmTranslator.Publish();
            })
            .then(function(response) {
                return XrmTranslator.AddToSolution(updates.map(function(u) { return u.MetadataId; }), XrmTranslator.ComponentType.Attribute);
            })
            .then(function(response) {
                return XrmTranslator.ReleaseLockAndPrompt();
            })
            .then(function (response) {
                XrmTranslator.LockGrid("Reloading");

                return AttributeHandler.Load();
            })
            .catch(XrmTranslator.errorHandler);
    }
} (window.AttributeHandler = window.AttributeHandler || {}));

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
(function (AllInOneHandler, undefined) {
    "use strict";

    var savedState = {};

    var handlerTypes = [
        { type: "attributes", prefix: "attr~", number: 1, label: "Attributes",     handler: function() { return AttributeHandler; } },
        { type: "options",    prefix: "opts~", number: 2, label: "Options",        handler: function() { return OptionSetHandler; } },
        // Forms (number 3) handled separately in Load/Save
        { type: "views",      prefix: "view~", number: 4, label: "Views",          handler: function() { return ViewHandler; } },
        { type: "formMeta",   prefix: "fmta~", number: 5, label: "Form Metadata",  handler: function() { return FormMetaHandler; } },
        { type: "entityMeta", prefix: "enty~", number: 6, label: "Entity Metadata", handler: function() { return EntityHandler; } },
        { type: "relationships", prefix: "rels~", number: 7, label: "Relationships", handler: function() { return RelationshipHandler; } },
        { type: "charts",     prefix: "chrt~", number: 8, label: "Charts",         handler: function() { return ChartHandler; } },
        { type: "bpf",        prefix: "bpfs~", number: 9, label: "Business Process Flows", handler: function() { return BpfHandler; } }
    ];

    // --- Utility functions ---

    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function prefixRecords(records, prefix) {
        for (var i = 0; i < records.length; i++) {
            var rec = records[i];
            rec.recid = prefix + rec.recid;
            rec._allInOneType = prefix;

            if (rec.w2ui && rec.w2ui.children) {
                for (var j = 0; j < rec.w2ui.children.length; j++) {
                    var child = rec.w2ui.children[j];
                    child.recid = prefix + child.recid;
                    child._allInOneType = prefix;

                    // Handle 3-level nesting (BPF: workflow > stage > field)
                    if (child.w2ui && child.w2ui.children) {
                        for (var k = 0; k < child.w2ui.children.length; k++) {
                            var grandchild = child.w2ui.children[k];
                            grandchild.recid = prefix + grandchild.recid;
                            grandchild._allInOneType = prefix;
                        }
                    }
                }
            }
        }
    }

    function stripPrefix(recid, prefix) {
        if (recid && recid.indexOf(prefix) === 0) {
            return recid.substring(prefix.length);
        }
        return recid;
    }

    function stripPrefixFromRecords(records, prefix) {
        for (var i = 0; i < records.length; i++) {
            var rec = records[i];
            rec.recid = stripPrefix(rec.recid, prefix);

            if (rec.w2ui && rec.w2ui.children) {
                for (var j = 0; j < rec.w2ui.children.length; j++) {
                    var child = rec.w2ui.children[j];
                    child.recid = stripPrefix(child.recid, prefix);

                    if (child.w2ui && child.w2ui.children) {
                        for (var k = 0; k < child.w2ui.children.length; k++) {
                            child.w2ui.children[k].recid = stripPrefix(child.w2ui.children[k].recid, prefix);
                        }
                    }
                }
            }
        }
    }

    function captureGridRecords() {
        var grid = XrmTranslator.GetGrid();
        var records = grid.records.filter(function(r) { return !r.w2ui || !r.w2ui.summary; });
        return deepClone(records);
    }

    function hasChanges(records) {
        return records.some(function(r) {
            if (r.w2ui && r.w2ui.changes && Object.keys(r.w2ui.changes).length > 0) return true;
            if (r.w2ui && r.w2ui.children) {
                return r.w2ui.children.some(function(c) {
                    if (c.w2ui && c.w2ui.changes && Object.keys(c.w2ui.changes).length > 0) return true;
                    if (c.w2ui && c.w2ui.children) {
                        return c.w2ui.children.some(function(gc) {
                            return gc.w2ui && gc.w2ui.changes && Object.keys(gc.w2ui.changes).length > 0;
                        });
                    }
                    return false;
                });
            }
            return false;
        });
    }

    function groupRecordsByPrefix(records) {
        var groups = {};
        for (var i = 0; i < records.length; i++) {
            var rec = records[i];
            var prefix = rec._allInOneType;
            if (!prefix) continue;

            if (!groups[prefix]) {
                groups[prefix] = [];
            }
            groups[prefix].push(rec);
        }
        return groups;
    }

    // Extract data records from group nodes (skipping group wrappers)
    function extractDataRecords(gridRecords) {
        var result = [];
        for (var i = 0; i < gridRecords.length; i++) {
            var group = gridRecords[i];
            if (group.w2ui && group.w2ui.summary) continue;
            if (!group._isGroupNode) continue;
            if (group.w2ui && group.w2ui.children) {
                for (var j = 0; j < group.w2ui.children.length; j++) {
                    var child = group.w2ui.children[j];
                    if (child._isGroupNode && child.w2ui && child.w2ui.children) {
                        // Form sub-groups: extract their children
                        result = result.concat(child.w2ui.children);
                    } else {
                        result.push(child);
                    }
                }
            }
        }
        return result;
    }

    // --- Load ---

    AllInOneHandler.Load = function() {
        var grid = XrmTranslator.GetGrid();
        grid.clear();
        XrmTranslator.LockGrid("Loading ......");

        // Suppress grid.unlock() from individual handlers
        var originalUnlock = grid.unlock.bind(grid);
        grid.unlock = function() {};

        savedState = {};
        var allGroups = [];

        // Load each handler type sequentially
        var chain = WebApiClient.Promise.resolve();

        for (var h = 0; h < handlerTypes.length; h++) {
            (function(ht) {
                chain = chain.then(function() {
                    return ht.handler().Load()
                    .then(function() {
                        var records = captureGridRecords();
                        var metadata = deepClone(XrmTranslator.metadata);

                        var extra = {};
                        if (ht.type === "bpf") {
                            extra.bpfData = BpfHandler.GetBpfData();
                        }

                        prefixRecords(records, ht.prefix);

                        savedState[ht.type] = {
                            metadata: metadata,
                            extra: extra
                        };

                        allGroups.push({
                            number: ht.number,
                            node: {
                                recid: ht.prefix + "_group",
                                schemaName: ht.number + ". " + ht.label,
                                _isGroupNode: true,
                                _allInOneType: ht.prefix,
                                w2ui: {
                                    children: records,
                                    editable: false,
                                    hideCheckBox: true
                                }
                            }
                        });

                        grid.clear();
                    })
                    .catch(function(err) {
                        console.warn("AllInOne: Failed to load " + ht.label + ": " + (err && err.message || err));
                        grid.clear();
                    });
                });
            })(handlerTypes[h]);
        }

        // Load Forms (number 3)
        chain = chain.then(function() {
            return FormHandler.LoadAllForms()
            .then(function(allFormData) {
                if (!allFormData || allFormData.length === 0) {
                    return;
                }

                savedState.forms = {
                    perFormData: []
                };

                var formChildren = [];

                for (var i = 0; i < allFormData.length; i++) {
                    var fd = allFormData[i];
                    var formPrefix = "form~" + fd.formId + "~";

                    savedState.forms.perFormData.push({
                        formId: fd.formId,
                        formName: fd.formName,
                        metadata: fd.metadata,
                        selectedForms: fd.selectedForms,
                        prefix: formPrefix
                    });

                    var records = fd.records;
                    prefixRecords(records, formPrefix);

                    // Each form is a sub-group under "3. Forms"
                    formChildren.push({
                        recid: formPrefix + "_group",
                        schemaName: fd.formName,
                        _isGroupNode: true,
                        _allInOneType: formPrefix,
                        w2ui: {
                            children: records,
                            editable: false,
                            hideCheckBox: true
                        }
                    });
                }

                allGroups.push({
                    number: 3,
                    node: {
                        recid: "forms_group",
                        schemaName: "3. Forms",
                        _isGroupNode: true,
                        w2ui: {
                            children: formChildren,
                            editable: false,
                            hideCheckBox: true
                        }
                    }
                });

                grid.clear();
            })
            .catch(function(err) {
                console.warn("AllInOne: Failed to load Forms: " + (err && err.message || err));
                grid.clear();
            });
        });

        // Sort groups by number and populate grid
        chain = chain.then(function() {
            grid.unlock = originalUnlock;

            allGroups.sort(function(a, b) { return a.number - b.number; });
            var allRecords = allGroups.map(function(g) { return g.node; });
            grid.add(allRecords);
            grid.unlock();
        });

        return chain;
    };

    // --- Save ---

    AllInOneHandler.Save = function() {
        var grid = XrmTranslator.GetGrid();
        var filterbarEl = $("#filterbar");
        var originalFilterbarPointerEvents = filterbarEl.css("pointer-events");
        var originalFilterbarOpacity = filterbarEl.css("opacity");

        function restoreFilterbarInteraction() {
            filterbarEl.css("pointer-events", originalFilterbarPointerEvents || "");
            filterbarEl.css("opacity", originalFilterbarOpacity || "");
        }

        // During All-In-One save, block the top filter toolbar to prevent state changes mid-flight.
        filterbarEl.css("pointer-events", "none");
        filterbarEl.css("opacity", "0.8");

        XrmTranslator.LockGrid("Saving ......");

        var dataRecords = extractDataRecords(grid.records);
        var allRecordsClone = deepClone(dataRecords);

        var groups = groupRecordsByPrefix(allRecordsClone);

        var chain = WebApiClient.Promise.resolve();

        // Process each handler type
        for (var h = 0; h < handlerTypes.length; h++) {
            (function(ht) {
                chain = chain.then(function() {
                    var typeRecords = groups[ht.prefix];
                    if (!typeRecords || typeRecords.length === 0) return;

                    // Check if any records of this type have changes
                    if (!hasChanges(typeRecords)) return;

                    // Restore metadata
                    var state = savedState[ht.type];
                    if (!state) return;

                    XrmTranslator.metadata = deepClone(state.metadata);

                    if (ht.type === "bpf" && state.extra && state.extra.bpfData) {
                        BpfHandler.SetBpfData(state.extra.bpfData);
                    }

                    // Strip prefixes from records
                    stripPrefixFromRecords(typeRecords, ht.prefix);

                    // Swap grid records for the handler
                    grid.records = typeRecords;
                    grid.total = typeRecords.length;

                    return ht.handler().SaveOnly();
                });
            })(handlerTypes[h]);
        }

        // Process Forms (per-form save)
        chain = chain.then(function() {
            if (!savedState.forms || !savedState.forms.perFormData) return;

            return XrmTranslator.RunAsBaseLanguage(function () {
                var formRecordGroups = {};
                for (var prefix in groups) {
                    if (prefix.indexOf("form~") === 0) {
                        formRecordGroups[prefix] = groups[prefix];
                    }
                }

                var formChain = WebApiClient.Promise.resolve();

                for (var i = 0; i < savedState.forms.perFormData.length; i++) {
                    (function(fd) {
                        formChain = formChain.then(function() {
                            var formRecords = formRecordGroups[fd.prefix];
                            if (!formRecords || formRecords.length === 0) return;
                            if (!hasChanges(formRecords)) return;

                            XrmTranslator.metadata = deepClone(fd.metadata);
                            FormHandler.selectedForms = fd.selectedForms;

                            stripPrefixFromRecords(formRecords, fd.prefix);

                            grid.records = formRecords;
                            grid.total = formRecords.length;

                            return FormHandler.SaveOnly(true);
                        });
                    })(savedState.forms.perFormData[i]);
                }

                return formChain;
            });
        });

        // PublishAllXml once at the end, then release lock and reload
        chain = chain.then(function() {
            return XrmTranslator.RunAsBaseLanguage(function () {
                return WebApiClient.Execute(WebApiClient.Requests.PublishAllXmlRequest);
            });
        })
        .then(function() {
            return XrmTranslator.ReleaseLockAndPrompt();
        })
        .then(function() {
            return AllInOneHandler.Load();
        })
        .then(function() {
            restoreFilterbarInteraction();
        })
        .catch(function(err) {
            restoreFilterbarInteraction();
            XrmTranslator.errorHandler(err);
        });

        return chain;
    };

}(window.AllInOneHandler = window.AllInOneHandler || {}));

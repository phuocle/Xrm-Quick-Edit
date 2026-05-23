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
(function (XrmPropertyEditor, undefined) {
    "use strict";

    XrmPropertyEditor.entityMetadata = {};
    XrmPropertyEditor.metadata = [];

    XrmPropertyEditor.entity = null;
    XrmPropertyEditor.type = null;

    var currentHandler = null;
    var solutionEntityCache = {};
    var initialColumns = [
        { field: 'schemaName', text: 'Schema Name', size: '20%', sortable: true, resizable: true, frozen: true }
    ];

    XrmPropertyEditor.RestoreInitialColumns = function () {
        var grid = XrmPropertyEditor.GetGrid();

        grid.columns = initialColumns;

        grid.refresh();
    };

    XrmPropertyEditor.GetEntity = function() {
        return w2ui.grid_toolbar.get("entitySelect").selected;
    }

    XrmPropertyEditor.GetSolution = function() {
        return w2ui.grid_toolbar.get("solutionSelect").selected;
    }

    XrmPropertyEditor.GetEntityId = function() {
        return XrmPropertyEditor.entityMetadata[XrmPropertyEditor.GetEntity()]
    }

    XrmPropertyEditor.GetType = function() {
        return w2ui.grid_toolbar.get("type").selected;
    }

    function SetHandler() {
        if (XrmPropertyEditor.GetType() === "attributes") {
            currentHandler = AttributePropertyHandler;
        }
        else if (XrmPropertyEditor.GetType() === "entities") {
            currentHandler = EntityPropertyHandler;
        }
    }

    XrmPropertyEditor.errorHandler = function(error) {
        if(error.statusText) {
            w2alert(error.statusText);
        }
        else {
            w2alert(error);
        }

        XrmPropertyEditor.UnlockGrid();
    }

    XrmPropertyEditor.SchemaNameComparer = function(e1, e2) {
        if (e1.SchemaName < e2.SchemaName) {
            return -1;
        }

        if (e1.SchemaName > e2.SchemaName) {
            return 1;
        }

        return 0;
    }

    XrmPropertyEditor.GetGrid = function() {
        return w2ui.grid;
    }

    function SetToolbarLocked(locked) {
        if (w2ui.grid_toolbar && w2ui.grid_toolbar.box && w2ui.grid_toolbar.box.classList) {
            w2ui.grid_toolbar.box.classList.toggle("xqt-toolbar-locked", !!locked);
        }
    }

    function PatchGridToolbarLock() {
        var grid = w2ui && w2ui.grid ? w2ui.grid : null;
        if (!grid || grid._xqtToolbarLockPatched) {
            return;
        }

        var originalLock = grid.lock.bind(grid);
        var originalUnlock = grid.unlock.bind(grid);

        grid.lock = function(message, showSpinner) {
            originalLock(message, showSpinner);
            SetToolbarLocked(true);
        };

        grid.unlock = function() {
            originalUnlock();
            SetToolbarLocked(false);
        };

        grid._xqtToolbarLockPatched = true;
    }

    function StripOrderPrefix(text) {
        return String(text || "").replace(/^\d+\.\s*/, "");
    }

    function CompactToolbarText(text, maxLength) {
        text = StripOrderPrefix(text);
        maxLength = maxLength || 28;

        if (text.length <= maxLength) {
            return text;
        }

        return text.substring(0, maxLength - 1) + "...";
    }

    XrmPropertyEditor.LockGrid = function (message) {
        XrmPropertyEditor.GetGrid().lock(message, true);
        SetToolbarLocked(true);
    }

    XrmPropertyEditor.LockGridProgress = function (message, current, total) {
        XrmPropertyEditor.LockGrid(message + " (" + current + "/" + total + ")");
    }

    XrmPropertyEditor.UnlockGrid = function () {
        XrmPropertyEditor.GetGrid().unlock();
        SetToolbarLocked(false);
    }

    XrmPropertyEditor.Publish = function() {
        var xml = "<importexportxml><entities><entity>" + XrmPropertyEditor.GetEntity().toLowerCase() + "</entity></entities></importexportxml>";

        var request = WebApiClient.Requests.PublishXmlRequest
            .with({
                payload: {
                    ParameterXml: xml
                }
            })
        return WebApiClient.Execute(request);
    }

    XrmPropertyEditor.BatchSaveSize = 25;

    XrmPropertyEditor.CreateBatchName = function(prefix) {
        return prefix + "_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
    };

    XrmPropertyEditor.ChunkArray = function(items, chunkSize) {
        var chunks = [];

        for (var i = 0; i < items.length; i += chunkSize) {
            chunks.push(items.slice(i, i + chunkSize));
        }

        return chunks;
    };

    XrmPropertyEditor.ExecuteChangeSetBatches = function(items, options) {
        options = options || {};

        var batchSize = options.batchSize || XrmPropertyEditor.BatchSaveSize;
        var batches = XrmPropertyEditor.ChunkArray(items || [], batchSize);
        var progressLabel = options.progressLabel || "Saving batches";
        var batchNamePrefix = options.batchNamePrefix || "batch";
        var changeSetNamePrefix = options.changeSetNamePrefix || "changeset";
        var buildRequest = options.buildRequest;
        var saveIndex = 0;
        var responses = [];

        if (!buildRequest) {
            throw new Error("XrmPropertyEditor.ExecuteChangeSetBatches requires buildRequest.");
        }

        return WebApiClient.Promise.resolve(batches)
            .each(function(batchItems, batchIndex) {
                XrmPropertyEditor.LockGridProgress(progressLabel, ++saveIndex, batches.length);

                var requests = batchItems.map(function(item, index) {
                    var request = buildRequest(item, {
                        batchIndex: batchIndex,
                        index: index,
                        contentId: (batchIndex * batchSize) + index + 1
                    });

                    if (request && !request.contentId) {
                        request.contentId = (batchIndex * batchSize) + index + 1;
                    }

                    return request;
                });

                var changeSet = new WebApiClient.ChangeSet({
                    name: XrmPropertyEditor.CreateBatchName(changeSetNamePrefix),
                    requests: requests
                });

                var batch = new WebApiClient.Batch({
                    name: XrmPropertyEditor.CreateBatchName(batchNamePrefix),
                    changeSets: [changeSet]
                });

                return WebApiClient.SendBatch(batch)
                    .then(function(response) {
                        if (response && response.isFaulted) {
                            var errorMessage = response.errors && response.errors.length > 0
                                ? response.errors.map(function(error) { return error.message || error.code || error; }).join("\n")
                                : progressLabel + " failed.";

                            throw new Error(errorMessage);
                        }

                        if (response && response.changeSetResponses) {
                            for (var i = 0; i < response.changeSetResponses.length; i++) {
                                responses = responses.concat(response.changeSetResponses[i].responses || []);
                            }
                        }

                        if (response && response.batchResponses) {
                            responses = responses.concat(response.batchResponses);
                        }
                    });
            })
            .then(function() {
                return responses;
            });
    };

    XrmPropertyEditor.GetRecord = function(records, selector) {
        for (var i = 0; i < records.length; i++) {
            var record = records[i];

            if (selector(record)) {
                return record;
            }
        }

        return null;
    }

    XrmPropertyEditor.SetSaveButtonDisabled = function (disabled) {
        var saveButton = w2ui.grid_toolbar.get("w2ui-save");
        saveButton.disabled = disabled;
        w2ui.grid_toolbar.refresh();
    }

    XrmPropertyEditor.GetAttributeById = function(id) {
        return XrmPropertyEditor.GetAttributeByProperty("MetadataId", id);
    }

    XrmPropertyEditor.GetByRecId = function (records, recid) {
        function selector(rec) {
            if (rec.recid === recid) {
                return true;
            }
            return false;
        }

        return XrmPropertyEditor.GetRecord(records, selector);
    };

    XrmPropertyEditor.GetAttributeByProperty = function(property, value) {
        for (var i = 0; i < XrmPropertyEditor.metadata.length; i++) {
            var attribute = XrmPropertyEditor.metadata[i];

            if (attribute[property] === value) {
                return attribute;
            }
        }

        return null;
    }

    function InitializeGrid (entities) {
        new w2grid({
            name: 'grid',
            box: '#grid',
            show: {
                toolbar: true,
                footer: true,
                toolbarSave: true,
                toolbarSearch: true
            },
            multiSearch: true,
            searches: [
                { field: 'schemaName', text: 'Schema Name', type: 'text' }
            ],
            columns: initialColumns,
            onSave: function (event) {
                currentHandler.Save();
            },
            toolbar: {
                items: [
                    { type: 'menu-radio', id: 'solutionSelect', icon: 'icon-solution', tooltip: 'Solution',
                        text: function (item) {
                            var el = this.get('solutionSelect:' + item.selected);
                            if (el) {
                                return CompactToolbarText(el.text, 24);
                            }
                            return 'Solution';
                        },
                        selected: 'all',
                        items: [
                            { id: 'all', text: 'Default Solution', icon: 'icon-solution' },
                            { text: '--' }
                        ]
                    },
                    { type: 'menu-radio', id: 'entitySelect', icon: 'icon-entity', tooltip: 'Entity',
                        text: function (item) {
                            var el = this.get('entitySelect:' + item.selected);

                            if (el) {
                                return CompactToolbarText(el.text, 26);
                            }
                            else {
                                return "Entity";
                            }
                        },
                        items: []
                    },
                    { type: 'menu-radio', id: 'type', icon: 'icon-type', tooltip: 'Property type',
                        text: function (item) {
                            var el   = this.get('type:' + item.selected);
                            return el ? CompactToolbarText(el.text, 18) : 'Type';
                        },
                        selected: 'attributes',
                        items: [
                            { id: 'attributes', text: 'Attributes', icon: 'icon-attribute' }
                            //{ id: 'entities', text: 'Entities', icon: 'icon-entity' }
                        ]
                    },
                    { type: 'button', id: 'load', text: 'Load', tooltip: 'Load selected property data', icon:'icon-load', onClick: function (event) {
                        var entity = XrmPropertyEditor.GetEntity();

                        if (!entity || !XrmPropertyEditor.GetType()) {
                            return;
                        }

                        SetHandler();

                        XrmPropertyEditor.LockGrid("Loading " + entity + " attributes");

                        currentHandler.Load();
                    } }
                ],
                onClick: function (event) {
                    var target = event.target;

                    if (target.startsWith("solutionSelect:")) {
                        var selectedSolutionId = target.replace("solutionSelect:", "");
                        RepopulateEntitySelector(selectedSolutionId);
                    }
                }
            }
        }).render();

        PatchGridToolbarLock();
        XrmPropertyEditor.LockGrid("Loading entities");
    }

    function FillEntitySelector (entities) {
        entities = entities.sort(XrmPropertyEditor.SchemaNameComparer);
        var entitySelect = w2ui.grid_toolbar.get("entitySelect").items;

        for (var i = 0; i < entities.length; i++) {
            var entity = entities[i];

            entitySelect.push({
                id: entity.SchemaName,
                text: entity.SchemaName,
                icon: 'icon-entity'
            });
            XrmPropertyEditor.entityMetadata[entity.SchemaName] = entity.MetadataId;
        }

        return entities;
    }

    function GetEntities() {
        var request = {
            entityName: "EntityDefinition",
            queryParams: "?$select=SchemaName,MetadataId&$filter=IsCustomizable/Value eq true"
        };

        return WebApiClient.Retrieve(request);
    }

    function GetSolutions() {
        return WebApiClient.Retrieve({
            entityName: "solution",
            queryParams: "?$select=uniquename,friendlyname,solutionid&$filter=ismanaged eq false and isvisible eq true and uniquename ne 'Default'&$orderby=friendlyname asc"
        });
    }

    function FillSolutionSelector(solutions) {
        var solutionSelect = w2ui.grid_toolbar.get("solutionSelect").items;

        for (var i = 0; i < solutions.length; i++) {
            var solution = solutions[i];
            solutionSelect.push({
                id: solution.solutionid,
                text: solution.friendlyname + " (" + solution.uniquename + ")",
                icon: 'icon-solution'
            });
        }

        return solutions;
    }

    function GetSolutionEntities(solutionId) {
        if (solutionEntityCache[solutionId]) {
            return Promise.resolve(solutionEntityCache[solutionId]);
        }

        return WebApiClient.Retrieve({
            entityName: "solutioncomponent",
            queryParams: "?$select=objectid&$filter=_solutionid_value eq " + solutionId + " and componenttype eq 1"
        })
        .then(function(response) {
            var metadataIds = response.value.map(function(c) {
                return c.objectid.toLowerCase();
            });
            solutionEntityCache[solutionId] = metadataIds;
            return metadataIds;
        });
    }

    function RepopulateEntitySelector(solutionId) {
        var entitySelectItem = w2ui.grid_toolbar.get("entitySelect");
        entitySelectItem.selected = undefined;
        entitySelectItem.items = [];
        XrmPropertyEditor.entityMetadata = {};

        if (!solutionId || solutionId === 'all') {
            FillEntitySelector(XrmPropertyEditor.allEntities);
            w2ui.grid_toolbar.refresh();
            return Promise.resolve();
        }

        XrmPropertyEditor.LockGrid("Loading solution entities...");

        return GetSolutionEntities(solutionId)
        .then(function(metadataIds) {
            var solutionEntities = XrmPropertyEditor.allEntities.filter(function(e) {
                return metadataIds.indexOf(e.MetadataId.toLowerCase()) !== -1;
            });
            FillEntitySelector(solutionEntities);
            w2ui.grid_toolbar.refresh();
            XrmPropertyEditor.UnlockGrid();
        })
        .catch(XrmPropertyEditor.errorHandler);
    }

    function RegisterReloadPrevention () {
        // Dashboards are automatically refreshed on browser window resize, we don't want to loose changes.
        window.onbeforeunload = function(e) {
            var records = XrmPropertyEditor.GetGrid().records;
            var unsavedChanges = false;

            for (var i = 0; i < records.length; i++) {
                var record = records[i];

                if (record.w2ui && record.w2ui.changes) {
                    unsavedChanges = true;
                    break;
                }
            }

            if (unsavedChanges) {
                var warning = "There are unsaved changes in the dashboard, are you sure you want to reload and discard changes?";
                e.returnValue = warning;
                return warning;
            }
        };
    }

    XrmPropertyEditor.Initialize = function() {
        InitializeGrid();
        RegisterReloadPrevention();

        Promise.all([GetEntities(), GetSolutions()])
            .then(function(results) {
                XrmPropertyEditor.allEntities = results[0].value;
                FillSolutionSelector(results[1].value);
                return FillEntitySelector(XrmPropertyEditor.allEntities);
            })
            .then(function () {
                XrmPropertyEditor.UnlockGrid();
            })
            .catch(XrmPropertyEditor.errorHandler);
    }
} (window.XrmPropertyEditor = window.XrmPropertyEditor || {}));

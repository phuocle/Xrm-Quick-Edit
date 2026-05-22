/* v2.3 */
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
(function (XrmTranslator, undefined) {
    "use strict";

    XrmTranslator.entityMetadata = {};
    XrmTranslator.metadata = [];

    XrmTranslator.entity = null;
    XrmTranslator.type = null;



    // We need those for the FormHandleer, uilanguageid is current user language, formXml only contains labels for this locale by default
    XrmTranslator.userId = null;
    XrmTranslator.userSettings = null;
    XrmTranslator.installedLanguages = null;
    XrmTranslator.baseLanguage = null;

    XrmTranslator.config = null;

    XrmTranslator.columnRestoreNeeded = false;

    XrmTranslator.defaultSchemaNameSize = "20%";

    // Toggle quick DEBUG autofill button in toolbar (true = show, false = hide).
    XrmTranslator.showDebugButton = false;
    XrmTranslator.showAllInOneType = false;

    XrmTranslator.LockGridProgress = function (label, current, total) {
        total = total || 0;
        current = Math.min(current || 0, total);

        if (total <= 0) {
            XrmTranslator.LockGrid(label);
            return;
        }

        XrmTranslator.LockGrid(label + " " + current + "/" + total);
    };

    XrmTranslator.allEntities = [];

    var currentHandler = null;
    var solutionEntityCache = {};
    var baseLanguageScopeDepth = 0;
    var baseLanguageRestoreLcid = null;
    var unfilteredRecords = null;
    var recordSelectorContext = null;
    var CONFIG_WEBRESOURCE_NAMES = [
        "pl_/XrmQuickTranslate/config/XrmQuickTranslateConfig.js"
    ];
    var DEFAULT_CONFIG = {
        entityWhitelist: [],
        entityWhiteList: [],
        enableOpenAI: false,
        hideAutoTranslate: false,
        hideFindAndReplace: false,
        hideLanguagesByDefault: false,
        lockedLanguages: [],
        lockFormCells: false,
        solutionUniqueName: null,
        translationExceptions: []
    };



    RegExp.escape= function(s) {
        return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    };

    function ExpandRecord (record) {
        XrmTranslator.GetGrid().expand(record.recid);
    }

    function CollapseRecord (record) {
        XrmTranslator.GetGrid().collapse(record.recid);
    }

    function ToggleExpandCollapse (expand) {
        for (var i = 0; i < XrmTranslator.GetGrid().records.length; i++) {
            var record = XrmTranslator.GetGrid().records[i];

            if (!record.w2ui || !record.w2ui.children) {
                continue;
            }

            if (expand) {
                ExpandRecord(record);
            } else {
                CollapseRecord(record);
            }
        }
    }

    XrmTranslator.ComponentType = {
        Entity: 1,
        Attribute: 2,
        Relationship: 3,
        AttributePicklistValue: 4,
        AttributeLookupValue: 5,
        ViewAttribute: 6,
        LocalizedLabel: 7,
        RelationshipExtraCondition: 8,
        OptionSet: 9,
        EntityRelationship: 10,
        EntityRelationshipRole: 11,
        EntityRelationshipRelationships: 12,
        ManagedProperty: 13,
        EntityKey: 14,
        Role: 20,
        RolePrivilege: 21,
        DisplayString: 22,
        DisplayStringMap: 23,
        Form: 24,
        Organization: 25,
        SavedQuery: 26,
        Workflow: 29,
        Report: 31,
        ReportEntity: 32,
        ReportCategory: 33,
        ReportVisibility: 34,
        Attachment: 35,
        EmailTemplate: 36,
        ContractTemplate: 37,
        KBArticleTemplate: 38,
        MailMergeTemplate: 39,
        DuplicateRule: 44,
        DuplicateRuleCondition: 45,
        EntityMap: 46,
        AttributeMap: 47,
        RibbonCommand: 48,
        RibbonContextGroup: 49,
        RibbonCustomization: 50,
        RibbonRule: 52,
        RibbonTabToCommandMap: 53,
        RibbonDiff: 55,
        SavedQueryVisualization: 59,
        SystemForm: 60,
        WebResource: 61,
        SiteMap: 62,
        ConnectionRole: 63,
        FieldSecurityProfile: 70,
        FieldPermission: 71,
        PluginType: 90,
        PluginAssembly: 91,
        SDKMessageProcessingStep: 92,
        SDKMessageProcessingStepImage: 93,
        ServiceEndpoint: 95,
        RoutingRule: 150,
        RoutingRuleItem: 151,
        SLA: 152,
        SLAItem: 153,
        ConvertRule: 154,
        ConvertRuleItem: 155,
        HierarchyRule: 65,
        MobileOfflineProfile: 161,
        MobileOfflineProfileItem: 162,
        SimilarityRule: 165,
        CustomControl: 66,
        CustomControlDefaultConfig: 68,
    };

    XrmTranslator.GetSolution = function() {
        return w2ui.filterbar.get("solutionSelect").selected;
    }

    XrmTranslator.GetEntity = function() {
        return w2ui.filterbar.get("entitySelect").selected;
    }

    XrmTranslator.GetEntityId = function() {
        return XrmTranslator.entityMetadata[XrmTranslator.GetEntity()]
    }

    XrmTranslator.GetType = function() {
        return w2ui.filterbar.get("type").selected;
    }

    XrmTranslator.GetComponent = function() {
        return w2ui.filterbar.get("component").selected;
    }

    function SetHandler() {
        // Deactivate selectColumn on each change, only ContentSnippetHandler supports this right now
        w2ui.grid.show.selectColumn = false;

        w2ui['grid_toolbar'].hide("removeOverriddenAttributeLabels");

        if (XrmTranslator.GetType() === "allInOne") {
            currentHandler = AllInOneHandler;
        }
        else if (XrmTranslator.GetType() === "attributes") {
            currentHandler = AttributeHandler;
        }
        else if (XrmTranslator.GetType() === "options") {
            currentHandler = OptionSetHandler;
        }
        else if (["forms", "dashboards"].indexOf(XrmTranslator.GetType()) !== -1) {
            w2ui['grid_toolbar'].show("removeOverriddenAttributeLabels");
            currentHandler = FormHandler;
        }
        else if (XrmTranslator.GetType() === "views") {
            currentHandler = ViewHandler;
        }
        else if (XrmTranslator.GetType() === "formMeta") {
            currentHandler = FormMetaHandler;
        }
        else if (XrmTranslator.GetType() === "entityMeta") {
            currentHandler = EntityHandler;
        }
        else if (XrmTranslator.GetType() === "relationships") {
            currentHandler = RelationshipHandler;
        }
        else if (XrmTranslator.GetType() === "sitemap") {
            currentHandler = SiteMapHandler;
        }
        else if (XrmTranslator.GetType() === "charts") {
            currentHandler = ChartHandler;
        }
        else if (XrmTranslator.GetType() === "bpf") {
            currentHandler = BpfHandler;
        }
        else if (XrmTranslator.GetType() === "content") {
            w2ui.grid.show.selectColumn = true;
            currentHandler = ContentSnippetHandler;
        }
        else if (XrmTranslator.GetType() === "webresources") {
            currentHandler = WebResourceHandler;
        }
        else if (XrmTranslator.GetType() === "globalOptionSets") {
            currentHandler = GlobalOptionSetHandler;
        }

        w2ui.grid.refresh();
        w2ui.grid_toolbar.refresh();
        w2ui.filterbar.refresh();
    }

    XrmTranslator.errorHandler = function(error) {
        if(error.statusText) {
            w2alert(error.statusText);
        }
        else {
            w2alert(error);
        }

        XrmTranslator.UnlockGrid();
    };

    XrmTranslator.SchemaNameComparer = function(e1, e2) {
        if (e1.SchemaName < e2.SchemaName) {
            return -1;
        }

        if (e1.SchemaName > e2.SchemaName) {
            return 1;
        }

        return 0;
    };

    XrmTranslator.EntityComparer = function(e1, e2) {
        var e1localizedLabel = e1.DisplayName.UserLocalizedLabel || {};
        var e2localizedLabel = e2.DisplayName.UserLocalizedLabel || {};

        var e1compareValue = (e1localizedLabel.Label || e1.SchemaName).toLowerCase();
        var e2compareValue = (e2localizedLabel.Label || e2.SchemaName).toLowerCase();

        if (e1compareValue < e2compareValue) {
            return -1;
        }

        if (e1compareValue > e2compareValue) {
            return 1;
        }

        return 0;
    };

    XrmTranslator.GetGrid = function() {
        return w2ui.grid;
    };

    XrmTranslator.LockGrid = function (message) {
        var grid = w2ui && w2ui.grid ? w2ui.grid : null;
        if (grid) {
            grid.lock(message, true);
        }
    };

    XrmTranslator.UnlockGrid = function () {
        var grid = w2ui && w2ui.grid ? w2ui.grid : null;
        if (grid) {
            grid.unlock();
        }
    };

    XrmTranslator.SetUserLanguage = function (userId, language) {
        return WebApiClient.Update({
            overriddenSetName: "usersettingscollection",
            entityId: userId,
            entity: {
                uilanguageid: language,
                helplanguageid: language
            }
        });
    };

    XrmTranslator.GetBaseLanguage = function() {
        if (XrmTranslator.baseLanguage) {
            return Promise.resolve(XrmTranslator.baseLanguage);
        }

        return WebApiClient.Retrieve({entityName: "organization"})
        .then(function(orgs) {
            // Org exists always
            var org = orgs.value[0];

            XrmTranslator.baseLanguage = org.languagecode;

            return org.languagecode;
        });
    };

    XrmTranslator.SetBaseLanguage = function (userId) {
        return XrmTranslator.GetBaseLanguage()
        .then(function(baseLanguage) {
            return XrmTranslator.SetUserLanguage(userId, baseLanguage);
        });
    };

    XrmTranslator.RestoreUserLanguage = function () {
        var initialLanguage = XrmTranslator.userSettings.uilanguageid;

        return XrmTranslator.SetUserLanguage(XrmTranslator.userId, initialLanguage);
    };

    XrmTranslator.RunAsBaseLanguage = function (action) {
        if (typeof action !== "function") {
            return Promise.resolve(null);
        }

        if (baseLanguageScopeDepth > 0) {
            baseLanguageScopeDepth++;

            return Promise.resolve()
            .then(function () {
                return action();
            })
            .then(function (result) {
                baseLanguageScopeDepth--;
                return result;
            }, function (error) {
                baseLanguageScopeDepth--;
                throw error;
            });
        }

        baseLanguageScopeDepth = 1;
        baseLanguageRestoreLcid = XrmTranslator.userSettings && XrmTranslator.userSettings.uilanguageid;

        function resetScope() {
            var restoreLcid = baseLanguageRestoreLcid;
            baseLanguageRestoreLcid = null;
            baseLanguageScopeDepth = 0;

            return restoreLcid;
        }

        return XrmTranslator.SetBaseLanguage(XrmTranslator.userId)
        .then(function () {
            return action();
        })
        .then(function (result) {
            var restoreLcid = resetScope();

            if (restoreLcid == null) {
                return result;
            }

            return XrmTranslator.SetUserLanguage(XrmTranslator.userId, restoreLcid)
            .then(function () {
                return result;
            });
        }, function (error) {
            var restoreLcid = resetScope();

            if (restoreLcid == null) {
                throw error;
            }

            return XrmTranslator.SetUserLanguage(XrmTranslator.userId, restoreLcid)
            .then(function () {
                throw error;
            }, function () {
                throw error;
            });
        });
    };

    XrmTranslator.Publish = function(globalOptionSetNames) {
        return XrmTranslator.RunAsBaseLanguage(function () {
                var options = (globalOptionSetNames || []);
                var optionSetString = "<optionsets>" + options.map(function(o) { return "<optionset>" + o + "</optionset>"; }).join("") + "</optionsets>";

                var xml = "<importexportxml><entities><entity>" + XrmTranslator.GetEntity().toLowerCase() + "</entity></entities>" + (options.length ? optionSetString : "") + "</importexportxml>";

                var request = WebApiClient.Requests.PublishXmlRequest
                    .with({
                        payload: {
                            ParameterXml: xml
                        }
                    })
                return WebApiClient.Execute(request);
            })
            .catch(XrmTranslator.errorHandler);
    }

    XrmTranslator.PublishDashboard = function (dashboardIds) {
        return XrmTranslator.RunAsBaseLanguage(function () {

                var xml = "<importexportxml><dashboards>";
                for (var i = 0; i < dashboardIds.length; i++) {
                    xml += `<dashboard>{${dashboardIds[i].recid}}</dashboard>`;
                }
                xml += "</dashboards></importexportxml>";

                var request = WebApiClient.Requests.PublishXmlRequest
                    .with({
                        payload: {
                            ParameterXml: xml
                        }
                    })
                return WebApiClient.Execute(request);
            })
            .catch(XrmTranslator.errorHandler);
    }

    XrmTranslator.PublishWebResources = function (webresourceIds) {
        return XrmTranslator.RunAsBaseLanguage(function () {

                var xml = "<importexportxml><webresources>";
                for (var i = 0; i < webresourceIds.length; i++) {
                    xml += "<webresource>" + webresourceIds[i] + "</webresource>";
                }
                xml += "</webresources></importexportxml>";

                var request = WebApiClient.Requests.PublishXmlRequest
                    .with({
                        payload: {
                            ParameterXml: xml
                        }
                    })
                return WebApiClient.Execute(request);
            })
            .catch(XrmTranslator.errorHandler);
    }

    XrmTranslator.AddToSolution = function(componentIds, componentType, includeComponentSettings, includeSubComponents) {
        if (!XrmTranslator.config.solutionUniqueName) {
            return Promise.resolve(null);
        }

        XrmTranslator.LockGrid("Adding components to solution");

        var addIndex = 0;

        return WebApiClient.Promise.resolve(componentIds)
        .each(function(c) {
            XrmTranslator.LockGridProgress("Adding components to solution", ++addIndex, componentIds.length);
            var request = WebApiClient.Requests.AddSolutionComponentRequest.with({
                payload: {
                    ComponentId: c,
                    ComponentType: componentType, // Gather this from CRM SDK in SampleCode/CS/HelperCode/OptionSets.cs, named ComponentType
                    SolutionUniqueName: XrmTranslator.config.solutionUniqueName,
                    AddRequiredComponents: false,
                    IncludedComponentSettingsValues: includeComponentSettings ? null : [],
                    DoNotIncludeSubcomponents: includeSubComponents ? false : true
                }
            });

            return WebApiClient.Execute(request);
        })
        .catch(XrmTranslator.errorHandler);
    }

    XrmTranslator.GetRecord = function(records, selector) {
        for (var i = 0; i < records.length; i++) {
            var record = records[i];

            if (selector(record)) {
                return record;
            }
        }

        return null;
    }

    XrmTranslator.SetSaveButtonDisabled = function (disabled) {
        var saveButton = w2ui.grid_toolbar.get("w2ui-save");
        saveButton.disabled = disabled;
        w2ui.grid_toolbar.refresh();
    }

    XrmTranslator.GetAttributeById = function(id) {
        return XrmTranslator.GetAttributeByProperty("MetadataId", id);
    }

    XrmTranslator.GetByRecId = function (records, recid) {
        function selector(rec) {
            if (rec.recid === recid) {
                return true;
            }
            return false;
        }

        return XrmTranslator.GetRecord(records, selector);
    };

    function FlattenRecords (recs) {
        return recs.reduce(function(all, cur) {

            const children = FlattenRecords((cur.w2ui && cur.w2ui.children) ? cur.w2ui.children : []);

            if (children && children.length) {
                all = all.concat(children);
            }

            return all.concat([cur]);
        }, [])
    };

    XrmTranslator.GetManyByRecId = function (records, recids) {
        function buildSelector(recid) {
            return function selector(rec) {
                if (rec.recid === recid) {
                    return true;
                }
                return false;
            };
        }

        var searchRecords = records || XrmTranslator.GetAllRecords();

        return recids.reduce(function(all, cur) {
            var record = XrmTranslator.GetRecord(searchRecords, buildSelector(cur));

            if (!record) {
                return all;
            }

            // Leave out parent nodes that are not editable
            if (!record.w2ui || record.w2ui.editable == null || record.w2ui.editable) {
                all.push(record);
            }

            return all;
        }, []);
    };

    XrmTranslator.GetAttributeByProperty = function(property, value) {
        for (var i = 0; i < XrmTranslator.metadata.length; i++) {
            var attribute = XrmTranslator.metadata[i];

            if (attribute[property] === value) {
                return attribute;
            }
        }

        return null;
    }

    XrmTranslator.ApplyFindAndReplace = function (selected, results) {
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

            record.w2ui.changes[result.column] = (result.w2ui &&result.w2ui.changes) ? result.w2ui.changes.replaced : result.replaced;
            savable = true;
            grid.refreshRow(record.recid);
        }

        if (savable) {
            XrmTranslator.SetSaveButtonDisabled(false);
        }
    }

    function ShowFindAndReplaceResults (results) {
        if (!w2ui.findAndReplaceGrid) {
            new w2grid({
                name: 'findAndReplaceGrid',
                show: { selectColumn: true },
                multiSelect: true,
                columns: [
                    { field: 'schemaName', text: 'Schema Name', size: '25%', sortable: true, searchable: true },
                    { field: 'column', text: 'Column LCID', sortable: true, searchable: true, hidden: true },
                    { field: 'columnName', text: 'Column', size: '25%', sortable: true, searchable: true },
                    { field: 'current', text: 'Current Text', size: '25%', sortable: true, searchable: true },
                    { field: 'replaced', text: 'Replaced Text', size: '25%', sortable: true, searchable: true, editable: { type: 'text' } }
                ],
                records: []
            });
        }

        w2ui.findAndReplaceGrid.clear();
        w2ui.findAndReplaceGrid.add(results);

        w2popup.open({
            title   : 'Apply Find and Replace',
            buttons   : '<button class="w2ui-btn" onclick="w2popup.close();">Cancel</button> '+
                        '<button class="w2ui-btn" onclick="XrmTranslator.ApplyFindAndReplace(w2ui.findAndReplaceGrid.getSelection(), w2ui.findAndReplaceGrid.records); w2popup.close();">Apply</button>',
            width   : 900,
            height  : 600,
            showMax : true,
            body    : '<div id="main" style="position: absolute; left: 5px; top: 5px; right: 5px; bottom: 5px;"></div>',
            onOpen  : function (event) {
                event.onComplete = function () {
                    w2ui.findAndReplaceGrid.render('#w2ui-popup #main');
                    w2ui.findAndReplaceGrid.selectAll();
                };
            },
            onToggle: function (event) {
                w2ui.findAndReplaceGrid.box.style.display = 'none';
                event.onComplete = function () {
                    w2ui.findAndReplaceGrid.box.style.display = '';
                    w2ui.findAndReplaceGrid.resize();
                }
            }
        });
    }

    XrmTranslator.FindRecords = function(records, find, replace, useRegex, ignoreCase, column, columnName, selectRecords) {
        if (!records && selectRecords) {
            XrmTranslator.ShowRecordSelector("XrmTranslator.FindRecords", [find, replace, useRegex, ignoreCase, column, columnName, selectRecords], (XrmTranslator.GetGrid().getSelection() || []));
            return;
        }
        else if (!records) {
            records = XrmTranslator.GetAllRecords();
        }

        var findings = [];

        var regex = null;

        if (useRegex) {
            if (ignoreCase) {
                regex = new RegExp(find, "i");
            } else {
                regex = new RegExp(find);
            }
        } else {
            if (ignoreCase) {
                regex = new RegExp(RegExp.escape(find), "i");
            } else {
                regex = new RegExp(RegExp.escape(find));
            }
        }

        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            var value = record[column];

            if (record.w2ui && record.w2ui.changes && record.w2ui.changes[column]) {
                value = record.w2ui.changes[column];
            }

            if (value === null || typeof(value) === "undefined") {
                continue;
            }

            var replaced = null;

            replaced = value.replace(regex, replace);

            // No hit for search and replace
            if (value === replaced) {
                continue;
            }

            findings.push({
                recid: record.recid,
                schemaName: record.schemaName,
                column: column,
                columnName: columnName,
                current: value,
                replaced: replaced
            });
        }

        ShowFindAndReplaceResults(findings);
    }

    function removeHideCheckBoxFlag (r) {
        if (r.w2ui && r.w2ui.hideCheckBox) {
            r.w2ui.hideCheckBox = false;
        }

        if (r.w2ui && r.w2ui.children) {
            r.w2ui.children = r.w2ui.children.map(removeHideCheckBoxFlag);
        }

        return r;
    }

    function ResolveRecordSelectorCallback(callbackName) {
        var parts = String(callbackName || "").split(".");
        var context = window;

        for (var i = 0; i < parts.length; i++) {
            context = context[parts[i]];
            if (!context) {
                return null;
            }
        }

        return typeof context === "function" ? context : null;
    }

    XrmTranslator.ApplyRecordSelectorSelection = function () {
        var context = recordSelectorContext;
        recordSelectorContext = null;

        if (!context) {
            w2popup.close();
            return;
        }

        var callback = ResolveRecordSelectorCallback(context.callbackName);
        var selectedRecords = XrmTranslator.GetManyByRecId(null, w2ui.recordSelectorGrid.getSelection());
        var callbackParameters = context.callbackParameters || [];

        w2popup.close();

        if (callback) {
            callback.apply(null, [selectedRecords].concat(callbackParameters));
        }
    };

    XrmTranslator.ShowRecordSelector = function (callbackName, callbackParameters, preselectedRecords, recordFilter) {
        if (!w2ui.recordSelectorGrid) {
            new w2grid({
                name: 'recordSelectorGrid',
                show: { selectColumn: true },
                multiSelect: true,
                columns: [
                    { field: 'schemaName', text: 'Schema Name', size: '30%', sortable: true, searchable: true },
                    { field: 'sourceText', text: 'Source Text', size: '70%', sortable: true, searchable: true }
                ],
                records: [],
                onSelect: function(event) {
                    const record = XrmTranslator.GetByRecId(XrmTranslator.GetAllRecords(), event.recid);

                    if (record && record.w2ui && record.w2ui.children) {
                        w2ui.recordSelectorGrid.expand(event.recid);
                        record.w2ui.children.map(function(c) { return c.recid; }).forEach(function(id) { w2ui.recordSelectorGrid.select(id); });
                    }
                },
                onUnselect: function(event) {
                    const record = XrmTranslator.GetByRecId(XrmTranslator.GetAllRecords(), event.recid);

                    if (record && record.w2ui && record.w2ui.children) {
                        w2ui.recordSelectorGrid.expand(event.recid);
                        record.w2ui.children.map(function(c) { return c.recid; }).forEach(function(id) { w2ui.recordSelectorGrid.unselect(id); });
                    }
                },
                onExpand: function(event) {
                    event.onComplete = function() {
                        const record = XrmTranslator.GetByRecId(XrmTranslator.GetAllRecords(), event.recid);

                        if (record && record.w2ui && record.w2ui.children) {
                            record.w2ui.children.map(function(c) { return c.recid; }).forEach(function(id) { w2ui.recordSelectorGrid.expand(id); });
                        }
                    };
                },
                onCollapse: function(event) {
                    event.preventDefault();
                }
            });
        }

        w2ui.recordSelectorGrid.reset(true);
        w2ui.recordSelectorGrid.clear();
        var allRecords = JSON.parse(JSON.stringify(XrmTranslator.GetGrid().records)).map(removeHideCheckBoxFlag);

        var baseLang = XrmTranslator.baseLanguage ? XrmTranslator.baseLanguage.toString() : null;
        if (baseLang) {
            var setSourceTextRecursive = function(record, lang) {
                record.sourceText = record[lang] || '';
                if (record.w2ui && Array.isArray(record.w2ui.children)) {
                    record.w2ui.children.forEach(function(child) {
                        setSourceTextRecursive(child, lang);
                    });
                }
            };
            allRecords.forEach(function(r) {
                setSourceTextRecursive(r, baseLang);
            });
        }

        var filteredRecords;
        if (recordFilter) {
            var filterRecursive = function(records) {
                return records.filter(function(r) {
                    if (r.w2ui && Array.isArray(r.w2ui.children)) {
                        r.w2ui.children = filterRecursive(r.w2ui.children);
                        if (r.w2ui.children.length > 0) return true;
                    }
                    return recordFilter(r);
                });
            };
            filteredRecords = filterRecursive(allRecords);
        } else {
            filteredRecords = allRecords;
        }

        if (recordFilter && filteredRecords.length === 0) {
            w2alert("No matching records found. All records already have translations for the target language.");
            return;
        }

        w2ui.recordSelectorGrid.add(filteredRecords);
        w2ui.recordSelectorGrid.refresh();

        recordSelectorContext = {
            callbackName: callbackName,
            callbackParameters: callbackParameters || []
        };

        w2popup.open({
            title   : 'Select Records',
            buttons   : '<button class="w2ui-btn" onclick="w2popup.close();">Cancel</button> '+
                        '<button class="w2ui-btn" onclick="XrmTranslator.ApplyRecordSelectorSelection();">Ok</button>',
            width   : 900,
            height  : 600,
            showMax : true,
            body    : '<div id="main" style="position: absolute; left: 5px; top: 5px; right: 5px; bottom: 5px;"></div>',
            onOpen  : function (event) {
                event.onComplete = function () {
                    w2ui.recordSelectorGrid.render('#w2ui-popup #main');
                    w2ui.recordSelectorGrid.records.slice().forEach(function(r) { w2ui.recordSelectorGrid.expand(r.recid); });

                    if (preselectedRecords && preselectedRecords.length > 0) {
                        for (let i = 0; i < preselectedRecords.length; i++) {
                            const id = preselectedRecords[i];

                            w2ui.recordSelectorGrid.select(id);
                        }
                    }
                    else {
                        w2ui.recordSelectorGrid.selectAll();
                    }
                };
            },
            onClose: function () {
                recordSelectorContext = null;
            },
            onToggle: function (event) {
                w2ui.recordSelectorGrid.box.style.display = 'none';
                event.onComplete = function () {
                    w2ui.recordSelectorGrid.box.style.display = '';
                    w2ui.recordSelectorGrid.resize();
                }
            }
        });
    }

    var typesWithDescription = ["attributes", "options", "entityMeta", "globalOptionSets", "sitemap"];

    function UpdateComponentDropdown(selectedType) {
        var hasDescription = typesWithDescription.indexOf(selectedType) !== -1;
        var componentItem = w2ui.filterbar.get("component");

        if (hasDescription) {
            w2ui['filterbar'].enable("component");
        } else {
            if (componentItem) {
                componentItem.selected = "DisplayName";
            }
            w2ui['filterbar'].disable("component");
        }
        w2ui.filterbar.refresh();
    }

    function InitializeFindAndReplaceDialog() {
        var languageItems = [];
        var availableLanguages = XrmTranslator.GetGrid().columns;

        for (var i = 0; i < availableLanguages.length; i++) {
            if (availableLanguages[i].field === "schemaName") {
                continue;
            }

            languageItems.push({ id: availableLanguages[i].field, text: availableLanguages[i].text });
        }

        if (!w2ui.findAndReplace) {
            new w2form({
                name: 'findAndReplace',
                style: 'border: 0px; background-color: transparent;',
                formHTML:
                    '<div class="w2ui-page page-0" style="padding: 15px 25px;">'+
                    '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                    '        <label style="min-width: 130px; white-space: nowrap;">Replace in Column: <span style="color: red;">*</span></label>'+
                    '        <input name="column" type="list" style="flex: 1; width: 100%;"/>'+
                    '    </div>'+
                    '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                    '        <label style="min-width: 130px; white-space: nowrap;">Find: <span style="color: red;">*</span></label>'+
                    '        <input name="find" type="text" style="flex: 1; width: 100%;"/>'+
                    '    </div>'+
                    '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                    '        <label style="min-width: 130px; white-space: nowrap;">Replace: <span style="color: red;">*</span></label>'+
                    '        <input name="replace" type="text" style="flex: 1; width: 100%;"/>'+
                    '    </div>'+
                    '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                    '        <label style="min-width: 130px; white-space: nowrap;">Use Regex:</label>'+
                    '        <input name="regex" type="checkbox"/>'+
                    '    </div>'+
                    '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                    '        <label style="min-width: 130px; white-space: nowrap;">Ignore Case:</label>'+
                    '        <input name="ignoreCase" type="checkbox"/>'+
                    '    </div>'+
                    '    <div style="display: flex; align-items: center; margin-bottom: 10px;">'+
                    '        <label style="min-width: 130px; white-space: nowrap;">Select records:</label>'+
                    '        <input name="selectRecords" type="checkbox"/>'+
                    '    </div>'+
                    '</div>'+
                    '<div class="w2ui-buttons">'+
                    '    <button class="w2ui-btn" name="cancel">Cancel</button>'+
                    '    <button class="w2ui-btn" name="ok">Ok</button>'+
                    '</div>',
                fields: [
                    { field: 'find', type: 'text', required: true },
                    { field: 'replace', type: 'text', required: true },
                    { field: 'regex', type: 'checkbox', required: true },
                    { field: 'ignoreCase', type: 'checkbox', required: true },
                    { field: 'selectRecords', type: 'checkbox', required: false },
                    { field: 'column', type: 'list', required: true, options: { items: languageItems } }
                ],
                actions: {
                    "ok": function () {
                        var errors = this.validate();
                        if (errors.length > 0 || !this.record.column) {
                            return;
                        }

                        w2popup.close();
                        XrmTranslator.FindRecords(undefined, this.record.find, this.record.replace, this.record.regex, this.record.ignoreCase, this.record.column.id, this.record.column.text, this.record.selectRecords);
                    },
                    "cancel": function () {
                        w2popup.close();
                    }
                }
            });
        }
        else {
            // Columns will be different when user switches to portal content snippet or back from it, we need to make sure columns always match current grid columns
            var columnField = w2ui.findAndReplace.fields.find(function (field) {
                return field.field === "column";
            });

            if (columnField) {
                columnField.options.items = languageItems;
            }

            w2ui.findAndReplace.refresh();
        }

        return Promise.resolve({});
    }

    function OpenFindAndReplaceDialog () {
        InitializeFindAndReplaceDialog()
        .then(function() {
            w2popup.open({
                title   : 'Find and Replace',
                name    : 'findAndReplacePopup',
                body    : '<div id="form" style="width: 100%; height: 100%;"></div>',
                style   : 'padding: 15px 0px 0px 0px',
                width   : 650,
                height  : 300,
                showMax : true,
                onToggle: function (event) {
                    w2ui.findAndReplace.box.style.display = 'none';
                    event.onComplete = function () {
                        w2ui.findAndReplace.box.style.display = '';
                        w2ui.findAndReplace.resize();
                    }
                },
                onOpen: function (event) {
                    event.onComplete = function () {
                        w2ui.findAndReplace.render('#w2ui-popup #form');
                    }
                }
            });
        });
    }

    function isRecordUntranslated(record, targetColumns) {
        for (var i = 0; i < targetColumns.length; i++) {
            var col = targetColumns[i];
            var val;

            if (record.w2ui && record.w2ui.changes && Object.prototype.hasOwnProperty.call(record.w2ui.changes, col)) {
                val = record.w2ui.changes[col];
            } else {
                val = record[col];
            }

            if (!val) {
                return true;
            }
        }

        return false;
    }

    function filterRecordsRecursive(records, targetColumns) {
        var result = [];

        for (var i = 0; i < records.length; i++) {
            var rec = records[i];

            if (rec.w2ui && rec.w2ui.summary) {
                continue;
            }

            if (rec.w2ui && rec.w2ui.children && rec.w2ui.children.length > 0) {
                // Node with children: recurse, keep only if any leaf descendant is untranslated
                var filteredChildren = filterRecordsRecursive(rec.w2ui.children, targetColumns);

                if (filteredChildren.length > 0) {
                    var clone = JSON.parse(JSON.stringify(rec));
                    clone.w2ui.children = filteredChildren;
                    result.push(clone);
                }
            } else if (!rec._isGroupNode) {
                // Leaf node: check if untranslated (skip structural group nodes)
                if (isRecordUntranslated(rec, targetColumns)) {
                    result.push(rec);
                }
            }
        }

        return result;
    }

    function ToggleUntranslatedFilter() {
        var grid = XrmTranslator.GetGrid();

        if (!unfilteredRecords) {
            // Activating: store originals and filter
            var baseLcid = XrmTranslator.baseLanguage ? XrmTranslator.baseLanguage.toString() : null;
            var targetColumns = XrmTranslator.GetColumns(false).map(function(c) { return String(c); });

            if (baseLcid) {
                targetColumns = targetColumns.filter(function(c) { return c !== baseLcid; });
            }

            if (targetColumns.length === 0) {
                w2alert("No target language columns to filter on.");
                return;
            }

            unfilteredRecords = JSON.parse(JSON.stringify(grid.records));

            // Use only root-level records for filtering. When w2ui expands
            // tree nodes it splices children into grid.records as flat entries
            // (with parent_recid set). Filtering via w2ui.children already
            // reaches those children, so we skip the flat duplicates here.
            var rootRecords = grid.records.filter(function(r) {
                return !r.w2ui || !r.w2ui.parent_recid;
            });

            var filtered = filterRecordsRecursive(rootRecords, targetColumns);

            grid.clear();
            grid.add(filtered);
            XrmTranslator.AddSummary(filtered);
            grid.refresh();
        } else {
            // Deactivating: restore originals
            if (unfilteredRecords) {
                grid.clear();
                grid.add(unfilteredRecords);
                unfilteredRecords = null;
                grid.refresh();
            }
        }
    }

    function LoadHandler () {
        var entity = XrmTranslator.GetEntity();

        if (!entity || !XrmTranslator.GetType()) {
            return;
        }

        TriggerLoading(entity);
    }

    function ShowAbout () {
        var html = '<div style="padding: 25px 30px; font-size: 15px; line-height: 1.6; text-align: center;">' +
            '<h2 style="margin: 0 0 10px 0; font-size: 24px; font-weight: 600;">Xrm Quick Translate</h2>' +
            '<p style="margin: 0 0 15px 0; color: #777; font-size: 14px;">Complete Translation Management UI for Dynamics 365 / Dataverse</p>' +
            '<hr style="border: none; border-top: 1px solid #eaeaea; margin: 20px 0;">' +
            '<p style="text-align: justify; text-align-last: center; font-size: 14px; margin: 0; color: #444;">Developed by ' +
            '<a href="https://github.com/phuocle" target="_blank" rel="noopener noreferrer" style="font-weight: 500; text-decoration: none;">Phuoc Le</a>, ' +
            'featuring AI-powered translation, intelligent dictionary management, All-In-One bulk translation mode, ' +
            'and a beautifully optimized workflow.</p>' +
            '</div>';

        w2popup.open({
            title: 'About',
            body: html,
            width: 580,
            height: 310,
            modal: true,
            showClose: true,
            showMax: true,
            buttons: '<button class="w2ui-btn" onclick="w2popup.close();">Close</button>',
            onOpen: function (event) {
                event.onComplete = function () {
                    setTimeout(function () { w2popup.max(); }, 100);
                };
            }
        });
    }

    function ShowHelp () {
        var html = '<div style="padding: 15px 20px; font-size: 13px; line-height: 1.8;">' +
            '<b>Solution filter:</b> Selecting a Solution filters the Entity list to only show entities in that solution. ' +
            'Use <i>Default Solution</i> to see all entities.' +
            '<hr style="margin: 8px 0; border: none; border-top: 1px solid #ddd;">' +
            '<b>Entity-based types</b> (select an Entity first):' +
            '<ul style="margin: 4px 0 12px 0; padding-left: 20px;">' +
            '<li><b>All-In-One</b> — Loads all entity-dependent types into one grid for bulk translation (Auto Translate &amp; Save in one go)</li>' +
            '<li><b>1. Attributes</b> — Solution &rarr; Entity &rarr; <i>[entity]</i> &rarr; Type &rarr; Attributes &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '<li><b>2. Options</b> — Solution &rarr; Entity &rarr; <i>[entity]</i> &rarr; Type &rarr; Options &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '<li><b>3. Forms</b> — Solution &rarr; Entity &rarr; <i>[entity]</i> &rarr; Type &rarr; Forms &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '<li><b>4. Views</b> — Solution &rarr; Entity &rarr; <i>[entity]</i> &rarr; Type &rarr; Views &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '<li><b>5. Form Metadata</b> — Solution &rarr; Entity &rarr; <i>[entity]</i> &rarr; Type &rarr; Form Metadata &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '<li><b>6. Entity Metadata</b> — Solution &rarr; Entity &rarr; <i>[entity]</i> &rarr; Type &rarr; Entity Metadata &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '<li><b>7. Relationships</b> — Solution &rarr; Entity &rarr; <i>[entity]</i> &rarr; Type &rarr; Relationships &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '<li><b>8. Charts</b> — Solution &rarr; Entity &rarr; <i>[entity]</i> &rarr; Type &rarr; Charts &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '<li><b>9. Business Process Flows</b> — Solution &rarr; Entity &rarr; <i>[entity]</i> &rarr; Type &rarr; Business Process Flows &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '</ul>' +
            '<b>Entity-independent types</b> (set Entity to None):' +
            '<ul style="margin: 4px 0 12px 0; padding-left: 20px;">' +
            '<li><b>1. Sitemap</b> — Entity &rarr; None &rarr; Type &rarr; Sitemap &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '<li><b>2. Dashboards</b> — Entity &rarr; None &rarr; Type &rarr; Dashboards &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '<li><b>3. Web Resources</b> — Entity &rarr; None &rarr; Type &rarr; Web Resources &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '<li><b>4. Global Option Sets</b> — Entity &rarr; None &rarr; Type &rarr; Global Option Sets &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '</ul>' +
            '<b>Special type:</b>' +
            '<ul style="margin: 4px 0 0 0; padding-left: 20px;">' +
            '<li><b>Content Snippets</b> — Entity &rarr; Adx_contentsnippet &rarr; Type &rarr; Content &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '</ul>' +
            '<hr style="margin: 8px 0; border: none; border-top: 1px solid #ddd;">' +
            '<b>AI Translate:</b>' +
            '<ul style="margin: 4px 0 12px 0; padding-left: 20px;">' +
            '<li><b>Auto Translate</b> — Uses Google Gemini by default, or another enabled provider, to translate labels from a source language to a target language. ' +
            'Configure provider credentials via <i>AI Settings</i>.</li>' +
            '<li><b>AI Settings</b> — Configure API keys, model names, and custom prompts for enabled providers. ' +
            'Settings are stored in your browser\'s localStorage.</li>' +
            '</ul>' +
            '<b>Dictionary:</b>' +
            '<ul style="margin: 4px 0 12px 0; padding-left: 20px;">' +
            '<li><b>Dictionary</b> — Open and manage translation dictionary entries (source &rarr; target term pairs). ' +
            'When <i>Use Dictionary as First Priority</i> is enabled in Auto Translate, dictionary matches are applied before calling the AI provider.</li>' +
            '<li><b>Apply Dictionary</b> — Batch-apply existing dictionary entries to all matching records in the current grid without calling AI. ' +
            'Supports three modes: <i>All Overwrite</i>, <i>All Missing</i>, <i>All Missing Or Identical</i>.</li>' +
            '<li><b>Storage:</b> Dictionary data is saved as a web resource (<code>pl_/XrmQuickTranslate/data/TranslationDictionary.xml</code>) ' +
            'inside an unmanaged solution named <b>Xrm Quick Translate Data</b> (unique name: <code>XrmQuickTranslateData</code>). ' +
            'This solution is auto-created on first use.</li>' +
            '</ul>' +
            '</div>';

        w2popup.open({
            title: 'Translation Guide',
            body: html,
            width: 700,
            height: 520,
            modal: true,
            showClose: true,
            showMax: true,
            onOpen: function (event) {
                event.onComplete = function () {
                    setTimeout(function () { w2popup.max(); }, 100);
                };
            }
        });
    }

    function TriggerLoading(entity) {
        unfilteredRecords = null;
        var filterBtn = w2ui.grid_toolbar ? w2ui.grid_toolbar.get('filterUntranslated') : null;
        if (filterBtn) { filterBtn.checked = false; w2ui.grid_toolbar.refresh(); }

        let promise = undefined;

        if (XrmTranslator.columnRestoreNeeded) {
            XrmTranslator.ClearColumns();
            promise = TranslationHandler.FillLanguageCodes(XrmTranslator.installedLanguages.LocaleIds, XrmTranslator.userSettings, XrmTranslator.config);
        }
        else {
            promise = Promise.resolve(null);
        }

        promise.then(function(){
            XrmTranslator.columnRestoreNeeded = false;
            XrmTranslator.entity = entity;
            SetHandler();

            if (XrmTranslator.GetType() !== "allInOne") {
                XrmTranslator.LockGrid("Loading " + entity + " attributes");
            }

            // Reset column sorting
            XrmTranslator.GetGrid().sort();
            currentHandler.Load();
        });
    }

    function InitializeGrid (entities) {
        var filterItems = [
            { type: 'menu-radio', id: 'solutionSelect', icon: 'icon-folder',
                text: function (item) {
                    var el = this.get('solutionSelect:' + item.selected);
                    if (el) {
                        return 'Solution: ' + el.text;
                    }
                    return 'Choose solution';
                },
                selected: 'all',
                items: [
                    { id: 'all', text: 'Default Solution' },
                    { text: '--' }
                ]
            },
            { type: 'menu-radio', id: 'entitySelect', icon: 'icon-folder',
                text: function (item) {
                    var text = item.selected;
                    var el = this.get('entitySelect:' + item.selected);

                    if (el) {
                        return 'Entity: ' + el.text;
                    }
                    else {
                        return "Choose entity";
                    }
                },
                selected: "none",
                items: [
                    { id: 'none', text: 'None' },
                    { text: '--' }
                ]
            },
            { type: 'menu-radio', id: 'type', icon: 'icon-folder',
                text: function (item) {
                    var text = item.selected;
                    var el   = this.get('type:' + item.selected);
                    return 'Type: ' + el.text;
                },
                selected: 'sitemap',
                items: (XrmTranslator.showAllInOneType ? [
                    { id: 'allInOne', text: 'All-In-One', icon: 'fa-camera' },
                    { id: 'entitySeparator', text: '--' }
                ] : []).concat([
                    { id: 'attributes', text: '1. Attributes', icon: 'fa-camera' },
                    { id: 'options', text: '2. Option Sets', icon: 'fa-picture' },
                    { id: 'forms', text: '3. Forms', icon: 'fa-picture' },
                    { id: 'views', text: '4. Views', icon: 'fa-picture' },
                    { id: 'formMeta', text: '5. Form Metadata', icon: 'fa-picture' },
                    { id: 'entityMeta', text: '6. Entity Metadata', icon: 'fa-picture' },
                    { id: 'relationships', text: '7. Relationships', icon: 'fa-picture' },
                    { id: 'charts', text: '8. Charts', icon: 'fa-picture' },
                    { id: 'bpf', text: '9. Business Process Flows', icon: 'fa-picture' },
                    { id: 'sitemap', text: '1. Sitemap', icon: 'fa-picture' },
                    { id: 'content', text: 'Content', icon: 'fa-picture' },
                    { id: 'dashboards', text: '2. Dashboards', icon: 'fa-picture' },
                    { id: 'webresources', text: '3. Web Resources', icon: 'fa-picture' },
                    { id: 'globalOptionSets', text: '4. Global Option Sets', icon: 'fa-picture' }
                ])
            },
            { type: 'menu-radio', id: 'component', icon: 'icon-folder',
                text: function (item) {
                    var text = item.selected;
                    var el   = this.get('component:' + item.selected);
                    return 'Component: ' + el.text;
                },
                selected: 'DisplayName',
                items: [
                    { id: 'DisplayName', text: 'DisplayName', icon: 'fa-picture' },
                    { id: 'Description', text: 'Description', icon: 'fa-picture' }
                ]
            },
            { type: 'break' },
            { type: 'button', id: 'load', text: 'Load', icon:'w2ui-icon-reload', onClick: LoadHandler },
            { type: 'spacer' },
            { type: 'break' },
            { type: 'button', id: 'about', text: 'About', icon: 'icon-about' },
            { type: 'button', id: 'help', text: 'Help', icon:'w2ui-icon-info' }
        ];

        new w2toolbar({
            name: 'filterbar',
            items: filterItems,
            onClick: function (event) {
                var target = event.target;

                if (target === "about") {
                    ShowAbout();
                    return;
                }

                if (target === "help") {
                    ShowHelp();
                    return;
                }

                if (target.startsWith("solutionSelect:")) {
                    var selectedSolutionId = target.replace("solutionSelect:", "");
                    RepopulateEntitySelector(selectedSolutionId);
                }

                if (target.startsWith("type:")) {
                    var selectedType = target.replace("type:", "");
                    UpdateComponentDropdown(selectedType);
                }

                if (target.startsWith("entitySelect:")) {
                    if (target === "entitySelect:none") {
                        w2ui['filterbar'].hide('type:allInOne');
                        w2ui['filterbar'].hide('type:entitySeparator');
                        w2ui['filterbar'].hide('type:attributes');
                        w2ui['filterbar'].hide('type:options');
                        w2ui['filterbar'].hide('type:views');
                        w2ui['filterbar'].hide('type:entityMeta');
                        w2ui['filterbar'].hide('type:relationships');
                        w2ui['filterbar'].hide('type:charts');
                        w2ui['filterbar'].hide('type:content');
                        w2ui['filterbar'].hide('type:forms');
                        w2ui['filterbar'].hide('type:formMeta');
                        w2ui['filterbar'].hide('type:bpf');

                        w2ui['filterbar'].show('type:webresources');
                        w2ui['filterbar'].show('type:dashboards');
                        w2ui['filterbar'].show('type:sitemap');
                        w2ui['filterbar'].show('type:globalOptionSets');

                        if (["allInOne", "attributes", "options", "forms", "views", "formMeta", "entityMeta", "relationships", "charts", "bpf", "content"].indexOf(w2ui.filterbar.get("type").selected) !== -1) {
                            w2ui.filterbar.get("type").selected = "sitemap";
                            UpdateComponentDropdown("sitemap");
                            w2ui.filterbar.refresh();
                        }
                    }
                    else {
                        w2ui['filterbar'].show('type:allInOne');
                        w2ui['filterbar'].show('type:entitySeparator');
                        w2ui['filterbar'].show('type:attributes');
                        w2ui['filterbar'].show('type:options');
                        w2ui['filterbar'].show('type:views');
                        w2ui['filterbar'].show('type:entityMeta');
                        w2ui['filterbar'].show('type:relationships');
                        w2ui['filterbar'].show('type:charts');
                        w2ui['filterbar'].show('type:forms');
                        w2ui['filterbar'].show('type:formMeta');
                        w2ui['filterbar'].show('type:bpf');

                        w2ui['filterbar'].hide('type:webresources');
                        w2ui['filterbar'].hide('type:dashboards');
                        w2ui['filterbar'].hide('type:sitemap');
                        w2ui['filterbar'].hide('type:globalOptionSets');
                        w2ui['filterbar'].hide('type:content');

                        if (target === "entitySelect:Adx_contentsnippet") {
                            w2ui['filterbar'].show('type:content');
                        }

                        if (["content", "webresources", "dashboards", "sitemap", "globalOptionSets"].indexOf(w2ui.filterbar.get("type").selected) !== -1) {
                            w2ui.filterbar.get("type").selected = "attributes";
                            UpdateComponentDropdown("attributes");
                            w2ui.filterbar.refresh();
                        }
                    }
                }
            }
        }).render('#filterbar');

        // Hide entity-dependent items on initial load (entity defaults to None)
        w2ui['filterbar'].hide('type:allInOne');
        w2ui['filterbar'].hide('type:entitySeparator');
        w2ui['filterbar'].hide('type:attributes');
        w2ui['filterbar'].hide('type:options');
        w2ui['filterbar'].hide('type:forms');
        w2ui['filterbar'].hide('type:views');
        w2ui['filterbar'].hide('type:formMeta');
        w2ui['filterbar'].hide('type:entityMeta');
        w2ui['filterbar'].hide('type:relationships');
        w2ui['filterbar'].hide('type:charts');
        w2ui['filterbar'].hide('type:content');
        w2ui['filterbar'].hide('type:bpf');

        var items = [
            { type: 'button', hidden: true, id: 'removeOverriddenAttributeLabels', text: 'Remove Overridden Attribute Labels', icon:'w2ui-icon-cross', onClick: function(event) {
                FormHandler.RemoveOverriddenCellLabels();
            }}
        ];

        var aiTranslateMenuItems = [];

        if (!XrmTranslator.config.hideAutoTranslate) {
            aiTranslateMenuItems.push({ id: 'autoTranslate', text: 'Auto Translate', icon: 'icon-page' });
        }

        aiTranslateMenuItems.push({ id: 'aiSettings', text: 'AI Settings', icon: 'icon-page' });

        items.push({ type: 'menu', id: 'aiTranslate', text: 'AI Translate', icon: 'icon-page',
            items: aiTranslateMenuItems
        });

        items.push({ type: 'break' });

        items.push({ type: 'button', id: 'applyDictionary', text: 'Apply Dictionary', icon: 'icon-page', onClick: function () {
            TranslationHandler.ShowApplyDictionaryPrompt();
        } });

        items.push({ type: 'button', id: 'dictionary', text: 'Dictionary', icon: 'icon-page', onClick: function () {
            if (window.TranslationDictionaryService && TranslationDictionaryService.ShowDictionaryPrompt) {
                TranslationDictionaryService.ShowDictionaryPrompt();
            }
        } });

        items.push({ type: 'break', id: 'break-filter' });
        items.push({ type: 'check', id: 'filterUntranslated', icon: 'icon-funnel', tooltip: 'Show only untranslated records', onClick: function () {
            ToggleUntranslatedFilter();
        } });

        items.push({ type: 'spacer' });

        if (XrmTranslator.showDebugButton) {
            items.push({ type: 'button', id: 'debugAutofill', text: 'DEBUG', icon: 'icon-page', onClick: function () {
                TranslationHandler.ApplyDebugTranslations();
            } });
        }

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
            columns: [
                { field: 'schemaName', text: 'Schema Name', size: XrmTranslator.defaultSchemaNameSize, sortable: true, resizable: true, frozen: true }
            ],
            onSave: function (event) {
                currentHandler.Save();
            },
            toolbar: {
                items: items,
                onClick: function (event) {
                    var target = event.target;

                    if (target.indexOf("expandAll") !== -1) {
                        ToggleExpandCollapse(true);
                    } else if (target.indexOf("collapseAll") !== -1) {
                        ToggleExpandCollapse(false);
                    }

                    switch(event.target) {
                        case "aiTranslate:autoTranslate":
                            TranslationHandler.ShowTranslationPrompt();
                            break;
                        case "aiTranslate:aiSettings":
                            TranslationHandler.ShowAISettings();
                            break;
                    }
                }
            }
        }).render();

        // Insert items before built-in grid toolbar items
        var gridToolbar = w2ui['grid_toolbar'];

        gridToolbar.insert('w2ui-reload', { type: 'menu', id: 'toggle', icon: 'icon-folder',
            text: "Toggle",
            items: [
                { type: 'button', text: 'Expand all records', id: 'expandAll', icon: 'w2ui-icon-expand' },
                { type: 'button', text: 'Collapse all records', id: 'collapseAll', icon: 'w2ui-icon-collapse' }
            ]
        });
        gridToolbar.insert('w2ui-reload', { type: 'break', id: 'break-toggle' });

        if (!XrmTranslator.config.hideFindAndReplace) {
            gridToolbar.insert('w2ui-search-advanced', { type: 'button', text: 'Find and Replace', icon: 'icon-page', id: 'findReplace', onClick: function (event) {
                OpenFindAndReplaceDialog();
            } });
        }

        // Move Save button to the far right (after DEBUG)
        var saveBtn = gridToolbar.get('w2ui-save');
        if (saveBtn) {
            gridToolbar.remove('w2ui-save');
            gridToolbar.add(saveBtn);
        }

        // Patch grid.lock/unlock to also cover the filterbar (toolbar1).
        // This way ANY call to grid.unlock() from any handler automatically unlocks both.
        var _grid = w2ui.grid;
        var _origLock = _grid.lock.bind(_grid);
        var _origUnlock = _grid.unlock.bind(_grid);
        var _filterbar = document.getElementById("filterbar");

        // Create an overlay div matching w2ui's .w2ui-lock style
        var _filterbarLock = document.createElement('div');
        _filterbarLock.style.cssText = "display:none;position:absolute;z-index:10;top:0;left:0;width:100%;height:100%;background-color:rgba(0,0,0,0.1);pointer-events:auto;";
        _filterbar.style.position = "relative";
        _filterbar.appendChild(_filterbarLock);

        _grid.lock = function(msg, showSpinner) {
            _origLock(msg, showSpinner);
            _filterbarLock.style.display = '';
        };

        _grid.unlock = function() {
            _origUnlock();
            _filterbarLock.style.display = 'none';
        };

        XrmTranslator.LockGrid("Loading entities");
    }

    function FillEntitySelector (entities) {
        if (XrmTranslator.config.entityWhitelist && XrmTranslator.config.entityWhitelist.length) {
            entities = entities.filter(function (e) { return XrmTranslator.config.entityWhitelist.indexOf(e.LogicalName) !== -1 });
        }

        entities = entities.sort(XrmTranslator.EntityComparer);
        var entitySelect = w2ui.filterbar.get("entitySelect").items;

        for (var i = 0; i < entities.length; i++) {
            var entity = entities[i];

            var localizedLabel = entity.DisplayName.UserLocalizedLabel || {};
            entitySelect.push({id: entity.SchemaName, text: localizedLabel.Label ? `${localizedLabel.Label} (${entity.LogicalName})` : entity.LogicalName });
            XrmTranslator.entityMetadata[entity.SchemaName] = entity.MetadataId;
        }

        return entities;
    }

    function GetEntities() {
        var queryParams = "?$select=SchemaName,LogicalName,MetadataId,DisplayName&$filter=IsCustomizable/Value eq true";

        var request = {
            entityName: "EntityDefinition",
            queryParams: queryParams
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
        var solutionSelect = w2ui.filterbar.get("solutionSelect").items;

        for (var i = 0; i < solutions.length; i++) {
            var solution = solutions[i];
            solutionSelect.push({
                id: solution.solutionid,
                text: solution.friendlyname + " (" + solution.uniquename + ")"
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
        var entitySelectItem = w2ui.filterbar.get("entitySelect");
        entitySelectItem.selected = "none";
        entitySelectItem.items = [
            { id: 'none', text: 'None' },
            { text: '--' }
        ];
        XrmTranslator.entityMetadata = {};

        if (!solutionId || solutionId === 'all') {
            FillEntitySelector(XrmTranslator.allEntities);
            w2ui.filterbar.refresh();
            return Promise.resolve();
        }

        XrmTranslator.LockGrid("Loading solution entities...");

        return GetSolutionEntities(solutionId)
        .then(function(metadataIds) {
            var solutionEntities = XrmTranslator.allEntities.filter(function(e) {
                return metadataIds.indexOf(e.MetadataId.toLowerCase()) !== -1;
            });
            FillEntitySelector(solutionEntities);
            w2ui.filterbar.refresh();
            XrmTranslator.UnlockGrid();
        })
        .catch(function(error) {
            XrmTranslator.errorHandler(error);
        });
    }

    function GetUserId() {
        return WebApiClient.Execute(WebApiClient.Requests.WhoAmIRequest);
    }

    function GetUserSettings(userId) {
        return WebApiClient.Retrieve({
            overriddenSetName: "usersettingscollection",
            entityId: userId
        });
    }

    function RegisterReloadPrevention () {
        // Dashboards are automatically refreshed on browser window resize, we don't want to lose changes.
        window.onbeforeunload = function(e) {
            var records = XrmTranslator.GetGrid().records;
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

    XrmTranslator.GetAllRecords = function() {
        var records = XrmTranslator.GetGrid().records;

        return Array.from(new Set(FlattenRecords(records)));
    };

    XrmTranslator.GetColumns = function (includeSchemaName) {
        var columns = XrmTranslator.GetGrid().columns.map(function(c) { return c.field; });

        if (includeSchemaName) {
            return columns;
        }

        return columns.filter(function(c) { return c !== "schemaName" });
    }

    XrmTranslator.ClearColumns = function() {
        // Don't remove schema name column
        var columns = XrmTranslator.GetColumns(false);

        columns.forEach(function(l) {
            XrmTranslator.GetGrid().removeColumn(l);
        });
    }

    XrmTranslator.AddSummary = function(records, countChildParents) {
        var parentCount = records.length;
        var childCount = records.map(function(r) { return r.w2ui && r.w2ui.children && r.w2ui.children.length; }).reduce(function(a, b) { return a + (b || 0); }, 0);

        var count = 0;

        if (childCount > 0) {
            count = childCount;

            if (countChildParents) {
                count += parentCount;
            }
        }
        else {
            count = parentCount;
        }

        var summary = {
            w2ui: { summary: true },
            recid: 'Summary-1',
            schemaName: '<span style="float: right;">Of ' + count + ' labels in total</span>'
        };

        for (var i = 0; i < XrmTranslator.installedLanguages.LocaleIds.length; i++) {
            var language = XrmTranslator.installedLanguages.LocaleIds[i].toString();

            var translatedParents = records.filter(function(r) { return !!r[language]; }).length;
            var translatedChildren = records.map(function(r) { return r.w2ui && r.w2ui.children && r.w2ui.children.filter(function(c) { return !!c[language]; })}).reduce(function(a, b) { return a + (b || []).length; }, 0);

            var translatedRecords = 0;

            if (translatedChildren > 0) {
                translatedRecords = translatedChildren;

                if (countChildParents) {
                    translatedRecords += translatedParents;
                }
            }
            else {
                translatedRecords = translatedParents;
            }

            summary[language] = translatedRecords + " translated (" + (count - translatedRecords) + " untranslated)";
        }

        records.push(summary);
    };

    function EscapeODataString(value) {
        return String(value || "").replace(/'/g, "''");
    }

    function CloneDefaultConfig() {
        return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }

    function NormalizeConfig(config) {
        var normalized = CloneDefaultConfig();

        if (config && typeof config === "object") {
            Object.keys(config).forEach(function (key) {
                normalized[key] = config[key];
            });
        }

        if (!normalized.entityWhitelist.length && normalized.entityWhiteList.length) {
            normalized.entityWhitelist = normalized.entityWhiteList;
        }

        return normalized;
    }

    function DecodeConfigContent(content) {
        if (!content) {
            return {};
        }

        return JSON.parse(atob(content));
    }

    function FindConfigWebResource(configNames) {
        var names = configNames.slice(0);

        function next() {
            var configName = names.shift();

            if (!configName) {
                return Promise.resolve(null);
            }

            return WebApiClient.Retrieve({
                overriddenSetName: "webresourceset",
                queryParams: "?$select=webresourceid,name,content&$filter=name eq '" + EscapeODataString(configName) + "'"
            })
            .then(function (result) {
                var records = result && result.value ? result.value : [];
                return records.length ? records[0] : next();
            });
        }

        return next();
    }

    function FetchConfig() {
        return FindConfigWebResource(CONFIG_WEBRESOURCE_NAMES)
        .then(function (webResource) {
            XrmTranslator.config = NormalizeConfig(webResource ? DecodeConfigContent(webResource.content) : null);
        });
    }

    XrmTranslator.Initialize = function() {
        FetchConfig()
        .then(function() {
            return XrmTranslator.GetBaseLanguage();
        })
        .then(function() {
            InitializeGrid();
            RegisterReloadPrevention();

            return GetUserId();
        })
        .then(function (response) {
            XrmTranslator.userId = response.UserId;

            return GetUserSettings(XrmTranslator.userId);
        })
        .then(function (response) {
            XrmTranslator.userSettings = response;

            return Promise.all([GetEntities(), GetSolutions()]);
        })
        .then(function(results) {
            var entities = results[0].value;
            var solutions = results[1].value;

            XrmTranslator.allEntities = entities;

            FillSolutionSelector(solutions);
            return FillEntitySelector(entities);
        })
        .then(function () {
            return TranslationHandler.GetAvailableLanguages();
        })
        .then(function(languages) {
            XrmTranslator.installedLanguages = languages;
            return TranslationHandler.FillLanguageCodes(languages.LocaleIds, XrmTranslator.userSettings, XrmTranslator.config);
        })
        .then(function () {
            if (window.TranslationDictionaryService && TranslationDictionaryService.EnsureInitialized) {
                XrmTranslator.LockGrid("Preparing dictionary storage...");

                return TranslationDictionaryService.EnsureInitialized()
                .then(function () {
                    if (TranslationDictionaryService.PreloadCache) {
                        return TranslationDictionaryService.PreloadCache();
                    }

                    return null;
                })
                .catch(function(error) {
                    if (window.console && window.console.warn) {
                        window.console.warn("Dictionary bootstrap failed.", error);
                    }
                });
            }

            return null;
        })
        .then(function () {
            XrmTranslator.UnlockGrid();
        })
        .catch(function (error) {
            XrmTranslator.errorHandler(error);
        });
    }
} (window.XrmTranslator = window.XrmTranslator || {}));





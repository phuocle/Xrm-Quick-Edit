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

    XrmTranslator.columnRestoreNeeded = false;

    XrmTranslator.defaultSchemaNameSize = "20%";

    XrmTranslator.showAllInOneType = true;

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
    var ENTITY_DEPENDENT_TYPE_ITEMS = [
        "type:allInOne",
        "type:entitySeparator",
        "type:attributes",
        "type:options",
        "type:forms",
        "type:views",
        "type:formMeta",
        "type:entityMeta",
        "type:relationships",
        "type:charts",
        "type:content",
        "type:bpf"
    ];
    var GLOBAL_TYPE_ITEMS = [
        "type:webresources",
        "type:dashboards",
        "type:sitemap",
        "type:globalOptionSets"
    ];
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

    function GetToolbar() {
        return w2ui && w2ui.grid_toolbar ? w2ui.grid_toolbar : null;
    }

    function RefreshToolbar() {
        var toolbar = GetToolbar();
        if (toolbar) {
            toolbar.refresh();
            NormalizeGridSearchUiSoon();
        }
    }

    function NormalizeGridSearchUiSoon() {
        NormalizeGridSearchUi();
        setTimeout(NormalizeGridSearchUi, 0);
        setTimeout(NormalizeGridSearchUi, 50);
    }

    function NormalizeGridSearchUi() {
        var grid = w2ui && w2ui.grid ? w2ui.grid : null;
        var gridBox = grid && grid.box ? grid.box : null;
        if (!grid || !gridBox || !grid.name) {
            return;
        }

        ConfigureSimpleGridSearch(grid);
        RemoveGridSearchPanel(gridBox);

        var searchName = gridBox.querySelector("#grid_" + grid.name + "_search_name");
        var searchInput = gridBox.querySelector("#grid_" + grid.name + "_search_all");
        var nameText = searchName ? searchName.querySelector(".name-text") : null;
        var label = nameText ? String(nameText.textContent || "").trim() : "";
        var hasValidSearchName = label && label.toLowerCase() !== "null" && label.toLowerCase() !== "undefined";

        if (!hasValidSearchName) {
            if (searchName) {
                searchName.style.display = "none";
            }
            if (nameText) {
                nameText.textContent = "";
            }
            grid.searchSelected = null;
        }

        if (searchInput) {
            if (!hasValidSearchName) {
                searchInput.readOnly = false;
            }
            var searchValueText = String(searchInput.value || "").trim().toLowerCase();
            if (searchValueText === "null" || searchValueText === "undefined" || (!hasValidSearchName && searchInput.value === " ")) {
                searchInput.value = "";
            }
            searchInput.placeholder = "";
            searchInput.removeAttribute("placeholder");
        }

        if (grid.last) {
            if (!grid.last.field || ["null", "undefined"].indexOf(String(grid.last.field).toLowerCase()) !== -1) {
                grid.last.field = "all";
            }
            if (!grid.last.label || ["null", "undefined"].indexOf(String(grid.last.label).toLowerCase()) !== -1) {
                grid.last.label = "All Fields";
            }
        }
    }

    function RemoveGridSearchPanel(gridBox) {
        var searchPanels = gridBox.querySelectorAll(".w2ui-grid-searches");
        for (var i = 0; i < searchPanels.length; i++) {
            searchPanels[i].remove();
        }
    }

    function ConfigureSimpleGridSearch(grid) {
        if (!grid || grid._xqtSimpleSearchConfigured) {
            return;
        }

        if (grid.defaultOperator) {
            grid.defaultOperator.text = "contains";
        }
        if (grid.show) {
            grid.show.searchLogic = false;
            grid.show.searchSave = false;
        }

        grid.searchOpen = function () {};
        grid.searchShowFields = function () {};
        grid.searchSuggest = function () {};
        grid._xqtSimpleSearchConfigured = true;
    }

    function SetToolbarItemsVisible(ids, visible) {
        var toolbar = GetToolbar();
        if (!toolbar) {
            return;
        }

        for (var i = 0; i < ids.length; i++) {
            if (toolbar.get(ids[i])) {
                if (visible) {
                    toolbar.show(ids[i]);
                } else {
                    toolbar.hide(ids[i]);
                }
            }
        }
    }

    function HasSelectedSolution() {
        var solutionId = XrmTranslator.GetSolution();
        return !!solutionId && solutionId !== "all";
    }

    function IsDebugToolbarEnabled() {
        try {
            return sessionStorage.getItem("XrmQuickTranslateDebug") === "true";
        }
        catch (e) {
            return false;
        }
    }

    function SetToolbarItemsEnabled(ids, enabled) {
        var toolbar = GetToolbar();
        if (!toolbar) {
            return;
        }

        for (var i = 0; i < ids.length; i++) {
            if (!toolbar.get(ids[i])) {
                continue;
            }

            if (enabled) {
                toolbar.enable(ids[i]);
            } else {
                toolbar.disable(ids[i]);
            }
        }
    }

    function ApplyTypeVisibilityForEntity(entityTarget) {
        if (entityTarget === "entitySelect:none" || entityTarget === "none") {
            SetToolbarItemsVisible(ENTITY_DEPENDENT_TYPE_ITEMS, false);
            SetToolbarItemsVisible(GLOBAL_TYPE_ITEMS, true);

            if (["allInOne", "attributes", "options", "forms", "views", "formMeta", "entityMeta", "relationships", "charts", "bpf", "content"].indexOf(GetToolbar().get("type").selected) !== -1) {
                GetToolbar().get("type").selected = "sitemap";
                UpdateComponentDropdown("sitemap");
            }
        }
        else {
            SetToolbarItemsVisible(ENTITY_DEPENDENT_TYPE_ITEMS, true);
            SetToolbarItemsVisible(GLOBAL_TYPE_ITEMS, false);
            SetToolbarItemsVisible(["type:content"], false);

            if (entityTarget === "entitySelect:Adx_contentsnippet" || entityTarget === "Adx_contentsnippet") {
                SetToolbarItemsVisible(["type:content"], true);
            }

            if (["content", "webresources", "dashboards", "sitemap", "globalOptionSets"].indexOf(GetToolbar().get("type").selected) !== -1) {
                GetToolbar().get("type").selected = "attributes";
                UpdateComponentDropdown("attributes");
            }
        }
    }

    function SetSolutionRequiredState(enabled) {
        SetToolbarItemsEnabled(["entitySelect", "type", "load"], enabled);

        if (!enabled) {
            SetToolbarItemsVisible(ENTITY_DEPENDENT_TYPE_ITEMS, false);
            SetToolbarItemsVisible(GLOBAL_TYPE_ITEMS, false);
            SetToolbarItemsEnabled(["component"], false);
        }

        RefreshToolbar();
    }

    function SetToolbarLocked(locked) {
        var toolbar = GetToolbar();
        var toolbarBox = toolbar && toolbar.box ? toolbar.box : null;
        if (toolbarBox && toolbarBox.classList) {
            toolbarBox.classList.toggle("xqt-toolbar-locked", !!locked);
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
            NormalizeGridSearchUiSoon();
        };

        grid._xqtToolbarLockPatched = true;
    }

    function StripOrderPrefix(text) {
        return String(text || "").replace(/^\d+\.\s*/, "");
    }

    function CompactToolbarText(text, maxLength, keepOrderPrefix) {
        if (!keepOrderPrefix) {
            text = StripOrderPrefix(text);
        }

        maxLength = maxLength || 28;

        if (text.length <= maxLength) {
            return text;
        }

        return text.substring(0, maxLength - 1) + "...";
    }

    function GetToolbarDisplayName(text) {
        return String(text || "").replace(/\s+\([^)]+\)\s*$/, "").trim();
    }

    function GetEntityToolbarText(item, toolbar) {
        var el = toolbar.get('entitySelect:' + item.selected);
        if (!el) {
            return "Entity";
        }

        if (item.selected === "none") {
            return "None";
        }

        return CompactToolbarText(GetToolbarDisplayName(el.text), 26);
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
        return GetToolbar().get("solutionSelect").selected;
    }

    XrmTranslator.GetEntity = function() {
        return GetToolbar().get("entitySelect").selected;
    }

    XrmTranslator.GetEntityId = function() {
        return XrmTranslator.entityMetadata[XrmTranslator.GetEntity()]
    }

    XrmTranslator.GetType = function() {
        return GetToolbar().get("type").selected;
    }

    XrmTranslator.GetComponent = function() {
        return GetToolbar().get("component").selected;
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
        RefreshToolbar();
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
        SetToolbarLocked(true);
    };

    XrmTranslator.UnlockGrid = function () {
        var grid = w2ui && w2ui.grid ? w2ui.grid : null;
        if (grid) {
            grid.unlock();
        }
        SetToolbarLocked(false);
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
        return Promise.resolve(null);
    }

    XrmTranslator.BatchSaveSize = 25;

    XrmTranslator.CreateBatchName = function(prefix) {
        return prefix + "_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
    };

    XrmTranslator.ChunkArray = function(items, chunkSize) {
        var chunks = [];

        for (var i = 0; i < items.length; i += chunkSize) {
            chunks.push(items.slice(i, i + chunkSize));
        }

        return chunks;
    };

    XrmTranslator.ExecuteChangeSetBatches = function(items, options) {
        options = options || {};

        var batchSize = options.batchSize || XrmTranslator.BatchSaveSize;
        var batches = XrmTranslator.ChunkArray(items || [], batchSize);
        var progressLabel = options.progressLabel || "Saving batches";
        var batchNamePrefix = options.batchNamePrefix || "batch";
        var changeSetNamePrefix = options.changeSetNamePrefix || "changeset";
        var buildRequest = options.buildRequest;
        var saveIndex = 0;
        var responses = [];

        if (!buildRequest) {
            throw new Error("XrmTranslator.ExecuteChangeSetBatches requires buildRequest.");
        }

        return WebApiClient.Promise.resolve(batches)
            .each(function(batchItems, batchIndex) {
                XrmTranslator.LockGridProgress(progressLabel, ++saveIndex, batches.length);

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
                    name: XrmTranslator.CreateBatchName(changeSetNamePrefix),
                    requests: requests
                });

                var batch = new WebApiClient.Batch({
                    name: XrmTranslator.CreateBatchName(batchNamePrefix),
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

    function hasRecordSelectorText(value) {
        if (value === null || typeof value === "undefined") {
            return false;
        }

        return String(value)
            .replace(/&nbsp;/gi, " ")
            .replace(/\u00a0/g, " ")
            .replace(/<[^>]*>/g, "")
            .trim()
            .length > 0;
    }

    function getRecordSelectorValue(record, lang) {
        if (!record) {
            return "";
        }

        if (record.w2ui && record.w2ui.changes && Object.prototype.hasOwnProperty.call(record.w2ui.changes, lang)) {
            return record.w2ui.changes[lang];
        }

        if (record.w2ui && record.w2ui.changes && Object.prototype.hasOwnProperty.call(record.w2ui.changes, String(lang))) {
            return record.w2ui.changes[String(lang)];
        }

        if (Object.prototype.hasOwnProperty.call(record, lang)) {
            return record[lang];
        }

        if (Object.prototype.hasOwnProperty.call(record, String(lang))) {
            return record[String(lang)];
        }

        return "";
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
        var selectedRecords = context.selectAllOnly
            ? (context.records || [])
            : XrmTranslator.GetManyByRecId(null, w2ui.recordSelectorGrid.getSelection());
        var callbackParameters = context.callbackParameters || [];

        w2popup.close();

        if (callback) {
            callback.apply(null, [selectedRecords].concat(callbackParameters));
        }
    };

    function getRecordSelectorRootRecords() {
        var selectorSourceRecords = unfilteredRecords || XrmTranslator.GetGrid().records;

        return selectorSourceRecords.filter(function(r) {
            if (r.w2ui && r.w2ui.summary) {
                return false;
            }

            // Expanded w2ui tree rows are also inserted into grid.records with
            // parent_recid. Use root rows only, then traverse w2ui.children.
            return !r.w2ui || !r.w2ui.parent_recid;
        });
    }

    function getRecordSelectorLocationLabel(record) {
        if (!record || record.w2ui && record.w2ui.summary) {
            return "";
        }

        return String(record.schemaName || "").trim();
    }

    function shouldIncludeRecordSelectorLocation(record) {
        if (!record) {
            return false;
        }

        var label = getRecordSelectorLocationLabel(record);
        if (!label) {
            return false;
        }

        // Skip top-level All-In-One buckets such as "3. Forms"; keep actual form names.
        return !record._isGroupNode || !/^\d+\.\s/.test(label);
    }

    function getRecordSelectorChildLocation(location, record) {
        if (!shouldIncludeRecordSelectorLocation(record)) {
            return location;
        }

        var label = getRecordSelectorLocationLabel(record);
        return location ? location + " > " + label : label;
    }

    function getRecordSelectorLeafRecords(records, location) {
        var result = [];

        records.forEach(function(record) {
            if (record.w2ui && record.w2ui.summary) {
                return;
            }

            var childLocation = getRecordSelectorChildLocation(location || "", record);

            if (record.w2ui && Array.isArray(record.w2ui.children) && record.w2ui.children.length > 0) {
                result = result.concat(getRecordSelectorLeafRecords(record.w2ui.children, childLocation));
                return;
            }

            if (!record._isGroupNode) {
                record.location = location || "";
                result.push(record);
            }
        });

        return result;
    }

    function getRecordSelectorTranslationRecords(records, includeBranchRecords, location) {
        var result = [];

        records.forEach(function(record) {
            if (record.w2ui && record.w2ui.summary) {
                return;
            }

            var hasChildren = record.w2ui && Array.isArray(record.w2ui.children) && record.w2ui.children.length > 0;
            var hasSource = hasRecordSelectorText(record.sourceText);
            var currentLocation = location || "";
            var childLocation = getRecordSelectorChildLocation(currentLocation, record);

            if (includeBranchRecords && hasChildren && !record._isGroupNode && hasSource) {
                record.location = currentLocation;
                result.push(record);
            }

            if (hasChildren) {
                result = result.concat(getRecordSelectorTranslationRecords(record.w2ui.children, includeBranchRecords, childLocation));
                return;
            }

            if (!record._isGroupNode) {
                record.location = currentLocation;
                result.push(record);
            }
        });

        return result;
    }

    function trimRecordSelectorDisplayValues(record) {
        ["schemaName", "sourceText", "location"].forEach(function(field) {
            if (record[field] !== null && typeof record[field] !== "undefined") {
                record[field] = String(record[field]).trim();
            }
        });

        return record;
    }

    function prepareRecordSelectorLeafRecord(record) {
        trimRecordSelectorDisplayValues(record);

        if (record.w2ui) {
            delete record.w2ui.children;
            delete record.w2ui.parent_recid;
            delete record.w2ui.expanded;
            delete record.w2ui.hideCheckBox;
            delete record.w2ui.summary;
        }

        return record;
    }

    XrmTranslator.ShowRecordSelector = function (callbackName, callbackParameters, preselectedRecords, recordFilter, options) {
        options = options || {};
        var selectAllOnly = !!options.selectAllOnly;

        if (w2ui.recordSelectorGrid && w2ui.recordSelectorGrid._xqtSelectAllOnly !== selectAllOnly) {
            w2ui.recordSelectorGrid.destroy();
        }

        if (!w2ui.recordSelectorGrid) {
            new w2grid({
                name: 'recordSelectorGrid',
                show: { selectColumn: !selectAllOnly },
                multiSelect: !selectAllOnly,
                _xqtSelectAllOnly: selectAllOnly,
                columns: [
                    { field: 'location', text: 'Location', size: '40%', sortable: true, searchable: true },
                    { field: 'schemaName', text: 'Schema Name', size: '25%', sortable: true, searchable: true },
                    { field: 'sourceText', text: 'Source Text', size: '35%', sortable: true, searchable: true }
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
            w2ui.recordSelectorGrid._xqtSelectAllOnly = selectAllOnly;
        }

        w2ui.recordSelectorGrid.reset(true);
        w2ui.recordSelectorGrid.clear();
        var allRecords = JSON.parse(JSON.stringify(getRecordSelectorRootRecords())).map(removeHideCheckBoxFlag);

        var sourceLang = options.sourceLcid ? String(options.sourceLcid) : (XrmTranslator.baseLanguage ? XrmTranslator.baseLanguage.toString() : null);
        if (sourceLang) {
            var setSourceTextRecursive = function(record, lang) {
                record.sourceText = getRecordSelectorValue(record, lang);

                if (record.w2ui && Array.isArray(record.w2ui.children)) {
                    record.w2ui.children.forEach(function(child) {
                        setSourceTextRecursive(child, lang);
                    });
                }
            };
            allRecords.forEach(function(r) {
                setSourceTextRecursive(r, sourceLang);
            });
        }

        var filteredRecords;
        if (options.leafOnly) {
            var selectorRecords = options.includeBranchRecords
                ? getRecordSelectorTranslationRecords(allRecords, true)
                : getRecordSelectorLeafRecords(allRecords);

            filteredRecords = selectorRecords.filter(function(r) {
                if (options.excludeEmptySource && !hasRecordSelectorText(r.sourceText)) {
                    return false;
                }

                return recordFilter ? recordFilter(r) : true;
            }).map(prepareRecordSelectorLeafRecord);
        } else if (recordFilter) {
            var filterRecursive = function(records) {
                return records.filter(function(r) {
                    var hasChildren = r.w2ui && Array.isArray(r.w2ui.children);

                    if (r.w2ui && Array.isArray(r.w2ui.children)) {
                        r.w2ui.children = filterRecursive(r.w2ui.children);
                        if (r.w2ui.children.length > 0) return true;
                    }

                    if (options.excludeEmptySource && !hasRecordSelectorText(r.sourceText)) {
                        return false;
                    }

                    if (hasChildren) {
                        return false;
                    }

                    return recordFilter(r);
                });
            };
            filteredRecords = filterRecursive(allRecords);
        } else {
            filteredRecords = allRecords;
        }

        filteredRecords.forEach(function(record) {
            if (!record.w2ui || !Array.isArray(record.w2ui.children)) {
                trimRecordSelectorDisplayValues(record);
            }
        });

        if (recordFilter && filteredRecords.length === 0) {
            w2alert(options.emptyMessage || "No matching records found. All records already have translations for the target language.");
            return;
        }

        w2ui.recordSelectorGrid.add(filteredRecords);
        w2ui.recordSelectorGrid.refresh();

        recordSelectorContext = {
            callbackName: callbackName,
            callbackParameters: callbackParameters || [],
            records: filteredRecords,
            selectAllOnly: selectAllOnly
        };

        w2popup.open({
            title   : options.title || (selectAllOnly ? 'Records to Translate' : 'Select Records'),
            buttons   : '<button class="w2ui-btn" onclick="w2popup.close();">Cancel</button> '+
                        '<button class="w2ui-btn" onclick="XrmTranslator.ApplyRecordSelectorSelection();">OK</button>',
            width   : 900,
            height  : 600,
            showMax : false,
            body    : '<div id="main" style="position: absolute; left: 5px; top: 5px; right: 5px; bottom: 5px;"></div>',
            onOpen  : function (event) {
                event.onComplete = function () {
                    w2ui.recordSelectorGrid.render('#w2ui-popup #main');
                    w2ui.recordSelectorGrid.records.slice().forEach(function(r) { w2ui.recordSelectorGrid.expand(r.recid); });
                    setTimeout(function () {
                        w2popup.max();
                        w2ui.recordSelectorGrid.resize();
                    }, 100);

                    if (selectAllOnly) {
                        return;
                    }

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
        var toolbar = GetToolbar();
        var componentItem = toolbar.get("component");

        if (hasDescription) {
            toolbar.enable("component");
        } else {
            if (componentItem) {
                componentItem.selected = "DisplayName";
            }
            toolbar.disable("component");
        }
        RefreshToolbar();
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
                    '<div class="w2ui-page page-0 xqt-find-replace-form">'+
                    '    <div class="xqt-find-replace-field">'+
                    '        <label>Replace in Column <span class="xqt-required">*</span></label>'+
                    '        <input name="column" type="list"/>'+
                    '    </div>'+
                    '    <div class="xqt-find-replace-field">'+
                    '        <label>Find <span class="xqt-required">*</span></label>'+
                    '        <input name="find" type="text"/>'+
                    '    </div>'+
                    '    <div class="xqt-find-replace-field">'+
                    '        <label>Replace <span class="xqt-required">*</span></label>'+
                    '        <input name="replace" type="text"/>'+
                    '    </div>'+
                    '    <div class="xqt-find-replace-options">'+
                    '        <label><input name="regex" type="checkbox"/> Use Regex</label>'+
                    '        <label><input name="ignoreCase" type="checkbox"/> Ignore Case</label>'+
                    '        <label><input name="selectRecords" type="checkbox"/> Select Records</label>'+
                    '    </div>'+
                    '</div>'+
                    '<div class="w2ui-buttons xqt-find-replace-buttons">'+
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
                body    : '<div id="form" class="xqt-find-replace-popup-form"></div>',
                style   : 'padding: 0',
                width   : 720,
                height  : 305,
                showMax : false,
                onToggle: function (event) {
                    w2ui.findAndReplace.box.style.display = 'none';
                    event.onComplete = function () {
                        w2ui.findAndReplace.box.style.display = '';
                        w2ui.findAndReplace.resize();
                    }
                },
                onOpen: function (event) {
                    event.onComplete = function () {
                        var popup = document.querySelector('#w2ui-popup');
                        if (popup) {
                            popup.classList.add('xqt-find-replace-popup');
                        }
                        w2ui.findAndReplace.render('#w2ui-popup #form');
                    }
                },
                onClose: function () {
                    var popup = document.querySelector('#w2ui-popup');
                    if (popup) {
                        popup.classList.remove('xqt-find-replace-popup');
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

        if (!HasSelectedSolution()) {
            return DialogHelper.alert("Please select a solution before loading.");
        }

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
            showMax: false,
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
            '<b>Solution filter:</b> Select a Solution first. The Entity list and solution-level types are scoped to that solution.' +
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
            '<li><b>10. Sitemap</b> — Solution &rarr; Entity &rarr; None &rarr; Type &rarr; Sitemap &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '<li><b>11. Dashboards</b> — Solution &rarr; Entity &rarr; None &rarr; Type &rarr; Dashboards &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '<li><b>12. Web Resources</b> — Solution &rarr; Entity &rarr; None &rarr; Type &rarr; Web Resources &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '<li><b>13. Global Option Sets</b> — Solution &rarr; Entity &rarr; None &rarr; Type &rarr; Global Option Sets &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '</ul>' +
            '<b>Special type:</b>' +
            '<ul style="margin: 4px 0 0 0; padding-left: 20px;">' +
            '<li><b>Content Snippets</b> — Entity &rarr; Adx_contentsnippet &rarr; Type &rarr; Content &rarr; Load &rarr; Translate &rarr; Save</li>' +
            '</ul>' +
            '<hr style="margin: 8px 0; border: none; border-top: 1px solid #ddd;">' +
            '<b>AI Translate:</b>' +
            '<ul style="margin: 4px 0 12px 0; padding-left: 20px;">' +
            '<li><b>Auto Translate</b> — Uses the selected enabled provider to translate labels from a source language to a target language. ' +
            'Configure provider credentials via <i>AI Settings</i>.</li>' +
            '<li><b>AI Settings</b> — Configure URLs, API keys, model names, and custom prompts for enabled providers. ' +
            'Settings are stored in your browser\'s localStorage.</li>' +
            '</ul>' +
            '<b>Dictionary:</b>' +
            '<ul style="margin: 4px 0 12px 0; padding-left: 20px;">' +
            '<li><b>Dictionary</b> — Open and manage translation dictionary entries (source &rarr; target term pairs). ' +
            'When <i>Use Dictionary as First Priority</i> is enabled in Auto Translate, dictionary matches are applied before calling the AI provider.</li>' +
            '<li><b>Apply Dictionary</b> — Batch-apply existing dictionary entries to all matching records in the current grid without calling AI. ' +
            'Supports two modes: <i>All Overwrite</i> and <i>All Missing</i>.</li>' +
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
            showMax: false,
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
            promise = TranslationHandler.FillLanguageCodes(XrmTranslator.installedLanguages.LocaleIds, XrmTranslator.userSettings);
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

    function HandleToolbarClick(event) {
        var target = String(event.target || "");

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
            return;
        }

        if (target.startsWith("type:")) {
            var selectedType = target.replace("type:", "");
            UpdateComponentDropdown(selectedType);
            return;
        }

        if (target.startsWith("entitySelect:")) {
            if (!HasSelectedSolution()) {
                return;
            }

            ApplyTypeVisibilityForEntity(target);
            RefreshToolbar();
            return;
        }

        if (target.indexOf("expandAll") !== -1) {
            ToggleExpandCollapse(true);
            return;
        }

        if (target.indexOf("collapseAll") !== -1) {
            ToggleExpandCollapse(false);
            return;
        }

        switch(target) {
            case "autoTranslate":
                TranslationHandler.ShowTranslationPrompt();
                break;
            case "aiSettings":
                TranslationHandler.ShowAISettings();
                break;
        }
    }

    function InitializeGrid (entities) {
        var toolbarItems = [
            { type: 'menu-radio', id: 'solutionSelect', icon: 'icon-solution',
                tooltip: 'Solution',
                text: function (item) {
                    var el = this.get('solutionSelect:' + item.selected);
                    if (el) {
                        return CompactToolbarText(GetToolbarDisplayName(el.text), 24);
                    }
                    return 'Solution';
                },
                selected: null,
                items: []
            },
            { type: 'menu-radio', id: 'entitySelect', icon: 'icon-entity',
                tooltip: 'Entity',
                text: function (item) {
                    return GetEntityToolbarText(item, this);
                },
                selected: "none",
                items: [
                    { id: 'none', text: 'None', icon: 'icon-empty' },
                    { text: '--' }
                ]
            },
            { type: 'menu-radio', id: 'type', icon: 'icon-type',
                tooltip: 'Translation type',
                text: function (item) {
                    var el   = this.get('type:' + item.selected);
                    return el ? CompactToolbarText(el.text, 18, true) : 'Type';
                },
                selected: 'sitemap',
                items: (XrmTranslator.showAllInOneType ? [
                    { id: 'allInOne', text: '0. All-In-One', icon: 'icon-grid' },
                    { id: 'entitySeparator', text: '--' }
                ] : []).concat([
                    { id: 'attributes', text: '1. Attributes', icon: 'icon-attribute' },
                    { id: 'options', text: '2. Option Sets', icon: 'icon-options' },
                    { id: 'forms', text: '3. Forms', icon: 'icon-form' },
                    { id: 'views', text: '4. Views', icon: 'icon-view' },
                    { id: 'formMeta', text: '5. Form Metadata', icon: 'icon-layout' },
                    { id: 'entityMeta', text: '6. Entity Metadata', icon: 'icon-entity' },
                    { id: 'relationships', text: '7. Relationships', icon: 'icon-link' },
                    { id: 'charts', text: '8. Charts', icon: 'icon-chart' },
                    { id: 'bpf', text: '9. Business Process Flows', icon: 'icon-flow' },
                    { id: 'sitemap', text: '10. Sitemap', icon: 'icon-sitemap' },
                    { id: 'content', text: 'Content', icon: 'icon-code' },
                    { id: 'dashboards', text: '11. Dashboards', icon: 'icon-dashboard' },
                    { id: 'webresources', text: '12. Web Resources', icon: 'icon-file-code' },
                    { id: 'globalOptionSets', text: '13. Global Option Sets', icon: 'icon-global-options' }
                ])
            },
            { type: 'menu-radio', id: 'component', icon: 'icon-component',
                tooltip: 'Component',
                text: function (item) {
                    var el   = this.get('component:' + item.selected);
                    return el ? CompactToolbarText(el.text, 18) : 'Component';
                },
                selected: 'DisplayName',
                items: [
                    { id: 'DisplayName', text: 'DisplayName', icon: 'icon-label' },
                    { id: 'Description', text: 'Description', icon: 'icon-description' }
                ]
            },
            { type: 'break' },
            { type: 'button', id: 'load', text: 'Load', tooltip: 'Load selected data', icon:'icon-load', onClick: LoadHandler },
            { type: 'break', id: 'break-context' }
        ];

        toolbarItems.push(
            { type: 'button', hidden: true, id: 'removeOverriddenAttributeLabels', text: '', tooltip: 'Remove overridden attribute labels', icon:'icon-eraser', onClick: function(event) {
                FormHandler.RemoveOverriddenCellLabels();
            }}
        );

        toolbarItems.push({ type: 'button', id: 'autoTranslate', text: '', tooltip: 'Auto Translate', icon: 'icon-translate' });
        toolbarItems.push({ type: 'button', id: 'aiSettings', text: '', tooltip: 'AI Settings', icon: 'w2ui-icon-settings' });

        toolbarItems.push({ type: 'break' });

        toolbarItems.push({ type: 'button', id: 'applyDictionary', text: '', tooltip: 'Apply dictionary', icon: 'icon-book-check', onClick: function () {
            TranslationHandler.ShowApplyDictionaryPrompt();
        } });

        toolbarItems.push({ type: 'button', id: 'dictionary', text: '', tooltip: 'Manage dictionary', icon: 'icon-book', onClick: function () {
            if (window.TranslationDictionaryService && TranslationDictionaryService.ShowDictionaryPrompt) {
                TranslationDictionaryService.ShowDictionaryPrompt();
            }
        } });

        toolbarItems.push({ type: 'break', id: 'break-filter' });
        toolbarItems.push({ type: 'check', id: 'filterUntranslated', icon: 'icon-funnel', tooltip: 'Show only untranslated records', onClick: function () {
            ToggleUntranslatedFilter();
        } });

        toolbarItems.push({ type: 'spacer' });

        if (IsDebugToolbarEnabled()) {
            toolbarItems.push({ type: 'button', id: 'debugAutofill', text: 'DEBUG', tooltip: 'Apply debug translations', icon: 'icon-debug', onClick: function () {
                TranslationHandler.ApplyDebugTranslations();
            } });
            toolbarItems.push({ type: 'button', id: 'debugEmpty', text: 'DEBUG EMPTY', tooltip: 'Clear translated columns', icon: 'icon-eraser', onClick: function () {
                TranslationHandler.ApplyDebugEmptyTranslations();
            } });
        }

        toolbarItems.push(
            { type: 'button', id: 'about', text: '', tooltip: 'About', icon: 'icon-about' },
            { type: 'button', id: 'help', text: '', tooltip: 'Help', icon:'icon-help' }
        );

        new w2grid({
            name: 'grid',
            box: '#grid',
            show: {
                toolbar: true,
                footer: true,
                toolbarSave: true,
                toolbarSearch: true,
                toolbarReload: false
            },
            multiSearch: false,
            searches: [
                { field: 'schemaName', text: 'Schema Name', type: 'text', operator: 'contains' }
            ],
            columns: [
                { field: 'schemaName', text: 'Schema Name', size: XrmTranslator.defaultSchemaNameSize, sortable: true, resizable: true, frozen: true }
            ],
            onSave: function (event) {
                currentHandler.Save();
            },
            onSearch: function (event) {
                event.onComplete = NormalizeGridSearchUiSoon;
            },
            toolbar: {
                items: toolbarItems,
                onClick: HandleToolbarClick
            }
        }).render();

        var gridToolbar = w2ui['grid_toolbar'];

        // Require selecting a solution before enabling scoped actions.
        SetToolbarItemsVisible(ENTITY_DEPENDENT_TYPE_ITEMS, false);
        SetToolbarItemsVisible(GLOBAL_TYPE_ITEMS, false);
        SetSolutionRequiredState(false);

        gridToolbar.insert('w2ui-search-advanced', { type: 'menu', id: 'toggle', text: '', tooltip: 'Expand/collapse rows', icon: 'icon-tree',
            items: [
                { type: 'button', text: 'Expand all records', id: 'expandAll', icon: 'w2ui-icon-expand' },
                { type: 'button', text: 'Collapse all records', id: 'collapseAll', icon: 'w2ui-icon-collapse' }
            ]
        });
        gridToolbar.insert('w2ui-search-advanced', { type: 'break', id: 'break-toggle' });

        gridToolbar.insert('w2ui-search-advanced', { type: 'button', text: '', tooltip: 'Find and replace', icon: 'icon-find-replace', id: 'findReplace', onClick: function (event) {
            OpenFindAndReplaceDialog();
        } });

        // Move Save button to the far right (after DEBUG)
        var saveBtn = gridToolbar.get('w2ui-save');
        if (saveBtn) {
            saveBtn.text = 'Save';
            saveBtn.tooltip = 'Save changes';
            gridToolbar.remove('w2ui-save');
            gridToolbar.add(saveBtn);
        }

        PatchGridToolbarLock();
        NormalizeGridSearchUiSoon();
        XrmTranslator.LockGrid("Loading entities");
    }

    function FillEntitySelector (entities) {
        entities = entities.sort(XrmTranslator.EntityComparer);
        var entitySelect = GetToolbar().get("entitySelect").items;

        for (var i = 0; i < entities.length; i++) {
            var entity = entities[i];

            var localizedLabel = entity.DisplayName.UserLocalizedLabel || {};
            entitySelect.push({id: entity.SchemaName, text: localizedLabel.Label ? `${localizedLabel.Label} (${entity.LogicalName})` : entity.LogicalName, icon: 'icon-entity' });
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
        var solutionSelect = GetToolbar().get("solutionSelect").items;

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
        var entitySelectItem = GetToolbar().get("entitySelect");
        entitySelectItem.selected = "none";
        entitySelectItem.items = [
            { id: 'none', text: 'None', icon: 'icon-empty' },
            { text: '--' }
        ];
        XrmTranslator.entityMetadata = {};

        if (!solutionId || solutionId === 'all') {
            SetSolutionRequiredState(false);
            RefreshToolbar();
            return Promise.resolve();
        }

        XrmTranslator.LockGrid("Loading solution entities...");

        return GetSolutionEntities(solutionId)
        .then(function(metadataIds) {
            var solutionEntities = XrmTranslator.allEntities.filter(function(e) {
                return metadataIds.indexOf(e.MetadataId.toLowerCase()) !== -1;
            });
            FillEntitySelector(solutionEntities);
            SetToolbarItemsEnabled(["entitySelect", "type", "load"], true);
            ApplyTypeVisibilityForEntity("entitySelect:none");
            UpdateComponentDropdown(GetToolbar().get("type").selected || "sitemap");
            RefreshToolbar();
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

    XrmTranslator.Initialize = function() {
        XrmTranslator.GetBaseLanguage()
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
            return entities;
        })
        .then(function () {
            return TranslationHandler.GetAvailableLanguages();
        })
        .then(function(languages) {
            XrmTranslator.installedLanguages = languages;
            return TranslationHandler.FillLanguageCodes(languages.LocaleIds, XrmTranslator.userSettings);
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





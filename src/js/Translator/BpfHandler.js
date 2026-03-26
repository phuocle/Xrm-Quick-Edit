/* @preserve
 * MIT License
 *
 * Copyright (c) 2025 Phuoc Le
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
(function (BpfHandler, undefined) {
    "use strict";

    var bpfData = [];
    var idSeparator = "|";

    function FindStageSteps(step, results) {
        if (!step) {
            return;
        }

        if (step.__class && (step.__class.indexOf("StageStep:#") !== -1 || step.__class.indexOf("PageStep:#") !== -1)) {
            if (step.description) {
                // Collect step fields within this stage
                var fields = [];
                if (step.steps && step.steps.list) {
                    for (var f = 0; f < step.steps.list.length; f++) {
                        var field = step.steps.list[f];
                        if (field.__class && field.__class.indexOf("StepStep:#") !== -1 && field.stepStepId) {
                            fields.push(field);
                        }
                    }
                }
                step._fields = fields;
                results.push(step);
            }
        }

        if (step.steps && step.steps.list) {
            for (var i = 0; i < step.steps.list.length; i++) {
                FindStageSteps(step.steps.list[i], results);
            }
        }
    }

    function FillTable() {
        var grid = XrmTranslator.GetGrid();
        grid.clear();

        var records = [];

        for (var i = 0; i < bpfData.length; i++) {
            var bpf = bpfData[i];

            var parent = {
                recid: bpf.workflowid,
                schemaName: bpf.name,
                w2ui: {
                    editable: false,
                    children: []
                }
            };

            for (var j = 0; j < bpf.stages.length; j++) {
                var stage = bpf.stages[j];
                var stageNode = {
                    recid: bpf.workflowid + idSeparator + stage.stageId,
                    schemaName: "[Stage] " + (stage.description || ""),
                    w2ui: {
                        children: []
                    }
                };

                if (stage.stepLabels && stage.stepLabels.list) {
                    for (var k = 0; k < stage.stepLabels.list.length; k++) {
                        var label = stage.stepLabels.list[k];
                        stageNode[label.languageCode.toString()] = label.description;
                    }
                }

                // Add step fields as children of the stage
                if (stage._fields) {
                    for (var f = 0; f < stage._fields.length; f++) {
                        var field = stage._fields[f];
                        var fieldNode = {
                            recid: bpf.workflowid + idSeparator + field.stepStepId,
                            schemaName: "[Field] " + (field.description || "")
                        };

                        if (field.stepLabels && field.stepLabels.list) {
                            for (var fl = 0; fl < field.stepLabels.list.length; fl++) {
                                var fLabel = field.stepLabels.list[fl];
                                fieldNode[fLabel.languageCode.toString()] = fLabel.description;
                            }
                        }

                        stageNode.w2ui.children.push(fieldNode);
                    }
                }

                parent.w2ui.children.push(stageNode);
            }

            records.push(parent);
        }

        XrmTranslator.AddSummary(records);
        grid.add(records);
        grid.unlock();
    }

    function GetUpdates(records) {
        var updatedWorkflows = {};

        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            if (!record.w2ui || !record.w2ui.changes) {
                continue;
            }

            var parts = record.recid.split(idSeparator);
            var workflowId = parts[0];
            var stageId = parts[1];

            if (!stageId) {
                continue;
            }

            if (!updatedWorkflows[workflowId]) {
                updatedWorkflows[workflowId] = [];
            }

            var changes = record.w2ui.changes;
            var labels = [];

            for (var lang in changes) {
                if (!changes.hasOwnProperty(lang) || changes[lang] == null) {
                    continue;
                }
                labels.push({ languageCode: lang, description: changes[lang] });
            }

            if (labels.length > 0) {
                updatedWorkflows[workflowId].push({
                    stageId: stageId,
                    labels: labels
                });
            }
        }

        return updatedWorkflows;
    }

    /**
     * BPF XAML Update — Inserts/updates translated labels directly in workflow XAML.
     *
     * WARNING — WHY STRING REPLACEMENT INSTEAD OF DOM MANIPULATION:
     *     Browser DOMParser + XMLSerializer corrupts CRM XAML structure:
     *     - Strips the <?xml version="1.0" encoding="utf-16"?> declaration
     *     - Adds inline xmlns on new elements (xmlns:mcwo="clr-namespace:...")
     *     CRM rejects the corrupted XAML with "Error generating UiData" (500).
     *     String replacement preserves XAML byte-for-byte, only inserting/modifying labels.
     *
     * BPF XAML STRUCTURE:
     *     Each stage and field in a BPF has the same label structure in XAML:
     *
     *     <sco:Collection x:TypeArguments="mcwo:StepLabel" x:Key="StepLabels">
     *         <mcwo:StepLabel Description="Stage A" LabelId="GUID" LanguageCode="1033" />
     *         <mcwo:StepLabel Description="Giai đoạn A" LabelId="GUID" LanguageCode="1066" />
     *     </sco:Collection>
     *     <x:String x:Key="StageId">GUID</x:String>           ← for stages
     *     <x:String x:Key="ProcessStepId">GUID</x:String>     ← for step fields
     *
     *     Translation labels live inside <sco:Collection x:Key="StepLabels"> immediately
     *     BEFORE the <x:String x:Key="StageId"> or <x:String x:Key="ProcessStepId"> element.
     *     The LabelId of each StepLabel = the GUID of that stage/field.
     *
     * ALGORITHM:
     *     1. Find marker <x:String x:Key="StageId">GUID</x:String> in the XAML string
     *        (if not found, try <x:String x:Key="ProcessStepId">GUID</x:String>)
     *     2. Search backwards (lastIndexOf) for the nearest </sco:Collection> before the marker
     *        — this is the closing tag of the StepLabels collection for this stage/field
     *     3. For each language to update:
     *        a. If a label for that language already exists (regex match) → update Description
     *        b. If not found → insert new <mcwo:StepLabel .../> element before </sco:Collection>
     *     4. After each insertion, recalculate closingIdx because the string has shifted
     *
     * @param {string} xaml - Raw XAML string from workflow.xaml (preserved as-is, never DOM-parsed)
     * @param {Array} stageUpdates - Array of {stageId: "GUID", labels: [{languageCode, description}]}
     *                               stageId is the GUID of a stage (StageId) or field (ProcessStepId)
     * @returns {string} Updated XAML, ready to PATCH into the workflow entity
     */
    function ApplyXamlUpdates(xaml, stageUpdates) {
        for (var u = 0; u < stageUpdates.length; u++) {
            var update = stageUpdates[u];

            // Step 1: Find the marker position in XAML — try StageId first, then ProcessStepId
            var stageMarker = '<x:String x:Key="StageId">' + update.stageId + '</x:String>';
            var stepMarker = '<x:String x:Key="ProcessStepId">' + update.stageId + '</x:String>';

            var markerIdx = xaml.indexOf(stageMarker);
            if (markerIdx === -1) {
                markerIdx = xaml.indexOf(stepMarker);
            }

            if (markerIdx === -1) {
                continue;
            }

            // Step 2: Search backwards for the nearest </sco:Collection> before the marker
            //         This is the closing tag of the StepLabels collection for this stage/field
            var beforeMarker = xaml.substring(0, markerIdx);
            var closingTag = '</sco:Collection>';
            var closingIdx = beforeMarker.lastIndexOf(closingTag);

            if (closingIdx === -1) {
                continue;
            }

            // Step 3: Process each language update
            for (var l = 0; l < update.labels.length; l++) {
                var labelUpdate = update.labels[l];
                var langCode = labelUpdate.languageCode;

                // Escape XML special characters to prevent breaking XAML structure
                var description = labelUpdate.description
                    .replace(/&/g, '&amp;')
                    .replace(/"/g, '&quot;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');

                // Step 3a: Check if a label for this language already exists
                //          Search within 500 chars before </sco:Collection> (enough to cover all StepLabels)
                var labelRegex = new RegExp(
                    '<mcwo:StepLabel[^/]*LabelId="' + update.stageId + '"[^/]*LanguageCode="' + langCode + '"[^/]*/>'
                );
                var existingMatch = xaml.substring(closingIdx - 500, closingIdx).match(labelRegex);

                if (existingMatch) {
                    // Step 3a-YES: Label exists → update Description only, keep everything else
                    var oldLabel = existingMatch[0];
                    var newLabel = oldLabel.replace(/Description="[^"]*"/, 'Description="' + description + '"');
                    xaml = xaml.replace(oldLabel, newLabel);
                } else {
                    // Step 3b-NO: Label missing → insert new StepLabel before </sco:Collection>
                    // Must recalculate closingIdx because prior insertions shifted the string
                    markerIdx = xaml.indexOf(stageMarker);
                    if (markerIdx === -1) {
                        markerIdx = xaml.indexOf(stepMarker);
                    }
                    beforeMarker = xaml.substring(0, markerIdx);
                    closingIdx = beforeMarker.lastIndexOf(closingTag);

                    var newStepLabel = '<mcwo:StepLabel Description="' + description + '" LabelId="' + update.stageId + '" LanguageCode="' + langCode + '" />';
                    xaml = xaml.substring(0, closingIdx) + newStepLabel + xaml.substring(closingIdx);
                }
            }
        }

        return xaml;
    }

    function DeactivateWorkflow(workflowId) {
        return WebApiClient.Update({
            entityName: "workflow",
            entityId: workflowId,
            entity: {
                statecode: 0,
                statuscode: 1
            }
        });
    }

    function ActivateWorkflow(workflowId) {
        return WebApiClient.Update({
            entityName: "workflow",
            entityId: workflowId,
            entity: {
                statecode: 1,
                statuscode: 2
            }
        });
    }

    /**
     * Load — Reads BPF stages and fields from workflow.clientdata (JSON).
     *
     * DATA SOURCE:
     *     - workflow.clientdata is JSON auto-generated by CRM from workflow.xaml
     *     - clientdata contains labels for ALL languages (no need to switch user language)
     *     - Unlike Forms which only return labels for the current user's language
     *
     * CLIENTDATA STRUCTURE:
     *     WorkflowStep (root)
     *       └─ steps.list[]
     *            └─ EntityStep (primaryentity)
     *                 └─ steps.list[]
     *                      └─ StageStep (1 stage = 1 tab on the BPF bar)
     *                           ├─ stageId: GUID (= processstageid)
     *                           ├─ description: "Stage A" (base language name)
     *                           ├─ stepLabels.list[]: [{labelId, languageCode, description}]
     *                           └─ steps.list[]
     *                                └─ StepStep (1 field within the stage)
     *                                     ├─ stepStepId: GUID (= ProcessStepId in XAML)
     *                                     ├─ description: "Name" (base language name)
     *                                     └─ stepLabels.list[]: [{labelId, languageCode, description}]
     *
     * GRID DISPLAY (3 levels):
     *     BPF Name (parent, non-editable)
     *       ├─ [Stage] Stage A (child, editable labels)
     *       │    └─ [Field] Name (grandchild, editable labels)
     *       ├─ [Stage] Stage B
     *       │    └─ [Field] Owner
     *       └─ ...
     */
    BpfHandler.Load = function () {
        var entityName = XrmTranslator.GetEntity();

        bpfData = [];

        return WebApiClient.Retrieve({
            entityName: "workflow",
            queryParams: "?$select=workflowid,name,clientdata&$filter=category eq 4 and primaryentity eq '" + entityName.toLowerCase() + "'"
        })
        .then(function (response) {
            var workflows = response.value;

            for (var i = 0; i < workflows.length; i++) {
                var wf = workflows[i];

                if (!wf.clientdata) {
                    continue;
                }

                var parsed;
                try {
                    parsed = JSON.parse(wf.clientdata);
                } catch (e) {
                    continue;
                }

                var stages = [];
                FindStageSteps(parsed, stages);

                bpfData.push({
                    workflowid: wf.workflowid,
                    name: wf.name,
                    stages: stages
                });
            }

            FillTable();
        })
        .catch(XrmTranslator.errorHandler);
    };

    /**
     * Save — Persists translated BPF stage and field labels into workflow XAML.
     *
     * WARNING: This operation modifies workflow XAML directly.
     *     If the XAML becomes corrupted, the BPF will fail to activate and remain in Draft state.
     *     Recovery: CRM → Settings → Processes → find BPF → Activate manually.
     *
     * SAVE FLOW (sequential per workflow):
     *     1. Deactivate BPF (statecode=0) — XAML is only writable in Draft state
     *     2. GET workflow.xaml — fetch current XAML from CRM (saved as backup for rollback)
     *     3. ApplyXamlUpdates() — insert/modify StepLabel via string replacement
     *     4. PATCH workflow.xaml — write updated XAML back to CRM
     *     5. Activate BPF (statecode=1) — CRM validates XAML and regenerates clientdata
     *
     * ERROR RECOVERY (if step 4 or 5 fails):
     *     1. Restore original XAML (PATCH backup from step 2)
     *     2. Reactivate BPF
     *     3. If rollback succeeds → user sees "BPF restored" message
     *     4. If rollback also fails → user sees manual recovery instructions
     *
     * WHY DEACTIVATE/ACTIVATE:
     *     - workflow.xaml only allows PATCH when the workflow is in Draft state
     *     - On Activate, CRM reads XAML → validates → regenerates clientdata JSON + uidata
     *     - clientdata is a READ-ONLY field, CRM auto-generates it from XAML
     *
     * AFTER SUCCESSFUL SAVE:
     *     - Workflow is added to the solution (AddToSolution)
     *     - Grid auto-reloads to display new labels from the regenerated clientdata
     */
    BpfHandler.Save = function () {
        XrmTranslator.LockGrid("Saving");

        var records = XrmTranslator.GetAllRecords();
        var updatedWorkflows = GetUpdates(records);
        var workflowIds = Object.keys(updatedWorkflows);

        if (workflowIds.length === 0) {
            XrmTranslator.LockGrid("Reloading");
            return BpfHandler.Load();
        }

        // For each workflow: Deactivate → Fetch XAML → Update XAML → Save XAML → Activate
        // On failure: restore original XAML → reactivate → report error
        return WebApiClient.Promise.resolve(workflowIds)
            .each(function (workflowId) {
                var stageUpdates = updatedWorkflows[workflowId];
                var originalXaml = null;

                return DeactivateWorkflow(workflowId)
                    .then(function () {
                        return WebApiClient.Retrieve({
                            entityName: "workflow",
                            entityId: workflowId,
                            queryParams: "?$select=xaml"
                        });
                    })
                    .then(function (workflow) {
                        // Save original XAML for rollback
                        originalXaml = workflow.xaml;

                        var updatedXaml = ApplyXamlUpdates(workflow.xaml, stageUpdates);

                        return WebApiClient.Update({
                            entityName: "workflow",
                            entityId: workflowId,
                            entity: {
                                xaml: updatedXaml
                            }
                        });
                    })
                    .then(function () {
                        return ActivateWorkflow(workflowId);
                    })
                    .catch(function (error) {
                        // ROLLBACK: Restore original XAML and reactivate
                        var rollback = WebApiClient.Promise.resolve();

                        if (originalXaml) {
                            rollback = rollback.then(function () {
                                return WebApiClient.Update({
                                    entityName: "workflow",
                                    entityId: workflowId,
                                    entity: { xaml: originalXaml }
                                });
                            });
                        }

                        return rollback
                            .then(function () {
                                return ActivateWorkflow(workflowId);
                            })
                            .then(function () {
                                // Rollback succeeded — rethrow with clear message
                                throw new Error(
                                    "Failed to save BPF translations. " +
                                    "The BPF has been restored to its original state.\n\n" +
                                    "Original error: " + (error.message || error)
                                );
                            })
                            .catch(function (rollbackError) {
                                // Rollback also failed
                                if (rollbackError.message && rollbackError.message.indexOf("Failed to save BPF") === 0) {
                                    throw rollbackError;
                                }
                                throw new Error(
                                    "Failed to save BPF translations AND failed to restore.\n" +
                                    "The BPF may be stuck in Draft state.\n" +
                                    "Go to CRM → Settings → Processes → find the BPF → Activate manually.\n\n" +
                                    "Original error: " + (error.message || error) + "\n" +
                                    "Rollback error: " + (rollbackError.message || rollbackError)
                                );
                            });
                    });
            })
            .then(function () {
                return XrmTranslator.AddToSolution(
                    workflowIds,
                    XrmTranslator.ComponentType.Workflow
                );
            })
            .then(function () {
                return XrmTranslator.ReleaseLockAndPrompt();
            })
            .then(function () {
                XrmTranslator.LockGrid("Reloading");
                return BpfHandler.Load();
            })
            .catch(XrmTranslator.errorHandler);
    };

}(window.BpfHandler = window.BpfHandler || {}));

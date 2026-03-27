# Implementation Guide: Global Option Sets (Standalone) Translation Handler

## Overview

Add a new translation type `globalOptionSets` to allow browsing and translating **Global Option Sets independently**, without needing to select an entity first. The current `OptionSetHandler` only shows global option sets when they appear on an entity's attributes.

**Priority:** 🟡 Medium  
**Pattern:** Similar to `OptionSetHandler.js` but using `GlobalOptionSetDefinitions` API  
**ComponentType:** `OptionSet = 9` (already defined in `XrmTranslator.ComponentType`)

---

## Files to Modify

| File | Action |
|------|--------|
| `src/js/Translator/GlobalOptionSetHandler.js` | **CREATE** — new handler file |
| `src/html/TranslationGrid.html` | **MODIFY** — add `<script>` tag |
| `src/js/Translator/XrmTranslator.js` | **MODIFY** — register handler + dropdown entry |

---

## Step 1: Create `GlobalOptionSetHandler.js`

Create file: `src/js/Translator/GlobalOptionSetHandler.js`

```javascript
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

    function ApplyChanges(changes, labels) {
        for (var change in changes) {
            if (!changes.hasOwnProperty(change)) {
                continue;
            }
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
                if (i === labels.length - 1) {
                    labels.push({ LanguageCode: change, Label: changes[change] });
                }
            }
        }
    }

    function GetUpdates() {
        var records = XrmTranslator.GetAllRecords();
        var updates = [];

        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            if (!record.w2ui || !record.w2ui.changes) {
                continue;
            }

            // record.recid = MetadataId|OptionValue for option values
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
            var options = optionSet.Options;

            if (!options || options.length === 0) {
                continue;
            }

            var parent = {
                recid: optionSet.MetadataId,
                schemaName: optionSet.Name,
                w2ui: { editable: false, children: [] }
            };

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

            records.push(parent);
        }

        XrmTranslator.AddSummary(records);
        grid.add(records);
        grid.unlock();
    }

    GlobalOptionSetHandler.Load = function () {
        // Retrieve ALL global option sets with their options
        var request = {
            entityName: "GlobalOptionSetDefinition",
            queryParams: ""
        };

        return WebApiClient.Retrieve(request)
            .then(function (response) {
                // Filter to only OptionSetType === "Picklist" (exclude Boolean, State, Status)
                // Also filter to only customizable option sets
                var optionSets = response.value.filter(function (os) {
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

        // Collect unique option set names for publish
        var optionSetNames = [];
        updates.forEach(function (u) {
            if (optionSetNames.indexOf(u.OptionSetName) === -1) {
                optionSetNames.push(u.OptionSetName);
            }
        });

        // Collect unique MetadataIds for AddToSolution
        var optionSetIds = [];
        for (var i = 0; i < XrmTranslator.metadata.length; i++) {
            var os = XrmTranslator.metadata[i];
            if (optionSetNames.indexOf(os.Name) !== -1 && optionSetIds.indexOf(os.MetadataId) === -1) {
                optionSetIds.push(os.MetadataId);
            }
        }

        return WebApiClient.Promise.resolve(updates)
            .each(function (payload) {
                return WebApiClient.SendRequest("POST", WebApiClient.GetApiUrl() + "UpdateOptionValue", payload);
            })
            .then(function () {
                XrmTranslator.LockGrid("Publishing");
                // Publish global option sets - need to use PublishXml with <optionsets>
                return XrmTranslator.SetBaseLanguage(XrmTranslator.userId)
                    .then(function () {
                        var optionSetXml = optionSetNames.map(function (n) {
                            return "<optionset>" + n + "</optionset>";
                        }).join("");
                        var xml = "<importexportxml><optionsets>" + optionSetXml + "</optionsets></importexportxml>";

                        var request = WebApiClient.Requests.PublishXmlRequest.with({
                            payload: { ParameterXml: xml }
                        });
                        return WebApiClient.Execute(request);
                    })
                    .then(function () {
                        return XrmTranslator.RestoreUserLanguage();
                    });
            })
            .then(function () {
                return XrmTranslator.AddToSolution(optionSetIds, XrmTranslator.ComponentType.OptionSet, true, true);
            })
            .then(function () {
                return XrmTranslator.ReleaseLockAndPrompt();
            })
            .then(function () {
                XrmTranslator.LockGrid("Reloading");
                return GlobalOptionSetHandler.Load();
            })
            .catch(XrmTranslator.errorHandler);
    };

}(window.GlobalOptionSetHandler = window.GlobalOptionSetHandler || {}));
```

---

## Step 2: Add Script Reference in `TranslationGrid.html`

Add after `OptionSetHandler.js`:

```html
<script type="text/javascript" src="../js/GlobalOptionSetHandler.js"></script>
```

---

## Step 3: Register in `XrmTranslator.js` — Type Dropdown

In `InitializeGrid()`, add to the `type` menu-radio items:

```javascript
{ id: 'globalOptionSets', text: 'Global Option Sets', icon: 'fa-picture' },
```

---

## Step 4: Register in `XrmTranslator.js` — SetHandler()

Add in `SetHandler()`:

```javascript
else if (XrmTranslator.GetType() === "globalOptionSets") {
    currentHandler = GlobalOptionSetHandler;
}
```

---

## Step 5: Register in `XrmTranslator.js` — Enable/Disable Logic

Global Option Sets are **entity-independent** (like dashboards). They should be:

- **Enabled** when entity is "none"
- **Disabled** when an entity is selected

**When entity is "none":**
```javascript
w2ui['filterbar'].enable('type:globalOptionSets');
```

**When entity is selected:**
```javascript
w2ui['filterbar'].disable('type:globalOptionSets');
```

Also add `"globalOptionSets"` to the reset array:

```javascript
if (["content", "webresources", "dashboards", "globalOptionSets"].indexOf(w2ui.filterbar.get("type").selected) !== -1) {
```

---

## Step 6: Update `README.md`

Add:

```markdown
- **Global Option Sets** - Standalone global option set value labels
```

---

## API Reference

| Operation | API |
|-----------|-----|
| Retrieve all global option sets | `GET GlobalOptionSetDefinitions` |
| Update option value | `POST UpdateOptionValue` with `{ OptionSetName, Value, Label/Description, MergeLabels }` |
| Publish | `PublishXml` with `<optionsets><optionset>name</optionset></optionsets>` |
| AddToSolution | `ComponentType = 9` (OptionSet) |

## Testing

1. Select Entity → None
2. Select Type → Global Option Sets
3. Grid should show all customizable global option sets grouped by name
4. Edit an option value label for a non-base language
5. Click Save → verify label updated in CRM
6. Test Component → Description for description labels
7. Verify the option set is added to the configured solution
8. **Edge case:** Test with boolean-type global option sets (TrueOption/FalseOption)

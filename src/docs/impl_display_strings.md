# Implementation Guide: Display Strings / Ribbon Translation Handler

## Overview

Add a new translation type `displayStrings` to allow translating **Display Strings** — system messages, ribbon labels, and UI text strings that appear in the "Display Strings" worksheet of `CrmTranslations.xml`.

**Priority:** 🟡 Medium  
**Pattern:** Similar to `ViewHandler.js` (uses `RetrieveLocLabels` / `SetLocLabels`)  
**ComponentType:** `DisplayString = 22` (already defined in `XrmTranslator.ComponentType`)

---

## Files to Modify

| File | Action |
|------|--------|
| `src/js/Translator/DisplayStringHandler.js` | **CREATE** — new handler file |
| `src/html/TranslationGrid.html` | **MODIFY** — add `<script>` tag |
| `src/js/Translator/XrmTranslator.js` | **MODIFY** — register handler + dropdown entry |

---

## Step 1: Create `DisplayStringHandler.js`

Create file: `src/js/Translator/DisplayStringHandler.js`

### Key Concepts

- Display strings are stored in the `displaystring` entity
- Each record has a `displaystringid`, `displaystringkey` (the string identifier), and `publisheddisplaystring` (published text)
- Localized labels are accessible via `RetrieveLocLabels` on the `publisheddisplaystring` attribute
- Updates use `SetLocLabels` on the same attribute

```javascript
(function (DisplayStringHandler, undefined) {
    "use strict";

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
        var records = XrmTranslator.GetGrid().records;
        var updates = [];

        for (var i = 0; i < records.length; i++) {
            var record = records[i];
            if (record.w2ui && record.w2ui.changes) {
                var ds = XrmTranslator.GetAttributeByProperty("recid", record.recid);
                var labels = ds.labels.Label.LocalizedLabels;
                ApplyChanges(record.w2ui.changes, labels);
                updates.push(ds);
            }
        }

        return updates;
    }

    function FillTable() {
        var grid = XrmTranslator.GetGrid();
        grid.clear();
        var records = [];

        for (var i = 0; i < XrmTranslator.metadata.length; i++) {
            var ds = XrmTranslator.metadata[i];
            var displayNames = ds.labels.Label.LocalizedLabels;

            if (!displayNames || displayNames.length === 0) {
                continue;
            }

            var record = {
                recid: ds.recid,
                schemaName: ds.displaystringkey || ds.recid
            };

            for (var j = 0; j < displayNames.length; j++) {
                record[displayNames[j].LanguageCode.toString()] = displayNames[j].Label;
            }

            records.push(record);
        }

        XrmTranslator.AddSummary(records);
        grid.add(records);
        grid.unlock();
    }

    DisplayStringHandler.Load = function () {
        // Retrieve display strings that are customizable
        // Note: You can filter by specific entity if needed, but display strings
        // are typically entity-agnostic, so load all customizable ones
        var queryRequest = {
            entityName: "displaystring",
            queryParams: "?$filter=iscustomizable/Value eq true&$orderby=displaystringkey asc"
        };

        return WebApiClient.Retrieve(queryRequest)
            .then(function (response) {
                var displayStrings = response.value;
                var requests = [];

                for (var i = 0; i < displayStrings.length; i++) {
                    var ds = displayStrings[i];

                    var retrieveLabelsRequest = WebApiClient.Requests.RetrieveLocLabelsRequest
                        .with({
                            urlParams: {
                                EntityMoniker: "{'@odata.id':'displaystrings(" + ds.displaystringid + ")'}",
                                AttributeName: "'publisheddisplaystring'",
                                IncludeUnpublished: true
                            }
                        });

                    var prop = WebApiClient.Promise.props({
                        recid: ds.displaystringid,
                        displaystringkey: ds.displaystringkey,
                        labels: WebApiClient.Execute(retrieveLabelsRequest)
                    });

                    requests.push(prop);
                }

                return WebApiClient.Promise.all(requests);
            })
            .then(function (responses) {
                XrmTranslator.metadata = responses;
                FillTable();
            })
            .catch(XrmTranslator.errorHandler);
    };

    DisplayStringHandler.Save = function () {
        XrmTranslator.LockGrid("Saving");

        var updates = GetUpdates();
        var requests = [];

        for (var i = 0; i < updates.length; i++) {
            var update = updates[i];

            var request = WebApiClient.Requests.SetLocLabelsRequest
                .with({
                    payload: {
                        Labels: update.labels.Label.LocalizedLabels,
                        EntityMoniker: {
                            "@odata.type": "Microsoft.Dynamics.CRM.displaystring",
                            displaystringid: update.recid
                        },
                        AttributeName: "publisheddisplaystring"
                    }
                });

            requests.push(request);
        }

        return WebApiClient.Promise.resolve(requests)
            .each(function (request) {
                return WebApiClient.Execute(request);
            })
            .then(function () {
                XrmTranslator.LockGrid("Publishing");
                // Display strings need PublishAllXml since they are not entity-specific
                return XrmTranslator.SetBaseLanguage(XrmTranslator.userId)
                    .then(function () {
                        var request = WebApiClient.Requests.PublishAllXmlRequest;
                        return WebApiClient.Execute(request);
                    })
                    .then(function () {
                        return XrmTranslator.RestoreUserLanguage();
                    });
            })
            .then(function () {
                return XrmTranslator.AddToSolution(
                    updates.map(function (u) { return u.recid; }),
                    XrmTranslator.ComponentType.DisplayString
                );
            })
            .then(function () {
                return XrmTranslator.ReleaseLockAndPrompt();
            })
            .then(function () {
                XrmTranslator.LockGrid("Reloading");
                return DisplayStringHandler.Load();
            })
            .catch(XrmTranslator.errorHandler);
    };

}(window.DisplayStringHandler = window.DisplayStringHandler || {}));
```

---

## Step 2: Add Script Reference in `TranslationGrid.html`

Add after existing handler scripts:

```html
<script type="text/javascript" src="../js/DisplayStringHandler.js"></script>
```

---

## Step 3: Register in `XrmTranslator.js` — Type Dropdown

Add to the `type` menu-radio items:

```javascript
{ id: 'displayStrings', text: 'Display Strings', icon: 'fa-picture' },
```

---

## Step 4: Register in `XrmTranslator.js` — SetHandler()

```javascript
else if (XrmTranslator.GetType() === "displayStrings") {
    currentHandler = DisplayStringHandler;
}
```

---

## Step 5: Register in `XrmTranslator.js` — Enable/Disable Logic

Display Strings are **entity-independent**:

- **Enabled** when entity is "none"
- **Disabled** when an entity is selected

**When entity is "none":**
```javascript
w2ui['filterbar'].enable('type:displayStrings');
```

**When entity is selected:**
```javascript
w2ui['filterbar'].disable('type:displayStrings');
```

Add `"displayStrings"` to reset array:

```javascript
if (["content", "webresources", "dashboards", "displayStrings"].indexOf(...) !== -1) {
```

---

## Step 6: Update `README.md`

```markdown
- **Display Strings** - System messages, ribbon labels, and UI text
```

---

## API Reference

| Operation | API |
|-----------|-----|
| Retrieve | `GET displaystrings?$filter=iscustomizable/Value eq true` |
| Read labels | `RetrieveLocLabels` with EntityMoniker `displaystrings({id})`, AttributeName `publisheddisplaystring` |
| Write labels | `SetLocLabels` with EntityMoniker `@odata.type: Microsoft.Dynamics.CRM.displaystring` |
| Publish | `PublishAllXml` (display strings are not entity-specific) |
| AddToSolution | `ComponentType = 22` (DisplayString) |

## Testing

1. Select Entity → None
2. Select Type → Display Strings
3. Grid should show all customizable display strings with their keys
4. Edit a label for a non-base language
5. Click Save → verify message text updated in CRM
6. **Note:** The attribute name for SetLocLabels is `publisheddisplaystring` — if this fails, try `customdisplaystring` instead. Check the entity metadata to confirm the correct attribute name

## Known Considerations

- Display strings may have a large number of records. Consider adding pagination or search if performance is an issue.
- The `publisheddisplaystring` attribute name may differ across CRM versions. Verify with your target environment.
- `PublishAllXml` is slower than entity-specific publish. If performance is a concern, consider using entity-specific publish when possible.

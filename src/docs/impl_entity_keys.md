# Implementation Guide: Entity Keys Translation Handler

## Overview

Add a new translation type `entityKeys` to allow translating **DisplayName** labels of Alternate Keys defined on entities.

**Priority:** 🟢 Low  
**Pattern:** Same as `AttributeHandler.js` (metadata API + PUT with `MSCRM.MergeLabels`)  
**ComponentType:** `EntityKey = 14` (already defined in `XrmTranslator.ComponentType`)

---

## Files to Modify

| File | Action |
|------|--------|
| `src/js/Translator/EntityKeyHandler.js` | **CREATE** — new handler file |
| `src/html/TranslationGrid.html` | **MODIFY** — add `<script>` tag |
| `src/js/Translator/XrmTranslator.js` | **MODIFY** — register handler + dropdown entry |

---

## Step 1: Create `EntityKeyHandler.js`

Create file: `src/js/Translator/EntityKeyHandler.js`

### Key Concepts

- Entity keys are accessed via `EntityDefinitions({id})/Keys`
- Each key has `MetadataId`, `SchemaName`, `DisplayName`, `KeyAttributes` (array of attribute logical names)
- `DisplayName` is a `Label` complex type with `LocalizedLabels`
- Updates use PUT to `EntityDefinitions({id})/Keys({keyId})` with `MSCRM.MergeLabels: true`
- Only the `DisplayName` label is translatable (no Description)

```javascript
(function (EntityKeyHandler, undefined) {
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
                var key = XrmTranslator.GetAttributeById(record.recid);
                var labels = key.DisplayName.LocalizedLabels;
                ApplyChanges(record.w2ui.changes, labels);
                updates.push(key);
            }
        }

        return updates;
    }

    function FillTable() {
        var grid = XrmTranslator.GetGrid();
        grid.clear();
        var records = [];

        for (var i = 0; i < XrmTranslator.metadata.length; i++) {
            var key = XrmTranslator.metadata[i];
            var displayNames = key.DisplayName.LocalizedLabels;

            if (!displayNames || displayNames.length === 0) {
                continue;
            }

            var record = {
                recid: key.MetadataId,
                schemaName: key.SchemaName + " (" + (key.KeyAttributes || []).join(", ") + ")"
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

    EntityKeyHandler.Load = function () {
        var entityName = XrmTranslator.GetEntity();
        var entityMetadataId = XrmTranslator.entityMetadata[entityName];

        var request = {
            entityName: "EntityDefinition",
            entityId: entityMetadataId,
            queryParams: "/Keys"
        };

        return WebApiClient.Retrieve(request)
            .then(function (response) {
                var keys = (response.value || []).sort(function (a, b) {
                    return (a.SchemaName || "").localeCompare(b.SchemaName || "");
                });

                XrmTranslator.metadata = keys;
                FillTable();
            })
            .catch(XrmTranslator.errorHandler);
    };

    EntityKeyHandler.Save = function () {
        XrmTranslator.LockGrid("Saving");

        var updates = GetUpdates();
        var requests = [];
        var entityMetadataId = XrmTranslator.GetEntityId();

        for (var i = 0; i < updates.length; i++) {
            var update = updates[i];
            var url = WebApiClient.GetApiUrl() + "EntityDefinitions(" + entityMetadataId + ")/Keys(" + update.MetadataId + ")";

            requests.push({
                method: "PUT",
                url: url,
                payload: update,
                headers: [{ key: "MSCRM.MergeLabels", value: "true" }]
            });
        }

        return WebApiClient.Promise.resolve(requests)
            .each(function (request) {
                return WebApiClient.SendRequest(request.method, request.url, request.payload, request.headers);
            })
            .then(function () {
                XrmTranslator.LockGrid("Publishing");
                return XrmTranslator.Publish();
            })
            .then(function () {
                return XrmTranslator.AddToSolution(
                    updates.map(function (u) { return u.MetadataId; }),
                    XrmTranslator.ComponentType.EntityKey
                );
            })
            .then(function () {
                return XrmTranslator.ReleaseLockAndPrompt();
            })
            .then(function () {
                XrmTranslator.LockGrid("Reloading");
                return EntityKeyHandler.Load();
            })
            .catch(XrmTranslator.errorHandler);
    };

}(window.EntityKeyHandler = window.EntityKeyHandler || {}));
```

---

## Step 2: Add Script Reference in `TranslationGrid.html`

```html
<script type="text/javascript" src="../js/EntityKeyHandler.js"></script>
```

---

## Step 3: Register in `XrmTranslator.js` — Type Dropdown

```javascript
{ id: 'entityKeys', text: 'Entity Keys', icon: 'fa-picture' },
```

---

## Step 4: Register in `XrmTranslator.js` — SetHandler()

```javascript
else if (XrmTranslator.GetType() === "entityKeys") {
    currentHandler = EntityKeyHandler;
}
```

---

## Step 5: Register in `XrmTranslator.js` — Enable/Disable Logic

Entity Keys are **entity-dependent** (like attributes):

- **Enabled** when an entity is selected
- **Disabled** when entity is "none"

```javascript
// When entity is "none":
w2ui['filterbar'].disable('type:entityKeys');

// When entity is selected:
w2ui['filterbar'].enable('type:entityKeys');
```

---

## Step 6: Component Dropdown Note

Entity Keys only have `DisplayName` (no `Description`). You may want to hide the Component dropdown or lock it to "DisplayName" when this type is selected. However, this is optional — if Description is selected, the grid will simply show no labels.

---

## Step 7: Update `README.md`

```markdown
- **Entity Keys** - Alternate key display names
```

---

## API Reference

| Operation | API |
|-----------|-----|
| Retrieve | `GET EntityDefinitions({id})/Keys` |
| Update | `PUT EntityDefinitions({id})/Keys({keyId})` with `MSCRM.MergeLabels: true` |
| Publish | Same as entity publish (`PublishXml`) |
| AddToSolution | `ComponentType = 14` (EntityKey) |

## Testing

1. Select an entity that has alternate keys defined (e.g., a custom entity with alternate keys)
2. Select Type → Entity Keys, Component → DisplayName
3. Grid should show all keys with their schema name and key attributes
4. Edit a label for a non-base language
5. Click Save → verify key name updated in CRM
6. **Edge case:** Entity with no keys → grid should be empty, no errors

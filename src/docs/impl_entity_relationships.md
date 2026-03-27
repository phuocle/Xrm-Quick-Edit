# Implementation Guide: Entity Relationships Translation Handler

## Overview

Add a new translation type `relationships` to allow translating **DisplayName** and **Description** labels of 1:N (OneToMany) and N:N (ManyToMany) entity relationships.

**Priority:** 🔴 High  
**Pattern:** Same as `EntityHandler.js` (metadata API + PUT with `MSCRM.MergeLabels`)  
**ComponentType:** `EntityRelationship = 10` (already defined in `XrmTranslator.ComponentType`)

---

## Files to Modify

### 1. `src/js/Translator/RelationshipHandler.js` — [NEW FILE]

Create this file following the `EntityHandler.js` pattern. Full code below.

### 2. `src/html/TranslationGrid.html`

Add the script reference.

### 3. `src/js/Translator/XrmTranslator.js`

Register the handler in the type dropdown and `SetHandler()` function.

---

## Step 1: Create `RelationshipHandler.js`

Create file: `src/js/Translator/RelationshipHandler.js`

```javascript
(function (RelationshipHandler, undefined) {
    "use strict";

    var idSeparator = "|";

    // Reuse the standard ApplyChanges pattern from EntityHandler / AttributeHandler
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
            if (!record.w2ui || !record.w2ui.changes) {
                continue;
            }

            var rel = XrmTranslator.GetAttributeByProperty("recid", record.recid);
            if (!rel) {
                continue;
            }

            // Component dropdown selects DisplayName or Description
            var labels = rel[XrmTranslator.GetComponent()].LocalizedLabels;
            var changes = record.w2ui.changes;

            ApplyChanges(changes, labels);
            updates.push(rel);
        }

        return updates;
    }

    function FillTable() {
        var grid = XrmTranslator.GetGrid();
        grid.clear();

        var records = [];

        for (var i = 0; i < XrmTranslator.metadata.length; i++) {
            var rel = XrmTranslator.metadata[i];
            var displayNames = rel[XrmTranslator.GetComponent()].LocalizedLabels;

            if (!displayNames || displayNames.length === 0) {
                continue;
            }

            var record = {
                recid: rel.recid,
                schemaName: rel.SchemaName + " (" + rel.relType + ")"
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

    RelationshipHandler.Load = function () {
        var entityName = XrmTranslator.GetEntity();
        var entityMetadataId = XrmTranslator.entityMetadata[entityName];

        // Fetch both 1:N and N:N relationships in parallel
        var oneToManyRequest = {
            entityName: "EntityDefinition",
            entityId: entityMetadataId,
            queryParams: "/OneToManyRelationships"
        };

        var manyToManyRequest = {
            entityName: "EntityDefinition",
            entityId: entityMetadataId,
            queryParams: "/ManyToManyRelationships"
        };

        return WebApiClient.Promise.all([
            WebApiClient.Retrieve(oneToManyRequest),
            WebApiClient.Retrieve(manyToManyRequest)
        ])
        .then(function (responses) {
            var oneToMany = (responses[0].value || []).map(function (r) {
                return {
                    recid: r.MetadataId,
                    MetadataId: r.MetadataId,
                    SchemaName: r.SchemaName,
                    relType: "1:N",
                    DisplayName: r.AssociatedMenuConfiguration
                        ? r.AssociatedMenuConfiguration.Label || { LocalizedLabels: [] }
                        : { LocalizedLabels: [] },
                    // 1:N relationships do not have a top-level DisplayName/Description
                    // They DO have AssociatedMenuConfiguration.Label for the menu item
                    // BUT the relationship itself doesn't expose DisplayName via this path.
                    // We must use the relationship-level DisplayName and Description.
                    _raw: r
                };
            });

            // Actually, OneToManyRelationshipMetadata DOES have top-level
            // DisplayName (undocumented but present in API response).
            // Let's use the raw response directly:
            var allRels = [];

            for (var i = 0; i < responses[0].value.length; i++) {
                var r = responses[0].value[i];
                // Only include customizable relationships
                if (r.IsCustomizable && !r.IsCustomizable.Value) {
                    continue;
                }
                allRels.push({
                    recid: r.MetadataId,
                    MetadataId: r.MetadataId,
                    SchemaName: r.SchemaName,
                    relType: "1:N → " + r.ReferencingEntity,
                    DisplayName: r.DisplayName || { LocalizedLabels: [] },
                    Description: r.Description || { LocalizedLabels: [] }
                });
            }

            for (var j = 0; j < responses[1].value.length; j++) {
                var m = responses[1].value[j];
                if (m.IsCustomizable && !m.IsCustomizable.Value) {
                    continue;
                }
                allRels.push({
                    recid: m.MetadataId,
                    MetadataId: m.MetadataId,
                    SchemaName: m.SchemaName,
                    relType: "N:N ↔ " + m.Entity2LogicalName,
                    DisplayName: m.DisplayName || { LocalizedLabels: [] },
                    Description: m.Description || { LocalizedLabels: [] }
                });
            }

            allRels.sort(function (a, b) {
                return a.SchemaName < b.SchemaName ? -1 : a.SchemaName > b.SchemaName ? 1 : 0;
            });

            XrmTranslator.metadata = allRels;
            FillTable();
        })
        .catch(XrmTranslator.errorHandler);
    };

    RelationshipHandler.Save = function () {
        XrmTranslator.LockGrid("Saving");

        var updates = GetUpdates();
        var requests = [];

        // Determine the correct API endpoint for each relationship
        var entityMetadataId = XrmTranslator.GetEntityId();

        for (var i = 0; i < updates.length; i++) {
            var update = updates[i];
            var relType = update.relType.indexOf("1:N") === 0
                ? "OneToManyRelationships"
                : "ManyToManyRelationships";

            var url = WebApiClient.GetApiUrl() + "EntityDefinitions(" + entityMetadataId + ")/" + relType + "(" + update.MetadataId + ")";

            // Build minimal update payload with just the label fields
            var payload = {};
            payload[XrmTranslator.GetComponent()] = update[XrmTranslator.GetComponent()];

            requests.push({
                method: "PUT",
                url: url,
                payload: payload,
                headers: [{ key: "MSCRM.MergeLabels", value: "true" }],
                metadataId: update.MetadataId
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
                    XrmTranslator.ComponentType.EntityRelationship
                );
            })
            .then(function () {
                return XrmTranslator.ReleaseLockAndPrompt();
            })
            .then(function () {
                XrmTranslator.LockGrid("Reloading");
                return RelationshipHandler.Load();
            })
            .catch(XrmTranslator.errorHandler);
    };

}(window.RelationshipHandler = window.RelationshipHandler || {}));
```

---

## Step 2: Add Script Reference in `TranslationGrid.html`

In `src/html/TranslationGrid.html`, add this line **after** the existing handler script tags (e.g., after `BpfHandler.js`):

```html
<script type="text/javascript" src="../js/RelationshipHandler.js"></script>
```

The final order should be:

```html
<script type="text/javascript" src="../js/BpfHandler.js"></script>
<script type="text/javascript" src="../js/RelationshipHandler.js"></script>   <!-- NEW -->
<script type="text/javascript" src="../js/XrmTranslator.js"></script>
```

---

## Step 3: Register in `XrmTranslator.js` — Type Dropdown

In function `InitializeGrid()`, find the `type` menu-radio items array (around line 1122-1134). Add a new entry:

```javascript
{ id: 'relationships', text: 'Relationships', icon: 'fa-picture' },
```

Add it after the `entityMeta` entry so the list becomes:

```javascript
items: [
    { id: 'attributes', text: 'Attributes', icon: 'fa-camera' },
    { id: 'options', text: 'Options', icon: 'fa-picture' },
    { id: 'forms', text: 'Forms', icon: 'fa-picture' },
    { id: 'views', text: 'Views', icon: 'fa-picture' },
    { id: 'formMeta', text: 'Form Metadata', icon: 'fa-picture' },
    { id: 'entityMeta', text: 'Entity Metadata', icon: 'fa-picture' },
    { id: 'relationships', text: 'Relationships', icon: 'fa-picture' },  // NEW
    { id: 'charts', text: 'Charts', icon: 'fa-picture' },
    { id: 'bpf', text: 'Business Process Flows', icon: 'fa-picture' },
    { id: 'content', text: 'Content', icon: 'fa-picture' },
    { id: 'dashboards', text: 'Dashboards', icon: 'fa-picture' },
    { id: 'webresources', text: 'Web Resources', icon: 'fa-picture' }
]
```

---

## Step 4: Register in `XrmTranslator.js` — SetHandler()

In `SetHandler()` function (around line 169-211), add a new `else if` branch:

```javascript
else if (XrmTranslator.GetType() === "relationships") {
    currentHandler = RelationshipHandler;
}
```

Add it after the `entityMeta` check:

```javascript
else if (XrmTranslator.GetType() === "entityMeta") {
    currentHandler = EntityHandler;
}
else if (XrmTranslator.GetType() === "relationships") {
    currentHandler = RelationshipHandler;
}
```

---

## Step 5: Register in `XrmTranslator.js` — Enable/Disable Logic

In the `entitySelect` click handler (around line 1162-1200), add enable/disable logic for the new type:

**When entity is "none":**
```javascript
w2ui['filterbar'].disable('type:relationships');
```

**When entity is selected:**
```javascript
w2ui['filterbar'].enable('type:relationships');
```

Place these alongside the existing enable/disable calls for `type:attributes`, `type:entityMeta`, etc.

---

## Step 6: Update `README.md`

Add to the Translation Management Dashboard features list:

```markdown
- **Relationships** - Entity relationship display names and descriptions
```

---

## API Reference

| Operation | API |
|-----------|-----|
| Retrieve 1:N | `GET EntityDefinitions({id})/OneToManyRelationships` |
| Retrieve N:N | `GET EntityDefinitions({id})/ManyToManyRelationships` |
| Update 1:N | `PUT EntityDefinitions({id})/OneToManyRelationships({relId})` with `MSCRM.MergeLabels: true` |
| Update N:N | `PUT EntityDefinitions({id})/ManyToManyRelationships({relId})` with `MSCRM.MergeLabels: true` |
| Publish | Same as entity publish (`PublishXml`) |
| AddToSolution | `ComponentType = 10` (EntityRelationship) |

## Testing

1. Select an entity with known relationships (e.g., Account, Contact)
2. Select Type → Relationships, Component → DisplayName
3. Grid should show all customizable 1:N and N:N relationships
4. Edit a label for a non-base language
5. Click Save → verify label updated in CRM
6. Test Component → Description to verify description labels work
7. Verify the relationship is added to the configured solution

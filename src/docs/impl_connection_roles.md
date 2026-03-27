# Implementation Guide: Connection Roles Translation Handler

## Overview

Add a new translation type `connectionRoles` to allow translating **Name** and **Description** labels of Connection Roles. These appear when users create connections between records.

**Priority:** 🟡 Medium  
**Pattern:** Same as `ViewHandler.js` / `ChartHandler.js` (uses `RetrieveLocLabels` / `SetLocLabels`)  
**ComponentType:** `ConnectionRole = 63` (already defined in `XrmTranslator.ComponentType`)

---

## Files to Modify

| File | Action |
|------|--------|
| `src/js/Translator/ConnectionRoleHandler.js` | **CREATE** — new handler file |
| `src/html/TranslationGrid.html` | **MODIFY** — add `<script>` tag |
| `src/js/Translator/XrmTranslator.js` | **MODIFY** — register handler + dropdown entry |

---

## Step 1: Create `ConnectionRoleHandler.js`

Create file: `src/js/Translator/ConnectionRoleHandler.js`

### Key Concepts

- Connection roles are stored in the `connectionrole` entity
- Each has `connectionroleid`, `name`, `description`, and `category` (picklist)
- Category values: 1=Business, 2=Family, 3=Social, 4=Sales, 5=Other, 1000=Stakeholder, 1001=Sales Team, 1002=Service
- Localized labels for `name` are retrieved via `RetrieveLocLabels`
- Updates use `SetLocLabels` on the `name` attribute

```javascript
(function (ConnectionRoleHandler, undefined) {
    "use strict";

    var categoryMap = {
        1: "Business",
        2: "Family",
        3: "Social",
        4: "Sales",
        5: "Other",
        1000: "Stakeholder",
        1001: "Sales Team",
        1002: "Service"
    };

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
                var role = XrmTranslator.GetAttributeByProperty("recid", record.recid);
                var labels = role.labels.Label.LocalizedLabels;
                ApplyChanges(record.w2ui.changes, labels);
                updates.push(role);
            }
        }

        return updates;
    }

    function FillTable() {
        var grid = XrmTranslator.GetGrid();
        grid.clear();
        var records = [];

        for (var i = 0; i < XrmTranslator.metadata.length; i++) {
            var role = XrmTranslator.metadata[i];
            var displayNames = role.labels.Label.LocalizedLabels;

            if (!displayNames || displayNames.length === 0) {
                continue;
            }

            var record = {
                recid: role.recid,
                schemaName: categoryMap[role.category] || ("Category " + role.category)
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

    ConnectionRoleHandler.Load = function () {
        // Retrieve all active connection roles
        // The attribute to translate depends on the Component dropdown:
        // - DisplayName → "name" attribute
        // - Description → "description" attribute
        var attributeName = XrmTranslator.GetComponent() === "DisplayName" ? "name" : "description";

        return WebApiClient.Retrieve({
            entityName: "connectionrole",
            queryParams: "?$select=connectionroleid,name,category&$filter=statecode eq 0&$orderby=name asc"
        })
        .then(function (response) {
            var roles = response.value;
            var requests = [];

            for (var i = 0; i < roles.length; i++) {
                var role = roles[i];

                var retrieveLabelsRequest = WebApiClient.Requests.RetrieveLocLabelsRequest
                    .with({
                        urlParams: {
                            EntityMoniker: "{'@odata.id':'connectionroles(" + role.connectionroleid + ")'}",
                            AttributeName: "'" + attributeName + "'",
                            IncludeUnpublished: true
                        }
                    });

                var prop = WebApiClient.Promise.props({
                    recid: role.connectionroleid,
                    name: role.name,
                    category: role.category,
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

    ConnectionRoleHandler.Save = function () {
        XrmTranslator.LockGrid("Saving");

        var updates = GetUpdates();
        var requests = [];
        var attributeName = XrmTranslator.GetComponent() === "DisplayName" ? "name" : "description";

        for (var i = 0; i < updates.length; i++) {
            var update = updates[i];

            var request = WebApiClient.Requests.SetLocLabelsRequest
                .with({
                    payload: {
                        Labels: update.labels.Label.LocalizedLabels,
                        EntityMoniker: {
                            "@odata.type": "Microsoft.Dynamics.CRM.connectionrole",
                            connectionroleid: update.recid
                        },
                        AttributeName: attributeName
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
                // Connection roles don't need entity-specific publish
                // Use PublishAllXml
                return XrmTranslator.SetBaseLanguage(XrmTranslator.userId)
                    .then(function () {
                        return WebApiClient.Execute(WebApiClient.Requests.PublishAllXmlRequest);
                    })
                    .then(function () {
                        return XrmTranslator.RestoreUserLanguage();
                    });
            })
            .then(function () {
                return XrmTranslator.AddToSolution(
                    updates.map(function (u) { return u.recid; }),
                    XrmTranslator.ComponentType.ConnectionRole
                );
            })
            .then(function () {
                return XrmTranslator.ReleaseLockAndPrompt();
            })
            .then(function () {
                XrmTranslator.LockGrid("Reloading");
                return ConnectionRoleHandler.Load();
            })
            .catch(XrmTranslator.errorHandler);
    };

}(window.ConnectionRoleHandler = window.ConnectionRoleHandler || {}));
```

---

## Step 2: Add Script Reference in `TranslationGrid.html`

```html
<script type="text/javascript" src="../js/ConnectionRoleHandler.js"></script>
```

---

## Step 3: Register in `XrmTranslator.js` — Type Dropdown

```javascript
{ id: 'connectionRoles', text: 'Connection Roles', icon: 'fa-picture' },
```

---

## Step 4: Register in `XrmTranslator.js` — SetHandler()

```javascript
else if (XrmTranslator.GetType() === "connectionRoles") {
    currentHandler = ConnectionRoleHandler;
}
```

---

## Step 5: Register in `XrmTranslator.js` — Enable/Disable Logic

Connection Roles are **entity-independent**:

- **Enabled** when entity is "none"
- **Disabled** when an entity is selected

```javascript
// When entity is "none":
w2ui['filterbar'].enable('type:connectionRoles');

// When entity is selected:
w2ui['filterbar'].disable('type:connectionRoles');
```

Add `"connectionRoles"` to reset array.

---

## Step 6: Update `README.md`

```markdown
- **Connection Roles** - Connection role names and descriptions
```

---

## API Reference

| Operation | API |
|-----------|-----|
| Retrieve | `GET connectionroles?$select=connectionroleid,name,category&$filter=statecode eq 0` |
| Read labels | `RetrieveLocLabels` with EntityMoniker `connectionroles({id})`, AttributeName `name` or `description` |
| Write labels | `SetLocLabels` with `@odata.type: Microsoft.Dynamics.CRM.connectionrole` |
| Publish | `PublishAllXml` |
| AddToSolution | `ComponentType = 63` (ConnectionRole) |

## Testing

1. Select Entity → None
2. Select Type → Connection Roles, Component → DisplayName
3. Grid should show all active connection roles grouped by category
4. Edit a name label for a non-base language
5. Click Save → verify connection role name updated in CRM
6. Test Component → Description switch
7. Verify the connection role is added to the configured solution

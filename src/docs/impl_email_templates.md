# Implementation Guide: Email / KB Article Templates Translation Handler

## Overview

Add a new translation type `emailTemplates` to allow translating **Subject** and **Body** labels of Email Templates and KB Article Templates.

**Priority:** 🟢 Low  
**Pattern:** Similar to `ViewHandler.js` (uses `RetrieveLocLabels` / `SetLocLabels`)  
**ComponentType:** `EmailTemplate = 36`, `KBArticleTemplate = 38` (both already defined in `XrmTranslator.ComponentType`)

> **Note:** Template content is typically rich HTML, which differs from simple metadata labels. This handler focuses on the **Subject** (title) field. Body translation is more complex and optional.

---

## Files to Modify

| File | Action |
|------|--------|
| `src/js/Translator/EmailTemplateHandler.js` | **CREATE** — new handler file |
| `src/html/TranslationGrid.html` | **MODIFY** — add `<script>` tag |
| `src/js/Translator/XrmTranslator.js` | **MODIFY** — register handler + dropdown entry |

---

## Step 1: Create `EmailTemplateHandler.js`

Create file: `src/js/Translator/EmailTemplateHandler.js`

### Key Concepts

- Email templates are stored in the `template` entity
- Key fields: `templateid`, `title` (subject/name), `body`, `templatetypecode` (entity logical name or "global")
- The `title` and `subject` field labels are accessible via `RetrieveLocLabels`
- Email templates can be global or entity-specific
- KB Article templates are stored in `kbarticletemplate` entity

### Approach: Start with Email Template Subject Translation

```javascript
(function (EmailTemplateHandler, undefined) {
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
                var tmpl = XrmTranslator.GetAttributeByProperty("recid", record.recid);
                var labels = tmpl.labels.Label.LocalizedLabels;
                ApplyChanges(record.w2ui.changes, labels);
                updates.push(tmpl);
            }
        }

        return updates;
    }

    function FillTable() {
        var grid = XrmTranslator.GetGrid();
        grid.clear();
        var records = [];

        for (var i = 0; i < XrmTranslator.metadata.length; i++) {
            var tmpl = XrmTranslator.metadata[i];
            var displayNames = tmpl.labels.Label.LocalizedLabels;

            if (!displayNames || displayNames.length === 0) {
                continue;
            }

            var record = {
                recid: tmpl.recid,
                schemaName: tmpl.title + " [" + tmpl.templatetypecode + "]"
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

    EmailTemplateHandler.Load = function () {
        // Retrieve email templates
        // Component dropdown maps:
        //   DisplayName → translate "title" attribute
        //   Description → translate "subject" attribute (the email subject line)
        var attributeName = XrmTranslator.GetComponent() === "DisplayName" ? "title" : "subject";

        return WebApiClient.Retrieve({
            entityName: "template",
            queryParams: "?$select=templateid,title,templatetypecode&$filter=ismanaged eq false&$orderby=title asc"
        })
        .then(function (response) {
            var templates = response.value;
            var requests = [];

            for (var i = 0; i < templates.length; i++) {
                var tmpl = templates[i];

                var retrieveLabelsRequest = WebApiClient.Requests.RetrieveLocLabelsRequest
                    .with({
                        urlParams: {
                            EntityMoniker: "{'@odata.id':'templates(" + tmpl.templateid + ")'}",
                            AttributeName: "'" + attributeName + "'",
                            IncludeUnpublished: true
                        }
                    });

                var prop = WebApiClient.Promise.props({
                    recid: tmpl.templateid,
                    title: tmpl.title,
                    templatetypecode: tmpl.templatetypecode,
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

    EmailTemplateHandler.Save = function () {
        XrmTranslator.LockGrid("Saving");

        var updates = GetUpdates();
        var requests = [];
        var attributeName = XrmTranslator.GetComponent() === "DisplayName" ? "title" : "subject";

        for (var i = 0; i < updates.length; i++) {
            var update = updates[i];

            var request = WebApiClient.Requests.SetLocLabelsRequest
                .with({
                    payload: {
                        Labels: update.labels.Label.LocalizedLabels,
                        EntityMoniker: {
                            "@odata.type": "Microsoft.Dynamics.CRM.template",
                            templateid: update.recid
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
                // Email templates don't need explicit publish
                return XrmTranslator.AddToSolution(
                    updates.map(function (u) { return u.recid; }),
                    XrmTranslator.ComponentType.EmailTemplate
                );
            })
            .then(function () {
                return XrmTranslator.ReleaseLockAndPrompt();
            })
            .then(function () {
                XrmTranslator.LockGrid("Reloading");
                return EmailTemplateHandler.Load();
            })
            .catch(XrmTranslator.errorHandler);
    };

}(window.EmailTemplateHandler = window.EmailTemplateHandler || {}));
```

---

## Step 2: Add Script Reference in `TranslationGrid.html`

```html
<script type="text/javascript" src="../js/EmailTemplateHandler.js"></script>
```

---

## Step 3: Register in `XrmTranslator.js` — Type Dropdown

```javascript
{ id: 'emailTemplates', text: 'Email Templates', icon: 'fa-picture' },
```

---

## Step 4: Register in `XrmTranslator.js` — SetHandler()

```javascript
else if (XrmTranslator.GetType() === "emailTemplates") {
    currentHandler = EmailTemplateHandler;
}
```

---

## Step 5: Register in `XrmTranslator.js` — Enable/Disable Logic

Email Templates are **entity-independent** (global templates exist):

- **Enabled** when entity is "none"
- **Disabled** when an entity is selected

```javascript
// When entity is "none":
w2ui['filterbar'].enable('type:emailTemplates');

// When entity is selected:
w2ui['filterbar'].disable('type:emailTemplates');
```

Add `"emailTemplates"` to reset array.

---

## Step 6: Update `README.md`

```markdown
- **Email Templates** - Template titles and subject lines
```

---

## API Reference

| Operation | API |
|-----------|-----|
| Retrieve | `GET templates?$select=templateid,title,templatetypecode&$filter=ismanaged eq false` |
| Read labels | `RetrieveLocLabels` with EntityMoniker `templates({id})`, AttributeName `title` or `subject` |
| Write labels | `SetLocLabels` with `@odata.type: Microsoft.Dynamics.CRM.template` |
| Publish | Not required for email templates |
| AddToSolution | `ComponentType = 36` (EmailTemplate) |

## Testing

1. Select Entity → None
2. Select Type → Email Templates, Component → DisplayName
3. Grid should show all unmanaged email templates with their titles
4. Edit a title label for a non-base language
5. Click Save → verify title updated in CRM
6. Test Component → Description for subject translation
7. Verify the template is added to the configured solution

## Known Considerations

- `RetrieveLocLabels` may not support all attributes on the `template` entity. You need to test whether `title` and `subject` are supported. If not, a fallback approach is to update the template record directly using `WebApiClient.Update`.
- **Body translation** is significantly more complex because it contains HTML content. This is out of scope for the initial implementation but could be added as a separate feature later.
- KB Article templates (`kbarticletemplate`) follow a similar pattern but use `kbarticletemplateid` and different field names. They could be added as a sub-feature of this handler if needed.

## Future Enhancement: KB Article Templates

If you want to add KB article template support:

1. Add a sub-type selector or separate type `kbTemplates`
2. Entity: `kbarticletemplate`
3. Fields: `kbarticletemplateid`, `title`, `description`
4. Same `RetrieveLocLabels` / `SetLocLabels` pattern
5. ComponentType: `KBArticleTemplate = 38`

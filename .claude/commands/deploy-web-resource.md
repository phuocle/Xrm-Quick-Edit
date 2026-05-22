# Deploy Web Resource

Deploy a local file to Dataverse as a web resource using MCP `manage_webresource`.

## Input

$ARGUMENTS — local file path to deploy (REQUIRED)

## Steps

**Step 1: Validate**

If `$ARGUMENTS` is empty → stop: "Usage: `/deploy-web-resource <local-path>`". If file does not exist → stop: "File `$ARGUMENTS` not found."

**Step 2: Resolve CRM unique name**

Read `.claude/mapping-v2.xml`. If `$ARGUMENTS` matches a `LocalPath` → use its `UniqueName`.

If not found, derive from convention:

| File pattern | UniqueName |
|---|---|
| `src2/js/Translator/*.js` | `pl_/XrmQuickTranslate/js/<filename>` |
| `src2/js/PropertyEditor/*.js` | `pl_/XrmQuickTranslate/js/<filename>` |
| `src2/lib/*.js` | `pl_/XrmQuickTranslate/js/<filename>` |
| `src2/css/*.css` | `pl_/XrmQuickTranslate/css/<filename>` |
| `src2/html/*.html` | `pl_/XrmQuickTranslate/html/<filename>` |
| `src2/img/*.svg` | `pl_/img/<filename>` |

For new files not matching above → ask user for the desired CRM unique name.

**Step 3: Determine web resource type from file extension**

| Ext | Type |
|---|---|
| `.js` | `js` |
| `.css` | `css` |
| `.html` | `html` |
| `.svg` | `svg` |
| `.png` | `png` |

**Step 4: Check if web resource exists**

Call MCP `manage_webresource` with `action=detail`, `web_resource_id=<UniqueName>`.

**Step 5: Create or Update**

- **If exists**: `manage_webresource` with `action=update`, `web_resource_id=<UniqueName>`, `file_path=$ARGUMENTS`
- **If not exists**: `manage_webresource` with `action=create`, `name=<UniqueName>`, `file_path=$ARGUMENTS`, `type=<type>`, `solution_name=XrmQuickTranslate`

**For new JS files**: also register in `.claude/mapping-v2.xml` under the appropriate section.

**Step 6: Report**

Success → "Deployed `$ARGUMENTS` as `<UniqueName>`."
Failure → show error.

## Naming Convention (when creating new web resources)

All must follow `pl_/XrmQuickTranslate/<type>/<name.ext>`. For new JS handlers follow the `src2/js/Translator/` or `src2/js/PropertyEditor/` directory pattern.
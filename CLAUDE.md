# CLAUDE.md

## CRITICAL: `src/` is READ-ONLY — DO NOT EDIT

**`src/` is the historical source of truth. NEVER edit, modify, or delete any file under `src/`.**
Touching `src/` is a violation of this rule. If asked to change something in `src/`, refuse and explain. `src2/` is the only active codebase.

## Project

`src2/` is a clone of `src/` upgraded with:
- **w2ui** 2.0 (was 1.5), **jQuery removed**
- **WebApiClient** 4.1.6 (was 3.6.5)
- Publisher `pl_`, solution `XrmQuickTranslate`
- All web resources under `pl_/XrmQuickTranslate/`

Two HTML dashboards load JS via `<script>` tags. No build step — JS files deploy directly as CRM web resources. MCP server connects to the dev Dataverse environment.

## Architecture

Handler-based IIFE modules orchestrated by `XrmTranslator.js`:

```
User picks Entity → Type → Component → Load
XrmTranslator.SetHandler(type) → handler.Load()
Grid populated per installed language columns
User edits → Save → handler.Save() → Web API PUT with MergeLabels
```

Every handler: `Load()` fetches metadata + fills w2ui grid, `Save()` extracts changes + PUTs to CRM. Handlers read shared state from `XrmTranslator` global. Key shared modules: `DialogHelper.js`, `TranslationDictionaryService.js`, `TranslationHandler.js`.

## Commands

### /commit
Full git workflow: stage all → commit → push → verify clean.

### /deploy-web-resource `<local-path>`
Deploy a file to Dataverse using MCP `manage_webresource`:
1. Look up `<local-path>` in `.claude/mapping-v2.xml` to get CRM `UniqueName`
2. If not in mapping, auto-derive: `pl_/XrmQuickTranslate/<type>/<basename>` where type = `js|css|html|img`
3. Try `manage_webresource` with `action=detail`, `web_resource_id=<UniqueName>` to check existence
4. If exists → `action=update`, `web_resource_id=<UniqueName>`, `file_path=<local-path>`
5. If not → `action=create`, `name=<UniqueName>`, `file_path=<local-path>`, `type=<js|css|html|svg|png>`, `solution_name=XrmQuickTranslate`

Do NOT use `devkit` CLI. Use MCP `manage_webresource` directly.

### /export-solution
Export `XrmQuickTranslate` solution via PAC CLI (profile: XrmQuickEdit).
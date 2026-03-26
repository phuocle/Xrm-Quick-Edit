# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Xrm Quick Edit is a Dataverse solution for Microsoft Dynamics 365 that provides two dashboard web resources for bulk translation management and metadata property editing. There is no build step — JavaScript source files are deployed directly as CRM web resources.

## Development Commands

### Deploy a single web resource to Dataverse
```
/deploy-web-resource <file-path>
```
Uses `devkit webresource` CLI with credentials from `.env`. The file-to-web-resource mapping is defined in `.claude/mapping.xml`.

### Export the solution
```
/export-solution
```
Exports managed and unmanaged ZIPs to `solutions/` using PAC CLI. Requires a PAC auth profile named "XrmQuickEdit".

### Commit and push
```
/commit
```

### Environment setup
The `.env` file (gitignored) must contain: `DEVKIT_AUTH_TYPE`, `DEVKIT_URL`, `DEVKIT_CLIENT_ID`, `DEVKIT_CLIENT_SECRET`.

## Architecture

### Handler Pattern

The core architectural pattern is a **handler-based module system**. Two orchestrators each delegate to specialized handlers:

**XrmTranslator.js** (translation dashboard orchestrator) selects a handler via `SetHandler()` based on user-chosen type:
- `"attributes"` → AttributeHandler
- `"options"` → OptionSetHandler
- `"forms"` / `"dashboards"` → FormHandler
- `"views"` → ViewHandler
- `"formMeta"` → FormMetaHandler
- `"entityMeta"` → EntityHandler
- `"charts"` → ChartHandler
- `"content"` → ContentSnippetHandler
- `"webresources"` → WebResourceHandler

**XrmPropertyEditor.js** (property editor orchestrator) delegates to AttributePropertyHandler or EntityPropertyHandler.

### Handler Contract

Every handler implements two methods:
- **`Load()`** — Fetch metadata from CRM APIs, populate the w2ui grid
- **`Save()`** — Extract changed grid records, update CRM via Web API, publish

### Module Pattern

All modules use IIFEs with global namespace registration:
```javascript
(function (HandlerName, undefined) {
    "use strict";
    HandlerName.Load = function() { ... };
    HandlerName.Save = function() { ... };
}(window.HandlerName = window.HandlerName || {}));
```

Handlers access shared state through the `XrmTranslator` global (metadata, user settings, installed languages, config).

### Data Flow

1. User selects Entity → Type → Component, clicks Load
2. Orchestrator calls `SetHandler()` then `currentHandler.Load()`
3. Handler fetches metadata via `WebApiClient`, stores in `XrmTranslator.metadata`
4. Handler calls `FillTable()` to populate the w2ui grid (columns auto-generated per installed language)
5. User edits cells inline; w2ui tracks changes in `record.w2ui.changes`
6. On Save: handler extracts changes → PUTs to CRM metadata API with `MSCRM.MergeLabels: true` → publishes entity

### Translation Providers

`TranslationHandler.js` integrates four external translation services: Glosbe (free/legacy), Azure Translator, DeepL, and Gemini AI. API keys are stored in `localStorage`.

### HTML Dashboards

`TranslationGrid.html` and `PropertyEditorGrid.html` load scripts in order (libraries first, handlers next, orchestrator last) and call `Initialize()` on window.onload. Scripts are referenced with relative paths (e.g., `../js/XrmTranslator.js`).

### FormHandler Special Case

FormHandler parses form XML with `DOMParser` and uses a tree walker to traverse form structure. CRM only returns labels for the current user's language, so the tool temporarily switches user language to each installed language to collect all labels.

## Web Resource Naming

All CRM web resources use the prefix `oss_/XrmQuickEdit/`. The mapping from local paths to CRM unique names is in `.claude/mapping.xml`. When adding a new file, register it in this mapping.

## Key Libraries

- **w2ui** (v1.5.rc1) — Grid UI framework, accessed via `w2ui` global
- **jQuery** — DOM utilities
- **Xrm-WebApi-Client** — Dataverse Web API wrapper, accessed via `WebApiClient` global

## Connected Dataverse Environment

The MCP server (configured in `.mcp.json`) connects to the dev environment and provides tools for querying/modifying Dataverse data and metadata directly.

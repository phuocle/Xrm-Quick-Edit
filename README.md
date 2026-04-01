# Xrm Quick Edit

A productivity tool for Microsoft Dynamics 365 / Dataverse that simplifies bulk translation management and metadata property editing. Distributed as a Dataverse solution with two interactive dashboards.

> **This is a fork** of [XRM-OSS/Xrm-Quick-Edit](https://github.com/XRM-OSS/Xrm-Quick-Edit) by [Florian Kronert (DigitalFlow)](https://github.com/DigitalFlow).
> Continued development and enhancements by [Phuoc Le](https://github.com/phuocle), including AI-powered translation, translation dictionary, All-In-One mode, and more.

> **Note:** This is a beta. Use at your own risk and export a backup solution before testing.

## Features

### Translation Management Dashboard

Translate UI labels for a wide range of CRM components directly in an inline grid editor:

| Component | What is translated |
|-----------|-------------------|
| **Attributes** | Display names and descriptions |
| **Option Sets** | Local and global option set values (including state/status codes) and descriptions |
| **Forms** | Form labels and field labels |
| **Views** | Display names and descriptions |
| **Form Metadata** | Form display names |
| **Entity Metadata** | Entity display names and collection names |
| **Relationships** | Navigation menu labels for entity relationships |
| **Charts** | Visualization display names |
| **Business Process Flows** | Stage and field labels (3-level hierarchy) |
| **SiteMap** | Navigation areas, groups, and subareas |
| **Dashboards** | Dashboard form labels |
| **Web Resources** | Text content within web resources |
| **Content Snippets** | Dynamics 365 Portals content (adx_contentsnippet) |
| **Global Option Sets** | Global option set values (entity-independent) |

#### All-In-One Mode

Loads **all entity-dependent translation types** into a single grid for bulk translation. Translate Attributes, Option Sets, Forms, Views, Form Metadata, Entity Metadata, Relationships, Charts, and Business Process Flows in one go without switching between types.

#### AI Translation

Translate labels automatically using an AI provider. Select a source language and a target language, then click **Auto Translate** to fill in missing labels.

| Provider | Notes |
|----------|-------|
| **Google Gemini** | Batch mode, custom prompt support, configurable model (default: `gemini-2.0-flash`) |
| **OpenAI** | Chat-based, custom prompt support, configurable model (default: `gpt-4o-mini`) |

API keys and model settings are managed via the **AI Settings** dialog and stored in `localStorage`.

#### Translation Dictionary

Maintain a persistent glossary of source-to-target term pairs. When **Use Dictionary as First Priority** is enabled, dictionary matches are applied before calling the AI provider.

- **Dictionary dialog** -- Create, edit, and delete term mappings
- **Apply Dictionary** -- Batch-apply dictionary entries to all matching records without calling AI. Three modes: *All Missing*, *All Missing Or Identical*, *All Overwrite*
- **Storage** -- Dictionary data is saved as a web resource (`oss_XrmQuickEdit/data/TranslationDictionary.xml`) inside an unmanaged solution named **Xrm Quick Edit Data** (`XrmQuickEditData`), auto-created on first use

#### Find and Replace

Search across all loaded labels using plain text or JavaScript regular expressions (with capture group support).

Example: find `(Account) (.*)` and replace with `$2 $1` turns "Account Number" into "Number Account".

#### Untranslated Records Filter

Toggle a filter to show only records with missing translations. Supports hierarchical filtering (parent nodes are shown if any child is untranslated). The base language column is excluded automatically.

### Property Editor Dashboard

Bulk-edit field properties across an entity:

- **Required Level** (None / Recommended / Application Required)
- **Is Audit Enabled**
- **Is Valid for Advanced Find**
- **Is Secured** (field-level security)

### Other Capabilities

- **Solution filter** -- Filter the entity list by solution membership; select *Default Solution* to see all entities
- **Solution integration** -- Automatically add translated components to a specified solution
- **Language column toggle** -- Show only the current user's language by default, expand as needed
- **Locked languages** -- Prevent editing of specific language columns
- **About / Help** -- In-app translation guide and fork attribution

## Installation

1. Download the latest solution from [GitHub Releases](https://github.com/phuocle/Xrm-Quick-Edit/releases).
2. Import the solution (managed or unmanaged) into your Dynamics 365 / Dataverse environment.
3. The dashboards and required components will be created in your organization.

### System Requirements

- **Dynamics CRM 2016 (v8.0)** or later / Dynamics 365 / Dataverse
- **System Administrator** security role (required for metadata operations)

## Configuration

Edit the web resource `oss_/XrmQuickEdit/config/XrmQuickEditConfig.js` to customize behavior:

| Setting | Type | Description |
|---------|------|-------------|
| `entityWhiteList` | `string[]` | Entity logical names to show. Empty = all entities. |
| `hideAutoTranslate` | `boolean` | Hide the Auto Translate button. |
| `hideFindAndReplace` | `boolean` | Hide the Find and Replace button. |
| `hideLanguagesByDefault` | `boolean` | Show only the current user's language columns initially. |
| `lockedLanguages` | `number[]` | Locale IDs of languages that cannot be edited. |
| `solutionUniqueName` | `string` | Auto-add translated components to this solution. |

## Usage Notes

### Workflow

1. Select a **Solution** (optional, filters the entity list).
2. Select an **Entity** (or *None* for entity-independent types like SiteMap, Dashboards, Web Resources, Global Option Sets).
3. Select a **Type** (Attributes, Options, Forms, All-In-One, etc.).
4. Click **Load** to populate the grid.
5. Edit cells inline, use **Auto Translate**, or **Apply Dictionary**.
6. Click **Save** to write changes back to Dataverse and publish.

### Form Translation

CRM returns form labels only for the current user's language. To work around this, the tool temporarily switches the user language to each installed language to retrieve all labels, then restores the original language. **Do not abort the loading process** or your user language may be left in a different state.

The tool also sets the UI language to the base language before publishing to avoid known CRM publishing issues.

### Overridden Attribute Labels in Forms

If translating an attribute doesn't update its form label, the form likely has overridden labels for that field. Use the **Remove Overridden Attribute Labels** button inside the form translator to clear them. A confirmation dialog will warn you before any changes are made.

> Use this at your own risk. Back up your forms by exporting them in a solution first.

### Field Security Changes

When toggling **Is Secured** on fields, you may see:

```
The user does not have full permissions to unsecure the attribute...
```

A background CRM workflow processes security changes. Wait a few minutes and retry.

## Architecture

### Handler Pattern

The core architectural pattern is a handler-based module system. Two orchestrators each delegate to specialized handlers:

**XrmTranslator.js** selects a handler via `SetHandler()` based on the user-chosen type. Every handler implements:
- **`Load()`** -- Fetch metadata from CRM APIs, populate the w2ui grid
- **`Save()`** -- Extract changed grid records, update CRM via Web API, publish

All modules use IIFEs with global namespace registration:

```javascript
(function (HandlerName, undefined) {
    "use strict";
    HandlerName.Load = function() { /* ... */ };
    HandlerName.Save = function() { /* ... */ };
}(window.HandlerName = window.HandlerName || {}));
```

### Project Structure

```
src/
  html/
    TranslationGrid.html          # Translation dashboard
    PropertyEditorGrid.html       # Property editor dashboard
  js/
    Translator/
      XrmTranslator.js            # Main orchestrator
      AllInOneHandler.js           # Unified multi-type handler
      AttributeHandler.js          # Attribute labels
      OptionSetHandler.js          # Local option sets
      GlobalOptionSetHandler.js    # Global option sets
      FormHandler.js               # Form/field labels
      FormMetaHandler.js           # Form display names
      ViewHandler.js               # View labels
      EntityHandler.js             # Entity display names
      ChartHandler.js              # Chart labels
      BpfHandler.js                # Business Process Flows
      RelationshipHandler.js       # Relationship labels
      SiteMapHandler.js            # SiteMap labels
      ContentSnippetHandler.js     # Portal content snippets
      WebResourceHandler.js        # Web resource text
      TranslationHandler.js        # AI translation orchestration
      TranslationDictionaryService.js  # Dictionary storage & matching
      DialogHelper.js              # Promise-based dialog utilities
    PropertyEditor/
      XrmPropertyEditor.js         # Property editor orchestrator
      AttributePropertyHandler.js  # Attribute property editing
      EntityPropertyHandler.js     # Entity property editing
  css/
    style.css                      # Shared styles
  lib/
    jquery.min.js
    w2ui-1.5.rc1.min.js
    w2ui-1.5.rc1.min.css
  img/
    app-icon.svg
solutions/                         # Exported solution ZIPs
```

## Tech Stack

| Library | Version | Purpose |
|---------|---------|---------|
| [w2ui](https://github.com/vitmalina/w2ui) | 1.5.rc1 | Grid UI framework |
| [jQuery](https://github.com/jquery/jquery) | -- | DOM utilities |
| [Xrm-WebApi-Client](https://github.com/DigitalFlow/Xrm-WebApi-Client) | -- | Dataverse Web API wrapper |

No build step -- JavaScript source files are deployed directly as CRM web resources.

## License

MIT License

Copyright (c) 2017 Florian Kronert

Continued development by [Phuoc Le](https://github.com/phuocle).

# Xrm Quick Edit

A productivity tool for Microsoft Dynamics 365 / Dataverse that simplifies bulk translation management and metadata property editing. Distributed as a Dataverse solution with two interactive dashboards.

> **Note:** This is a beta. Use at your own risk and export a backup solution before testing.

## Features

### Translation Management Dashboard

Translate UI labels for a wide range of CRM components directly in a grid editor:

- **Attributes** - Display names and descriptions
- **OptionSet Values** - Global and local option sets (including state/status codes)
- **Views** - Display names and descriptions
- **System Forms** - Form labels and field labels
- **Form Names** - Form display names
- **Entity Names** - Entity display and collection names
- **Charts** - Visualization display names
- **Content Snippets** - Dynamics 365 Portals content
- **Web Resources** - Text content within web resources

#### Auto Translation

Multiple translation providers are supported:

| Provider | Notes |
|----------|-------|
| Glosbe API | Free, legacy |
| Azure Translator | Requires API key |
| DeepL | Requires API key |
| Gemini AI | Batch mode with custom prompt support |

Select a source language column and a target language column, then click **Auto Translate** to fill in missing labels automatically.

#### Find and Replace

Search across all loaded labels using plain text or JavaScript regular expressions (with capture group support).

Example: find `(Account) (.*)` and replace with `$2 $1` turns "Account Number" into "Number Account".

### Property Editor Dashboard

Bulk-edit field properties across an entity:

- **Required Level** (None / Recommended / Application Required)
- **Is Audit Enabled**
- **Is Valid for Advanced Find**
- **Is Secured** (field-level security)

### Other Capabilities

- **Solution integration** - Automatically add translated components to a specified solution
- **Solution filter** - Filter entities by solution membership
- **Language column toggle** - Show only the current user's language by default, expand as needed
- **Locked languages** - Prevent editing of specific language columns

## Installation

1. Download the latest solution from [GitHub Releases](https://github.com/DigitalFlow/Xrm-Quick-Edit/releases).
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

### Form Translation

CRM returns form labels only for the current user's language. To work around this, the tool temporarily switches the user language to each installed language to retrieve all labels, then restores the original language. **Do not abort the loading process** or your user language may be left in a different state.

Since v2.6.1 the tool also sets the UI language to the base language before publishing to avoid known CRM publishing issues.

### Overridden Attribute Labels in Forms

If translating an attribute doesn't update its form label, the form likely has overridden labels for that field. Use the **Remove Overridden Attribute Labels** button (available since v3.15.0) inside the form translator to clear them.

> Use this at your own risk. Back up your forms by exporting them in a solution first.

### Field Security Changes

When toggling **Is Secured** on fields, you may see:

```
The user does not have full permissions to unsecure the attribute...
```

A background CRM workflow processes security changes. Wait a few minutes and retry.

## Tech Stack

- [w2ui](https://github.com/vitmalina/w2ui) - Grid UI framework
- [jQuery](https://github.com/jquery/jquery) - DOM utilities
- [Xrm-WebApi-Client](https://github.com/DigitalFlow/Xrm-WebApi-Client) - Dataverse Web API wrapper

## License

MIT License - Copyright (c) 2017 Florian Kroenert

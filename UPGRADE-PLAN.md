# Upgrade Plan: Xrm Quick Translate (v2)

`src/` NEVER touched. All work in `src2/`. Two solutions coexist side-by-side.

| | Old (keep as-is) | New |
|---|---|---|
| Folder | `src/` | `src2/` |
| Solution | `XrmQuickEdit` | `XrmQuickTranslate` |
| Publisher | `oss_` | `pl_` (option prefix `77777`) |
| Web resource prefix | `oss_/XrmQuickEdit/` | `pl_/XrmQuickTranslate/` |
| w2ui | 1.5.rc1 | 2.0.0 |
| jQuery | 2.1.0 | removed |
| WebApiClient | 3.6.5 | 4.1.6 |

---

# Step 1: Copy `src/` to `src2/`

```bash
cp -r src/ src2/
```

No code changes. Just a clean copy. `src/` remains untouched forever.

---

# Step 2: Create Publisher & Solution in Dataverse

Create via MCP tools or Power Apps maker portal.

**Publisher:**

| Field | Value |
|-------|-------|
| Display Name | PL |
| Unique Name | `pl` |
| Prefix | `pl_` |
| Option Value Prefix | `77777` |

**Solution:**

| Field | Value |
|-------|-------|
| Display Name | Xrm Quick Translate |
| Unique Name | `XrmQuickTranslate` |
| Publisher | PL (`pl_`) |

---

# Step 3: Download Latest Libs & Remove Old Libs

**Download:**

| Library | Version | Save to |
|---------|---------|---------|
| w2ui JS | 2.0.0 | `src2/lib/w2ui-2.0.min.js` |
| w2ui CSS | 2.0.0 | `src2/lib/w2ui-2.0.min.css` |
| WebApiClient | 4.1.6 | `src2/lib/WebApiClient.js` |

Source: npm registry or GitHub releases (`vitmalina/w2ui` for w2ui, `nicedoc/xrm-webapi-client` for WebApiClient).

**Remove old libs:**

```bash
rm src2/lib/w2ui-1.5.rc1.min.js
rm src2/lib/w2ui-1.5.rc1.min.css
rm src2/lib/jquery.min.js
```

**DO NOT change any code** in `src2/js/` or `src2/html/` at this point. Old code goes up as-is.

---

# Step 4: Create Mapping File

Create `.claude/mapping-v2.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<Mapping SolutionName="XrmQuickTranslate">
  <!-- CSS -->
  <File LocalPath="src2/lib/w2ui-2.0.min.css" UniqueName="pl_/XrmQuickTranslate/css/w2ui.css" />
  <File LocalPath="src2/css/style.css" UniqueName="pl_/XrmQuickTranslate/css/style.css" />

  <!-- HTML -->
  <File LocalPath="src2/html/TranslationGrid.html" UniqueName="pl_/XrmQuickTranslate/html/TranslationGrid.html" />
  <File LocalPath="src2/html/PropertyEditorGrid.html" UniqueName="pl_/XrmQuickTranslate/html/PropertyEditorGrid.html" />

  <!-- JS Libraries -->
  <File LocalPath="src2/lib/w2ui-2.0.min.js" UniqueName="pl_/XrmQuickTranslate/js/w2ui.js" />
  <File LocalPath="src2/lib/WebApiClient.js" UniqueName="pl_/XrmQuickTranslate/js/WebApiClient.js" />

  <!-- JS Translator -->
  <File LocalPath="src2/js/Translator/AllInOneHandler.js" UniqueName="pl_/XrmQuickTranslate/js/AllInOneHandler.js" />
  <File LocalPath="src2/js/Translator/AttributeHandler.js" UniqueName="pl_/XrmQuickTranslate/js/AttributeHandler.js" />
  <File LocalPath="src2/js/Translator/BpfHandler.js" UniqueName="pl_/XrmQuickTranslate/js/BpfHandler.js" />
  <File LocalPath="src2/js/Translator/ChartHandler.js" UniqueName="pl_/XrmQuickTranslate/js/ChartHandler.js" />
  <File LocalPath="src2/js/Translator/ContentSnippetHandler.js" UniqueName="pl_/XrmQuickTranslate/js/ContentSnippetHandler.js" />
  <File LocalPath="src2/js/Translator/DialogHelper.js" UniqueName="pl_/XrmQuickTranslate/js/DialogHelper.js" />
  <File LocalPath="src2/js/Translator/EntityHandler.js" UniqueName="pl_/XrmQuickTranslate/js/EntityHandler.js" />
  <File LocalPath="src2/js/Translator/FormHandler.js" UniqueName="pl_/XrmQuickTranslate/js/FormHandler.js" />
  <File LocalPath="src2/js/Translator/FormMetaHandler.js" UniqueName="pl_/XrmQuickTranslate/js/FormMetaHandler.js" />
  <File LocalPath="src2/js/Translator/GlobalOptionSetHandler.js" UniqueName="pl_/XrmQuickTranslate/js/GlobalOptionSetHandler.js" />
  <File LocalPath="src2/js/Translator/OptionSetHandler.js" UniqueName="pl_/XrmQuickTranslate/js/OptionSetHandler.js" />
  <File LocalPath="src2/js/Translator/RelationshipHandler.js" UniqueName="pl_/XrmQuickTranslate/js/RelationshipHandler.js" />
  <File LocalPath="src2/js/Translator/SiteMapHandler.js" UniqueName="pl_/XrmQuickTranslate/js/SiteMapHandler.js" />
  <File LocalPath="src2/js/Translator/TranslationDictionaryService.js" UniqueName="pl_/XrmQuickTranslate/js/TranslationDictionaryService.js" />
  <File LocalPath="src2/js/Translator/TranslationHandler.js" UniqueName="pl_/XrmQuickTranslate/js/TranslationHandler.js" />
  <File LocalPath="src2/js/Translator/ViewHandler.js" UniqueName="pl_/XrmQuickTranslate/js/ViewHandler.js" />
  <File LocalPath="src2/js/Translator/WebResourceHandler.js" UniqueName="pl_/XrmQuickTranslate/js/WebResourceHandler.js" />
  <File LocalPath="src2/js/Translator/XrmTranslator.js" UniqueName="pl_/XrmQuickTranslate/js/XrmTranslator.js" />

  <!-- JS PropertyEditor -->
  <File LocalPath="src2/js/PropertyEditor/AttributePropertyHandler.js" UniqueName="pl_/XrmQuickTranslate/js/AttributePropertyHandler.js" />
  <File LocalPath="src2/js/PropertyEditor/EntityPropertyHandler.js" UniqueName="pl_/XrmQuickTranslate/js/EntityPropertyHandler.js" />
  <File LocalPath="src2/js/PropertyEditor/XrmPropertyEditor.js" UniqueName="pl_/XrmQuickTranslate/js/XrmPropertyEditor.js" />

  <!-- Image -->
  <File LocalPath="src2/img/app-icon.svg" UniqueName="pl_/img/app-icon.svg" />
</Mapping>
```

No jQuery entry. WebApiClient now has a local file.

---

# Step 5: Deploy All Files to Dataverse

Use `devkit webresource` CLI to deploy every file listed in `mapping-v2.xml` one by one.

App **will NOT work yet** at this point (old JS code still references jQuery + w2ui 1.5 APIs). That's OK. The goal is to register all web resources in solution `XrmQuickTranslate`.

---

# Step 6: Git Commit

```bash
git add src2/ .claude/mapping-v2.xml UPGRADE-PLAN.md
git commit -m "Add src2/ for new solution XrmQuickTranslate (pl_ prefix) - pre-upgrade baseline"
```

From here, every code change is tracked in git history.

---

# Step 7: aP Manually Creates Dashboards & App

**Phuoc does this manually in Power Apps / Dynamics 365:**

- [ ] Create HTML dashboard **"Xrm Quick Translate"** pointing to `pl_/XrmQuickTranslate/html/TranslationGrid.html`
- [ ] Create HTML dashboard **"Xrm Property Editor v2"** pointing to `pl_/XrmQuickTranslate/html/PropertyEditorGrid.html`
- [ ] Create Model-Driven App **"Xrm Quick Translate"** with SiteMap pointing to both dashboards
- [ ] Set app icon to `pl_/img/app-icon.svg`
- [ ] Make sure all components belong to solution `XrmQuickTranslate`

After this step, the app exists in Dataverse with all web resources. Opening it will show errors because code is not yet upgraded. That's expected.

---

# Step 8: Code Upgrade (Fix -> Deploy -> Verify)

Now the real work. Loop: **fix a file -> deploy -> aP opens app and verifies -> next file**.

## Round 1: HTML files

**Files:** `TranslationGrid.html`, `PropertyEditorGrid.html`

Changes:
- Remove `<script src="../js/jQuery.js">` tag
- Keep `w2ui.js`, `w2ui.css` references (paths already correct via mapping)

Deploy -> aP verifies pages load (JS errors expected, just checking HTML loads).

## Round 2: PropertyEditor (simplest, ~10 changes)

**Files:** `XrmPropertyEditor.js`, `AttributePropertyHandler.js`, `EntityPropertyHandler.js`

Changes:
- `$('#grid').w2grid({...})` -> `new w2grid({...}).render('#grid')`
- `w2alert()` -> verify API
- WebApiClient calls if API changed

Deploy -> aP verifies Property Editor dashboard works end-to-end.

## Round 3: DialogHelper (~5 changes)

**File:** `DialogHelper.js`

Changes:
- Migrate `w2popup`, `w2alert`, `w2confirm` to w2ui 2.0 API

Deploy -> verify dialogs still work.

## Round 4: XrmTranslator (heaviest, ~50 changes)

**File:** `XrmTranslator.js`

Changes:
- `$('#grid').w2grid()` -> `new w2grid().render('#grid')`
- `$('#filterbar').w2toolbar()` -> `new w2toolbar().render('#filterbar')`
- `$().w2popup('open')` -> `w2popup.open()`
- `$(function(){...})` -> remove wrapper
- `$(w2ui.xxx.box).hide()/.show()` -> native DOM
- Verify tree grid, dynamic columns, lock/unlock

Deploy -> aP verifies Translation dashboard loads, entity/type selection works.

## Round 5: TranslationHandler (~30 changes)

**File:** `TranslationHandler.js`

Changes:
- `$().w2form()` -> `new w2form()`
- Popup + rendering migration
- `w2utils.encodeTags()`/`decodeTags()` verify

Deploy -> aP verifies translation (Azure, DeepL, Gemini).

## Round 6: TranslationDictionaryService (~25 changes)

**File:** `TranslationDictionaryService.js`

Changes:
- Dictionary grid, popup, toolbar migration
- `.getChanges()`, `.getSelection()`, `.remove()` verify

Deploy -> aP verifies dictionary CRUD + apply.

## Round 7: Remaining handlers

**Files:** `FormHandler.js`, `SiteMapHandler.js`, other handlers

- FormHandler + SiteMapHandler have `$().w2form()` and `$().w2popup()` calls
- Other handlers may need zero changes (only WebApiClient if breaking)

Deploy each -> aP verifies each handler type.

## Round 8: Full test pass

aP tests everything end-to-end. Git commit final working state.

---

# Quick Reference: w2ui 1.5 -> 2.0

| Old (1.5) | New (2.0) |
|-----------|-----------|
| `$().w2grid({...})` | `new w2grid({...})` |
| `$('#id').w2grid({...})` | `new w2grid({...}).render('#id')` |
| `$('#id').w2toolbar({...})` | `new w2toolbar({...}).render('#id')` |
| `$().w2form({...})` | `new w2form({...})` |
| `$().w2popup('open', {...})` | `w2popup.open({...})` |
| `$('#sel').w2render('name')` | `w2ui.name.render('#sel')` |
| `$(w2ui.x.box).hide()` | `w2ui.x.box.style.display='none'` |
| `$(w2ui.x.box).show()` | `w2ui.x.box.style.display=''` |
| `$(function(){...})` | remove wrapper |
| `w2alert(msg)` | `w2alert(msg)` (may return Promise) |
| `w2confirm(msg, cb)` | `w2confirm(msg).yes(cb)` (verify) |

---

# Critical Grid Features to Verify

| Feature | Files | Must work? |
|---------|-------|------------|
| `record.w2ui.changes` | 6+ files | YES |
| `record.w2ui.children` | XrmTranslator | YES (tree grid) |
| `.addColumn()` / `.removeColumn()` | XrmTranslator | YES (language columns) |
| `.expand()` / `.collapse()` | XrmTranslator | YES (tree mode) |
| `.lock()` / `.unlock()` | XrmTranslator | YES (loading UX) |
| `.getChanges()` | DictionaryService | YES (save flow) |
| `w2utils.encodeTags/decodeTags` | TranslationHandler, DictionaryService | YES |
| `record.w2ui.summary` | DictionaryService | Medium |
| `record.w2ui.editable` | XrmTranslator | Medium |
| `toolbar.insert/remove/add` | XrmTranslator | Medium |

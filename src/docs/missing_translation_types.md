# Missing Translation Types in Xrm-Quick-Edit

## Currently Supported (11 types)

| Type ID | Dropdown Label | Handler File | What it translates |
|---------|---------------|--------------|-------------------|
| `attributes` | Attributes | `AttributeHandler.js` | Field DisplayName / Description |
| `options` | Options | `OptionSetHandler.js` | Local + Global OptionSet values (Picklist, Boolean, Status, State, MultiSelect) |
| `forms` | Forms | `FormHandler.js` | Form field labels, tab labels, section labels |
| `views` | Views | `ViewHandler.js` | Saved query DisplayName / Description |
| `formMeta` | Form Metadata | `FormMetaHandler.js` | Form names (via `RetrieveLocLabels`) |
| `entityMeta` | Entity Metadata | `EntityHandler.js` | Entity DisplayName + CollectionName (plural) |
| `charts` | Charts | `ChartHandler.js` | Chart DisplayName / Description |
| `bpf` | Business Process Flows | `BpfHandler.js` | BPF stage names + field labels (XAML-level) |
| `content` | Content | `ContentSnippetHandler.js` | Portal content snippets (`adx_contentsnippet`) |
| `dashboards` | Dashboards | `FormHandler.js` | Dashboard labels (entity = none, type 0 or 10) |
| `webresources` | Web Resources | `WebResourceHandler.js` | RESX web resource string values |

---

## Missing — Not Yet Implemented

The following Dataverse translatable components have **no handler** and **no entry in the type dropdown**, despite being translatable via the Dataverse API or included in `CrmTranslations.xml` export.

### 1. 🔴 Entity Relationships (High Value)

**What:** One-to-Many (`OneToManyRelationshipMetadata`) and Many-to-Many (`ManyToManyRelationshipMetadata`) relationships have translatable **DisplayName** and **Description** labels (`Label` → `LocalizedLabels`).

**API:** `GET EntityDefinitions({id})/OneToManyRelationships` and `/ManyToManyRelationships`, with `$select=SchemaName,DisplayName,Description`

**Why it matters:** Relationship labels appear in Advanced Find, Related Records navigation, and lookup dialogs. Untranslated relationship names confuse users in multi-language environments.

**ComponentType:** `EntityRelationship = 10` (already defined in `XrmTranslator.ComponentType`)

---

### 2. 🔴 SiteMap (High Value)

**What:** SiteMap areas, groups, and subareas have translatable **Title** and **Description** text. These control the left-hand navigation in model-driven apps.

**API:** SiteMap translations are stored in `sitemap` entity. Labels are managed via `LocalizedNames` nodes in the sitemap XML, or via `RetrieveLocLabels` / `SetLocLabels` against `sitemap` records.

> [!IMPORTANT]
> SiteMap translations are NOT included in the standard `CrmTranslations.xml` export. They must be translated via API or by editing `Customizations.xml` in a solution. This makes a UI tool especially valuable.

**ComponentType:** `SiteMap = 62` (already defined in `XrmTranslator.ComponentType`)

---

### 3. 🟡 Global Option Sets (Standalone View) (Medium Value)

**What:** The current `OptionSetHandler` already translates global option sets when they appear on an entity's attributes. However, there is **no way to browse and translate Global Option Sets independently** (without selecting an entity first). Some global option sets may not be attached to any entity in the current solution.

**API:** `GET GlobalOptionSetDefinitions` → returns all global option sets with their `Options[].Label.LocalizedLabels`

**Impact:** Standalone global option set editing is supported by XrmToolBox Easy Translator and is a commonly requested feature.

---

### 4. 🟡 Ribbon / Display Strings (Medium Value)

**What:** The `CrmTranslations.xml` export has a separate **"Display Strings"** worksheet containing translatable text for:
- System ribbon button labels
- Custom ribbon button labels (via `<LocLabels>` in ribbon XML)
- Error messages and system messages

**API:** `displaystring` entity — `GET displaystrings?$filter=...` with localized labels

**ComponentType:** `DisplayString = 22` (already defined in `XrmTranslator.ComponentType`)

> [!NOTE]
> Custom ribbon labels are more complex since they live inside `RibbonDiff` XML. Display Strings for system components are simpler to implement.

---

### 5. 🟡 Connection Roles (Medium Value)

**What:** Connection roles have translatable **Name** and **Description** labels. These appear when users create connections between records.

**API:** `connectionrole` entity, translations via `RetrieveLocLabels` / `SetLocLabels`

**ComponentType:** `ConnectionRole = 63` (already defined in `XrmTranslator.ComponentType`)

---

### 6. 🟢 Entity Keys (Low Value)

**What:** Alternate keys defined on entities have translatable **DisplayName** labels.

**API:** `GET EntityDefinitions({id})/Keys` → `KeyMetadataId`, `DisplayName.LocalizedLabels`

**ComponentType:** `EntityKey = 14` (already defined in `XrmTranslator.ComponentType`)

---

### 7. 🟢 Email Templates / KB Article Templates (Low Value)

**What:** Email template **Subject** and **Body**, KB article templates, and mail merge templates have translatable text. However, these are typically content-heavy and differ from metadata labels.

**Impact:** Low — template content is typically managed differently from UI metadata translations.

---

## Summary Table

| Missing Component | Priority | API Available | ComponentType Defined | Competitor Support |
|---|---|---|---|---|
| Entity Relationships | 🔴 High | ✅ Yes | ✅ Yes (#10) | ✅ Easy Translator |
| SiteMap | 🔴 High | ✅ Yes | ✅ Yes (#62) | ✅ Easy Translator |
| Global Option Sets (standalone) | 🟡 Medium | ✅ Yes | ✅ Yes (#9) | ✅ Easy Translator |
| Display Strings / Ribbon | 🟡 Medium | ✅ Yes | ✅ Yes (#22) | ✅ Easy Translator |
| Connection Roles | 🟡 Medium | ✅ Yes | ✅ Yes (#63) | ✅ Easy Translator |
| Entity Keys | 🟢 Low | ✅ Yes | ✅ Yes (#14) | ❌ Not common |
| Email/KB Templates | 🟢 Low | ⚠️ Partial | ✅ Yes (#36,#38) | ❌ Not common |

> [!TIP]
> All `ComponentType` values for the missing types are **already defined** in `XrmTranslator.ComponentType` — only the handlers and dropdown entries are missing.

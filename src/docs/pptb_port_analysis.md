# Phân Tích: Port Xrm-Quick-Edit sang Power Platform ToolBox (PPTB)

> Ngày phân tích: 30/03/2026
> Nguồn tham khảo: https://www.powerplatformtoolbox.com/ · https://docs.powerplatformtoolbox.com/

---

## 1. Tổng quan về Power Platform ToolBox

PPTB là ứng dụng desktop dựa trên **Electron** (tương tự XrmToolBox nhưng modern và cross-platform). Mỗi "tool" là một web app chạy trong **sandboxed iframe**, giao tiếp với host Electron qua hai API toàn cục:

| API | Mục đích |
|-----|----------|
| `window.toolboxAPI` | Connection management, notifications, clipboard, file dialog, terminal, events |
| `window.dataverseAPI` | CRUD, FetchXML, metadata, execute actions/functions, publish, deploy solution |

Tool được đóng gói như **npm package**, publish lên npm registry, rồi submit vào PPTB marketplace. Auth hoàn toàn do PPTB xử lý (MFA, OAuth, token refresh) — tool không bao giờ thấy access token.

---

## 2. So sánh kiến trúc hiện tại vs PPTB

| Khía cạnh | Xrm-Quick-Edit (hiện tại) | PPTB Tool (sau khi port) |
|-----------|--------------------------|--------------------------|
| **Môi trường chạy** | Web resource trong CRM iframe | Sandboxed iframe trong Electron |
| **Authentication** | `ClientGlobalContext.js.aspx` (CRM inject) | `toolboxAPI.connections.getActiveConnection()` |
| **Dataverse API** | `WebApiClient` (thư viện self-hosted) | `window.dataverseAPI` (PPTB built-in) |
| **Ngôn ngữ** | JavaScript thuần, IIFE modules | TypeScript + Vite build |
| **UI Framework** | w2ui 1.5.rc1 + jQuery | Tự chọn: HTML/TS, React, Vue, Svelte |
| **Build step** | Không có | Bắt buộc (`npm run build`) |
| **Deployment** | PAC CLI / devkit webresource → Dataverse | `npm publish` → PPTB marketplace |
| **CSP** | Kiểm soát bởi CRM | Strict, khai báo `cspExceptions` trong package.json |
| **Entity select, solution filter** | Dropdown tự code trong toolbar | Tự code (PPTB không có toolbar mặc định) |

---

## 3. Phân tích từng thành phần

### 3.1 Authentication & Connection Context

**Hiện tại:**
```javascript
// XrmTranslator.js tự lấy userId, userSettings, installedLanguages từ CRM
WebApiClient.Retrieve({ entityName: "usersettings", ... })
```

**Sau khi port:**
```typescript
const connection = await toolboxAPI.connections.getActiveConnection();
// connection.url -> base URL của Dataverse environment
// Sau đó gọi dataverseAPI để lấy userSettings, installedLanguages như cũ
```

**Đánh giá:** ✅ **Dễ** — chỉ cần thay điểm khởi tạo. Logic fetch `WhoAmI`, `usersettings`, `RetrieveAvailableLanguages` vẫn giữ nguyên qua `dataverseAPI.execute()` và `dataverseAPI.fetchXmlQuery()`.

---

### 3.2 Dataverse API Layer (WebApiClient → dataverseAPI)

#### 3.2.1 Kết quả phân tích docs đầy đủ: Blocker KHÔNG còn tồn tại

Sau khi đọc kỹ toàn bộ API reference của PPTB, **vấn đề `MSCRM.MergeLabels` đã được giải quyết hoàn toàn bởi chính PPTB** — không cần Custom Action, không cần deploy solution gì thêm cả.

PPTB cung cấp **native metadata CRUD API** với `mergeLabels` option có sẵn (bắt đầu từ v1.0.20):

| Operation cũ (WebApiClient) | PPTB native API (mới) |
|-----------------------------|----------------------|
| PUT Attribute metadata + MergeLabels | `dataverseAPI.updateAttribute(entity, attrId, def, { mergeLabels: true })` |
| PUT Entity metadata + MergeLabels | `dataverseAPI.updateEntityDefinition(entityId, def, { mergeLabels: true })` |
| PUT Relationship metadata + MergeLabels | `dataverseAPI.updateRelationship(schemaName, def, { mergeLabels: true })` |
| UpdateGlobalOptionSet + MergeLabels | `dataverseAPI.updateGlobalOptionSet(name, def, { mergeLabels: true })` |
| UpdateOptionValue + MergeLabels | `dataverseAPI.updateOptionValue({ ..., MergeLabels: true })` |

Đây là **API chính thức, documented đầy đủ**, không phải workaround.

---

#### 3.2.2 Map đầy đủ WebApiClient → dataverseAPI

**Operations đọc (Load):**

| WebApiClient (cũ) | dataverseAPI (mới) |
|-------------------|--------------------|
| `SendRequest("GET", "/EntityDefinitions(x)/Attributes")` | `dataverseAPI.getEntityRelatedMetadata(entity, 'Attributes')` |
| `SendRequest("GET", "/EntityDefinitions(x)/OneToManyRelationships")` | `dataverseAPI.getEntityRelatedMetadata(entity, 'OneToManyRelationships')` |
| `SendRequest("GET", "/EntityDefinitions(LogicalName='x')")` | `dataverseAPI.getEntityMetadata(entity, true)` |
| `SendRequest("GET", "/GlobalOptionSetDefinitions")` | `dataverseAPI.queryData('GlobalOptionSetDefinitions')` |
| `RetrieveMultipleRecords({entityName: "savedquery", ...})` | `dataverseAPI.fetchXmlQuery(fetchXml)` |
| `SendRequest("GET", "/EntityDefinitions")` | `dataverseAPI.getAllEntitiesMetadata(properties)` |

**Operations ghi (Save) — metadata có MergeLabels:**

| Handler | WebApiClient (cũ) | dataverseAPI (mới) |
|---------|-------------------|--------------------|
| AttributeHandler | PUT Attribute + MergeLabels | `updateAttribute(entity, id, def, { mergeLabels: true })` |
| EntityHandler, FormMetaHandler | PUT Entity + MergeLabels | `updateEntityDefinition(id, def, { mergeLabels: true })` |
| RelationshipHandler | PUT Relationship + MergeLabels | `updateRelationship(schemaName, def, { mergeLabels: true })` |
| OptionSetHandler | UpdateOptionValue + MergeLabels | `updateOptionValue({ ..., MergeLabels: true })` |
| GlobalOptionSetHandler | UpdateGlobalOptionSet | `updateGlobalOptionSet(name, def, { mergeLabels: true })` |

**Operations ghi (Save) — standard entity records (không cần MergeLabels):**

| Handler | Loại record | dataverseAPI (mới) |
|---------|-------------|------------------|
| ViewHandler | `savedquery` | `dataverseAPI.update('savedquery', id, record)` |
| FormHandler | `systemform` | `dataverseAPI.update('systemform', id, record)` |
| ChartHandler | `savedqueryvisualization` | `dataverseAPI.update('savedqueryvisualization', id, record)` |
| BpfHandler | `workflow` | `dataverseAPI.update('workflow', id, record)` |
| ContentSnippetHandler | `webcontentlanguage` / `webtemplate` | `dataverseAPI.update(...)` |
| WebResourceHandler | `webresource` | `dataverseAPI.update('webresource', id, record)` |
| SiteMapHandler | `sitemap` | `dataverseAPI.update('sitemap', id, record)` |

**Publish sau khi save:**

```typescript
// Publish entity cụ thể
await dataverseAPI.publishCustomizations('account');

// Publish all
await dataverseAPI.publishCustomizations();
```

**Đánh giá:** ✅ **Tất cả operations đều có API PPTB tương ứng. Không cần Custom Action, không cần deploy solution.**

---

### 3.3 UI Framework (w2ui)

w2ui 1.5.rc1 là thư viện standalone, không phụ thuộc framework, hoạt động tốt trong môi trường browser thông thường. Trong PPTB iframe:

- **CSP:** w2ui không load từ CDN (file local trong dist/) nên không cần `script-src` exception.
- **jQuery dependency:** Tương tự, bundle cùng vào dist.
- **Grid, toolbar, popup:** Tất cả render vào DOM trong iframe — không có vấn đề về shadow DOM hay frame boundary.

Tuy nhiên, nếu chọn React/Vue, cần **rewrite toàn bộ UI** (grid, toolbar, popup) — công việc lớn. Lựa chọn khôn ngoan nhất là:

> **Dùng template HTML/TypeScript** và giữ nguyên w2ui + jQuery → port logic JS, không rewrite UI.

**Đánh giá:** ✅ **Khả thi** với HTML/TS template, nhưng cần bundle w2ui vào `dist/`.

---

### 3.4 Module System (IIFE → ES Modules / TypeScript)

**Hiện tại:** Mỗi handler là IIFE đăng ký global:
```javascript
(function (AttributeHandler, undefined) {
    "use strict";
    AttributeHandler.Load = function() { ... };
}(window.AttributeHandler = window.AttributeHandler || {}));
```

**Sau khi port:** TypeScript module exports:
```typescript
// attributeHandler.ts
export const AttributeHandler = {
    Load: async function() { ... },
    Save: async function() { ... }
};
```

**Đánh giá:** 🟡 **Trung bình** — mechanical refactor, nhiều file nhưng không phức tạp về logic. Công cụ có thể hỗ trợ tự động hóa phần lớn.

---

### 3.5 XrmTranslator Global State

Hiện tại `XrmTranslator` là global object chứa shared state (`metadata`, `installedLanguages`, `currentHandler`, `config`...) được tất cả handler truy cập.

Trong TypeScript, cần chuyển sang:
- Module-level state (import/export)
- Hoặc giữ nguyên pattern nhưng dùng `export` thay `window.XrmTranslator`

**Đánh giá:** 🟡 **Trung bình** — cần thiết kế lại state flow, nhưng logic không đổi.

---

### 3.6 FormHandler (Language Switching)

FormHandler có kỹ thuật đặc biệt: tạm thời đổi `uilanguageid` của user sang từng ngôn ngữ để CRM trả về labels theo ngôn ngữ đó, rồi restore lại. Kỹ thuật này vẫn hoạt động qua `dataverseAPI.update("usersettings", userId, { uilanguageid: lcid })` và sau đó fetch form XML. Không phụ thuộc vào context của web resource nên compat tốt.

**Đánh giá:** ✅ **Không ảnh hưởng** — logic hoạt động ở Dataverse layer.

---

### 3.7 TranslationHandler (External APIs)

TranslationHandler.js tích hợp 4 dịch vụ dịch tự động: Glosbe, Azure Translator, DeepL, Gemini AI. Trong PPTB, cần khai báo `cspExceptions` cho từng domain:

```json
"cspExceptions": {
  "connect-src": [
    { "domain": "api.cognitive.microsofttranslator.com", "exceptionReason": "Azure Translator API for auto-translation", "optional": true },
    { "domain": "api.deepl.com", "exceptionReason": "DeepL API for auto-translation", "optional": true },
    { "domain": "generativelanguage.googleapis.com", "exceptionReason": "Gemini AI API for auto-translation", "optional": true },
    { "domain": "glosbe.com", "exceptionReason": "Glosbe free translation API", "optional": true }
  ]
}
```

API keys hiện lưu trong `localStorage` — trong PPTB nên chuyển sang `toolboxAPI.settings` để persist đúng cách theo tool context.

**Đánh giá:** ✅ **Dễ** — khai báo CSP + thay localStorage bằng settings API.

---

### 3.8 Hai Dashboard → Một hoặc Hai Tool

Hiện có 2 dashboard riêng biệt:
- `TranslationGrid.html` → **XrmTranslator** (chức năng chính)
- `PropertyEditorGrid.html` → **XrmPropertyEditor** (chức năng phụ)

Trong PPTB có thể:
- **Option A:** Tạo 2 PPTB tool riêng, publish 2 npm package.
- **Option B:** Tạo 1 tool duy nhất với navigation tab giữa 2 chức năng.

Option B gọn hơn cho người dùng. Cả hai đều khả thi về mặt kỹ thuật.

---

### 3.9 Solution Filter & Entity Picker

Hiện tại UI toolbar dùng w2ui toolbar với combo/select cho solution và entity. Trong PPTB không có toolbar host-side — tool tự quản lý toàn bộ UI. Giữ nguyên w2ui toolbar là cách đơn giản nhất.

---

## 4. Công việc cần làm (Ước tính)

| Hạng mục | Độ phức tạp | Ghi chú |
|----------|-------------|---------|
| Scaffolding PPTB tool (Yeoman) | Thấp | `yo pptb`, HTML/TS template |
| Cấu hình package.json, icon SVG | Thấp | Điền metadata, `minAPI: "1.0.20"` |
| Bundle w2ui + jQuery vào dist | Thấp | Copy lib files vào src/lib |
| Thay WebApiClient → dataverseAPI (read) | Trung bình | FetchXML, getEntityMetadata, getEntityRelatedMetadata |
| Thay WebApiClient → dataverseAPI (write metadata) | Trung bình | updateAttribute/Entity/Relationship/OptionSet với `mergeLabels: true` |
| Thay IIFE → TypeScript modules | Trung bình | ~15 files, refactor cơ học |
| Init context (userId, languages) | Thấp | Thay ClientGlobalContext bằng getActiveConnection + WhoAmI + usersettings |
| TranslationHandler CSP + settings | Thấp | 4 CSP entries + chuyển API keys sang settings API |
| FormHandler — không đổi logic | Không | Logic language switching vẫn hoạt động qua dataverseAPI.update |
| Test thủ công toàn bộ handlers | Trung bình | 11 translation types + property editor |
| Publish npm + submit marketplace | Thấp | Theo quy trình PPTB |

---

## 5. Kết luận: CÓ dễ không?

**Tổng thể: HOÀN TOÀN KHẢ THI — không còn blocker kỹ thuật nào.**

### ✅ Thuận lợi
- Logic nghiệp vụ (handler Load/Save, FetchXML, metadata API) **giữ nguyên ~80%** — không cần rewrite.
- **`MSCRM.MergeLabels` đã được PPTB giải quyết native** qua `updateAttribute/Entity/Relationship/OptionSet(..., { mergeLabels: true })` — không cần Custom Action, không cần deploy solution vào môi trường người dùng.
- PPTB có metadata API đầy đủ: đọc attribute, relationship, optionset, entity definitions đều có sẵn.
- w2ui hoạt động được trong iframe PPTB nếu bundle local, không cần rewrite UI.
- Scaffold và tooling của PPTB (Yeoman generator, `@pptb/types`) rất tốt, giảm boilerplate.
- Auth hoàn toàn do PPTB xử lý — không cần lo connection logic.
- **Không phụ thuộc** vào bất kỳ solution/plugin nào được cài trong môi trường người dùng. Tool chạy out-of-the-box sau khi cài từ PPTB marketplace.

### 🟡 Thách thức còn lại (không phải blocker)
1. **Refactor module system** — 15+ file IIFE → TypeScript modules, không khó nhưng tốn thời gian.
2. **Map toàn bộ metadata API calls** — Cần đọc kỹ code của từng handler để map sang đúng PPTB API (đặc biệt các `getEntityRelatedMetadata` paths).
3. **`minAPI: "1.0.20"`** — Yêu cầu version PPTB đủ mới (metadata CRUD operations yêu cầu v1.0.20, v1.0.18 cho relationship operations).

### 📋 Bước tiếp theo khuyến nghị
1. Scaffold project: `npx --package yo --package generator-pptb -- yo pptb` → chọn HTML/TS template
2. Cài `@pptb/types` và thử port **AttributeHandler** trước (handler đơn giản nhất, dùng làm template)
3. Port từng handler theo thứ tự: Attribute → Entity → OptionSet → GlobalOptionSet → Relationship → View → Form → ...
4. Build và test trong PPTB Debug Mode
5. Publish npm + submit marketplace

---

## 6. Tài nguyên

- PPTB Tool Development: https://docs.powerplatformtoolbox.com/tool-development
- API Reference: https://docs.powerplatformtoolbox.com/tool-development/api-reference
- Yeoman Generator: `npx --package yo --package generator-pptb -- yo pptb`
- TypeScript types: `npm install --save-dev @pptb/types`
- Sample Tools: https://github.com/PowerPlatformToolBox/sample-tools
- PPTB Discord: https://discord.gg/efwAu9sXyJ

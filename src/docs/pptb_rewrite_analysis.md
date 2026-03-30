# Phân Tích: Viết Lại Từ Đầu cho PPTB (Dùng Code Cũ Làm Tham Khảo)

> Ngày phân tích: 30/03/2026
> Xem thêm: [pptb_port_analysis.md](./pptb_port_analysis.md) — phân tích hướng port/refactor

---

## 1. Định nghĩa "Viết Lại Từ Đầu"

Không phải là bỏ hết mọi thứ. Cụ thể:

| Bỏ lại | Giữ lại (làm tham khảo) |
|--------|------------------------|
| Toàn bộ code JS/IIFE/global pattern | Toàn bộ **business logic** (đã được verified qua nhiều năm) |
| w2ui 1.5.rc1 + jQuery | Dataverse metadata API endpoints & payloads |
| `WebApiClient` wrapper | Handler pattern concept (Load / Save) |
| `ClientGlobalContext.js.aspx` | FormHandler language switching trick |
| HTML dashboard files (1 file = 1 feature) | Translation providers logic |
| `window.SomeHandler = ...` globals | OptionSet compound ID pattern |
| | Rollup field exclusion logic |
| | `SanitizeForPut` pattern (strip `versionnumber`) |

Code cũ là **kho tài liệu kỹ thuật** — chứa đầy những edge case đã xử lý sẵn.

---

## 2. Tại Sao Viết Lại Lại Hấp Dẫn?

### 2.1 Vấn đề của hướng port

Khi port code cũ sang PPTB:
- Phải giải quyết từng chỗ `window.XrmTranslator.xxx` → proper module import/export
- `w2ui` grid API cồng kềnh, khó type-safe, không có TypeScript definitions
- Handler pattern với IIFE/global state phải refactor từng file một (~15 files)
- Logic và UI bị **coupled chặt** (handler tự gọi `w2ui.grid.clear()`, `w2ui.grid.records.push(...)`) → khó test, khó tách

### 2.2 Lợi thế của viết lại

- **TypeScript from day 1**: Type-safe Dataverse metadata objects, không còn `as any` khắp nơi
- **Chọn UI framework tốt hơn**: Grid component chuyên nghiệp, được maintain chủ động
- **Tách biệt data và UI**: Handler chỉ trả về data, UI component tự render
- **Reuse pattern rõ ràng**: Mỗi translation type là một hook/service, không phụ thuộc UI
- **UX có thể cải thiện**: Không bị lock vào layout cũ

---

## 3. Quyết Định Kiến Trúc Quan Trọng

### 3.1 Framework UI

| Option | Bundle size | Phù hợp PPTB | Ecosystem grid | Khuyến nghị |
|--------|------------|--------------|----------------|-------------|
| **React + Fluent UI v9** | ~158KB | ✅✅ (PPTB tự dùng Fluent) | TanStack Table / AG Grid Community | ⭐⭐⭐ |
| HTML/TypeScript thuần | ~50KB | ✅ | Thư viện grid rời | ⭐⭐ |
| Vue 3 | ~77KB | ✅ | Vue-compatible grid | ⭐⭐ |
| Svelte 5 | ~45KB | ✅ | Svelte-compatible grid | ⭐⭐ |

**Khuyến nghị: React + Fluent UI v9 (Microsoft)**

Lý do:
- Fluent UI v9 là design system chính thức của Microsoft Power Platform — nhìn sẽ nhất quán với PPTB host.
- PPTB tự dùng Fluent → không có CSS conflict giữa host và tool (cùng version).
- Ecosystem React lớn nhất cho grid component (TanStack Table, AG Grid).
- `@pptb/types` compatible với React.

### 3.2 Grid Component — Thay thế w2ui

Grid là trái tim của tool. Không thể dùng w2ui mới vì không có TypeScript types tốt và ít được maintain. Các lựa chọn:

| Grid | License | Inline edit | TypeScript | Tree rows | Khuyến nghị |
|------|---------|-------------|------------|-----------|-------------|
| **AG Grid Community** | MIT | ✅ | ✅✅ | ✅ | ⭐⭐⭐ |
| TanStack Table v8 | MIT | Tự build | ✅✅ | ✅ | ⭐⭐ (cần nhiều code hơn) |
| Handsontable Community | MIT (v6+) | ✅ | ✅ | ❌ | ⭐ (không có tree) |
| Fluent UI DataGrid | MIT | Tự build | ✅✅ | ❌ | ⭐ (không có tree) |

**Khuyến nghị: AG Grid Community (miễn phí)**

AG Grid Community hỗ trợ đầy đủ: inline editing, tree data (cần cho FormHandler), column auto-generate, virtual scrolling cho metadata lớn. API tốt hơn w2ui nhiều. Có bundled size lớn hơn (~300KB) nhưng chấp nhận được cho desktop app.

---

## 4. Kiến Trúc Đề Xuất

```
src/
├── app.tsx                  # Entry point, khởi tạo connection context
├── types/
│   ├── dataverse.ts         # Type cho metadata objects (AttributeMetadata, etc.)
│   ├── grid.ts              # Type cho grid rows
│   └── translation.ts       # Type cho translation providers
├── context/
│   └── AppContext.tsx        # React context: connection, installedLanguages, baseLanguage, userId
├── services/
│   ├── dataverseService.ts  # Wrapper mỏng quanh window.dataverseAPI (typed)
│   ├── translationService.ts # 4 providers: Azure, DeepL, Gemini, Glosbe
│   └── publishService.ts    # publishCustomizations, publishXml
├── handlers/                # Một file = một translation type
│   ├── IHandler.ts          # Interface: load(): Promise<GridRow[]>, save(changes): Promise<void>
│   ├── attributeHandler.ts
│   ├── optionSetHandler.ts
│   ├── globalOptionSetHandler.ts
│   ├── formHandler.ts       # Phức tạp nhất (language switching)
│   ├── formMetaHandler.ts
│   ├── entityHandler.ts
│   ├── viewHandler.ts
│   ├── chartHandler.ts
│   ├── bpfHandler.ts
│   ├── contentSnippetHandler.ts
│   ├── webResourceHandler.ts
│   ├── relationshipHandler.ts
│   └── siteMapHandler.ts
├── components/
│   ├── Toolbar.tsx          # Solution / Entity / Type / Component selects + Load/Save buttons
│   ├── TranslationGrid.tsx  # AG Grid wrapper — columns tự động theo installedLanguages
│   ├── TranslationTool.tsx  # Main page (compose Toolbar + TranslationGrid)
│   ├── PropertyEditorTool.tsx # Property editor page
│   └── AutoTranslateDialog.tsx # Dialog chọn provider + fill translations
└── index.html
```

### 4.1 Handler Interface

```typescript
// handlers/IHandler.ts
export interface GridRow {
    id: string;
    schemaName: string;
    labels: Record<number, string>;  // LCID -> Label text
    children?: GridRow[];            // Cho FormHandler tree
    meta?: unknown;                  // Original metadata object để dùng khi Save
}

export interface IHandler {
    load(context: AppContext): Promise<GridRow[]>;
    save(rows: GridRow[], changes: CellChange[], context: AppContext): Promise<void>;
}
```

### 4.2 AppContext (thay thế `window.XrmTranslator`)

```typescript
// context/AppContext.tsx
interface AppContext {
    connection: DataverseConnection;
    userId: string;
    userLanguage: number;              // uilanguageid hiện tại của user
    baseLanguage: number;              // org languagecode
    installedLanguages: LanguageLocale[];
    selectedSolution: string;
    selectedEntity: string;
    selectedType: TranslationType;
    selectedComponent: string;
}
```

Toàn bộ shared state nằm trong React context, không phải `window.XrmTranslator`. Handler nhận context làm param, hoàn toàn pure function.

---

## 5. Những Đoạn Logic Cần Khai Thác Từ Code Cũ

### 5.1 FormHandler — Language Switching

Đây là trick phức tạp nhất trong codebase. Code cũ làm:
1. Lấy danh sách form được chọn
2. Với mỗi installed language: set `uilanguageid` của user → fetch formxml → parse với DOMParser → TreeWalker → collect labels
3. Restore lại ngôn ngữ gốc

Logic này phải được **sao chép cẩn thận** — không được đơn giản hóa vì CRM không trả về multilabel một lúc.

```typescript
// handlers/formHandler.ts (phác thảo)
async function collectLabelsForLanguage(formId: string, lcid: number, ctx: AppContext): Promise<LabelMap> {
    await dataverseService.setUserLanguage(ctx.userId, lcid);
    const form = await dataverseService.retrieveForm(formId);
    return parseFormXmlLabels(form.formxml);  // DOMParser + TreeWalker
}
```

### 5.2 AttributeHandler — Rollup Field Exclusion

```typescript
// handlers/attributeHandler.ts
function shouldExclude(attr: AttributeMetadata): boolean {
    if (!attr.FormulaDefinition) return false;
    // Rollup field sinh ra _Base, _Date, _State columns → CRM ném exception
    return true;  // exclude the companion fields
}
```

### 5.3 OptionSetHandler — Compound Record ID

OptionSet dùng `"{attrId}|{optionValue}"` làm ID row vì nhiều attribute có thể share cùng option value. Cần giữ lại pattern này cho grid row key.

### 5.4 SanitizeForPut

```typescript
// services/dataverseService.ts
function sanitizeForPut<T>(obj: T): T {
    // Xóa versionnumber (BigInt) khỏi payload PUT — Dataverse reject nếu có
    // Xóa các field không safe integer
    ...
}
```

### 5.5 Translation Service — 4 Providers

Từ `TranslationHandler.js`, cần port logic của 4 providers. Quan trọng nhất là Gemini vì dùng batch translation (gửi array labels, nhận array kết quả). Logic parse response của Gemini cần cẩn thận.

### 5.6 Publish Logic

```typescript
// services/publishService.ts
async function publishEntity(entityLogicalName: string): Promise<void> {
    // Đổi user về base language trước khi publish (FormHandler requirement)
    await dataverseService.setUserLanguage(userId, baseLanguage);
    await dataverseAPI.publishCustomizations(entityLogicalName);
    await dataverseService.restoreUserLanguage(userId, originalLanguage);
}
```

---

## 6. So Sánh Port vs. Viết Lại

| Tiêu chí | Port (file 1) | Viết lại từ đầu |
|----------|---------------|-----------------|
| Thời gian | ~3-4 tuần | ~6-8 tuần |
| Rủi ro bỏ sót edge case | Thấp (copy logic) | **Trung bình** (phải đọc hiểu rồi rewrite) |
| Chất lượng code kết quả | Trung bình (legacy pattern) | **Cao** (clean TypeScript) |
| Khả năng thêm feature sau | Khó (UI/logic coupled) | **Dễ** (tách biệt rõ ràng) |
| Khả năng test | Thấp | **Cao** (pure handlers, có thể unit test) |
| UI quality | w2ui (cũ, kém mobile) | AG Grid + Fluent (hiện đại) |
| Bundle size | ~200KB (w2ui + jQuery) | ~450KB (React + AG Grid) |
| Maintenance | Khó (w2ui không còn develop) | **Dễ** (actively maintained libs) |
| Breaking risk | Nếu miss 1 API call → bug | Nếu logic sai → bug |

### Quyết định then chốt

**Hướng viết lại phù hợp hơn nếu:**
- Có thời gian > 1 tháng
- Muốn maintain lâu dài
- Muốn thêm UX improvements (search, filter, sort trong grid)
- Muốn có unit test coverage

**Hướng port phù hợp hơn nếu:**
- Muốn ra sản phẩm nhanh (< 1 tháng)
- Code cũ đã quá stable, không muốn rủi ro regression
- Không có kế hoạch thêm feature lớn

---

## 7. Kế Hoạch Thực Hiện (Viết Lại)

### Phase 1 — Scaffold & Core (1 tuần)

- [ ] `yo pptb` → React template
- [ ] Cài AG Grid Community, Fluent UI v9, `@pptb/types`
- [ ] Tạo `AppContext` — load connection, userId, installedLanguages, baseLanguage
- [ ] Tạo `TranslationGrid` component với AG Grid (columns dynamic theo installedLanguages)
- [ ] Tạo `Toolbar` component (solution/entity/type selects, Load/Save buttons)
- [ ] Scaffold `IHandler` interface
- [ ] Cài đặt `dataverseService.ts` wrapper (typed)

### Phase 2 — Simple Handlers (1 tuần)

Port logic từ code cũ cho các handler đơn giản nhất:
- [ ] `attributeHandler.ts` — dùng `getEntityRelatedMetadata` + `updateAttribute(..., { mergeLabels: true })`
- [ ] `entityHandler.ts` — `getEntityMetadata` + `updateEntityDefinition`
- [ ] `viewHandler.ts` — `fetchXmlQuery("savedquery")` + `update("savedquery")`
- [ ] `chartHandler.ts` — tương tự viewHandler
- [ ] `formMetaHandler.ts` — entity metadata fields

### Phase 3 — Complex Handlers (1.5 tuần)

- [ ] `optionSetHandler.ts` — compound ID, local vs global, `updateOptionValue`
- [ ] `globalOptionSetHandler.ts` — `updateGlobalOptionSet`
- [ ] `relationshipHandler.ts` — 1:N và N:N, `updateRelationship`
- [ ] `bpfHandler.ts`, `contentSnippetHandler.ts`, `webResourceHandler.ts`, `siteMapHandler.ts`

### Phase 4 — FormHandler (1 tuần riêng)

FormHandler đủ phức tạp để có sprint riêng:
- [ ] Language switching logic
- [ ] DOMParser + TreeWalker trên formxml
- [ ] Tree data rendering trong AG Grid (nested rows cho Form → Tab → Section → Field)
- [ ] Save: reconstruct lại formxml từ changes

### Phase 5 — Translation Providers (0.5 tuần)

- [ ] `translationService.ts` với 4 providers
- [ ] API keys lưu trong `toolboxAPI.settings` thay localStorage
- [ ] `AutoTranslateDialog.tsx` component
- [ ] CSP exceptions trong `package.json`

### Phase 6 — Property Editor (0.5 tuần)

- [ ] `attributePropertyHandler.ts`, `entityPropertyHandler.ts`
- [ ] `PropertyEditorTool.tsx` page
- [ ] Navigation tab giữa Translation và Property Editor

### Phase 7 — Polish & Publish (0.5 tuần)

- [ ] Loading states, error handling toàn diện với `toolboxAPI.utils.showNotification`
- [ ] Validate `package.json` với `npx pptb-validate`
- [ ] Test debug mode trong PPTB
- [ ] `npm publish` + submit marketplace

---

## 8. Những Điều Cần Đọc Kỹ Từ Code Cũ Trước Khi Viết

Trước khi bắt đầu viết bất kỳ handler nào, **phải đọc hết** file handler tương ứng trong code cũ, đặc biệt chú ý:

1. **`Load()` function**: Những API nào được gọi? Theo thứ tự nào? Có dependency nào không?
2. **`FillTable()` function**: Data được transform thành grid rows như thế nào? Hierarchical không?
3. **`Save()` function**: Payload được construct thế nào? Headers đặc biệt nào? Sequence của các calls?
4. **Edge cases**: Có comment `// Skip because CRM throws exception` hay tương tự không?

### Các edge case đã biết từ code cũ cần lưu ý

| Handler | Edge case |
|---------|-----------|
| AttributeHandler | Skip `_Base`, `_Date`, `_State` fields của Rollup attributes |
| OptionSetHandler | Global vs local optionset có payload khác nhau; compound `id\|value` key |
| FormHandler | CRM chỉ trả label của user's current language — phải switch language để lấy đủ |
| FormHandler | Dashboard và Form khác nhau ở publish step (`publishDashboard` vs `publishEntity`) |
| EntityHandler | `DisplayName` vs `Description` vs `DisplayCollectionName` — 3 components khác nhau |
| RelationshipHandler | 1:N có `AssociatedMenuConfiguration`, N:N có `Entity1AssociatedMenuConfiguration` |
| SiteMapHandler | Không publish qua publishxml mà qua import/export |
| ContentSnippetHandler | Cho phép chọn cụ thể record (selectColumn = true) |

---

## 9. Template Starter Code

### package.json

```json
{
  "name": "@your-org/xrm-quick-translate",
  "version": "1.0.0",
  "displayName": "Xrm Quick Translate",
  "description": "Bulk translation management for Dataverse metadata",
  "main": "index.html",
  "icon": "icons/tool.svg",
  "license": "MIT",
  "contributors": [{ "name": "Your Name" }],
  "configurations": {
    "repository": "https://github.com/your-org/xrm-quick-translate"
  },
  "features": {
    "minAPI": "1.0.20"
  },
  "cspExceptions": {
    "connect-src": [
      { "domain": "api.cognitive.microsofttranslator.com", "exceptionReason": "Azure Translator", "optional": true },
      { "domain": "api.deepl.com", "exceptionReason": "DeepL API", "optional": true },
      { "domain": "generativelanguage.googleapis.com", "exceptionReason": "Gemini AI", "optional": true },
      { "domain": "glosbe.com", "exceptionReason": "Glosbe free translation", "optional": true }
    ]
  },
  "devDependencies": {
    "@pptb/types": "latest",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@fluentui/react-components": "^9.0.0",
    "ag-grid-react": "^32.0.0",
    "ag-grid-community": "^32.0.0"
  }
}
```

### dataverseService.ts (phác thảo)

```typescript
/// <reference types="@pptb/types" />

/** Fully typed thin wrapper over window.dataverseAPI */
export const dataverseService = {
    // Load attribute metadata for entity
    async getAttributes(entityLogicalName: string) {
        return dataverseAPI.getEntityRelatedMetadata(entityLogicalName, 'Attributes');
    },

    // Update attribute with MergeLabels
    async updateAttribute(entityLogicalName: string, attrId: string, definition: unknown) {
        return dataverseAPI.updateAttribute(entityLogicalName, attrId, definition, { mergeLabels: true });
    },

    // Update entity metadata with MergeLabels
    async updateEntity(entityId: string, definition: unknown) {
        return dataverseAPI.updateEntityDefinition(entityId, definition, { mergeLabels: true });
    },

    // Temporary language switch (FormHandler)
    async setUserLanguage(userId: string, lcid: number) {
        return dataverseAPI.update('usersettings', userId, {
            uilanguageid: lcid,
            helplanguageid: lcid
        });
    },

    // Strip versionnumber and unsafe BigInts before PUT
    sanitizeForPut<T>(obj: T): T {
        return JSON.parse(JSON.stringify(obj, (_key, value) => {
            if (_key.toLowerCase() === 'versionnumber') return undefined;
            if (typeof value === 'bigint') return undefined;
            return value;
        }));
    }
};
```

---

## 10. Tóm Tắt

| | Viết lại từ đầu |
|--|----------------|
| **Thời gian** | ~6-8 tuần |
| **Độ khó** | Trung bình-Cao (cần đọc kỹ code cũ để không bỏ sót edge case) |
| **Chất lượng kết quả** | Cao — clean TypeScript, type-safe, testable, modern UI |
| **Blocker kỹ thuật** | Không — `dataverseAPI` của PPTB hỗ trợ đầy đủ kể cả mergeLabels |
| **Rủi ro chính** | Bỏ sót một edge case trong code cũ → regression bug |
| **Giảm thiểu rủi ro** | Đọc kỹ từng handler cũ trước khi implement; sau đó test song song với tool cũ |

**Recommendation**: Nếu đây là project dài hạn → viết lại. Nếu muốn có PPTB tool chạy được trong vòng 1 tháng → port trước, refactor sau.

---

## 11. Tài Nguyên

- PPTB API Docs: https://docs.powerplatformtoolbox.com/tool-development/api-reference/dataverse-api
- AG Grid Docs: https://www.ag-grid.com/react-data-grid/
- Fluent UI v9: https://react.fluentui.dev/
- `yo pptb` scaffold: `npx --package yo --package generator-pptb -- yo pptb`
- PPTB Discord: https://discord.gg/efwAu9sXyJ

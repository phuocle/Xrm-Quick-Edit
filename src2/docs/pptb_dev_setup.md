# Hướng Dẫn Cài Đặt & Phát Triển PPTB Tool (src2)

> Tài liệu dành cho project viết lại Xrm Quick Edit dưới dạng Power Platform ToolBox tool.
> Code mới nằm trong folder `src2/`.

---

## 1. Yêu Cầu Hệ Thống

| Phần mềm | Version | Ghi chú |
|-----------|---------|---------|
| **Node.js** | >= 18.x | Cần cho npm, vite, yo |
| **npm** | >= 9.x | Đi kèm Node.js |
| **Power Platform ToolBox** | Latest | Desktop app, tải từ [powerplatformtoolbox.com](https://www.powerplatformtoolbox.com) |
| **VS Code** | Latest | Khuyến nghị, không bắt buộc |

---

## 2. Scaffold Project Mới

### Option A — Dùng npx (không cần cài global)

```bash
cd src2
npx --package yo --package generator-pptb -- yo pptb
```

### Option B — Cài global

```bash
npm install -g yo generator-pptb
cd src2
yo pptb
```

Generator sẽ tạo cấu trúc:
```
src2/
├── package.json        # PPTB manifest + dependencies
├── index.html          # Entry point
├── app.ts              # Main TypeScript file
├── styles.css
├── icons/
│   └── tool.svg        # Icon (dùng fill="currentColor" cho theme support)
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 3. Cài Dependencies

```bash
cd src2

# Dependencies chính
npm install react react-dom @fluentui/react-components ag-grid-react ag-grid-community

# Dev dependencies
npm install --save-dev @pptb/types typescript vite @vitejs/plugin-react
```

### Verify `package.json` có đủ các field bắt buộc

```jsonc
{
  "name": "@phuocle/xrm-quick-translate",
  "version": "1.0.0",
  "displayName": "Xrm Quick Translate",
  "description": "Bulk translation management for Dataverse metadata",
  "main": "index.html",                           // ← entry point
  "icon": "icons/tool.svg",                        // ← SVG, fill="currentColor"
  "license": "MIT",                                // ← phải là approved license
  "contributors": [{ "name": "Phuoc Le" }],
  "configurations": {
    "repository": "https://github.com/phuocle/xrm-quick-translate",
    "readmeUrl": "https://raw.githubusercontent.com/phuocle/xrm-quick-translate/main/README.md"
  },
  "features": {
    "minAPI": "1.2.0"
  },
  "cspExceptions": {
    "connect-src": [
      { "domain": "api.cognitive.microsofttranslator.com", "exceptionReason": "Azure Translator API", "optional": true },
      { "domain": "api.deepl.com", "exceptionReason": "DeepL translation API", "optional": true },
      { "domain": "generativelanguage.googleapis.com", "exceptionReason": "Gemini AI translation", "optional": true },
      { "domain": "glosbe.com", "exceptionReason": "Glosbe free translation", "optional": true }
    ]
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "validate": "pptb-validate"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@fluentui/react-components": "^9.0.0",
    "ag-grid-react": "^32.0.0",
    "ag-grid-community": "^32.0.0"
  },
  "devDependencies": {
    "@pptb/types": "latest",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}
```

### Approved Licenses

Chỉ được dùng: `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `GPL-2.0`, `GPL-3.0`, `LGPL-3.0`, `ISC`, `AGPL-3.0-only`.

---

## 4. Cấu Trúc Project Sau Khi Setup

```
src2/
├── package.json
├── index.html
├── vite.config.ts
├── tsconfig.json
├── icons/
│   └── tool.svg
├── src/
│   ├── app.tsx                     # Entry point, render React app
│   ├── types/
│   │   ├── dataverse.ts            # Type definitions cho metadata
│   │   ├── grid.ts                 # Type cho grid rows
│   │   └── translation.ts          # Type cho translation providers
│   ├── context/
│   │   └── AppContext.tsx           # React context: connection, languages, user
│   ├── services/
│   │   ├── dataverseService.ts     # Typed wrapper quanh window.dataverseAPI
│   │   ├── translationService.ts   # 4 providers: Azure, DeepL, Gemini, Glosbe
│   │   └── publishService.ts       # publishCustomizations
│   ├── handlers/
│   │   ├── IHandler.ts             # Interface: load() + save()
│   │   ├── attributeHandler.ts
│   │   ├── optionSetHandler.ts
│   │   ├── ...                     # Xem pptb_rewrite_analysis.md Section 4
│   │   └── siteMapHandler.ts
│   └── components/
│       ├── Toolbar.tsx
│       ├── TranslationGrid.tsx     # AG Grid wrapper
│       ├── TranslationTool.tsx     # Main page
│       ├── PropertyEditorTool.tsx
│       └── AutoTranslateDialog.tsx
└── dist/                           # Output sau build (vite build)
```

---

## 5. TypeScript Config

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["@pptb/types"]
  },
  "include": ["src"]
}
```

`@pptb/types` cung cấp type definitions cho các global objects:
- `dataverseAPI` — Dataverse Web API wrapper
- `toolboxAPI` — ToolBox utilities, settings, notifications

---

## 6. PPTB Global APIs

Sau khi cài `@pptb/types`, code có thể truy cập trực tiếp (không cần import):

### dataverseAPI (Dataverse operations)

```typescript
// CRUD
await dataverseAPI.create(entitySet, data);
await dataverseAPI.retrieve(entitySet, id, columns);
await dataverseAPI.update(entitySet, id, data);
await dataverseAPI.delete(entitySet, id);

// Metadata
await dataverseAPI.getEntityMetadata(entityLogicalName);
await dataverseAPI.getEntityRelatedMetadata(entityLogicalName, 'Attributes');
await dataverseAPI.updateAttribute(entity, attrId, definition, { mergeLabels: true });
await dataverseAPI.updateEntityDefinition(entityId, definition, { mergeLabels: true });

// Query
await dataverseAPI.fetchXmlQuery(fetchXml);
await dataverseAPI.queryData(entitySet, queryString);

// Option Sets
await dataverseAPI.updateGlobalOptionSet(id, definition);
await dataverseAPI.updateOptionValue(/* ... */);

// Relationships
await dataverseAPI.updateRelationship(id, definition);

// Publish
await dataverseAPI.publishCustomizations(entityLogicalName);

// Actions
await dataverseAPI.execute(request);

// Helpers
dataverseAPI.buildLabel(lcid, text);
```

### toolboxAPI (ToolBox utilities)

```typescript
// Notifications
toolboxAPI.utils.showNotification({
    type: 'success',    // 'info' | 'success' | 'warning' | 'error'
    message: 'Saved!',
    duration: 3000
});

// Clipboard
toolboxAPI.utils.copyToClipboard(text);

// Theme
const theme = toolboxAPI.utils.getCurrentTheme();  // 'light' | 'dark'

// Parallel execution
await toolboxAPI.utils.executeParallel(promise1, promise2, promise3);

// Connection
const conn = toolboxAPI.getActiveConnection();
// conn.url, conn.name, conn.id, ...
```

### Settings API (thay thế localStorage)

```typescript
// Lưu API key
await toolboxAPI.settings.set('azureTranslatorKey', 'xxx');

// Đọc API key
const key = await toolboxAPI.settings.get('azureTranslatorKey');
```

Settings persist theo PPTB app, không mất khi clear browser data.

---

## 7. Build

```bash
cd src2

# Build production
npm run build

# Output → dist/ folder
```

Verify `dist/` chứa:
- `index.html`
- `icons/tool.svg`
- Compiled JS/CSS assets

---

## 8. Debug & Test Trong PPTB

### Bước 1 — Bật Debug Menu

1. Mở **Power Platform ToolBox** desktop app
2. Vào **Settings** (gear icon)
3. Bật **"Show Debug Menu"**
4. Click **Save**

### Bước 2 — Build với Watch Mode

```bash
cd src2
npm run build -- --watch
```

Mỗi khi sửa code, Vite tự rebuild vào `dist/`.

### Bước 3 — Load Local Tool

1. Trong PPTB sidebar, mở section **Debug**
2. Click **Browse** ở "Load Local Tool"
3. Chọn folder `src2/dist/` (folder chứa output build)
4. Click **Load Tool**

### Bước 4 — Connect Dataverse

1. Trong PPTB, thêm connection tới Dataverse environment
2. Chọn connection đó làm active
3. Mở tool vừa load — tool sẽ nhận `dataverseAPI` với connection đã chọn

### Bước 5 — Iterate

Mỗi khi sửa code:
1. Watch mode tự rebuild
2. Đóng tab tool trong PPTB
3. Mở lại từ sidebar → thấy changes mới

### Tips Debug

- Dùng `console.log()` — PPTB tool chạy trong iframe, console output hiển thị trong DevTools của PPTB
- Dùng `toolboxAPI.utils.showNotification({ type: 'error', message: '...' })` để hiện lỗi trên UI
- Nếu tool không load được, kiểm tra `dist/index.html` tồn tại và `package.json` hợp lệ

---

## 9. Validate Trước Khi Publish

```bash
cd src2

# Validate package.json theo chuẩn PPTB
npm run validate
# hoặc
npx pptb-validate
```

### Các check được thực hiện:

| Check | Mô tả |
|-------|-------|
| `name` | Scoped npm name, lowercase, không spaces |
| `version` | SemVer format |
| `displayName` | Non-empty string |
| `description` | Non-empty string |
| `license` | Phải nằm trong danh sách approved |
| `contributors` | Non-empty array với `name` |
| `configurations.repository` | Valid GitHub URL |
| `configurations.readmeUrl` | Valid raw.githubusercontent.com URL |
| `icon` | SVG file tồn tại |

**Exit code 0** = pass, **Exit code 1** = có lỗi.

### CLI Options

```bash
npx pptb-validate --skip-url-checks   # Bỏ qua check URL reachability (offline)
npx pptb-validate --json              # Output JSON (cho CI/CD)
```

---

## 10. Publish Lên npm & PPTB Marketplace

### Step 1 — Build final

```bash
npm run build
```

### Step 2 — Validate

```bash
npx pptb-validate
```

Fix mọi errors trước khi tiếp.

### Step 3 — Finalize package

```bash
npm run finalize-package
```

### Step 4 — Publish lên npm

```bash
# Login npm (lần đầu)
npm login

# Publish (scoped package cần --access public)
npm publish --access public

# Verify
npm view @phuocle/xrm-quick-translate
```

### Step 5 — Test từ npm

Trong PPTB Debug section, install tool từ npm để verify nó hoạt động đúng.

### Step 6 — Submit lên PPTB Marketplace

1. Truy cập [powerplatformtoolbox.com/submit-tool](https://powerplatformtoolbox.com/submit-tool)
2. Điền npm package name: `@phuocle/xrm-quick-translate`
3. Chọn categories (tối đa 3): `Development`, `Data`, `Solutions`
4. Submit

### Step 7 — Chờ review

- **Automated validation**: Kiểm tra package structure, license, security
- **Manual review**: 48-72 giờ — kiểm tra security, code quality, functionality
- Sau khi approved → tool xuất hiện trên PPTB Marketplace

### Update versions sau này

```bash
npm version patch    # Bug fix: 1.0.0 → 1.0.1
npm version minor    # New feature: 1.0.0 → 1.1.0
npm version major    # Breaking change: 1.0.0 → 2.0.0
npm run build
npm publish --access public
```

PPTB registry tự sync với npm, users nhận thông báo update.

---

## 11. CSP — Content Security Policy

Tool chạy trong iframe có CSP strict. Để gọi external API (translation providers), phải khai báo trong `cspExceptions`:

```json
"cspExceptions": {
  "connect-src": [
    { "domain": "api.cognitive.microsofttranslator.com", "exceptionReason": "Azure Translator API", "optional": true },
    { "domain": "api.deepl.com", "exceptionReason": "DeepL translation API", "optional": true },
    { "domain": "generativelanguage.googleapis.com", "exceptionReason": "Gemini AI translation", "optional": true },
    { "domain": "glosbe.com", "exceptionReason": "Glosbe free translation", "optional": true }
  ]
}
```

- Khi user mở tool lần đầu → PPTB hiện **consent dialog** liệt kê các domain
- User chấp nhận → CSP exception được apply
- `"optional": true` → tool vẫn load được nếu user từ chối (chỉ tính năng translate external bị disable)

**Không cần** khai báo `*.dynamics.com` — PPTB tự handle connection tới Dataverse.

---

## 12. Tham Khảo

| Tài liệu | URL |
|-----------|-----|
| PPTB Docs — Tool Development | https://docs.powerplatformtoolbox.com/tool-development |
| PPTB Docs — Package Manifest | https://docs.powerplatformtoolbox.com/tool-development/manifest |
| PPTB Docs — Dataverse API | https://docs.powerplatformtoolbox.com/tool-development/api-reference/dataverse-api |
| PPTB Docs — ToolBox API | https://docs.powerplatformtoolbox.com/tool-development/api-reference/toolbox-api |
| PPTB Docs — Settings API | https://docs.powerplatformtoolbox.com/tool-development/api-reference/settings-api |
| PPTB Docs — Events API | https://docs.powerplatformtoolbox.com/tool-development/api-reference/events |
| PPTB Docs — CSP Config | https://docs.powerplatformtoolbox.com/tool-development/csp-configuration |
| PPTB Docs — Validation | https://docs.powerplatformtoolbox.com/tool-development/validation |
| PPTB Docs — Publishing | https://docs.powerplatformtoolbox.com/tool-development/publishing |
| generator-pptb | https://github.com/PowerPlatformToolBox/generator-pptb |
| Sample tools | https://github.com/PowerPlatformToolBox/sample-tools |
| AG Grid React | https://www.ag-grid.com/react-data-grid/ |
| Fluent UI v9 | https://react.fluentui.dev/ |

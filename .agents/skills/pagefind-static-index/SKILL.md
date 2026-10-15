---
name: pagefind-static-index
description: "Pagefind 1.3.0 靜態搜尋維護 + 搜尋 UI 整合。當用戶說「pagefind 索引」「搜尋找不到」「Pagefind UI 沒顯示」「多語言 index」「排除規則」「搜尋結果 metadata」「index 過期」時使用。涵蓋 Pagefind 自動 build、手動 rebuild、exclude selectors、data-pagefind-meta hidden、多語言 .pf_meta segment、模組化 UI 整合、debug 流程（index 過期 / HTML wrapper 缺 / UI script 沒載 / index 跟 dist 不同步）。不涵蓋 build 細節（見 astro-build-clean skill）。應用：Astro 6.x + Pagefind 1.3.0 靜態站。"
license: MIT
metadata:
  author: donttalk-deploy
  version: "1.0.0"
  tags:
    - pagefind
    - search
    - static
    - index
    - ui
    - astro
    - i18n
---

# Pagefind Static Index 維護

> Pagefind 1.3.0 是 Astro build 內建的靜態搜尋（`package.json` `build` script 已配）。本 skill 聚焦**維護/整合/debug**，不涵蓋 build pipeline（見 `astro-build-clean` skill）。

## 核心產物

```
astro/dist/pagefind/                       # build 自動產
├── pagefind.js                            # entry (主)
├── pagefind-ui.js                         # 預設 UI（給一般使用者用）
├── pagefind-ui.css
├── pagefind-component-ui.js               # 模組化 UI（給自己寫搜尋框）
├── pagefind-component-ui.css
├── pagefind-modular-ui.js
├── pagefind-modular-ui.css
├── pagefind-highlight.js                  # 高亮匹配字
├── pagefind-entry.json                    # 入口 metadata
├── pagefind.zh-hant_*.pf_meta             # 繁中 index segment
├── pagefind.zh-tw_*.pf_meta               # 簡中（台灣用語）index segment
└── pagefind.en_*.pf_meta                  # 英文 index segment
```

每個語言一個 `.pf_meta` segment。`<html lang="...">` 決定走哪個 segment。

## 自動 build 觸發

`package.json`：

```json
"build": "astro build && npx pagefind --site dist --output-path dist/pagefind"
```

每次 `npm run build` 自動觸發。`npx pagefind --site dist` 掃 `dist/**/*.html`，產 index 到 `dist/pagefind/`。

## 何時需要手動 rebuild

通常不需要 — build script 已涵蓋。但這些場景手動比較快：

```powershell
cd D:\project\astro
# 改內容後還沒 build，先 rebuild index
npx pagefind --site dist --output-path dist/pagefind

# debug 排除規則
npx pagefind --site dist --output-path dist/pagefind --exclude-selectors "nav,footer,.no-index"
```

或驗證 index 跟 dist 同步：

```powershell
# 比較時間戳
Get-Item "astro\dist\index.html", "astro\dist\pagefind\pagefind-entry.json" | Select-Object Name, LastWriteTime | Format-Table -AutoSize
# 兩個時間接近代表 OK
```

## HTML Wrapper 必要

**Pagefind 1.x 只索引有 `<!DOCTYPE html>` 開頭 + `<html>` 根元素的 HTML 檔**。

如果頁面用：

```astro
---
// src/pages/about.astro
---
<Fragment>
  <head>...</head>
  <body>...</body>
</Fragment>
```

**會被 Pagefind 跳過** — 搜尋找不到這頁。

Astro 預設 layout 自動包 `<html>`，但 custom Fragment 會破壞。

檢查所有 .astro 頁有沒有 `<html>` wrapper：

```powershell
Get-ChildItem "astro\src\pages\*.astro" | ForEach-Object {
  $content = Get-Content $_.FullName -Raw
  if ($content -notmatch '<html') {
    Write-Warning "$($_.Name) 缺 <html> wrapper"
  }
}
```

## 排除規則

### 命令列 exclude selectors

```powershell
npx pagefind --site dist --output-path dist/pagefind --exclude-selectors "nav,footer,.no-index,.admin-badge"
```

排除元素**內容**不索引，元素本身仍在 DOM。

### Per-element hidden

```html
<div data-pagefind-meta="hidden">這段不索引</div>
```

### Per-element metadata

```html
<article>
  <h1>文章標題</h1>
  <p>內容</p>
  <data data-pagefind-meta="date" value="2026-10-15">2026-10-15</data>
  <data data-pagefind-meta="category" value="音樂">音樂</data>
  <data data-pagefind-meta="author" value="不說">不說</data>
</article>
```

搜尋結果會帶 date / category / author，可用於 filter / sort。

## 多語言 segment

每個 `<html lang="...">` 會走對應語言 segment：

```astro
<html lang="zh-Hant">  <!-- → pagefind.zh-hant_*.pf_meta -->
<html lang="zh-TW">    <!-- → pagefind.zh-tw_*.pf_meta -->
<html lang="en">       <!-- → pagefind.en_*.pf_meta -->
```

未宣告 lang 屬性的 HTML → 走 default segment（或不分）。

每個 segment 獨立，可單獨更新。`<html lang="zh-Hant">` 加新內容 → 只需 rebuild `zh-hant` segment（但 `npx pagefind` 預設全部 rebuild）。

## 搜尋 UI 整合

### 選項 A — 預設 UI（最快）

```html
<link href="/pagefind/pagefind-ui.css" rel="stylesheet">
<script src="/pagefind/pagefind-ui.js"></script>
<div id="search"></div>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    new PagefindUI({
      element: '#search',
      showImages: false,
      showSubResults: true,
      resetStyles: false,
    });
  });
</script>
```

預設 UI 已經有：
- 搜尋框
- 結果列表（含標題 + excerpt + URL）
- 高亮匹配字
- 分頁

### 選項 B — 模組化 UI（自訂外觀）

```js
import { PagefindUI } from '/pagefind/pagefind-component-ui.js';
new PagefindUI({
  element: '#search',
  showImages: false,
  showSubResults: true,
});
```

模組化 UI 可以用 CSS class 跟 data attribute 客製：

```css
[data-pagefind-ui-root] { ... }
[data-search-input] { ... }
[data-result-title] { ... }
```

### 選項 C — 完全自寫（最高自由）

```js
const pagefind = await import('/pagefind/pagefind.js');
const search = await pagefind.search('台積電');
console.log('total:', search.totalFilters);
const results = await Promise.all(search.results.slice(0, 10).map(r => r.data()));
// results = [{ url, title, excerpt, meta: { date, category } }, ...]
```

完全控制 render、filter、sort。

## Debug 流程

### 症狀：搜尋「台積電」沒結果

| 步驟 | 驗證 |
|---|---|
| 1. index 過期？ | `Get-Item astro\dist\pagefind\pagefind-entry.json \| Select LastWriteTime` — 跟 dist/index.html 比 |
| 2. 頁面沒 `<html>` wrapper？ | 上面 PowerShell 檢查 script |
| 3. pagefind.js 載入失敗？ | DevTools Network 看 `pagefind.js` 是不是 200 |
| 4. segment 不對？ | DevTools 看 `pagefind.zh-hant_*.pf_meta` 有沒有 fetch |
| 5. exclude 規則把內容排掉了？ | 暫時 `npx pagefind --site dist --output-path dist/pagefind` 不帶 exclude 重 build |

### 症狀：搜尋結果只顯示首頁

頁面用 `<Fragment>` 開頭（見 HTML Wrapper 段落）。修法：加 `<html>` 開頭。

### 症狀：搜尋結果有但點進去 404

dist 跟 Vercel .vercel/output 不同步。詳見 `astro-build-clean`。

### 症狀：Pagefind UI 沒顯示

```html
<!-- 確認順序：先 CSS、後 JS、再 element、最後 init -->
<link href="/pagefind/pagefind-ui.css" rel="stylesheet">
<script src="/pagefind/pagefind-ui.js"></script>
<div id="search"></div>
<script>...</script>
```

或檢查 `#search` 元素是否存在於 DOM。

## 部署

`astro/dist/pagefind/` 隨 build → Vercel serve `/pagefind/pagefind.js` + 各 `.pf_meta` segment。

**不要 commit `astro/dist/` 的 pagefind** — 那是 build output，會過期。Source-of-truth 是 `astro/pagefind/`（已 commit 的上次 build snapshot，作為 fallback）。

## References

- [`01-rebuild-and-exclude.md`](references/01-rebuild-and-exclude.md) — 手動 rebuild SOP、exclude 規則、metadata pattern
- [`02-multilingual-segments.md`](references/02-multilingual-segments.md) — zh-hant / zh-tw / en segment 對應、`<html lang>` 影響
- [`03-search-ui-integration.md`](references/03-search-ui-integration.md) — 3 種 UI 整合選項、custom CSS、debounce
- [`04-debug-flowchart.md`](references/04-debug-flowchart.md) — 5 個常見症狀決策樹

# Pagefind 1.3.0 設定

## 自動 build

`package.json` 內 `build` script：

```json
"build": "astro build && npx pagefind --site dist --output-path dist/pagefind"
```

`astro build` 跑完自動觸發 `npx pagefind`：
- 掃 `dist/**/*.html`
- 寫 index 到 `dist/pagefind/`
- 產生 `pagefind.js` + 各語言 `.pf_meta`

## 產出結構

```
astro/dist/pagefind/
├── pagefind.js                    # 主 entry (~100 KB)
├── pagefind-entry.json            # 入口 metadata
├── pagefind-ui.js                 # 預設 UI
├── pagefind-ui.css
├── pagefind-component-ui.js       # 模組化 UI
├── pagefind-component-ui.css
├── pagefind-modular-ui.js
├── pagefind-modular-ui.css
├── pagefind-highlight.js
├── pagefind.zh-hant_*.pf_meta     # 繁中 index
├── pagefind.zh-tw_*.pf_meta       # 簡中（台灣用語）
└── pagefind.en_*.pf_meta          # 英文
```

每語言一個 `.pf_meta` segment。

## HTML wrapper 必要

Astro 預設每個 `.astro` 頁都包 `<html>`：

```astro
---
// src/pages/about.astro
---
<html lang="zh-Hant">
  <head>...</head>
  <body>...</body>
</html>
```

**Pagefind 1.x 只索引有 `<html>` 根元素的 HTML 檔**。如果頁面用：

```astro
<Fragment>
  <head>...</head>
  <body>...</body>
</Fragment>
```

**會被跳過**，搜尋找不到。

檢查：

```powershell
Get-Content astro\dist\index.html -TotalCount 3
# 預期第一行: <!DOCTYPE html><html ...>
```

或：

```powershell
Get-ChildItem "astro\dist\*.html" | ForEach-Object {
  $first = Get-Content $_.FullName -TotalCount 1
  if ($first -notmatch '^<!DOCTYPE html>') {
    Write-Warning "$($_.Name) no <!DOCTYPE html>: $first"
  }
}
```

## 排除規則

### 排除 selector

```powershell
npx pagefind --site dist --output-path dist/pagefind --exclude-selectors "nav,footer,.no-index,.admin-badge"
```

排除的元素內容不索引，但元素本身還在 DOM。

### 標記 hidden 區塊

```html
<div data-pagefind-meta="hidden">這段不索引</div>
```

### 標記 metadata

```html
<article>
  <h1>文章標題</h1>
  <p>內容</p>
  <data data-pagefind-meta="date" value="2026-10-15">2026-10-15</data>
  <data data-pagefind-meta="category" value="音樂">音樂</data>
</article>
```

搜尋結果會帶 date / category。

## 重建 index

```powershell
cd D:\project\astro
# 確認 dist/ 是最新
npm run build
# 手動 rebuild index（build script 已自動跑，但 debug 時手動）
npx pagefind --site dist --output-path dist/pagefind
```

## UI 整合

最簡單用預設 UI：

```html
<link href="/pagefind/pagefind-ui.css" rel="stylesheet">
<script src="/pagefind/pagefind-ui.js"></script>
<div id="search"></div>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    new PagefindUI({ element: '#search' });
  });
</script>
```

模組化 UI（自己寫搜尋框）：

```js
import { Pagefind } from '/pagefind/pagefind.js';
const pagefind = await import('/pagefind/pagefind.js');
const search = await pagefind.search('台積電');
const results = await Promise.all(search.results.slice(0, 10).map(r => r.data()));
```

## 部署時的 index 對應

`astro/dist/pagefind/` 內的 `.pf_meta` 是 build 時的內容 snapshot。改完 source code 後：

1. 改 `astro/src/pages/<page>.astro`
2. `npm run build`（自動 pagefind）
3. 新 `.pf_meta` segment 寫到 `dist/pagefind/`
4. Vercel deploy → 遠端 serve 新 index

**不要 commit 過期的 pagefind**：`astro/pagefind/` 是上次 build 的 output，source-of-truth 是 `astro/dist/pagefind/`。改完內容要重 build 才會更新 index。

## 常見錯誤

| 症狀 | 原因 |
|---|---|
| 搜尋「台積電」沒結果 | page index 沒更新（`dist/pagefind/` 是舊的） |
| 搜尋結果只顯示首頁 | 其它頁沒 `<html>` wrapper（被跳過） |
| 搜尋結果有但點進去 404 | dist 跟 Vercel .vercel/output 不同步（見 01） |
| Pagefind UI 沒顯示 | `pagefind-ui.js` 沒載入或 path 錯 |

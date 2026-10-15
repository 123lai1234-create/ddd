# Pagefind Debug 流程圖

## 症狀 1：搜尋「台積電」沒結果

```
搜「台積電」沒結果
  ↓
1. index 過期？ — 比較 dist/index.html 跟 dist/pagefind/pagefind-entry.json 時間戳
  ↓ 是
   npm run build  # 自動 rebuild index
  ↓ 否
2. 頁面沒 <html> wrapper？ — 檢查 src/pages/*.astro
  ↓ 是
   改回 <html lang="..."> 開頭
  ↓ 否
3. pagefind.js 沒載入？ — DevTools Network 看 status
  ↓ 是
   確認 /pagefind/pagefind.js 是 200
  ↓ 否
4. segment 不對？ — DevTools Network 看 .pf_meta 有沒有 fetch
  ↓ 是
   確認 <html lang> 跟實際 segment 名對應
  ↓ 否
5. exclude 規則把內容排了？ — 暫時不帶 exclude 重 build
  ↓ 是
   拿掉 exclude 或調整 selector
  ↓ 否
6. 該頁根本沒被 pagefind 看到？ — 檢查 <html> + 內容是否在 dist/ 內
  ↓ 否
   確認 astro build 跑了，頁面在 dist/
```

## 症狀 2：搜尋結果只顯示首頁

**根因**：其它頁用 `<Fragment>` 開頭，缺 `<html>` wrapper → Pagefind 跳過。

**修法**：

```powershell
Get-ChildItem "astro\src\pages\*.astro" | ForEach-Object {
  $content = Get-Content $_.FullName -Raw
  if ($content -notmatch '<html') {
    Write-Warning "$($_.Name) 缺 <html> wrapper"
  }
}
```

把所有警告的檔案改成 `<html lang="...">...</html>` 開頭。

## 症狀 3：搜尋結果有但點進去 404

**根因**：dist 跟 Vercel `.vercel/output` 不同步。詳見 `astro-build-clean` skill。

**修法**：

```powershell
mavis-trash .vercel/output astro/.vercel/output
& "$env:APPDATA\npm\vercel.cmd" build --prod --yes
& "$env:APPDATA\npm\vercel.cmd" deploy --prebuilt --prod --yes --archive tgz
```

## 症狀 4：Pagefind UI 沒顯示

```html
<!-- 確認順序：CSS 在前、JS 在後、element 先存在、init 最後跑 -->
<link href="/pagefind/pagefind-ui.css" rel="stylesheet">
<script src="/pagefind/pagefind-ui.js"></script>
<div id="search"></div>
<script>
  document.addEventListener('DOMContentLoaded', () => {
    new PagefindUI({ element: '#search' });
  });
</script>
```

或：

```js
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSearch);
} else {
  initSearch();
}
```

**最常見原因**：`#search` element 還沒出現在 DOM 就 init。

## 症狀 5：搜尋結果 metadata 沒顯示

**根因**：metadata 沒正確標 `data-pagefind-meta`。

正確：

```html
<data data-pagefind-meta="date" value="2026-10-15">2026-10-15</data>
```

❌ 錯誤（用 attribute 沒 value）：

```html
<div data-pagefind-meta="date">2026-10-15</div>
```

❌ 錯誤（沒 data- prefix）：

```html
<data pagefind-meta="date" value="2026-10-15">2026-10-15</data>
```

## 症狀 6：build 完沒產 pagefind/

**根因**：`package.json` 內 `build` script 沒跑 pagefind，或 pagefind binary 沒裝。

**修法**：

```json
"build": "astro build && npx pagefind --site dist --output-path dist/pagefind"
```

```powershell
npm install --save-dev pagefind
# 確認 binary
Get-Command pagefind  # 應有 path
```

## 症狀 7：搜尋結果出現舊內容

**根因**：pagefind index 過期，沒跟最新 dist 同步。

**修法**：

```powershell
cd D:\project\astro
mavis-trash dist/pagefind
npm run build
```

或 CI 環境：

```dockerfile
RUN npx pagefind --site dist --output-path dist/pagefind
```

## 症狀 8：多語言 segment 沒分開

**根因**：所有頁 `<html lang>` 寫一樣。

**修法**：每語言用對應 lang：

```astro
---
// src/pages/en/about.astro
---
<html lang="en">
  <head>...</head>
  <body>...</body>
</html>
```

```astro
---
// src/pages/about.astro (default 繁中)
---
<html lang="zh-Hant">
  ...
</html>
```

## 通用 debug script

```python
import os
import json
from pathlib import Path

pf = Path(r"D:\project\astro\dist\pagefind")
dist = Path(r"D:\project\astro\dist")

# 1. 檢查 entry.json
entry = pf / "pagefind-entry.json"
if not entry.exists():
    print("❌ pagefind-entry.json 不存在")
else:
    e = json.load(open(entry))
    print(f"Pagefind version: {e.get('version')}")
    for lang, info in e.get("languages", {}).items():
        print(f"  {lang}: {info.get('page_count')} pages, hash {info.get('hash')}")

# 2. 檢查 dist/ 頁面數
html_count = len(list(dist.rglob("*.html")))
print(f"\nDist HTML 總數: {html_count}")
print(f"已索引: {sum(v.get('page_count', 0) for v in e.get('languages', {}).values())}")

# 3. 檢查哪些 HTML 沒 <html> wrapper
for html in dist.rglob("*.html"):
    content = html.read_text(encoding="utf-8", errors="ignore")
    if "<html" not in content[:200]:
        print(f"⚠️ {html.relative_to(dist)} 缺 <html> wrapper")
```

跑完會列：
- Pagefind 版本 + 每語言 segment 頁數
- 應該索引的頁數 vs 實際索引
- 哪些 dist HTML 檔沒 `<html>` wrapper（Pagefind 跳過的）

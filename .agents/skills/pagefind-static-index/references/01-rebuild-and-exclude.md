# Pagefind 手動 Rebuild + Exclude 規則

## 何時手動 rebuild

`npm run build` 已自動跑 pagefind。手動 rebuild 場景：

1. **改完內容但還沒 build** — 直接 rebuild index 預覽
2. **debug exclude 規則** — 反覆試不同 selector
3. **CI 環境分開跑** — build artifact 跟 index 分階段產

```powershell
cd D:\project\astro
npx pagefind --site dist --output-path dist/pagefind
```

## 命令列 flags

| Flag | 用途 |
|---|---|
| `--site <dir>` | 掃的目錄（預設 cwd） |
| `--output-path <dir>` | index 輸出目錄 |
| `--exclude-selectors <list>` | 排除元素 selector（逗號分隔） |
| `--glob <pattern>` | 額外包含檔案（`*.html` 之外） |
| `--force-language <lang>` | 強制某語言 segment |
| `--log-level <level>` | verbose / info / warn / error |

範例：

```powershell
# 排除 nav / footer / 帶 .no-index class
npx pagefind --site dist --output-path dist/pagefind --exclude-selectors "nav,footer,.no-index"

# 包含 .md 也索引（罕見）
npx pagefind --site dist --output-path dist/pagefind --glob "{*.html,*.md}"

# 強制 zh-Hant segment（debug segment 對應）
npx pagefind --site dist --output-path dist/pagefind --force-language zh-Hant
```

## Per-element Exclude

### Hidden（完全跳過）

```html
<div data-pagefind-meta="hidden">
  <p>這段完全不索引</p>
</div>
```

### Metadata

```html
<article>
  <h1 data-pagefind-meta="title">文章標題</h1>
  <p>內容...</p>
  <data data-pagefind-meta="date" value="2026-10-15">2026-10-15</data>
  <data data-pagefind-meta="category" value="音樂">音樂</data>
  <data data-pagefind-meta="tags" value="chibi,GLB,Three.js">標籤</data>
</article>
```

搜尋結果會帶這些 metadata，可以用於 filter / sort：

```js
// 搜尋「chibi」並 filter category = 音樂
const search = await pagefind.search('chibi');
const results = await Promise.all(
  search.results
    .filter(r => /* filter by meta */)
    .map(r => r.data())
);
```

## Exclude 規則選擇

| 場景 | 用 |
|---|---|
| 整段 nav / footer / sidebar 不索引 | `--exclude-selectors "nav,footer,.sidebar"` |
| 個別段落 hidden | `data-pagefind-meta="hidden"` |
| 只想索引 main 區塊 | `--exclude-selectors ":not(main) *"`（不推薦，破壞其他元素） |
| 加 custom metadata 給結果 | `<data data-pagefind-meta="...">` |

## Rebuild 完整 SOP

```powershell
# 1. 確認 dist/ 是最新
cd D:\project\astro
npm run build

# 2. 清舊 index
mavis-trash dist/pagefind

# 3. Rebuild
npx pagefind --site dist --output-path dist/pagefind

# 4. 驗證產物
Get-ChildItem dist\pagefind\ -Filter "*.pf_meta"
# 預期：pagefind.zh-hant_*.pf_meta + pagefind.en_*.pf_meta 等

# 5. 驗證 segment
python -c "import json,os; print(sorted(os.listdir(r'D:\project\astro\dist\pagefind')))"
# 應含 pagefind.js, pagefind-ui.js, *.pf_meta
```

## CI 環境特殊

Pagefind 需要寫檔 — 不要在唯讀 filesystem 跑。

如果是 Docker build stage：

```dockerfile
RUN npx pagefind --site /app/dist --output-path /app/dist/pagefind
```

Pagefind binary 從 npm 裝的 `pagefind` package 內有對應 platform binary — Linux / Windows / macOS 都支援。

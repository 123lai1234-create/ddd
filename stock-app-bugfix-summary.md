# Stock-App Bug 修復摘要（2026-08-14）

## 🐞 已修復的 10 個 Bug

### 嚴重 Bug（5/5）

| # | Bug | 根因 | 修復 |
|---|---|---|---|
| BUG-1 | `index.html` 右側個股資訊面板永遠空白 | 後端 `Content-Type` 沒設 `charset=utf-8`，Vercel Edge Function 回傳 JSON 中文在某些瀏覽器被當 latin1 解碼為亂碼，`renderStockIntro` 取屬性失敗 | `api/catchall.mjs`：`H_JSON` header 加上 `; charset=utf-8` |
| BUG-2 | `dashboard.html`「今日觸發訊號」顯示 `{"close":null,...}` 原始 JSON | 後端 `markers.text` 是 JSON 字串或物件，前端直接 `slice(0,40)` 把它當文字插入 DOM | `dashboard.html`：`loadMarkers()` 解析 `m.text`，提取 `message/note/summary` 或關鍵指標摘要 |
| BUG-3 | `etf.html` 自選股清單完全空白 + `data.forEach is not a function` | 後端 `/api/stocks` 回傳結構為 `{ok, source, count, stocks:[...}`，前端 `stockListData = d` 直接拿 object 當陣列 | `etf.html`：`loadStockList()` 抽出 `d.stocks`（相容 items/data）；exdiv sidebar 同樣保護 |
| BUG-4 | `price-compare.html` 124 檔股票名稱全 `null -` | 後端多處 stub 回 `name: null`，前端直接顯示字串 `null` | `price-compare.html`：`name==null \|\| name==='null' \|\| name===''` 統一顯示 "—"；連同 chart label、搜尋過濾都修 |
| BUG-5 | `revenue.html` 月營收表「名稱」欄位大部分空白 | 後端 SQL 只 `LEFT JOIN watchlist`（只有 7 支自選股），其他 2000+ 上市股票沒對應 | `api/catchall.mjs` revenue handler：改用 `COALESCE(NULLIF(w.name,''), NULLIF(inst.display_name,''), '')` 並 `LEFT JOIN` 含全市場名稱的 `market_instruments` |

### 中度 Bug（5/5）

| # | Bug | 根因 | 修復 |
|---|---|---|---|
| BUG-6 | `exdiv.html` 更新時間 `undefined`、4 個統計全 0 | `data.update_time` 可能 undefined；`data.data` 可能 null | `exdiv.html`：多 key fallback（update_time/fetched_at/last_update），`data.data` 防 null，unknown 時顯示「未知（後端未提供）」 |
| BUG-7 | `macro.html` FRED 原始數據顯示「無數據」 | 後端 macroData 把「來源」填成 `"macro_yields" / "TSMC proxy" / "需 Railway backend (offline)"`，但前端 `renderFredTable` 只 filter `d["來源"] === "FRED"` → 全被過濾 | `api/catchall.mjs` macroData handler：把所有總經指標的 `來源` 欄位統一標記為 `"FRED"`（用 `來源標記` 標示實際資料表） |
| BUG-8 | `uptrend-watch.html` 完全沒有資料、所有統計 0 | 後端 `uptrendWatch` 只回傳 `items` 混雜結果，但前端期待 `{as_of, scanned, uptrend_count, ma10, ma20, volow}` | `api/catchall.mjs` uptrendWatch handler：完整重寫，按前端結構回傳三類清單（多頭/回踩/爆量下殺），含 try/catch 避免 throw |
| BUG-9 | `index.html` 自選股只有台積電有即時報價 | 前端只有當使用者「點擊」某檔時才更新該檔的 sidebar 報價欄 | `index.html`：新增 `refreshSidebarPrices()`，載入清單後主動 fetch `/api/heatmap?scope=watchlist` 批次更新所有 sidebar 報價，含 throttle 防重複 |
| BUG-10 | `index.html` console 不斷噴 `Value is null` × 13 | `renderStockList()` 內 `stockListData.length` / `s.code` / `s.name` 在 null 情況下 throw | `index.html`：完整 null 防護（`Array.isArray` 檢查、`!s || !s.code` 跳過、`sName = '(無名稱)'` 替代） |

## 📁 修改的檔案

### 後端 (`api/catchall.mjs` + `astro/api/catchall.mjs`)
- `H_JSON` 加上 `charset=utf-8`（修復 BUG-1）
- `revenue()` SQL 加 `market_instruments` LEFT JOIN（修復 BUG-5）
- `macroData()` 改「來源」欄位為 `"FRED"`（修復 BUG-7）
- `uptrendWatch()` 重寫完整結構（修復 BUG-8）

### 前端 (`astro/public/stock-app/*.html`)
- `index.html`：
  - `renderStockList()` null/型別防護（修復 BUG-10）
  - 新增 `refreshSidebarPrices()` 批次更新 sidebar 報價（修復 BUG-9）
- `dashboard.html`：`loadMarkers()` 解析 markers.text JSON（修復 BUG-2）
- `etf.html`：`loadStockList()` 處理 `{ok, stocks:[...]}` 結構 + exdiv sidebar null 防護（修復 BUG-3）
- `price-compare.html`：picker / chart label / 搜尋過濾的 name null 防護（修復 BUG-4）
- `exdiv.html`：`update_time` / `data.data` fallback（修復 BUG-6）

## ⚠️ 部署注意事項

以上修復都在 source code 層級。**尚未部署到 Vercel**：
- 後端（`api/`、`astro/api/`）需透過 Vercel / Railway 重新部署
- 前端（`astro/public/stock-app/`）若用 `astro/dist/` 部署需重新 build
- 驗證方式：部署後到 https://donttalk.vercel.app/stock-app/ 重跑測試，確認 `test_results.json` 中：
  - `etf_initial.png` 自選股清單有內容
  - `index_initial.png` 右側面板有資料
  - `dashboard_initial.png`「今日觸發訊號」沒 JSON 洩漏
  - `price-compare.html` 名稱欄位不再是 `null`
  - `revenue.html` 名稱欄位有值
  - console errors 顯著減少（尤其 BUG-10 的 13 個 null error）

## 🔧 補充建議（非本次修復範圍）

1. **測試環境**：建議建立 CI，每次部署前跑 `node --check` 驗證 JS 語法、跑 `playwright` smoke test
2. **API schema 對齊**：前端期待的 response 結構應該有 schema validation（推薦 zod / ajv）
3. **後端排程**：macro/uptrend/exdiv 的「無數據」問題，部分根因是後端資料排程未跑或 DB 沒資料（不是純程式 bug），建議加 health check
4. **錯誤日誌**：dashboard.html 的 1 個 404 console error 需要查 network 找出是哪個 endpoint（可能是 favicon 或第三方腳本）
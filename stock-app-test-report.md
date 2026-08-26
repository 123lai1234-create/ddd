# Stock-App 功能按鈕測試報告

**測試時間**：2026-08-13
**測試目標**：https://donttalk.vercel.app/stock-app/（共 21 個頁面）
**測試方式**：Playwright 自動化測試 + 視覺截圖驗證
**詳細結果**：`d:\project\test_results.json`
**截圖位置**：`d:\project\test_screenshots\`

---

## 嚴重 Bug（必修）

### 🔴 BUG-1：首頁右側個股資訊面板永遠是空的（index.html）
- **位置**：`/stock-app/index.html`
- **症狀**：點擊自選股清單中任何股票（聯發科 2454、鴻海 2317、富邦金 2881 等），中間 K 線圖有資料，但右側「個股介紹」、「基本資料」、「基本面」、「財務資訊」全部顯示 "-" 或空白。
- **截圖證據**：`test_screenshots/index_initial.png`
- **影響**：這是首頁最核心的個股分析功能，現狀等於壞掉。
- **可能原因**：右側資訊 fetch 失敗、API 回傳 null、或 DOM 渲染時機錯誤。

### 🔴 BUG-2：Dashboard「今日觸發訊號」顯示原始 JSON 程式碼
- **位置**：`/stock-app/dashboard.html`
- **症狀**：「今日觸發訊號 (12 項)」列表的每一行顯示：
  ```
  event  2330  買出 ||
  {"close":null,"ma5":null,"ma10":null...}
  ```
  這是後端回傳的原始 JSON 字串直接被插入 DOM，沒有格式化。
- **影響**：使用者看到的是程式碼而不是訊號內容，且資料幾乎都是 null。
- **截圖**：`test_screenshots/dashboard_initial.png`

### 🔴 BUG-3：etf.html 自選股清單完全空白
- **位置**：`/stock-app/etf.html`
- **症狀**：進入 ETF 版後，左側「自選股」標題下沒有任何股票（index.html 有 7 支，etf.html 是 0 支）。
- **Console Error**：`載入除權息側邊欄失敗: TypeError: data.forEach is not a function at https://donttalk.vercel.app/stock-app/etf:1847:14`
- **Page Error**：`Value is null` × 9 次
- **影響**：ETF 版無法瀏覽自選股，這是核心功能。

### 🔴 BUG-4：price-compare.html 所有股票名稱顯示 null
- **位置**：`/stock-app/price-compare.html`
- **症狀**：124 檔股票清單中，所有股票代號後面都顯示「null -」，例如：
  ```
  ☑ 0050 null -   ☑ 006205 null -   ☑ 006208 null -
  ```
- **影響**：完全無法辨識是哪支股票。

### 🔴 BUG-5：revenue.html 個股名稱欄位大部分空白
- **位置**：`/stock-app/revenue.html`
- **症狀**：「名稱」欄位只有少數幾檔有值（南亞科、川湖、華邦電），其他都是空白。
- **影響**：月營收資料難以辨識個股。

---

## 中度 Bug

### 🟡 BUG-6：exdiv.html 更新時間顯示 undefined、4 個統計都是 0
- **位置**：`/stock-app/exdiv.html`
- **症狀**：
  - 標題列「更新時間: undefined」
  - 明日除權息、本週除權息、本月除權息、總計都是 0
- **影響**：除權息資訊完全無法使用。

### 🟡 BUG-7：macro.html FRED 原始數據顯示「無數據」
- **位置**：`/stock-app/macro.html`
- **症狀**：雖然有「過渡觀察期」訊號與「殖利率過高」警示，但「FRED 總經原始數據」表格顯示「無數據」，「市場即時數據」也沒資料。
- **影響**：總經面板形同虛設，沒有歷史數據可看。

### 🟡 BUG-8：uptrend-watch.html 完全沒有資料
- **位置**：`/stock-app/uptrend-watch.html`
- **症狀**：
  - 掃描總數、上升趨勢檔數、回踩均線、爆量下殺 都是 0
  - 「本類目前無符合個股」
  - 「更新時間 -」
- **影響**：上升趨勢觀察功能完全沒資料。

### 🟡 BUG-9：首頁自選股只有台積電有即時報價
- **位置**：`/stock-app/index.html` 左側自選股清單
- **症狀**：7 支自選股中，只有台積電 (2330) 顯示「2435」，其他 6 支（聯發科 2454、鴻海 2317、元大台灣50 0050、富邦金 2881、國泰金 2882、玉山金 2884）右側報價欄全部顯示「-」。

### 🟡 BUG-10：首頁 console 不斷噴出 "Value is null"
- **位置**：`/stock-app/index.html`
- **症狀**：每次載入/操作都會出現 13+ 個 `Uncaught Error: Value is null` page error。
- **影響**：可能造成其他功能失效，需要查原始碼處理 null 檢查。

---

## 各頁面問題彙整

| 頁面 | 狀態 | 主要問題 |
|------|------|---------|
| index.html | 🔴 嚴重 | BUG-1, BUG-9, BUG-10，13 個 null error |
| dashboard.html | 🔴 嚴重 | BUG-2，1 個 404 console error |
| etf.html | 🔴 嚴重 | BUG-3，9 個 null error + data.forEach not a function |
| signal-filter.html | ✅ 正常 | 無明顯錯誤 |
| stock-damo-filter.html | ⚠️ 輕微 | 1 個 404 console error（點擊重新掃描時） |
| etf-filter.html | ⚠️ 輕微 | 1 個 404 console error（點擊重新掃描時） |
| uptrend-watch.html | 🟡 中度 | BUG-8，無資料，1 個 404 |
| sold-too-early.html | ✅ 正常 | 有資料、運作正常 |
| revenue.html | 🔴 嚴重 | BUG-5，個股名稱缺失 |
| conference.html | ⚠️ 已知問題 | 「法說會資料為空」(MOPS 改格式)，最後更新顯示「--」 |
| admin_logs.html | ✅ 正常 | 密碼保護，正常運作 |
| etf_holdings.html | ⚠️ 已知問題 | 「資料尚未自動匯入」說明原因（MOPS 沒 ETF bulk download） |
| etf_holdings_tracker.html | ⚠️ 已知問題 | 「快照資料為空」(ETF 沒有歷史 archive)，1 個 404 |
| etf_holdings_pivot.html | ✅ 正常 | 有說明 + 介面正常 |
| warming.html | ✅ 正常 | 「掃描完成，共 10 支觸發」 |
| exdiv.html | 🟡 中度 | BUG-6，全部 0 |
| macro.html | 🟡 中度 | BUG-7，「無數據」 |
| ai-capex.html | ✅ 正常 | 有圖表、資料正常 |
| heatmap.html | ⚠️ 輕微 | 部分文字標籤被截斷（+1.9...、+3...） |
| price-compare.html | 🔴 嚴重 | BUG-4，所有股票名稱 null |
| rebalance.html | ✅ 正常 | ETF 動態再平衡正常顯示 |

---

## 已知問題（已於頁面上說明，非 bug）

1. **conference.html**：法說會資料因 MOPS 改格式而無法自動抓取，需手動查 PDF。
2. **etf_holdings.html**：ETF 月報成分股資料需要 per-issuer 爬蟲，目前未實作。
3. **etf_holdings_tracker.html**：ETF 沒有歷史 archive，只能抓到最新一期。

---

## 建議優先處理順序

1. **BUG-1**（首頁右側個資面板）：最核心功能，需立即修復
2. **BUG-2**（Dashboard JSON 洩漏）：使用者體驗嚴重扣分
3. **BUG-3**（etf.html 自選股清單）：核心功能壞掉
4. **BUG-4**（price-compare 名稱 null）：完全無法使用
5. **BUG-5**（revenue 名稱空白）：資料辨識困難
6. **BUG-6 ~ BUG-8**（exdiv/macro/uptrend-watch 無資料）：檢查後端 API 與排程
7. **BUG-10**（console null error）：根因排查

---

## 附加發現

- 首頁點擊「啟動盤中監控」按鈕會造成頁面長時間 polling，可能需檢查是否有 cancel 機制。
- 「事件標記」按鈕點擊後無明顯視覺反應，需確認 marker 是否實際繪製。
- dashboard.html 的「漲幅 Top 5」/「跌幅 Top 5」標題下的子項目顯示 +0.00%，懷疑排序邏輯有誤。
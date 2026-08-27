# 🔍 https://donttalk.vercel.app/stock 測試報告

## 📋 測試環境
- **測試時間**：2026-08-13 上午 9:43-9:54
- **測試工具**：Puppeteer (900x600) + Node.js API 探測 + 源碼審查
- **頁面版本**：iframe 嵌入 `/stock-app/index.html`

---

## ✅ 後端 API 狀態（全部正常）

| API 端點 | 狀態 | 回應時間 | 回應大小 |
|---------|------|---------|---------|
| `/api/healthz` | ✅ 200 | 1356ms | 43B |
| `/api/stocks` | ✅ 200 | 402ms | 6372B |
| `/api/macro_news` | ✅ 200 | 325ms | 37557B |
| `/api/scan` | ✅ 200 | 1532ms | 8811B |
| `/api/foreign_futures?days=30` | ✅ 200 | 877ms | 42082B |
| `/api/index_institutional?days=5` | ✅ 200 | 515ms | 621B |
| `/api/market_gaps?lookback=60&min_gap=0.3` | ✅ 200 | 532ms | 7868B |
| `/api/overnight_signal` | ✅ 200 | 465ms | 3081B |
| `/api/intraday_scan/status` | ✅ 200 | 396ms | 137B |
| `/api/stock/2330?days=120` | ✅ 200 | - | 33664B（120 筆 K 線） |

**結論**：後端 100% 正常，問題集中在前端。

---

## 🐛 發現的 Bug（按嚴重程度排序）

### 🔴 BUG #1：圖表只渲染在右下角小區域（嚴重）

**症狀**：
- 從 `/stock`（iframe）訪問時，圖表區域大約 250×200 px 大部分空白，只有右下角顯示 K 線
- 即使後端回傳 120 筆完整 K 線資料，圖表仍只佔用容器的一小部分

**根本原因**：
- `initChart()` 在 `window.addEventListener("load", ...)` 內執行
- 此時 `chart-container.clientWidth/clientHeight` 可能尚未取得正確值
- `c.clientWidth, c.clientHeight` 在初始化時是 iframe 內的視窗大小，但因 iframe 高度設定為 `position: absolute; inset: 0`，可能計算不正確
- LightweightCharts 在初始化後不會自動跟隨容器尺寸變化，除非 `ResizeObserver` 觸發

**修復建議**：
```javascript
// 在 initChart() 後延遲重新設定尺寸
function initChart() {
  // ... 現有程式碼 ...
  
  // ★ 延遲再設定一次尺寸，避免初始化時取得錯誤值
  requestAnimationFrame(function() {
    if (chart) {
      chart.applyOptions({ 
        width: c.clientWidth, 
        height: c.clientHeight 
      });
    }
  });
  
  // ★ 監聽 iframe 內視窗大小變化（不只容器）
  window.addEventListener('resize', function() {
    if (chart) {
      chart.applyOptions({ 
        width: c.clientWidth, 
        height: c.clientHeight 
      });
    }
  });
}
```

---

### 🔴 BUG #2：頁面標題垂直排列（嚴重 RWD bug）

**症狀**：
- 左側的 `📊 台股均線買賣訊號系統` 9 個中文字垂直堆疊（直書）
- 這個問題在 900×600 viewport 下出現（> 768px）

**根本原因**：
- header 容器寬度受限，加上 `flex: 1; min-width: 0`，導致 h1 容器被擠壓
- 缺少 `writing-mode: horizontal-tb` 強制設定
- 或 h1 缺少 `white-space: nowrap`，中文被迫換行成單字垂直

**修復建議**：
```css
.header h1 {
  font-size: 18px;
  background: linear-gradient(90deg, var(--blue), var(--purple));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;           /* ★ 新增：強制不換行 */
  writing-mode: horizontal-tb;   /* ★ 新增：強制水平書寫 */
  flex-shrink: 0;                /* ★ 新增：不被擠壓 */
}
```

---

### 🟡 BUG #3：Favicon 404（中度）

**症狀**：
- Console 出現 `GET /stock-app/static/favicon.svg 404`
- 影響：分頁標籤、書籤圖示消失

**根本原因**：
- HTML line 70-71 引用 `static/favicon.svg`
- 但 `astro/public/stock-app/` 目錄內沒有 `static/` 子目錄
- 沒有任何 favicon 檔案存在

**修復建議**（二選一）：
1. **建立目錄並放置 favicon**：
   ```bash
   mkdir d:\project\astro\public\stock-app\static
   # 把 favicon.svg 放到該目錄
   ```
2. **修改 HTML 改用正確路徑**：
   ```html
   <link rel="icon" type="image/svg+xml" href="/stock-app/favicon.svg">
   ```

---

### 🟡 BUG #4：搜尋框被裁切（中度 UX bug）

**症狀**：
- 左側 sidebar 的「🔍 搜尋股票...」輸入框右側被裁切
- 看不到輸入框的完整邊框和右側 padding

**根本原因**：
- sidebar 在 RWD 模式下 `display: flex; overflow-x: auto`
- 搜尋框可能被 `.search-box` 的 `padding: 8px 12px` 影響，內部 input 的 `width: 100%` 計算包含 padding，導致溢出

**修復建議**：
```css
.search-box input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--bdr);
  color: var(--txt);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;   /* ★ 確保 padding 算入 width */
  max-width: 100%;          /* ★ 新增 */
}
```

---

### 🟢 BUG #5：API 對 HEAD 請求回 404（輕微）

**症狀**：
- `HEAD /api/stock/2330` 回 404
- 但 `GET /api/stock/2330` 正常回 200

**根本原因**：
- 沒有處理 HEAD 請求的路由

**修復建議**（後端）：
```javascript
// Astro/Next API route
export async function HEAD(request) {
  return new Response(null, { status: 200 });
}
```

---

### 🟢 BUG #6：日文日期顯示為「114/11/12」（輕微資料問題）

**症狀**：
- API 回傳的 date 欄位是 `114/11/12`（民國年）而非西元年

**根本原因**：
- 後端格式化時間為 `114/11/12`（民國 114 年 = 西元 2025 年）

**修復建議**：
- 後端改用 ISO 格式 `2025-11-12`
- 或前端增加民國年轉西元年邏輯

---

### 🟢 BUG #7：被註解掉的程式碼殘留（程式碼品質）

**位置**：
- `astro/public/stock-app/index.html` line 2627-2631
```javascript
// // 頁面載入時執行
// window.addEventListener('load', () => {
//   loadExdivSidebar();
//   // 每 30 分鐘更新一次
//   setInterval(loadExdivSidebar, 30 * 60 * 1000);
// });
```

**修復建議**：刪除被註解程式碼，或使用版本控制（Git）追蹤歷史。

---

## 💡 優化建議

### ⚡ OPT #1：API 請求效能優化

**觀察**：頁面載入時同時觸發多個 API 請求：
- `/api/stock_list`
- `/api/market_gaps`
- `/api/stocks`
- `/api/stock_industry`
- `/api/macro_news`
- `/api/stock/2330?days=120&strategy=original`

**建議**：
1. 將多個獨立請求合併成 GraphQL 或單一聚合端點
2. 加入請求去重（debounce）
3. 加入 HTTP 快取頭（如 `Cache-Control: max-age=60`）

---

### ⚡ OPT #2：圖表渲染效能

**觀察**：
- 每次切換股票都呼叫 `chart.applyOptions({width, height})`
- 但沒看到 `chart.timeScale().fitContent()` 的呼叫在更新時

**建議**：
```javascript
// 切換股票後應該呼叫 fitContent
chart.timeScale().fitContent();
```

---

### ⚡ OPT #3：分頁瀏覽器支援

**觀察**：
- 使用 ES2017+ 語法（如 `async/await`、`Object.assign`）
- 程式碼沒有被 Babel/TypeScript 編譯

**建議**：
- 在 `index.html` 加入 `<script type="module">` 標籤，確保舊版瀏覽器不會執行
- 或編譯為 ES5 以支援 IE11/舊版 Edge

---

### ⚡ OPT #4：錯誤處理優化

**觀察**：
- 從 console 沒有看到錯誤（線上版本）
- 但從本地測試 (`file://`) 看到「❌ 載入 2330 失敗: Failed to fetch」

**建議**：
1. 加入 Service Worker 提供離線快取
2. 加入 retry 機制
3. 顯示更友善的錯誤訊息（包含診斷步驟）

---

### ⚡ OPT #5：無障礙性 (Accessibility) 改善

**觀察**：
- 大量 emoji 用於按鈕（📊、📈、🔍 等）
- 但缺少 `aria-label` 屬性
- 顏色對比可能不夠（深色主題 + 紫色按鈕）

**建議**：
```html
<button aria-label="搜尋股票">🔍 搜尋股票...</button>
<button aria-label="加權指數">📈 加權</button>
```

---

## 📊 測試摘要

| 項目 | 狀態 |
|------|------|
| 後端 API | ✅ 全部正常 |
| 健康狀態指示器 | ✅ 「後端已連線」綠色 |
| 新聞跑馬燈 | ✅ 正常更新（每 15 分鐘） |
| 股票切換 | ✅ 可切換（聯發科、台積電等） |
| 圖表渲染 | ❌ 只渲染小區域（**主要 Bug**） |
| 頁面標題 | ❌ 垂直排列（**主要 Bug**） |
| 搜尋框 | ⚠️ 被裁切 |
| Favicon | ❌ 404 |
| Console Errors | ✅ 無錯誤（線上版） |

---

## 🎯 優先修復建議

1. **🔴 立即修復**：BUG #1（圖表渲染問題）— 直接影響核心功能
2. **🔴 立即修復**：BUG #2（標題垂直排列）— 影響所有使用者的第一印象
3. **🟡 短期修復**：BUG #3（Favicon 404）— 簡單修復，提升專業度
4. **🟡 短期修復**：BUG #4（搜尋框裁切）— 影響可用性
5. **🟢 長期優化**：OPT #1-#5

---

## 📁 相關檔案

- **頁面容器**：`d:\project\astro\src\pages\stock.astro`（157 行）
- **主應用**：`d:\project\astro\public\stock-app\index.html`（8433 行）
- **健康檢查**：內嵌於 `stock.astro`
- **圖表函式庫**：`https://unpkg.com/lightweight-charts@4.1.1/...`（CDN）
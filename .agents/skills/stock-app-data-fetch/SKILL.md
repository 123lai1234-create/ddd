---
name: stock-app-data-fetch
description: "D:\\project stock-app 個股 / ETF / 大盤 資料抓取硬規則。當用戶說「個股」「台積電」「stock-app」「API 抓不到」「2330」「symbol 對不上」「cache 還是舊的」「股票 404」「ETF 看不到」「00675L」時使用。涵蓋個股只走 donttalk.vercel.app/api/stock/<ticker> 絕不 fallback Yahoo、大盤指數和 ETF 才用 Yahoo、2330 預設陷阱、Vercel edge cache 把不同代號搞混、cache-buster 必帶 Date.now() 不能用固定常數、stockKlines SQL filter 漏 ETF、UTF-8 cover/mv 是物件不是字串、stock-app HTML 同步。應用：D:\\project astro/public/stock-app/* 任一頁 / 個股 bot / 個股 API 修改。"
license: MIT
metadata:
  author: donttalk-deploy
  version: "1.0.0"
  priority: critical
  tags:
    - stock-app
    - api
    - yahoo-finance
    - 2330
    - cache
    - etf
    - hard-rule
    - donttalk
---

# Stock-App Data Fetch（D:\project 硬規則）

> **硬規則**（2026-07-06 起）：個股（50 檔大型股）只抓 `https://donttalk.vercel.app/api/stock/<ticker>`，**不准** fallback Yahoo Finance。大盤指數跟 ETF 才用 Yahoo。

## 資料源分流

| 類型 | 來源 | 為什麼 |
|---|---|---|
| **個股**（2330 / 2454 / 2317 等 50 檔） | `https://donttalk.vercel.app/api/stock/<ticker>` | 統一後端、靜默 2330 fallback 陷阱、edge cache 控管 |
| **大盤指數**（^TWSE / ^TWO） | Yahoo Finance v8/chart | donttalk 後端沒這些 |
| **ETF**（0050 / 0056 / 00878 / 00675L） | Yahoo Finance v8/chart | donttalk 後端沒 ETF |
| **加密貨幣**（BTC-USD / ETH-USD） | Yahoo Finance v8/chart | donttalk 後端沒 |
| **外匯**（USDTWD=X / USDJPY=X） | Yahoo Finance v8/chart 或 Frankfurter | USD↔TWD 走 Yahoo chart |

## 個股 API 呼叫

### 正確 pattern

```js
const ticker = '2330';
const url = `https://donttalk.vercel.app/api/stock/${ticker}?_=${Date.now()}`;
const d = await fetch(url).then(r => r.json());

// 1. 守衛 1: symbol 對齊（防 2330 fallback 陷阱）
if (d.symbol !== ticker) {
  throw new Error(`Symbol mismatch: requested ${ticker}, got ${d.symbol}`);
}

// 2. 守衛 2（建議）: name 對齊已知清單
const known = { '2330': '台積電', '2454': '聯發科' };
if (known[ticker] && d.name !== known[ticker]) {
  throw new Error(`Name mismatch: ${ticker} expected ${known[ticker]}, got ${d.name}`);
}
```

### ❌ 不要的 pattern

```js
// 1. 不要 fallback Yahoo
const d = ticker in LARGE_STOCKS
  ? await fetch(`/api/stock/${ticker}`).then(r => r.json())
  : await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`).then(r => r.json());

// 2. 不要用固定 cache-buster
const url = `/api/stock/${ticker}?_=1`;  // ❌ Vercel 用 query 當 cache key，連兩次還是 cache hit

// 3. 不要比 symbol
const d = await fetch(`/api/stock/${ticker}`).then(r => r.json());
// 沒 if (d.symbol === ticker) 守衛 → 9999.TW 會拿到 2330 資料
```

## 三個必踩陷阱

### 陷阱 1：未收錄 ticker 偷回 2330

**症狀**：打到 backend 沒列入 universe 的 ticker（例如 `9999.TW`），後端**靜默回傳 2330 的資料**（名稱、價格、圖都對應 2330），不是 404 / error。

**根因**：backend 對 unknown ticker 預設 fallback 到 2330（看起來是開發期 mock 沒清掉）。

**修法**：前端必加 `if (d.symbol !== ticker) throw`。

**根本修法**（TODO，建議下次後端改）：server 端在 universe 沒命中時回 `404 Not Found` 而不是 fallback。

### 陷阱 2：Vercel edge cache 把不同代號 response 搞混

**症狀**：`/api/stock/2330` 跟 `/api/stock/2454` 在 Vercel edge cache 偶爾會拿到同一份 response（Vercel 的 cache key 在某些情況下沒把 path 完全區分開，或 cache hit 條件出 bug）。

**修法**：每次都帶 cache-buster query param：

```js
const url = `/api/stock/${ticker}?_=${Date.now()}`;
```

**重要**：cache-buster 一定要每次都不一樣（用 `Date.now()` 或 `crypto.randomUUID()`），絕對不能用固定常數（例如 `?_=1`），否則 Vercel 還是用 query param 當 cache key → 連兩次相同 ticker 還是 cache hit。

如果還遇到 stale data，加 `cache: 'no-store'` 或帶 `Cache-Control: no-cache` header request。

### 陷阱 3：個股取不到時的 UX

如果 donttalk 後端暫時抓不到某檔個股，bot 顯示「**資料不可用**」（placeholder card），**絕對不**偷偷 fallback 到 Yahoo。完全遵守「個股只取本人網站」的硬規則。

## ETF / 大盤走 Yahoo v8/chart

```js
const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=5d&interval=1d`;
const r = await fetch(url).then(r => r.json());
const meta = r.chart.result[0].meta;
// meta.regularMarketPrice, meta.chartPreviousClose, meta.currency
```

支援狀況（2026-08 確認）：

- TW 個股（`2330.TW`、`2454.TW`）✅
- 指數（`^TWSE`、`^TWO`）❌ 回空資料
- 加密貨幣（`BTC-USD`、`ETH-USD`、`SOL-USD`）✅
- 外匯（`USDTWD=X`、`USDJPY=X`）✅

`convertCurrency` endpoint 死（500 errors）。改用 Frankfurter：

```js
'https://api.frankfurter.app/latest?from=USD&to=EUR&amount=100'
```

⚠️ Frankfurter **不支援 TWD**，USD↔TWD 改用 Yahoo chart 的 `USDTWD=X`。

`v7/finance/quote` 已死（401 Unauthorized，連 browser User-Agent 都拒），**不要用**。

## stockKlines SQL filter 漏 ETF（已修，但要知道）

**症狀**：
- 0050 看得到（DB 對 0050 剛好有 yahoo_v8 source 把它視為 `asset_type='stock'` insert，243 條 row）
- 0056 / 00878 / 00675L 看不到（純 ETF，DB 只有 `asset_type='etf'` row）
- Network panel 一排 `GET /api/stock/<ticker>?days=120 400` 是因為 regex `^\d{4,6}$` 不接受英文字母 L/R/B

**修法**（`astro/api/catchall.mjs:290` 已改 OR 條件）：

```sql
WHERE symbol = $1
  AND trade_date IS NOT NULL
  AND (
    (asset_type = 'stock' AND market = 'TWSE')
    OR asset_type = 'etf'
  )
```

配套 fix（已 commit）：
- `46566859` — stockKlines SQL 改 OR
- `9f33894d` — etf.html `loadStock()` 加 `if (!data.latest)` guard
- `25e506e8` — `^\d{4,6}$` → `^[A-Za-z0-9]{4,7}$` regex

## stock-app HTML 同步

`astro/public/stock-app/` 整個資料夾被當靜態資產 serve。`index.html` 上有 16+ 個 nav 按鈕，每個點下去是 `window.location.href = '<page>.html'` 直跳：

```
etf.html, warming.html, macro.html, signal-filter.html, etf-filter.html,
etf_holdings.html, etf_holdings_pivot.html, etf_holdings_v2.html, ...,
sold-too-early.html, uptrend-watch.html, heatmap.html, price-compare.html,
rebalance.html, ai-capex.html, revenue.html, conference.html, admin_logs.html,
marker_history.html, stock-damo-filter.html
```

任何一個缺，每個 nav click → 404。

**Canonical source**：`D:\project\dontalk-import\artifacts\portfolio\public\stock-app\`

驗證 + 修：

```powershell
$src = Get-ChildItem "D:\project\dontalk-import\artifacts\portfolio\public\stock-app" -File -Recurse | Select -ExpandProperty FullName
$dst = Get-ChildItem "D:\project\astro\public\stock-app" -File -Recurse | Select -ExpandProperty FullName
Compare-Object $src $dst
```

複製時**跳過 `index.html` 跟 `sitemap.html`** — 兩個 source 都有，但 `astro/public/stock-app/index.html` JT 會直接編，可能比較新。也別忘了 `static/` 子資料夾。

## stock-app HTML 改 bot 邏輯時要記得

- 改 fetch URL → 全 16 個頁面都要 update（共用同一段 inline JS / 引用同一個 shared helper）
- 改 data shape → `index.html` 的 render 跟其他頁的 chart init 都會受影響
- 改 cache 策略 → 重新檢視 50 檔個股的 ticker 列表有沒有進 universe

## music-player.js：cover/mv/image 可能是物件不是字串

`playlist.json` 裡 `track.cover` 是 `{local, cdn, ...}` 物件（不是純字串）。

**症狀**：
- Console: `[ERROR] 404 @ https://.../[object%20Object]`
- DOM: `<img src=".../%5Bobject%20Object%5D">` 破圖

**防禦 pattern**：

```js
const coverUrl = typeof track.cover === 'string'
  ? track.cover
  : (track.cover?.cdn || track.cover?.local || '');
```

**規則**：任何 JS code 讀 `track.*` 欄位都要先檢查 shape。`track.cover`、`track.mv`、`track.image`、`track.thumbnail` 都有可能 object。改動前先 `console.log(typeof pl.tracks[0].cover, pl.tracks[0].cover)` 確認。

## seed_missing_klines.py（DB 補 K 線歷史）

TWSE `STOCK_DAY_ALL` 只回當天 CSV，沒歷史。要 backfill 從 TWSE per-stock `STOCK_DAY?date=YYYYMMDD&stockNo=<code>`（每月 1 次 HTTP call 回 1 個月資料）。

`scripts/seed_missing_klines.py`：
- 自動偵測 watchlist + etf_watchlist 中 `COUNT(*) < 30` 的 ticker
- 對每個抓最近 6 個月（≈120 交易日）
- 經 TWSE `/exchangeReport/STOCK_DAY?response=json` 拿 batch → upsert `market_price_bars`（Neon HTTP SQL + UNNEST bulk insert）
- 寫死 stockKlines 回傳 `twse_STOCK_DAY` source_name

```powershell
python scripts\seed_missing_klines.py --dry-run  # 列出缺資料的 tickers
python scripts\seed_missing_klines.py --tickers 0056 00878  # 補指定
python scripts\seed_missing_klines.py  # auto-detect + 補全部
```

⚠️ 不要靠這 script 救 regex bug — 真正的 root cause 是 stockKlines SQL filter。

## References

- [`01-symbol-mismatch-guard.md`](references/01-symbol-mismatch-guard.md) — 2330 fallback 陷阱細節、symbol 比對強化
- [`02-edge-cache-buster.md`](references/02-edge-cache-buster.md) — Vercel edge cache 為何搞混、Date.now() vs 固定常數
- [`03-yahoo-v8-migration.md`](references/03-yahoo-v8-migration.md) — v7→v8 遷移、Frankfurter 取代 convertCurrency、指數 / 加密 / 外匯支援狀況
- [`04-stockapp-html-sync.md`](references/04-stockapp-html-sync.md) — 16 個 nav 頁面同步 SOP、copy 跳過規則

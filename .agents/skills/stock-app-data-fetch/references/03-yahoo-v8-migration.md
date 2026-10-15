# Yahoo Finance v7 → v8 遷移（細節）

## v7 已死

```js
'https://query1.finance.yahoo.com/v7/finance/quote?symbols=AAPL'
// 401 Unauthorized（連 browser User-Agent 都拒）
```

`v7/finance/quote` 完全死掉。連 basic auth / 帶 referer header / 假裝 browser 都拿不到。

## v8 還活著

```js
'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=5d&interval=1d'
// 200 OK
```

Response 結構：

```json
{
  "chart": {
    "result": [{
      "meta": {
        "longName": "Apple Inc.",
        "shortName": "AAPL",
        "regularMarketPrice": 178.5,
        "chartPreviousClose": 176.0,
        "previousClose": 176.0,
        "currency": "USD",
        "fullExchangeName": "NASDAQ",
        "regularMarketTime": 1697357400
      },
      "timestamp": [1697357400, ...],
      "indicators": {
        "quote": [{ "open": [...], "high": [...], "low": [...], "close": [...], "volume": [...] }]
      }
    }]
  }
}
```

關鍵欄位（給前端用）：

- `meta.regularMarketPrice` — 現價
- `meta.chartPreviousClose` / `meta.previousClose` — 前日收盤（changePct 計算用）
- `meta.currency` — USD / TWD
- `meta.fullExchangeName` — 顯示用
- `meta.shortName` / `meta.longName` — 股票名
- `timestamp[]` — UNIX timestamp array
- `indicators.quote[0].close[]` — 收盤價 array（candle 線）

## 支援狀況（2026-08 確認）

| Ticker 類型 | 範例 | 支援 |
|---|---|---|
| TW 個股 | `2330.TW`, `2454.TW` | ✅ |
| TW ETF | `0050.TW`, `0056.TW`, `00878.TW`, `00675L.TW` | ✅ |
| 大盤指數 | `^TWSE`, `^TWO` | ❌ 回空資料 |
| 美股 | `AAPL`, `TSLA`, `NVDA` | ✅ |
| 加密貨幣 | `BTC-USD`, `ETH-USD`, `SOL-USD` | ✅ |
| 外匯 | `USDTWD=X`, `USDJPY=X` | ✅ |

指數沒資料 → 改用其他源：
- TWSE 官方：`https://www.twse.com.tw/IndicesPrint/MI_5MINS_HIST?response=json`
- 或自己算（用成分股加權）

## convertCurrency 已死

`https://query1.finance.yahoo.com/v7/finance/convertCurrency` → 500 errors。

替代：**Frankfurter**（ECB reference rates）：

```js
'https://api.frankfurter.app/latest?from=USD&to=EUR&amount=100'
// { "amount": 100, "base": "USD", "date": "2026-08-15", "rates": { "EUR": 91.42 } }
```

⚠️ **Frankfurter 不支援 TWD**（ECB 沒台幣）。USD↔TWD 改用：

```js
'https://query1.finance.yahoo.com/v8/finance/chart/USDTWD=X?range=1d&interval=1d'
// meta.regularMarketPrice = 31.85 → 1 USD = 31.85 TWD
```

## CORS

Yahoo v8 對 browser request 有 CORS 限制 — 但**沒限制** server-side / Node.js request。

前端直接 fetch v8 會 CORS 失敗。改用：
1. 後端 proxy（已在 `astro/api/catchall.mjs`）
2. 或 Vercel Edge function 轉一道

## Rate limit

Yahoo 沒公開 rate limit，但**建議**一個 IP 每分鐘 < 60 request。

前端 50 檔個股 refetch 1 次 = 50 request / 60s 邊緣，但每個帶 `?_=${Date.now()}` → Vercel edge function 50 invocation → **不要每 1s refetch**。

stock-app 設計：每 60s refetch 一次，或 user 手動 refresh。

## 部署後的 client-side fetch 限制

某些 Vercel edge region 對 Yahoo request 失敗（地域 firewall）：

```
TypeError: Failed to fetch
```

Fallback：client 端直接打 Yahoo v8（成功率通常 80%+），失敗就顯示「暫時無法取得報價」。

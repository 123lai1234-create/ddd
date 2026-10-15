# 2330 Symbol Mismatch 陷阱（細節）

## 完整問題鏈

1. **使用者**在 `astro/public/stock-app/stock-detail.html` 輸入 `9999.TW`（假 ticker）
2. **前端** fetch `/api/stock/9999.TW`（或外部 donttalk.vercel.app）
3. **後端** catchall router 對 9999.TW 找不到 universe entry → **silently fallback 到 2330**（dev 期間 mock 邏輯沒清）
4. **response**：
   ```json
   {
     "symbol": "2330",
     "name": "台積電",
     "price": 580.0,
     "chart": [...2330 candles...]
   }
   ```
5. **前端** 沒 `if (d.symbol === ticker)` 守衛 → 直接 render
6. **使用者** 看到「9999.TW 台積電 $580」→ 嚴重 silent data corruption

## 修法層級

### 層級 1 — 前端守衛（已加，2026-07-06）

```js
const d = await fetch(`/api/stock/${ticker}?_=${Date.now()}`).then(r => r.json());
if (d.symbol !== ticker) {
  throw new Error(`Symbol mismatch: requested ${ticker}, got ${d.symbol}`);
}
```

### 層級 2 — 前端 name 守衛（建議加）

```js
const KNOWN = {
  '2330': '台積電',
  '2454': '聯發科',
  '2317': '鴻海',
  // ... 50 檔 large-cap
};
if (KNOWN[ticker] && d.name !== KNOWN[ticker]) {
  throw new Error(`Name mismatch: ${ticker} expected ${KNOWN[ticker]}, got ${d.name}`);
}
```

防 symbol 對但內容混（罕見但發生過，例如 backend bug 寫錯 row）。

### 層級 3 — 後端根本修（TODO）

```js
// astro/api/catchall.mjs 的 stockKlines handler
if (!UNIVERSE.has(ticker)) {
  return res.status(404).json({ error: 'ticker not in universe', ticker });
}
```

後端改 source-of-truth > 在前端 sanitize。前端守衛是過渡期。

## Universe 清單位置

`astro/api/catchall.mjs` 內 hard-code 50 檔：

```js
const UNIVERSE = new Set([
  '2330', '2454', '2317', '2303', '2308', /* ... */
]);
```

或從 `watchlist` DB table 讀。

驗證：

```powershell
Select-String -Path "astro\api\catchall.mjs" -Pattern "UNIVERSE|universe|set\(.*2330" | Select-Object -First 5
```

## Edge case：ticker 含英文字母

修正前 regex `^\d{4,6}$` 不接受 `00675L`（反型 ETF）。`^[A-Za-z0-9]{4,7}$` 接受。

```js
const isValidTicker = /^[A-Za-z0-9]{4,7}$/.test(ticker);
if (!isValidTicker) throw new Error(`Invalid ticker format: ${ticker}`);
```

## Edge case：ticker 加後綴

- 個股：`2330.TW` / `2454.TWO`
- 大盤指數：`^TWSE` / `^TWO`
- Yahoo：`2330.TW` 加 `.TW` / `.TWO` 後綴
- donttalk backend：直接 `2330` 沒後綴

前端要 normalize：

```js
function normalizeTicker(t) {
  // donttalk backend 用無後綴
  return t.replace(/\.(TW|TWO)$/, '');
}
```

呼叫 backend 用 `normalizeTicker(t)`，顯示給使用者用原 `t`。

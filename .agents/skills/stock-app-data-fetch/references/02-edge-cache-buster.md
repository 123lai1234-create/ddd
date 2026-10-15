# Vercel Edge Cache Buster 細節

## 問題

`/api/stock/2330` 跟 `/api/stock/2454` 在 Vercel edge cache 偶爾會拿到同一份 response（Vercel 的 cache key 在某些情況下沒把 path 完全區分開，或 cache hit 條件出 bug）。

**症狀**：
- 同時開兩個分頁分別看 2330 / 2454
- 其中一個 refetch（手動 / auto-refresh）
- 另一個被 Vercel 邊緣 cache 影響，**內容變成剛 refetch 那一個的**

這在 Vercel Edge Network / CDN 是偶發 bug，**不是 100% 重現**，但發生時 silent data corruption（看 2454 結果顯示 2330 的資料）。

## 修法

### 每次帶 cache-buster

```js
const url = `https://donttalk.vercel.app/api/stock/${ticker}?_=${Date.now()}`;
const d = await fetch(url).then(r => r.json());
```

### ❌ 不要用固定常數

```js
const url = `/api/stock/${ticker}?_=1`;  // ❌ Vercel 還是用 query 當 cache key
```

Vercel 把 query string 視為 cache key 一部分。固定常數 `_=1` 讓所有相同 path 的 request 都被視為相同 cache key → 連兩次相同 ticker 還是 cache hit。

**一定要用每次都不一樣的值**：`Date.now()` / `crypto.randomUUID()` / `performance.now()`。

### 加 `cache: 'no-store'`（保險）

```js
const d = await fetch(url, { cache: 'no-store' }).then(r => r.json());
```

繞過瀏覽器 HTTP cache（注意：這只影響 client cache，不影響 Vercel edge cache）。

### 加 `Cache-Control: no-cache` header request

```js
const d = await fetch(url, {
  headers: { 'Cache-Control': 'no-cache' },
}).then(r => r.json());
```

對某些 Vercel edge node 有效。

## 部署新版本後 stale

改完 backend 部署後，前端 cache-buster 仍可能拿到舊的：

1. **Vercel edge cache**：TTL 通常 60s
2. **Cloudflare CDN**（如有）：TTL 較長
3. **瀏覽器 HTTP cache**：`cache: 'no-store'` 跳過

部署完等 60s 再驗證，或 hard reload (Ctrl+Shift+R)。

## 驗證 cache-buster 生效

```js
const t = Date.now();
const r1 = await fetch(`/api/stock/2330?_=${t}`).then(r => r.json());
const r2 = await fetch(`/api/stock/2454?_=${t}`).then(r => r.json());
console.log('2330:', r1.symbol, r1.name);  // 應 "2330" "台積電"
console.log('2454:', r2.symbol, r2.name);  // 應 "2454" "聯發科"
```

不同 ticker 應該永遠拿到對應 symbol / name。如果 r1.name 是「聯發科」→ cache 還在搞混。

## WebSocket / SSE 替代方案（高頻更新場景）

如果每 1-5s 要 refetch，cache-buster 大量 query 浪費 Vercel function invocation：

```js
const evtSource = new EventSource(`/api/stock-stream?symbols=2330,2454`);
evtSource.onmessage = (e) => {
  const data = JSON.parse(e.data);
  // data = {2330: {...}, 2454: {...}}
};
```

但需要 backend 支援 SSE，且 Vercel Edge function SSE 有限制（maxDuration 30s）。目前 stock-app 沒走 SSE，cache-buster 方案夠用。

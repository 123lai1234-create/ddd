# LINE Webhook HMAC 細節

## HMAC 算法

LINE 用 **HMAC-SHA256** of **raw request body** (UTF-8 bytes) → **base64-encoded**：

```
signature = base64(HMAC-SHA256(channel_secret, raw_body))
```

Header: `x-line-signature: <signature>`

**注意**：HMAC 的輸入是 body bytes 本身，**不是** body + secret（這跟某些 SDK 教學寫法不同 — `body+secret` 是錯的）。

## 驗證程式

```js
import crypto from 'node:crypto';

function getRawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (typeof req.rawBody === 'string') return Buffer.from(req.rawBody, 'utf8');
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function verifyLineSignature(req, channelSecret) {
  const sig = req.headers['x-line-signature'];
  if (!sig) return false;
  const body = await getRawBody(req);
  const expected = crypto.createHmac('sha256', channelSecret)
    .update(body)
    .digest('base64');
  return crypto.timingSafeEqual(
    Buffer.from(sig, 'base64'),
    Buffer.from(expected, 'base64')
  );
}
```

`crypto.timingSafeEqual` 防止 timing attack。

## 為什麼不能用 `JSON.stringify(req.body)`

Vercel Node runtime 在進入 handler 前 parse body：

- `req.body` 是已解析的 JS object
- `req.rawBody` 通常是 undefined

如果用：

```js
// ❌ 永遠算不對
const sig = crypto.createHmac('sha256', secret)
  .update(JSON.stringify(req.body))
  .digest('base64');
```

`JSON.stringify(req.body)` 重新序列化：
- key 順序可能變（V8 不保證 object key 順序）
- 空白、number formatting 跟 client 簽的 bytes 不一樣
- HMAC 結果一定不對

**修法**：一定要讀 raw request stream。

## Express 內 HMAC 驗證

```ts
// api-server-src/src/routes/line.ts
import express, { Request, Response } from 'express';
import crypto from 'node:crypto';

const router = express.Router();

router.post('/webhook', async (req: Request, res: Response) => {
  // req.rawBody 是 Buffer（從 express.raw() middleware 設的）
  const signature = req.headers['x-line-signature'] as string;
  const expected = crypto.createHmac('sha256', process.env.LINE_CHANNEL_SECRET!)
    .update(req.rawBody)
    .digest('base64');
  
  if (signature !== expected) {
    return res.status(401).send('invalid signature');
  }
  
  // 處理 events
  const body = JSON.parse(req.rawBody.toString('utf8'));
  for (const event of body.events) {
    await handleEvent(event);
  }
  
  res.status(200).send('OK');
});
```

`app.use('/api/line/webhook', express.raw({ type: '*/*' }), (req, res, next) => { req.rawBody = req.body; next(); })` 把 Buffer 存到 `req.rawBody`。

## PowerShell 測試

```powershell
$env:LINE_CHANNEL_SECRET = "test-secret-1234567890abcdef"
$body = '{"events":[{"type":"message","source":{"userId":"U1234"},"message":{"type":"text","text":"test"}}]}'

# 算 HMAC（base64）
$hmac = [System.Security.Cryptography.HMACSHA256]::Create()
$hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($env:LINE_CHANNEL_SECRET)
$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
$sig = [Convert]::ToBase64String($hmac.ComputeHash($bodyBytes))

# 發 webhook
Invoke-WebRequest -Uri "https://donttalk.vercel.app/api/line/webhook" `
  -Method Post `
  -Body $body `
  -Headers @{
    "x-line-signature" = $sig
    "Content-Type" = "application/json"
  }
```

預期：200 OK。

## Python 測試

```python
import hmac
import hashlib
import base64
import requests

secret = 'test-secret-1234567890abcdef'
body = '{"events":[]}'

sig = base64.b64encode(
  hmac.new(secret.encode('utf-8'), body.encode('utf-8'), hashlib.sha256).digest()
).decode('utf-8')

r = requests.post(
  'https://donttalk.vercel.app/api/line/webhook',
  data=body,
  headers={'x-line-signature': sig, 'Content-Type': 'application/json'}
)
print(r.status_code, r.text)
```

## 常見錯誤

| 錯誤 | 原因 |
|---|---|
| 401 invalid signature | 用了 parsed body / 編碼不對 / 沒讀 raw stream |
| 401 invalid signature 持續 | channel secret env var 跟 LINE 後台不同 |
| 200 但 events 沒處理 | JSON.parse 失敗（body 是 Buffer 要 toString） |
| 400 Bad Request | body 不是 JSON |

## Debug 流程

```js
// 加 debug log
console.log('signature header:', req.headers['x-line-signature']);
console.log('raw body length:', req.rawBody?.length);
console.log('expected sig:', expected);
console.log('match:', signature === expected);
```

部署後看 Vercel function logs：

```
Vercel dashboard → Deployments → 點 commit → Functions → 點 handler → Logs
```

或 `vercel logs <deployment-url>` CLI。

## 部署前本地驗證

```powershell
# 跑 dev server
Set-Location D:\project\astro
npm run dev

# 在另一個 terminal 模擬 webhook
$body = '{"events":[]}'
$sig = ... # 算 HMAC
Invoke-WebRequest -Uri "http://localhost:4321/api/line/webhook" -Method Post -Body $body -Headers @{"x-line-signature"=$sig}
```

本地 dev 沒有 Vercel runtime wrapper，`req.body` 可能還沒 parse，但還是要用 raw stream 確保跟 production 一致。

## Signature timing

LINE 對 webhook 沒有強制時效（不像某些 API 限制 5 分鐘內）。但建議驗 timestamp 避免 replay：

```js
// 可選：拒 5 分鐘前的 request（防 replay）
const body = JSON.parse(req.rawBody.toString('utf8'));
const eventTime = body.events?.[0]?.timestamp;
if (eventTime && Math.abs(Date.now() - eventTime) > 5 * 60 * 1000) {
  return res.status(401).send('replay');
}
```

LINE 通常會立即送 webhook，5 分鐘 replay window 足夠。

## LINE SDK 簡化

如果用 `@line/bot-sdk`，middleware 自動處理 raw body + signature：

```ts
import { middleware, Client } from '@line/bot-sdk';

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  channelSecret: process.env.LINE_CHANNEL_SECRET!,
};

app.post('/api/line/webhook', middleware(config), (req, res) => {
  // req.body.events 已 parsed 且已驗 signature
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).end())
    .catch(err => res.status(500).end());
});
```

但 `@line/bot-sdk` 是 ESM 還是 CJS 會跟 Vercel serverless runtime 衝突 → 詳見 `deploy-vercel-prebuilt/references/02-hobby-plan-pitfalls.md` ESM/CJS 章節。

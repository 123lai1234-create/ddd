# Webhook Raw Body 解析（Vercel Node Runtime）

## 症狀

LINE / GitHub / Slack / Stripe webhook 部署到 Vercel 後 HMAC 驗證 401，但 local 用 ngrok 跑同樣 source code 是 200。

## 根因

Vercel Node runtime 在進入 handler 前已 parse body：
- `req.body` 是已解析物件
- `req.rawBody` 是 `undefined`（Vercel 官方文件說有，但實測沒有）

### 典型錯誤 pattern

```js
function getRawBody(req) {
  if (typeof req.rawBody === 'string') return req.rawBody;   // undefined
  if (typeof req.body === 'string') return req.body;         // 永遠不是
  if (req.body && typeof req.body === 'object')
    return JSON.stringify(req.body);                         // ❌ 錯誤的 bytes
}
```

`JSON.stringify(req.body)` 重新序列化 parsed object — key 順序、空白、number formatting 跟 client 簽的 bytes 不一樣 → HMAC 401。

## 修法：讀 raw request stream

```js
function getRawBody(req) {
  if (typeof req.rawBody === 'string') return Promise.resolve(req.rawBody);
  if (Buffer.isBuffer(req.rawBody)) return Promise.resolve(req.rawBody.toString('utf8'));
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  const rawBody = await getRawBody(req);  // 注意 async
  const sig = req.headers['x-line-signature'];
  const expected = crypto.createHmac('sha256', process.env.LINE_CHANNEL_SECRET).update(rawBody).digest('base64');
  if (sig !== expected) return res.status(401).send('invalid signature');
  // ... handle event
}
```

## 驗證

```powershell
# 本地測（mock signature）
$secret = 'test-secret'
$body = '{"events":[]}'
$sig = [Convert]::ToBase64String(
  [System.Security.Cryptography.HMACSHA256]::Create().ComputeHash(
    [System.Text.Encoding]::UTF8.GetBytes($body + $secret)
  )
)
# Vercel 上：
Invoke-WebRequest -Uri "https://<project>.vercel.app/api/line/webhook" `
  -Method Post `
  -Body $body `
  -Headers @{"x-line-signature"=$sig;"Content-Type"="application/json"}
```

## 適用範圍

任何 HMAC-based webhook 驗證都中：
- LINE Messaging API
- GitHub webhooks
- Slack Events API
- Stripe webhooks
- Shopify webhooks

## 注意

- Node runtime 用 `Buffer.concat`，Edge runtime 用 `await req.text()`
- Express 的 `express.raw()` middleware 在 serverless function 不適用（沒 middleware 機會介入）
- `req.body` 在 Vercel 是 parsed，不要依賴它的 key 順序

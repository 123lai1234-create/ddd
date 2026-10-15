---
name: dnt-line-bot-deploy
description: "D:\\project LINE bot 部署架構 + webhook HMAC 驗證。當用戶說「LINE bot」「line.ts」「api/line」「webhook 401」「LINE 推播」「Rich Menu」「API server」「catchall.mjs」「改 bot 沒生效」時使用。涵蓋 prod handler 在 api-server-src/src/routes/line.ts（不是 api/line/*.js 的 dead code）、改 bot 必須 rebuild _backend.mjs + commit + deploy、vercel.json rewrite 規則把 /api/* 送進 catchall、api/line/ 是開發遺留 dead code、LINE webhook HMAC 驗證 raw body 解析、Rich Menu API 要 verified channel、API server 對接 Railway / Supabase 等 backend。應用：D:\\project astro/api/catchall.mjs + api-server-src 整體架構。"
license: MIT
metadata:
  author: donttalk-deploy
  version: "1.0.0"
  tags:
    - line-bot
    - api
    - webhook
    - hmac
    - api-server-src
    - dead-code
    - rich-menu
    - verified-channel
    - donttalk
    - astro
---

# D:\project LINE Bot 部署架構

> **關鍵陷阱**（2026-07-04 用 dashboard deployment 582wia2uBgRqGm5NjomPjNw1em4e logs 確認）：`api/line/` 整個資料夾在 production 是 **dead code**。Prod LINE bot handler 在 `api-server-src/src/routes/line.ts` → bundled 成 `_backend.mjs` → 掛進 catchall `api/[...slug].mjs`。

## 架構鏈

```
User 在 LINE
  ↓ HTTPS POST
LINE platform → https://donttalk.vercel.app/api/line/webhook
  ↓ vercel.json rewrites
{ "source": "/api/:path*", "destination": "/api?p=:path*" }
  ↓
catchall api/[...slug].mjs (= api/index.mjs)
  ↓ boot stock backend 的 Express app
  ↓ Express 內部 mount LINE router from _backend.mjs
api-server-src/src/routes/line.ts (TypeScript source)
  → bundled to _backend.mjs (via esbuild / tsc)
  ↓
Express handler
  ↓
LINE API 回應
```

## 改 LINE bot 行為流程

要改 prod LINE bot 行為：

```
1. 編輯 api-server-src/src/routes/line.ts
2. Rebuild _backend.mjs（見下）
3. Commit (含 _backend.mjs)
4. Push / vercel deploy
5. 部署後實打驗證
```

**不要**編輯 `api/line/*.js` — 那是 dead code，production 零效果。

## 哪個 handler 在 prod

不確定時查 Vercel dashboard：

```
Vercel dashboard → Deployments → 點最新 commit → Source tab
  → 看 function layout
  → api/catchall.func/catchall.mjs 內 require _backend.mjs
  → _backend.mjs 內部有 line.ts compiled 的 handler
```

如果 Source tab 顯示多個 `api/line/webhook.func` → 那是 Hobby plan 12 functions cap 過後遺留（不過該 route 仍被 catchall 攔）。

## api/line/ 為什麼是 dead code

`vercel.json` 設了：

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api?p=:path*" }
  ]
}
```

這個 rewrite 把 `/api/line/*` 送到 catchall `api/[...slug].mjs` (= `api/index.mjs`)。

catchall boot stock backend 的 Express app，LINE webhook 是 mount 進 backend 的（從 `_backend.mjs` bundle）。

**`api/line/*.js` 的 Vercel Serverless Function 從來沒被 call**（rewrite 在前面攔截）。

## 編輯 `api/line/*.js` 的後果

- 改完 → commit → push → Vercel deploy → production 行為**沒變**
- 浪費時間 debug 「為什麼沒生效」
- 但 `api/line/webhook.js` 仍會 build 出 .func bundle（佔 function quota）

修法：把 `api/line/` 整個刪掉或加進 .vercelignore（避免 build 出 dead function bundle）。

## api-server-src 是什麼

D:\project 子資料夾（**不是** D:\project/astro/ 內）：

```
D:\project\api-server-src\
├── src/
│   ├── routes/
│   │   ├── line.ts          # LINE webhook handler (production)
│   │   ├── stock.ts         # Stock API
│   │   └── ...
│   ├── lib/
│   │   ├── line-message.ts
│   │   └── ...
│   └── index.ts             # Express app entry
├── package.json
├── tsconfig.json
└── scripts/
    └── build-backend.mjs    # esbuild / tsc → _backend.mjs
```

build script 產 `astro/api/_backend.mjs`（Vercel catchall import 這個 bundle）。

## Rebuild _backend.mjs

```powershell
Set-Location D:\project\api-server-src
npm install              # 第一次或加新 dep
npm run build            # 跑 scripts/build-backend.mjs
# → 產 D:\project\astro\api\_backend.mjs
```

或直接：

```powershell
node scripts/build-backend.mjs
```

build 完確認 `_backend.mjs` 是新的：

```powershell
Get-Item "D:\project\astro\api\_backend.mjs" | Select-Object Name, Length, LastWriteTime
```

## 改完後 deploy

```powershell
Set-Location D:\project
git add -u                              # 精準 staged 修改
git status                              # 確認只改 api-server-src + astro/api/_backend.mjs
git commit -m "feat(line): 新功能"
git push origin 123lai1234-create       # HEAD 在 123lai1234-create（AGENTS.md 規則）
```

Vercel auto-deploy 從 branch 觸發 → cloud build → 產 catchall + static。

## LINE Webhook HMAC 驗證

LINE platform 對每個 webhook request 加 `x-line-signature` header，內容是 HMAC-SHA256 of request body：

```js
import crypto from 'node:crypto';

function getRawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');
  if (typeof req.rawBody === 'string') return req.rawBody;
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function verifyLineSignature(req, channelSecret) {
  const signature = req.headers['x-line-signature'];
  if (!signature) return false;
  const rawBody = await getRawBody(req);
  const expected = crypto.createHmac('sha256', channelSecret)
    .update(rawBody)
    .digest('base64');
  return signature === expected;
}

export default async function handler(req, res) {
  if (!await verifyLineSignature(req, process.env.LINE_CHANNEL_SECRET)) {
    return res.status(401).send('invalid signature');
  }
  // ... handle event
}
```

**Vercel Node runtime `req.body` 已 parsed，不能用 `JSON.stringify(req.body)` 算 HMAC**（key 順序會變）→ 一定要讀 raw stream。

詳見 `deploy-vercel-prebuilt/references/05-webhook-raw-body.md`。

## LINE Rich Menu API

LINE Rich Menu API（create / link rich menu）會回：

```
400 invalid channel
或
403 forbidden
```

對 unverified channel。

**修法**：LINE Official Account 升級到 **verified** 或 **premium**。

| 類型 | Rich Menu API | 限制 |
|---|---|---|
| Unverified | ❌ | 開發期手動 upload rich menu image 可 work |
| Verified | ✅ | 公司 / 個人都可升 |
| Premium | ✅ | 大用量 |

升級流程：LINE Official Account manager → 設定 → 帳號升級。

## API Server 對接 backend

`api-server-src/src/routes/stock.ts`（LINE bot 內查 stock）會 call Railway / Supabase / Neon：

```ts
import { getStockQuote } from '../lib/stock-api';

export async function handleStockCommand(userId: string, ticker: string) {
  const quote = await getStockQuote(ticker);
  return {
    type: 'text',
    text: `${quote.name} (${ticker}) $${quote.price} (${quote.changePct}%)`,
  };
}
```

backend source of truth：`memory/donttalk-project.md` 提到：
- Railway `https://donttalk-production.up.railway.app`（**不是** `donttalk-api-production` 那個 dead subdomain）
- Supabase / Neon 連線細節

## LINE bot 開發 / 測試

### 開發期用 ngrok

```bash
ngrok http 4321  # astro dev port
# 給 LINE webhook URL：https://<random>.ngrok.io/api/line/webhook
```

`ngrok` 開 local server 到 public URL，LINE platform 可送 webhook。

### Webhook event 種類

LINE 推 4 種主要 event：

| Event | 用途 |
|---|---|
| `message` | user 傳訊息 |
| `follow` | user 加好友 |
| `unfollow` | user 封鎖 |
| `join` / `leave` | bot 加 / 退群 |

### Push 主動推播

```ts
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

await client.pushMessage(userId, {
  type: 'text',
  text: 'Stock 提醒：2330 突破 600',
});
```

對 free / unverified channel 有 quota 限制（每月 push 數）。verified 額度高。

## 部署後驗證 LINE bot

```powershell
# 1. 部署完
git push origin 123lai1234-create

# 2. 等 30s + dashboard 顯示 Ready
Start-Sleep 30

# 3. 用 LINE 傳訊息測試（用自己帳號）
# user: 你好
# bot: 自動 reply (確認 handler 跑對版本)
```

或 curl 模擬 webhook：

```powershell
$secret = $env:LINE_CHANNEL_SECRET
$body = '{"events":[{"type":"message","source":{"userId":"Uxxx"},"message":{"type":"text","text":"test"}}]}'
$sig = [Convert]::ToBase64String(
  [System.Security.Cryptography.HMACSHA256]::Create().ComputeHash(
    [System.Text.Encoding]::UTF8.GetBytes($body + $secret)  # ❌ LINE HMAC 是 HMAC(body) 不是 body+secret
  )
)
# 正確：
$sig = [Convert]::ToBase64String(
  [System.Security.Cryptography.HMACSHA256]::Create().ComputeHash(
    [System.Text.Encoding]::UTF8.GetBytes($body)
  )
)
Invoke-WebRequest -Uri "https://donttalk.vercel.app/api/line/webhook" `
  -Method Post -Body $body `
  -Headers @{"x-line-signature"=$sig;"Content-Type"="application/json"}
```

## References

- [`01-api-server-src-build.md`](references/01-api-server-src-build.md) — esbuild bundle 流程、`_backend.mjs` 產出、build script 細節
- [`02-line-webhook-hmac.md`](references/02-line-webhook-hmac.md) — HMAC-SHA256 raw body 細節、PowerShell 測試、handler 模板
- [`03-rich-menu-api.md`](references/03-rich-menu-api.md) — Rich Menu API 升級、verified channel 申請、image 上傳
- [`04-deploy-verify.md`](references/04-deploy-verify.md) — 部署後驗證 LINE bot、curl 測試、debug 流程

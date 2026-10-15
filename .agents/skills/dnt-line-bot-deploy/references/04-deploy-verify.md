# 部署後驗證 LINE Bot

## 部署流程確認

```powershell
Set-Location D:\project
git branch --show-current    # 應為 123lai1234-create（AGENTS.md 規則）
git status                    # 確認 staged 正確
git add api-server-src/src/routes/line.ts astro/api/_backend.mjs
git commit -m "feat(line): <改動>"
git push origin 123lai1234-create
```

Vercel auto-deploy 從 branch 觸發（~30s Ready）。

## 1. dashboard 確認

```
Vercel dashboard → Deployments → 找最新 commit
  → 點進去
  → Source tab → 看 function layout
    → 確認有 api/catchall.func
    → 確認 _backend.mjs 包含新 line.ts 邏輯
  → Logs tab → 確認沒 crash
```

## 2. Webhook endpoint 測試

```powershell
# 用 ngrok 或直接打 Vercel URL
$body = '{"events":[{"type":"message","source":{"userId":"U1234"},"message":{"type":"text","text":"個股 2330"}}]}'
$hmac = [System.Security.Cryptography.HMACSHA256]::new()
$hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($env:LINE_CHANNEL_SECRET)
$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
$sig = [Convert]::ToBase64String($hmac.ComputeHash($bodyBytes))

$r = Invoke-WebRequest -Uri "https://donttalk.vercel.app/api/line/webhook" `
  -Method Post -Body $body `
  -Headers @{"x-line-signature"=$sig; "Content-Type"="application/json"}
Write-Host "$($r.StatusCode) $($r.Content)"
```

預期：200 OK，無 body 內容（webhook 只回 ack）。

## 3. 用真實 LINE 帳號測

```
1. 手機 LINE → 加 bot 為好友
2. 傳訊息（用真實 user，not mock）
3. 看 bot 自動回應
4. 比對行為跟新版 line.ts 邏輯
```

**重要**：用真實 user 測才能 cover 完整路徑（webhook 簽章 + push 訊息 + 用戶狀態）。

## 4. Function logs 看錯誤

```powershell
# Vercel CLI
npx vercel logs donttalk.vercel.app --follow
# 或 deployment specific
npx vercel logs <deployment-id>
```

或 dashboard：
```
Deployments → 點 commit → Functions → 點 handler → Logs
```

## 常見 deploy 失敗

### 1. `_backend.mjs` 沒更新

**症狀**：改了 line.ts 但 prod 行為沒變。

**檢查**：

```powershell
Get-Item "D:\project\astro\api\_backend.mjs" | Select-Object LastWriteTime
git log -1 --format="%ai" -- astro/api/_backend.mjs
# LastWriteTime 應晚於 line.ts 改動時間
```

**修法**：

```powershell
Set-Location D:\project\api-server-src
node scripts/build-backend.mjs
# 確認 _backend.mjs 更新
# 再 commit + push
```

### 2. Build script 失敗

```powershell
Set-Location D:\project\api-server-src
node scripts/build-backend.mjs
```

看 error。可能：

- `tsconfig.json` 設定錯
- 缺 dependency → `npm install`
- esbuild 設定 external 不全

### 3. 部署後 webhook 401

**症狀**：webhook 收到但 HMAC 驗證失敗。

**可能原因**：

- `LINE_CHANNEL_SECRET` env var 沒設或錯
- `_backend.mjs` 內 HMAC 邏輯用了 parsed body（Vercel runtime）

**修法**：

```powershell
# 確認 env var 在 Vercel dashboard 對
# Project Settings → Environment Variables → LINE_CHANNEL_SECRET

# 改完後 redeploy
npx vercel redeploy <deployment-id>
```

### 4. 部署後 webhook 沒收到

**症狀**：curl 打有回應，但 LINE platform 沒送 webhook。

**檢查**：

- LINE Official Account Manager → 設定 → Webhook URL
  - 應為 `https://donttalk.vercel.app/api/line/webhook`
  - 狀態：啟用
- LINE 後台可能 webhook URL 沒更新

## Health check endpoint

加 `/api/line/health` 監控 bot 狀態：

```ts
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    api_server_version: process.env.npm_package_version || 'unknown',
    last_build: process.env.BUILD_TIME || 'unknown',
  });
});
```

```powershell
Invoke-WebRequest -Uri "https://donttalk.vercel.app/api/line/health" | Select-Object StatusCode, Content
```

## 部署後 +3 項驗證

| 項目 | 預期 | 失敗排查 |
|---|---|---|
| dashboard Ready | ✅ 1-2 分鐘內 | 看 build logs |
| `/api/line/health` | 200 + JSON | 看 function logs |
| 真實 LINE 帳號測試 | bot 回應正確 | webhook 401 / 沒回應 → HMAC / push 配額 |

## Rollback

如果新版 line.ts 炸了：

```powershell
# 用上一個 working deployment
npx vercel rollback <previous-deployment-id>
# 或
npx vercel alias <prev-url> donttalk.vercel.app
```

## Vercel function 監控

```
Vercel dashboard → Project → Observability → Logs
```

或用 `@vercel/otel` 加 OpenTelemetry trace。

## Webhook rate limit

LINE platform 對 webhook delivery 有限制：

- 一般 channel：~ 100 req/s
- 過量時：LINE 會 retry 5 分鐘後
- 重試 3 次失敗就 drop

對單一 user 的 bot 通常不會觸發。

## Push 配額

| Channel 類型 | 月 push 額度 |
|---|---|
| Unverified | 500 |
| Light | 15,000 |
| Standard | 45,000 |
| Premium | 200,000 |

超過配額 → push 失敗 429 → 用 `getMessageQuota()` API 查剩餘。

## 完整 deploy checklist

```
[ ] line.ts 改完測過本地
[ ] _backend.mjs 重新 build 且時間正確
[ ] git add 精準（只 line.ts + _backend.mjs + 其他必要）
[ ] git commit message 描述清楚
[ ] git push 對的 branch
[ ] dashboard 顯示 Ready
[ ] /api/line/health 200
[ ] 模擬 webhook 200
[ ] 真實 LINE 帳號測
[ ] 看 function logs 沒 error
```

## References

- [LINE Messaging API](https://developers.line.biz/en/reference/messaging-api/)
- [LINE Webhook events](https://developers.line.biz/en/reference/messaging-api/#common-properties)
- [LINE Rich Menu](https://developers.line.biz/en/reference/messaging-api/#rich-menu)
- [Vercel Functions Logs](https://vercel.com/docs/observability/runtime-logs)

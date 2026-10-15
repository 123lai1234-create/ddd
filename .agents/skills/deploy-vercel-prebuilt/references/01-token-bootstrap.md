# Token Bootstrap（PowerShell 引號陷阱 + 過期處理）

## 症狀

```powershell
& vercel deploy --token "vcp_xxx..."
# → Error: option requires argument: --token
```

或一段時間後：

```
Error: The token provided via VERCEL_TOKEN environment variable is not valid.
```

## 根因

PowerShell 把 `--token "<token>"` 整段當一個引號字串丟給 `vercel`，變成 `--token "vcp_xxx...` 缺右半邊。

OIDC token 30 天過期，所有 CLI 操作全 401。

## 修法

### Step 1 — 從 cached auth.json 拿 OAuth access token

```powershell
$auth = Get-Content "$env:APPDATA\com.vercel.cli\Data\auth.json" -Raw | ConvertFrom-Json
$env:VERCEL_TOKEN = $auth.token
```

格式：
```json
{ "token": "vca_xxx...", "userId": "...", "refreshToken": "cr_...", "expiresAt": 1234567890 }
```

### Step 2 — 一定要 `&`（call operator）+ 分開 args

```powershell
& "$env:APPDATA\npm\vercel.cmd" deploy --prebuilt --prod --yes
```

- 不要 `cmd.exe /c "vercel deploy ..."`
- 不要 `Start-Process vercel ...`
- 用 `&` + 完整路徑（避免 PATH 找不到 npm-global vercel）

### Step 3 — 每個新 PowerShell process 都要重設

mavis 不會自動 source user `.env`，所以 `$env:VERCEL_TOKEN` 只活在當前 shell。

跨 session / 跨 mavis 部署都重設一次。

## Token 過期 fallback

如果 OAuth refresh 也失敗（`400 invalid_client` 因為 refresh 需要埋在 CLI 裡的 `client_id`，沒公開 endpoint），跟 user 拿一顆 personal token：

1. 登入 Vercel dashboard → Settings → Tokens → Create Token
2. 設 Full Account 範圍 + 24h expiry 足夠一次部署
3. 在 PowerShell 設 `$env:VERCEL_TOKEN = "vcp_xxx..."`（注意 `vcp_` 不是 `vca_`）
4. 部署完到 dashboard Revoke 避免意外使用

## 不要用的 token 類型

- **OIDC JWT**（`.vercel/.env.production.local` / `.env.development.local` 裡的長 JWT）→ CLI 拒絕
- **vca_ token** 可用於 REST API（`/v6/deployments`），但 OIDC JWT 用於 REST 會 403 forbidden

## 驗證

```powershell
& "$env:APPDATA\npm\vercel.cmd" whoami
# 預期印 user email + username + current scope
```

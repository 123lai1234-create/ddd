# GCP Token Lifecycle（細節）

## access_token

- 格式：JWT-like string
- 過期：Testing 模式 7 天，Production 1 小時
- 用途：HTTP `Authorization: Bearer <token>` header
- 取得：OAuth flow 或 `refresh_token` 換

```python
import requests
r = requests.get(
    'https://www.googleapis.com/drive/v3/files',
    headers={'Authorization': f'Bearer {access_token}'}
)
```

`access_token` 過期會回 `401 invalid_token`，用 `refresh_token` 換新的。

## refresh_token

- 格式：opaque string
- 過期：**Testing 模式不過期**（除非 revoke），Production 6 個月 idle 或 revoke
- 用途：`access_token` 過期時換新
- 取得：OAuth flow（一次性）

```python
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

creds = Credentials.from_authorized_user_file('token.json')
if not creds.valid:
    creds.refresh(Request())  # 換新 access_token
```

## Refresh Token 過期的兩個情境

### 1. 6 個月沒用（Production）

Google 認定 token 「idle」→ 失效。下次 refresh 會回 `invalid_grant`：

```python
try:
    creds.refresh(Request())
except Exception as e:
    if 'invalid_grant' in str(e):
        # 必須重新走 OAuth flow
        flow = InstalledAppFlow.from_client_secrets_file(...)
        creds = flow.run_local_server(port=0)
```

**對 batch 應用**：用 `keep_alive` 風格 — 每 < 6 個月跑一次：

```python
# crontab: 每月 1 號跑一次 keep-alive
def keep_alive():
    creds = Credentials.from_authorized_user_file('token.json')
    creds.refresh(Request())
    save_token(creds)  # 更新 token.json
```

### 2. User 撤銷

User 在 Google 帳號 → 第三方應用程式存取權 → 撤銷。

**永久** 失效，**必須**重新走 OAuth。

## Testing vs Production 差異

| 情境 | Testing | Production |
|---|---|---|
| access_token 過期 | 7 天 | 1 小時 |
| refresh_token 過期（idle） | **不會** | 6 個月 |
| refresh_token 過期（密碼改） | 是 | 是 |
| 撤銷（user） | 是 | 是 |
| 撤銷（GCP 設定改） | 是 | 是 |

**對 batch 應用結論**：Testing 模式 + 100 個 test users **比** Production 模式友善（access_token 7 天夠用、refresh_token 不過期）。Production 對 production user-facing app 才需要。

## token.json 結構

```json
{
  "client_id": "123456789-abc.apps.googleusercontent.com",
  "client_secret": "GOCSPX-xxxx",
  "refresh_token": "1//0e_xxxx",
  "token": "ya29.xxx",  // current access_token
  "token_uri": "https://oauth2.googleapis.com/token",
  "scopes": ["https://www.googleapis.com/auth/drive.readonly"],
  "expiry": "2026-10-22T10:30:00Z"
}
```

`expiry` 過了 → 自動 refresh。Google auth library 會自動處理。

## revoke 後 debug 流程

```python
# 1. 試 refresh
creds = Credentials.from_authorized_user_file('token.json')
try:
    creds.refresh(Request())
    print('OK')
except Exception as e:
    print(f'FAIL: {e}')
    # Common errors:
    # "invalid_grant: Token has been expired or revoked" → 重新 OAuth
    # "invalid_grant: Bad Request" → client_id/secret 改過 / token 不屬於這個 client
    # "deleted_client" → GCP project OAuth client 被刪
```

## 重新 OAuth Flow

```python
from google_auth_oauthlib.flow import InstalledAppFlow

flow = InstalledAppFlow.from_client_secrets_file('client_secret.json', scopes=[...])
creds = flow.run_local_server(port=0)

# 覆蓋舊 token.json
import json
json.dump({
    'client_id': creds.client_id,
    'client_secret': creds.client_secret,
    'refresh_token': creds.refresh_token,
    'scopes': creds.scopes,
    'token': creds.token,
    'token_uri': creds.token_uri,
    'expiry': creds.expiry.isoformat(),
}, open('token.json', 'w'), indent=2)
```

## 多帳號切換

OAuth flow 預設用「最後登入的 Google 帳號」。要強制特定帳號：

```python
# 方法 1: prompt=consent 強制重新選
flow = InstalledAppFlow.from_client_secrets_file(
    'client_secret.json',
    scopes=[...],
    login_hint='user@example.com'  # 預選
)

# 方法 2: 用不同瀏覽器 session
# 在另一個 Chrome profile 跑 OAuth flow，自動用那個 profile 的登入帳號
```

## Token storage 安全

- **不要** commit `token.json` 進 git
- **不要** log 整個 token（只 log 前 8 字符）
- 存到：
  - 本機 dev: `~/.config/gcloud/token.json`
  - CI: GitHub Actions secret / Vercel env var
  - Server: 環境變數或 KMS

```python
# 環境變數存取
import os
import json

token_data = json.loads(os.environ['GCP_REFRESH_TOKEN_JSON'])
creds = Credentials(
    token=None,
    refresh_token=token_data['refresh_token'],
    token_uri='https://oauth2.googleapis.com/token',
    client_id=token_data['client_id'],
    client_secret=token_data['client_secret'],
    scopes=token_data['scopes'],
)
creds.refresh(Request())
```

## Time skew 問題

`expiry` 是 UTC ISO 格式。本機時鐘不準會誤判過期：

```python
# Google auth library 內部：
# if creds.expiry - now() < 0 → refresh
# 但 now() 從 google.auth._helpers 拿 NTP 校時
# 不依賴本機 clock
```

通常沒事，但如果 token 一直「提早過期」→ 檢查本機時鐘。

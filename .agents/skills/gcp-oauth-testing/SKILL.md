---
name: gcp-oauth-testing
description: "Google Cloud Platform OAuth consent screen Testing mode 完整 SOP。當用戶說「GCP OAuth」「Google login」「403 access_denied」「未完成 Google 驗證程序」「測試人員」「test user」「OAuth refresh token」「OAuth client_id」「Google API」「BigQuery」「Drive API」「Sheets API」時使用。涵蓋新建 GCP project 預設 Testing 狀態、Test users 必須手動加（含 owner account 也不會自動加）、Testing mode 行為（access_token 7 天過期 / refresh_token 不過期除非 revoke）、批次上傳（refresh_token 一次授權後反覆用）、多 GCP project 切換、refresh_token revoke 處理。應用：任何 GCP project（herms / 自建 / 客戶）+ OAuth 2.0 desktop / server flow。"
license: MIT
metadata:
  author: donttalk-deploy
  version: "1.0.0"
  tags:
    - gcp
    - oauth
    - google
    - testing-mode
    - access-token
    - refresh-token
    - api
    - drive
    - sheets
    - bigquery
---

# GCP OAuth Testing Mode

> 新建 GCP project 的 OAuth consent screen **預設是 Testing** 狀態（不是 Production）。這造成 owner account 也不在 test users 內，第一次登入就 `403 access_denied`。

## 核心症狀

```
403 access_denied
「herms」未完成 Google 驗證程序
只有您應用程式開發人員設定的測試人員可以使用
```

`herms` 是 GCP project ID，任何 GCP project 都會遇到。

## 預設行為（owner 也要手動加）

新建 GCP project（任何名字）+ 設 OAuth consent screen 後：

1. **預設 Publishing status = Testing**（不是 Production）
2. 只有「Test users」清單內的帳號能授權
3. **Project owner account 不會自動加入**（即使你是 billing account owner / project creator）

## 修法（30 秒）

```
1. GCP Console → Google Auth Platform → 目標對象（Audience）
2. Test users → Add users
3. 加 <your-account>@gmail.com
```

加完立刻可授權（不用等驗證）。

## Testing mode 行為差異

| 項目 | Testing | Production |
|---|---|---|
| Test users 限制 | 最多 100 人 | 任意人 |
| `access_token` 過期 | 7 天 | 1 小時 |
| `refresh_token` 過期 | **不會**過期（除非手動 revoke） | 6 個月 idle 或 revoke |
| Sensitive scopes 限制 | 部分禁用（Contacts / Drive.full 等） | 全部開放 |
| 驗證要求 | 不需要 | Google 審核（數天 - 數週） |

**對 batch 應用友善**：
- 一次性 OAuth 授權 → 拿 `refresh_token` → 之後用 refresh_token 換 access_token（不需 user 操作）
- refresh_token **不會**過期（除非手動 revoke）
- 7 天後 access_token 過期，refresh_token 換新的就好
- 適合：daily ETL、backup、CI 排程

**對 production 應用不友善**：
- Sensitive scopes 在 Testing 模式被擋
- 超過 100 test users 要申請 Production
- Production 申請 Google 審核要 1-4 週

## OAuth 2.0 Desktop / Server Flow

```python
# Desktop / CLI 應用
from google_auth_oauthlib.flow import InstalledAppFlow

flow = InstalledAppFlow.from_client_secrets_file(
    'client_secret.json',  # 從 GCP Console 下載的 OAuth client config
    scopes=['https://www.googleapis.com/auth/drive.readonly']
)
creds = flow.run_local_server(port=0)  # 開 browser 等 user 授權

# 拿 access_token + refresh_token
print('access_token:', creds.token)
print('refresh_token:', creds.refresh_token)
print('expires_at:', creds.expiry)

# 存 refresh_token 起來反覆用
import json
with open('token.json', 'w') as f:
    json.dump({
        'refresh_token': creds.refresh_token,
        'client_id': creds.client_id,
        'client_secret': creds.client_secret,
    }, f)
```

之後用 refresh_token 換 access_token：

```python
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

creds = Credentials.from_authorized_user_file('token.json')
if not creds.valid:
    creds.refresh(Request())  # 用 refresh_token 換新 access_token

# 用 creds.token 呼叫 Google API
import requests
r = requests.get(
    'https://www.googleapis.com/drive/v3/files',
    headers={'Authorization': f'Bearer {creds.token}'}
)
```

## 跨 session 重用 refresh_token

```python
# Day 1: 拿 refresh_token
flow = InstalledAppFlow.from_client_secrets_file('client_secret.json', scopes=[...])
creds = flow.run_local_server(port=0)
json.dump({'refresh_token': creds.refresh_token, ...}, open('token.json', 'w'))

# Day 2..N: 用 refresh_token
creds = Credentials.from_authorized_user_file('token.json')
creds.refresh(Request())
# creds.token 是新 access_token
```

refresh_token 不過期（Testing mode）→ 可永久重用。

## refresh_token 不見 / revoke 的修法

**不見**：只能重新走 OAuth flow（user 重新授權）。沒救。

**revoke**：使用者從 Google 帳號 → 「第三方應用程式存取權」→ 撤銷。**永久**失效，必須重新授權。

**GCP-side revoke**：GCP Console → Google Auth Platform → 目標對象 → 「移除測試使用者」也會讓 refresh_token 失效。

**疑難排解**：
```python
# 檢查 refresh_token 還能不能用
from google.auth.transport.requests import Request
creds = Credentials.from_authorized_user_file('token.json')
try:
    creds.refresh(Request())
    print('✅ refresh_token still valid')
except Exception as e:
    print(f'❌ revoked / expired: {e}')
    # → 需要重新 OAuth flow
```

## 切換多個 GCP project

每個 GCP project 有獨立的：
- `client_id` / `client_secret`（OAuth client 設定）
- `refresh_token`（user 對那個 client 授權的 token）
- Test users 清單

換 project = 換 token.json 檔。

```python
import os
creds = Credentials.from_authorized_user_file(
    os.environ['GOOGLE_OAUTH_TOKEN_PATH']  # 環境變數指定哪個 token.json
)
```

## Sensitive Scopes（Testing 模式禁用）

| Scope | Testing 可用？ |
|---|---|
| `drive.readonly` / `drive.file` | ✅ |
| `drive` (full) | ❌ 需 Production + Google 驗證 |
| `gmail.readonly` | ✅ |
| `gmail.send` | ✅ |
| `contacts.readonly` | ❌ |
| `bigquery.readonly` | ✅ |
| `bigquery` (full) | ❌ |

完整清單見 [Google OAuth 2.0 Scopes](https://developers.google.com/identity/protocols/oauth2/scopes)。

## Client ID 類型選擇

OAuth client 在 GCP Console → Google Auth Platform → 用戶端 (Clients) 設定：

| 類型 | 用途 | redirect URI |
|---|---|---|
| Web application | 網站後端 OAuth | `https://example.com/oauth2callback` |
| Desktop app | CLI / desktop | `http://127.0.0.1:port` (loopback) |
| iOS / Android | mobile | app scheme |

Desktop CLI 用「Desktop app」類型，`run_local_server()` 會在 127.0.0.1 開 port 接 callback。

## 環境變數（不要 hard-code）

```python
# 敏感資料放環境變數 / secret manager
import os
CLIENT_ID = os.environ['GCP_CLIENT_ID']
CLIENT_SECRET = os.environ['GCP_CLIENT_SECRET']
REFRESH_TOKEN = os.environ['GCP_REFRESH_TOKEN']
```

不要 commit `client_secret*.json` 或 `token.json` 進 git。

`.gitignore`：

```gitignore
client_secret*.json
token.json
*-oauth-token.json
.gcp/
```

## 切到 Production 模式

1. GCP Console → Google Auth Platform → 目標對象
2. 「PUBLISH APP」按鈕 → 選 Production
3. 如果用 sensitive scopes，提交 Google 驗證（OAuth verification form）
4. 驗證通過 → 任意 Google account 都能用

時間：1-4 週。準備驗證需要：
- 公司網站 / 隱私權政策 / 服務條款 URL
- scope 用途說明
- 影片 demo（部分 scope）

**對個人 project 不實際** — Testing mode + 100 個 test users 內通常夠用。

## 替代方案：Service Account

如果應用是 server-to-server（不需要 user 授權）：

1. GCP Console → IAM & Admin → Service Accounts → Create
2. 給 Service Account 適當 IAM role（例：BigQuery Data Viewer）
3. 下載 JSON key 檔
4. 用 Service Account 認證：

```python
from google.oauth2 import service_account
creds = service_account.Credentials.from_service_account_file(
    'service-account.json',
    scopes=['https://www.googleapis.com/auth/bigquery']
)
```

Service Account **不需要 OAuth consent screen**，沒有 Testing 模式限制。

但 Service Account 不能存取 user 自己的 Drive / Gmail — 那些需要 user OAuth。

## References

- [`01-add-test-users.md`](references/01-add-test-users.md) — GCP Console 詳細導航、screenshot 描述、batch 加 user
- [`02-token-lifecycle.md`](references/02-token-lifecycle.md) — access_token 7 天 vs refresh_token 永久、revoke 場景、debug
- [`03-multiple-projects.md`](references/03-multiple-projects.md) — 多 GCP project 切換、不同 token.json 隔離
- [`04-service-account-alternative.md`](references/04-service-account-alternative.md) — Service Account 取代 OAuth、IAM role、BigQuery / Cloud Storage / Pub/Sub

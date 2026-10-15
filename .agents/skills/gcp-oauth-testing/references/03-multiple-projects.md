# 多 GCP Project 切換

## 每個 project 獨立 state

| 項目 | 獨立？ |
|---|---|
| OAuth client_id | ✅ |
| OAuth client_secret | ✅ |
| refresh_token | ✅（綁定 user 對那個 client 的授權） |
| Test users 清單 | ✅（per project） |
| API 啟用狀態 | ✅ |
| IAM role 設定 | ✅（部分 share via org policy） |

換 project = 換 `client_secret.json` + 換 `token.json` + 加新 test users。

## 切換方式

### 用環境變數

```python
import os
import json
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

PROJECT = os.environ.get('GCP_PROJECT', 'herms')

token_path = f'.gcp/{PROJECT}/token.json'
client_path = f'.gcp/{PROJECT}/client_secret.json'

creds = Credentials.from_authorized_user_file(token_path)
if not creds.valid:
    creds.refresh(Request())

# 跑應用
```

`.gcp/<project>/` 結構：

```
.gcp/
├── herms/
│   ├── client_secret.json
│   └── token.json
├── another-project/
│   ├── client_secret.json
│   └── token.json
```

### 用 gcloud 切換

```bash
# 列 project
gcloud projects list

# 切換
gcloud config set project herms
```

但 `gcloud` 跟 OAuth refresh_token 是分開的。`gcloud config set` 只影響 `gcloud` 自己的 ADC credential，不影響你 Python app 的 token。

## 共用 OAuth client

如果多個 project 邏輯上是同一個應用：

**方案 A**：建一個「中央」GCP project 給 OAuth，其他 project 透過 IAM / Service Account 共享。

**方案 B**：每個 project 自己的 OAuth client，但用同一個 `client_secret.json` 結構。

實務上方案 A 比較好維護。

## 跨 project 服務呼叫

OAuth token 對那個 project 的 API 有效。如果要跨 project 呼叫：

```python
# 用 Project A 的 token 呼叫 Project B 的 API
# → 401 / 403（token 沒 Project B 的 scope）
```

修法：
1. Project B 的 API 也授權 Project A 的 OAuth client（不實際，scope 不 share）
2. 用 Service Account + cross-project IAM（標準做法）

```python
from google.oauth2 import service_account

# Service Account 是 project-level，不是 user-level
# 但可以跨 project 用
creds = service_account.Credentials.from_service_account_file(
    'sa-key.json',
    scopes=['https://www.googleapis.com/auth/cloud-platform']
)

# 用 credentials.with_subject 模擬 user（Domain-Wide Delegation）
# 或直接用 service account，沒 user
```

## 多個 OAuth flow 跑在不同 port

```python
# 多人協作，每個人跑自己的 OAuth flow
# port 8080 / 8081 / 8082 ...（run_local_server() 自動找可用 port）
flow1 = InstalledAppFlow.from_client_secrets_file('client_secret.json', scopes=[...])
creds1 = flow1.run_local_server(port=0)  # 0 = 自動選 port

# 同時跑兩個 flow 不會撞 port
```

`port=0` 讓 OS 分配 random available port。

## 多 project + 同一個 drive folder

如果多個 project 都要存取同一個 Drive folder：

- Folder owner 授權 Project A 的 OAuth client → 拿 refresh_token_A
- Folder owner 授權 Project B 的 OAuth client → 拿 refresh_token_B
- 兩個 token.json 各自存

或者：用 Service Account + Drive API（不需 user 授權的 folder 要先 share 給 service account email）。

## 跨專案 vs 跨環境

| 類型 | 共享？ |
|---|---|
| Dev 環境 + Prod 環境（同一 project） | ❌ 用不同 GCP project 隔離 |
| 個人 laptop + CI | ❌ refresh_token 不同 |
| 團隊成員 | ❌ 各拿各的 |
| Service Account | ✅ 共享（用 key file / env） |

對 batch 應用：Service Account 是首選（共享、永久、不需 user 授權）。

## CI 環境（GitHub Actions / Vercel）

```yaml
# GitHub Actions
- name: Run gcp job
  env:
    GCP_REFRESH_TOKEN: ${{ secrets.GCP_REFRESH_TOKEN }}
    GCP_CLIENT_ID: ${{ secrets.GCP_CLIENT_ID }}
    GCP_CLIENT_SECRET: ${{ secrets.GCP_CLIENT_SECRET }}
  run: python scripts/gcp_job.py
```

```python
# scripts/gcp_job.py
import os
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

creds = Credentials(
    token=None,
    refresh_token=os.environ['GCP_REFRESH_TOKEN'],
    token_uri='https://oauth2.googleapis.com/token',
    client_id=os.environ['GCP_CLIENT_ID'],
    client_secret=os.environ['GCP_CLIENT_SECRET'],
)
creds.refresh(Request())
# 跑 job
```

不要 commit `secrets` 進 git — 用 GitHub repo settings → Secrets。

## Audit log 找哪個 token 還能用

GCP Console → IAM & Admin → Audit Logs → 找最近的 token 用過 → 對應 client_id + user。

或 Cloud Logging：

```
resource.type="oauth_client"
protoPayload.methodName="RefreshCredentials"
```

## Common pitfalls

1. **Token 給 Project A，但 call Project B API** → 401
2. **client_secret.json 換了但 token.json 還用舊的** → invalid_grant
3. **兩個 GCP project 同名（不同 org）** → 選錯 project
4. **Test users 加到 Project A，token 從 Project B 來** → 仍 403（test users 是 per-project）
5. **Production 模式 6 個月沒用 refresh_token** → 過期

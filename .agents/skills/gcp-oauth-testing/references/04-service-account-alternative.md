# Service Account 替代 OAuth

## 什麼是 Service Account

GCP 提供的「機器帳號」，**不需要 user 授權**：

- 屬於 project，不是 user
- 用 JSON key file 或 ADC 認證
- IAM role 控制權限
- 永久有效（除非手動 revoke）

適合 server-to-server 場景。

## 跟 OAuth 比較

| 情境 | OAuth | Service Account |
|---|---|---|
| 需要 user 授權 | ✅ | ❌ |
| 存取 user 自己的 Drive / Gmail | ✅ | ❌（要 share 給 SA） |
| 存取 BigQuery / Cloud Storage | ✅ | ✅（首選） |
| 存取 Compute / Cloud Run | ❌ | ✅（首選） |
| Sensitive scopes | 需 Google 驗證 | 不用 |
| Token 過期 | 7 天 / 1 小時 | 永久 |
| 多人協作 | 各自 token | 共用 SA key |

## 建立 Service Account

### 1. GCP Console

```
IAM & Admin → Service Accounts → Create Service Account
- Service account name: my-batch-job
- Service account ID: my-batch-job
- Service account description: Daily ETL job
- Create and continue
```

### 2. Grant IAM role

```
Grant this service account access to project
- BigQuery Data Viewer
- BigQuery Job User
- Cloud Storage Object Viewer
- (依需求)
- Done
```

### 3. Create Key

```
Actions → Manage keys → Add key → Create new key → JSON
→ 下載 sa-key.json
```

### 4. 存到安全位置

```bash
mkdir -p ~/.gcp
mv sa-key.json ~/.gcp/herms-sa-key.json
chmod 600 ~/.gcp/herms-sa-key.json
```

`.gitignore`：

```gitignore
*-sa-key.json
.gcp/
```

## 用 Service Account 認證

```python
from google.oauth2 import service_account
from google.cloud import bigquery

creds = service_account.Credentials.from_service_account_file(
    'sa-key.json',
    scopes=['https://www.googleapis.com/auth/bigquery']
)

client = bigquery.Client(credentials=creds, project='herms')
query = "SELECT COUNT(*) FROM `herms.dataset.table`"
results = client.query(query).result()
for row in results:
    print(row)
```

## Application Default Credentials (ADC)

不需 explicit credentials file — gcloud / gke / Cloud Run 自動注入：

```python
from google.cloud import bigquery

# 在 GCP 環境（GCE / Cloud Run / GKE）
client = bigquery.Client()  # 自動用 metadata server 拿 SA
```

本地 dev：

```bash
# 一次認證，之後 gcloud / python 都用同一個 SA
gcloud auth application-default login
```

## 跨 project Service Account

```python
# SA 從 Project A 來，但要 call Project B 的資源
creds = service_account.Credentials.from_service_account_file(
    'sa-key.json',
    scopes=['https://www.googleapis.com/auth/cloud-platform']
)

# Project B 的 IAM：把 SA email 加進去，給合適 role
# 例：roles/bigquery.dataViewer on Project B
```

## 模擬 user（Domain-Wide Delegation）

Service Account 模擬 user 存取 user 資料（Drive / Calendar）：

```python
creds = service_account.Credentials.from_service_account_file(
    'sa-key.json',
    scopes=['https://www.googleapis.com/auth/drive.readonly'],
    subject='user@example.com'  # Workspace user email
)
```

需要：
1. SA 啟用 Domain-Wide Delegation
2. Workspace admin 在 admin console 授權該 SA 的 client_id + scopes

對個人 Gmail 不適用（要 Workspace / Cloud Identity）。

## 限制

- Service Account **不能**存取 user 自己的 Drive folder（除非 folder owner 把 SA email 加為編輯者/檢視者）
- Service Account 對某些 API quota 較低
- Free tier quota 計算方式不同

## 用 SA 跑 batch job 範例

```python
# scripts/daily_bigquery_export.py
import os
from google.cloud import bigquery, storage

SA_KEY = os.environ.get('GCP_SA_KEY_PATH', 'sa-key.json')

bq = bigquery.Client.from_service_account_json(SA_KEY)
gcs = storage.Client.from_service_account_json(SA_KEY)

# 1. 跑 BigQuery
query = """
EXPORT DATA OPTIONS(
  uri='gs://my-bucket/exports/*.csv',
  format='CSV',
  overwrite=true
) AS SELECT * FROM `dataset.table` WHERE date >= CURRENT_DATE() - 7
"""
job = bq.query(query)
job.result()
print(f'✅ Exported {job.total_rows} rows')

# 2. 上傳到 Cloud Storage
bucket = gcs.bucket('my-bucket')
for blob in bucket.list_blobs(prefix='exports/'):
    print(f'  {blob.name}: {blob.size} bytes')
```

crontab：

```bash
0 2 * * * cd /home/user/etl && /usr/bin/python3 daily_bigquery_export.py >> /var/log/etl.log 2>&1
```

## Migration 從 OAuth 換 SA

如果原本 OAuth 給 user Drive 權限，現在改用 SA：

1. 創 SA + 給 BigQuery 等專案權限（不需 user 授權）
2. 把 user Drive 內容搬出來（一次性 OAuth 拿資料）
3. SA 跑新工作流（如果不再需要 user Drive 內容）

如果還需要 user Drive：繼續用 OAuth + refresh_token。

## IAM role 速查

| 用途 | Role |
|---|---|
| 讀 BigQuery 表 | BigQuery Data Viewer |
| 跑 BigQuery job | BigQuery Job User |
| 讀 GCS bucket | Storage Object Viewer |
| 寫 GCS bucket | Storage Object Creator / Storage Object Admin |
| 寫 log | Logging Log Writer |
| 部署 Cloud Run | Cloud Run Admin |
| Pub/Sub publish | Pub/Sub Publisher |
| Pub/Sub subscribe | Pub/Sub Subscriber |

完整清單：https://cloud.google.com/iam/docs/understanding-roles

## 何時選 OAuth vs SA

| 應用 | 選 |
|---|---|
| 個人 app 存取自己 Drive | OAuth |
| 個人 app 跑 daily BigQuery | SA |
| 多人協作存取 shared Drive | OAuth（每人各自的） |
| CI 跑 nightly job | SA |
| 第三方 user 用你的 app 連他們 Drive | OAuth + Production + Google 驗證 |
| 內部工具連 BigQuery | SA |

## References

- [Google Cloud IAM roles](https://cloud.google.com/iam/docs/understanding-roles)
- [Service accounts](https://cloud.google.com/iam/docs/service-accounts)
- [Application Default Credentials](https://cloud.google.com/docs/authentication/provide-credentials-adc)

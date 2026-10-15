# GCP Console 加 Test Users（細節）

## 路徑導航

新版 GCP Console 結構（2025+）：

```
1. https://console.cloud.google.com/
2. 選 Project（top-left dropdown）→ 你的 project
3. 左側 menu → 「Google Auth Platform」（不是「APIs & Services」）
4. 左側 submenu → 「目標對象」（Audience）
5. 找到「Test users」section → 「Add users」按鈕
6. 輸入 email
7. 「Save」
```

舊版（< 2024）路徑：

```
APIs & Services → OAuth consent screen → Test users → Add users
```

新版改成「Google Auth Platform」後入口位置變了。新用戶容易找不到。

## 驗證是否已加

加完後回到 Audience 頁面，「Test users」section 應列出你加的 email。如果沒看到：

- 按了 Save 但頁面沒重整 → 重整
- email 拼錯 → 改重來
- 加了但被當作 Production user 警告 → 確認 publishing status = Testing

## 一次加多人

GCP Console UI 不支援 batch。但可以用 API（gcloud）：

```bash
# 不行 — Test users 只能從 UI 加，沒有公開 API
```

或用 gcloud：

```bash
# 也沒直接支援
gcloud auth list  # 看當前 authorized accounts
```

**實務上**：手動加。如果一次要加 10+ 個，準備好 email 清單 → 一次貼多個（用換行分隔）→ 一次 Save。

## Owner account 也要加

即使你是：
- `jtlai0921@gmail.com` (project owner)
- `jtlai0921@gmail.com` (billing account owner)
- `jtlai0921@gmail.com` (project creator)

**第一次 OAuth 登入仍會被擋**（403 access_denied）。

解：把 owner account 也手動加到 Test users。

這個設計是 Google 防止開發者不小心把測試版推給 end user。但對個人開發者很煩。

## 多人協作

團隊協作 GCP project：

1. Owner 開 OAuth consent screen
2. Owner 加團隊成員 email 到 Test users
3. 每人用同一個 `client_secret.json` + `client_id` 跑 OAuth flow
4. 每人會拿到**自己**的 `refresh_token`（授權 user 不同）

不要共享 refresh_token — 它綁定 user account，share 違反 Google ToS。

正確做法：

```python
# 每個 developer 自己的 token.json
# CI 環境用 dedicated service account
```

## 切到 Production 但不驗證 sensitive scope

如果你只用到 non-sensitive scopes（drive.readonly / bigquery.readonly / sheets.readonly）：

1. Audience → 「PUBLISH APP」→ 選 Production
2. 不需要 sensitive scope → 不需 Google 驗證
3. 立即生效

但 Production 模式測試 user 限制：
- 仍可加 test users（user 沒限制）
- 但所有用戶的 access_token 7 天過期
- refresh_token 6 個月 idle 過期

對 batch 應用反而沒 Testing 模式好。

## Reference

完整 Google OAuth 文件：
- [Setting up OAuth 2.0](https://support.google.com/cloud/answer/6158849)
- [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) — 測試 API 不用寫 code

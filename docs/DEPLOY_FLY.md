# Fly.io 部署指南 (FastAPI 後端)

本指南說明如何將 `site_api` FastAPI 服務部署到 Fly.io。
靜態前端頁面仍可保留在 Render（使用現有 `render.yaml`）。

---

## 前置條件

### 1. 安裝 flyctl

```powershell
# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex
```

### 2. 登入 / 建立帳號

```bash
# 已有帳號
fly auth login

# 尚無帳號
fly auth signup
```

---

## 初始化 Fly.io App

在此 repo 根目錄執行：

```bash
fly launch --no-deploy
```

當系統提問時：

- **App name**: `donttalk-api`（或其他名稱，需同步更新 `fly.toml` 中的 `app`）
- **Region**: `nrt`（東京，離台灣最近）
- **Copy existing config**: **Yes**（使用現有 `fly.toml`）

> `fly launch` 會偵測 `Dockerfile` 並套用 `fly.toml` 設定，無需重新建立。

---

## 設定 Secrets（環境變數）

```bash
fly secrets set DATABASE_URL="<your-postgres-connection-string>"
```

可驗證是否設定成功：

```bash
fly secrets list
```

> `DATABASE_URL` 格式範例：  
> `postgresql://user:password@host:5432/dbname`

---

## 部署

```bash
fly deploy
```

或強制不使用快取：

```bash
fly deploy --no-cache
```

---

## 部署後驗證

取得 App 的 endpoint：

```bash
fly status
fly info
```

測試 API health check：

```
GET https://<your-app>.fly.dev/healthz
```

---

## 前端設定更新

部署完成後，若靜態站（Render）的 API URL 需要更新，請確認
`about_me.html`、`gene_ai.html`、`index.html` 中的 API hostname 自動偵測邏輯
能對應到新的 Fly.io hostname `donttalk-api.fly.dev`。

若使用 `app-config.js` 本機覆蓋，修改為：

```js
window.APP_CONFIG = {
  API_BASE_URL: "https://donttalk-api.fly.dev",
};
```

---

## 常用指令

| 指令                   | 說明             |
| ---------------------- | ---------------- |
| `fly status`           | 查看 App 狀態    |
| `fly logs`             | 查看即時 log     |
| `fly deploy`           | 重新部署         |
| `fly secrets list`     | 列出所有 secrets |
| `fly ssh console`      | SSH 進入容器     |
| `fly scale memory 512` | 調整記憶體       |

---
name: deploy-vercel-prebuilt
description: "Vercel Hobby plan 部署完整 SOP。當用戶說「部署」「deploy」「上線」「redeploy」「build壞掉」「部署後 404」「Vercel token 過期」「env 沒生效」「framework 設定」「12 functions cap」「stale build cache」時使用。涵蓋 PowerShell token 引號陷阱、framework=null 吞 rewrites、rootDirectory 設 null、--archive tgz 必要性、.vercel/output stale cache、warm instance env 不更新、LINE webhook HMAC raw body 解析。適合 Astro / Next.js / 純靜態 + Vercel Hobby plan。"
license: MIT
metadata:
  author: donttalk-deploy
  version: "1.0.0"
  tags:
    - vercel
    - deploy
    - hobby-plan
    - powershell
    - 404
    - framework
    - cache
---

# Vercel Prebuilt Deploy (Hobby Plan)

> Vercel Hobby plan 上 `git push` auto-deploy **不可靠**（Ready 但 URL 全 404）。本 skill 走 `vercel build` + `vercel deploy --prebuilt` 手動管線，搭配真實 HTTP 驗證。

## 適用場景

| 觸發關鍵字 | 場景 |
|---|---|
| 「部署」「deploy」「上線」 | 一般 release |
| 「redeploy」 | 已有的 production deployment 重新觸發（最快路徑） |
| 「404」「沒內容」「Ready 但打不開」 | auto-deploy 壞掉 / stale cache |
| 「token 過期」「401」 | OAuth token 30 天到 |
| 「env 沒生效」「env 改了但沒用」 | warm instance 沒重啟 |
| 「framework」「rewrites」 | `/api/*` 404 但 function 還在 build output |
| 「12 functions」「Serverless Functions 超過」 | Hobby plan cap |

## 部署 Workflow（從快到慢）

### Path A — 最快（~23s）：`vercel redeploy <uid>`

適合：純 env / config 改動、想讓 warm instance 重啟、不需 rebuild。

```powershell
# 拿 production uid
$auth = Get-Content "$env:APPDATA\com.vercel.cli\Data\auth.json" -Raw | ConvertFrom-Json
$uid = (Invoke-RestMethod -Uri "https://api.vercel.com/v6/deployments?projectId=prj_xxxxxxxxxxxx&limit=1&target=production" -Headers @{Authorization="Bearer " + $auth.token}).deployments[0].uid
# 或
$uid = (& "$env:APPDATA\npm\vercel.cmd" ls --prod).Split("`n")[0].Trim()

& "$env:APPDATA\npm\vercel.cmd" redeploy $uid --yes
```

### Path B — 完整 rebuild（~2 分鐘）：build + prebuilt deploy

適合：改了 source code、dist 需要重產、auto-deploy 壞掉。

```powershell
$ErrorActionPreference = 'Stop'
Set-Location "D:\project"  # 一定要從 repo root，vercel.json 在 repo root

# 1. Token 從 cached auth.json 拿（不要 --token 引號）
$auth = Get-Content "$env:APPDATA\com.vercel.cli\Data\auth.json" -Raw | ConvertFrom-Json
$env:VERCEL_TOKEN = $auth.token

# 2. 清 stale build cache（不刪 dist，dist 已經是 source of truth）
mavis-trash .vercel/output astro/.vercel/output astro/node_modules/.vite

# 3. Build
& "$env:APPDATA\npm\vercel.cmd" build --prod --yes

# 4. Deploy（--archive tgz 防 15000 file 上限；--scope 防 team 混淆）
& "$env:APPDATA\npm\vercel.cmd" deploy --prebuilt --prod --yes --archive tgz --scope donttalk

# 5. 驗證（CLI Ready 不算）
Start-Sleep -Seconds 30
Invoke-WebRequest -Uri "https://donttalk.vercel.app/<changed-path>/" -Method Head
```

### Path C — ~~git push auto-deploy~~ ❌ 不要用

Hobby plan 上 git push auto-deploy **整個壞掉**：dashboard 顯示 Ready ≠ 內容齊全（Ready = pipeline 沒 crash）。改完永遠要再手動 Path B。

## 部署前 5 項檢查

- [ ] `vercel.json` 在 repo root（不要 `rootDirectory: "astro"`，用 `null` 從 root 跑）
- [ ] `outputDirectory: "astro/dist"`（framework=null 配 vite-style layout）
- [ ] `framework: "astro"` 已 PATCH 進 Vercel project（不是 `null`，否則吞 rewrites）
- [ ] `functions` map 只列 public endpoints（避開 12-function cap）
- [ ] 上次 build hash ≠ `.vercel/output/static/` hash（stale cache 訊號）

## 部署後 4 項驗證

每個改動的 path 都要：

```powershell
Invoke-WebRequest -Uri "https://donttalk.vercel.app/<path>/" -Method Head
```

預期 `200`，出現 `404`：
1. 檢查 `npx vercel inspect <id> --json` 的 `builds[0].config.vercelConfig` 有沒有 rewrites
2. 檢查 `npx vercel ls --prod` 確認 deployment 對的 project
3. 重跑 Path B 帶清 cache
4. 如果還是壞，把 `framework` PATCH 回 `"astro"` 重 build

## References

- [`01-token-bootstrap.md`](references/01-token-bootstrap.md) — PowerShell token 引號陷阱、auth.json 結構、30 天過期、refresh 失敗 fallback
- [`02-hobby-plan-pitfalls.md`](references/02-hobby-plan-pitfalls.md) — 12-function cap、git push auto-deploy 為什麼壞、--archive tgz 必要性
- [`03-stale-build-cache.md`](references/03-stale-build-cache.md) — `.vercel/output` stale cache 症狀與清法、`node_modules/.vite` 一併清
- [`04-framework-and-rewrites.md`](references/04-framework-and-rewrites.md) — framework=null 吞 rewrites 修法、合法 framework 值清單
- [`05-webhook-raw-body.md`](references/05-webhook-raw-body.md) — Vercel Node runtime `req.rawBody` undefined，要讀 raw stream

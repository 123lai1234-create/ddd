# 自動部署設定

這個 repo 已加入 GitHub Actions workflow：

- push 到 `main` 時會自動部署 Railway 後端
- 後端成功後，會依序自動部署 Vercel、Netlify、Cloudflare Pages 前端
- 也支援 GitHub Actions 的 `workflow_dispatch` 手動觸發

## 需要的 GitHub Secrets

請在 GitHub repo 的 Settings > Secrets and variables > Actions 新增以下 secrets：

- `RAILWAY_API_TOKEN`
- `VERCEL_TOKEN`
- `NETLIFY_AUTH_TOKEN`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`（建議新增；workflow 目前仍保留 repo 內 fallback 值）

## 目前對應平台

- Railway project: `donttalk-api`
- Railway service: `donttalk-api`
- Vercel project: `donttalk`
- Netlify site: `donttalk`
- Cloudflare Pages project: `donttalk`

## 目前可用網址

- Vercel: `https://donttalk.vercel.app`
- Netlify: `https://donttalk.netlify.app`
- Cloudflare Pages: `https://donttalk.pages.dev`
- Railway API: `https://donttalk-api-production.up.railway.app`

## 注意

- Railway 的 project 與 service 名稱已改成 `donttalk-api`。
- Railway 提供的公開 `up.railway.app` 網址目前也已切換成 `donttalk-api-production.up.railway.app`。
- `vercel.json` 與 `netlify.toml` 已同步更新到新的 Railway public domain。
- Cloudflare Pages 這條 CI 是用 Wrangler 做 direct upload，不是走 Cloudflare 的 Git integration。
- 如果 `donttalk` 這個 Pages 專案是用 GitHub repo 直接連進 Cloudflare 建立的，GitHub Actions 內的 `wrangler pages deploy` 會失敗；請改成 Direct Upload 專案，或移除該專案的 Git 連動後再用 CI 上傳。
- Cloudflare API token 至少要有 `Account / Cloudflare Pages / Edit` 權限。

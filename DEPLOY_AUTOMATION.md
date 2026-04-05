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

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

- Railway 與 Vercel 是目前的主要上線路徑；Netlify 與 Cloudflare Pages 在 workflow 內屬於 best-effort。也就是說，如果這兩個平台因權限或 token 問題失敗，GitHub Actions 會發出 warning，但不再把整體部署判成失敗。
- Railway 的 project 與 service 名稱已改成 `donttalk-api`。
- Railway 提供的公開 `up.railway.app` 網址目前也已切換成 `donttalk-api-production.up.railway.app`。
- `vercel.json` 與 `netlify.toml` 已同步更新到新的 Railway public domain。
- Cloudflare Pages 這條 CI 是用 Wrangler 做 direct upload，不是走 Cloudflare 的 Git integration。
- 如果 `donttalk` 這個 Pages 專案是用 GitHub repo 直接連進 Cloudflare 建立的，GitHub Actions 內的 `wrangler pages deploy` 會失敗；請改成 Direct Upload 專案，或移除該專案的 Git 連動後再用 CI 上傳。
- Cloudflare API token 至少要有 `Account / Cloudflare Pages / Edit` 權限。

## 平台權限提示

### Netlify

- `NETLIFY_AUTH_TOKEN` 必須來自擁有 `donttalk` 站台的 Netlify 使用者或 team。
- 若 GitHub Actions log 出現 `JSONHTTPError: Forbidden`，通常代表 token 不屬於該站台所在的帳號或 team，或該 token 無法建立 production deploy。
- 目前目標 site id 是 `65af318c-45c6-413e-837b-685a4fc01444`；更新 token 後，請先確認它對這個 site id 有部署權限。

### Cloudflare Pages

- `CLOUDFLARE_API_TOKEN` 至少需要 `Account / Cloudflare Pages / Edit` 權限，而且要作用在 account `3c09721dfbc2ab9071ccd45f257813af`。
- 若 Wrangler log 出現 `Authentication error [code: 10000]`，優先檢查 token 是否綁到正確 account，以及是否缺少 Pages 編輯權限。
- 建議額外給 `User / User Details / Read`，避免 Wrangler 無法識別 token 身分時只回模糊錯誤。
- 目前 workflow 是用 `wrangler pages deploy` 做 direct upload，所以 `donttalk` 這個 Pages project 也必須接受 direct upload 流程。

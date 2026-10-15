# Hobby Plan 部署陷阱

## 1. 12 Serverless Functions cap

錯誤：
```
No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan
```

根因：每個 `.js` 檔在 `api/`（含 `api/<group>/lib/*.js`）自動被偵測成 serverless function。

### 修法：`vercel.json` 顯式列 `functions` map

```json
{
  "functions": {
    "api/line/webhook.js":      { "maxDuration": 26 },
    "api/line/health.js":       { "maxDuration": 10 },
    "api/line/push.js":         { "maxDuration": 26 },
    "api/line/subscribers.js":  { "maxDuration": 26 },
    "api/index.mjs":            { "maxDuration": 26 }
  }
}
```

只列 public endpoints，library 被打包進 endpoint 不單獨部署。

修完後 ~11 functions in build output（5 endpoints + 6 catch-all remnants），comfortable margin。

## 2. git push auto-deploy 整個壞掉

**症狀**：commit push + Vercel auto-deploy Ready，但 `https://<project>.vercel.app/*` 全 404。

**根因**：
- Dashboard 顯示 Production Ready ≠ 內容齊全（Ready = pipeline 沒 crash）
- 自動 build 跑 `cd <root> && npm install --ignore-scripts && npm run build`，但 output 有時沒完整 populate `.vercel/output/static/`
- 特別是達到 12-function cap 或前次 build 留 stale state 時

**修法**：`git push` 後**永遠**再手動 `vercel deploy --prebuilt`，並用 `Invoke-WebRequest -Method Head` 實打驗證。

不要相信 auto-deploy。

## 3. --archive tgz 必要性

`vercel deploy --prebuilt` 上傳 `.vercel/output/` 到 Vercel side。當 `rootDirectory` 透過 API 設成子目錄時，Vercel CLI 會走整個子目錄想上傳全部 → 超過 15000 file 上限：

```
Error: Invalid request: \files\ should NOT have more than 15000 items, received 25501.
```

### 修法（推薦）

```powershell
& vercel deploy --prebuilt --prod --yes --archive tgz
```

`--archive tgz` 壓縮上傳（部署變慢 ~2 分鐘但安全）。

或 PATCH project 把 `rootDirectory` 設成 `null`，CLI 只上傳 `.vercel/output/` (~465 files)。

## 4. framework=null 吞 rewrites

**症狀**：`/api/*` 全 404，但 lambda function 還在 build output 裡。

**根因**：Vercel CLI 54 在 `framework` 為 `null` 時 silently drop `rewrites` from vercel.json。

**驗證**：
```powershell
npx vercel inspect <deployment-id> --json
# builds[0].config.vercelConfig 只有 {name, version:2}，沒有 rewrites / outputDirectory
```

**修法**：API PATCH project 設 `framework: "astro"`，durable，存 Vercel server 端，vercel.json 改不影響。

合法 framework 值（其他會 400 invalid_framework）：
`astro`, `nextjs`, `nuxtjs`, `gatsby`, `remix`, `svelte`, `sveltekit`, `vite`,
`vue`, `angular`, `react`, `create-react-app`, `hugo`, `jekyll`, `eleventy`,
`middleman`, `preact`, `ember`, `solid`, `flutter`, `lit`, `dojo`, `polymer`,
`rax`, `elm`

注意：`framework: "astrojs"` 會 schema error，只能用 `"astro"`。

## 5. warm instance env 不更新

Vercel Serverless Functions 在 warm instance 上不會自動 reload env vars。改完 Vercel dashboard env：
- 新 cold start 用新 env
- 還在跑的 warm instance 用舊 env 直到 idle 收回

**修法**：改完 env 後 `vercel redeploy <uid>` 強制所有 instance 重啟。

## 6. ESM / CJS 混用

`.mjs` import 會破壞 CJS-compiled functions。Vercel 自動偵測 lambda runtime 時，CJS bundle 進 ESM env 會失敗 — 症狀是 build success 但 runtime 拋 `ERR_REQUIRE_ESM`。

**修法**：保持所有 serverless function 統一 module format（全用 `.js` CommonJS 或全用 `.mjs` ESM），不要混。

## 7. build 一定要從 repo root 跑

`vercel.json` 在 repo root，`outputDirectory: "<subdir>/dist"`。

**不要從 subdir 跑**。Vercel CLI 會 walk up 找 vercel.json，然後把 `.vercel/output/` 寫到 repo root，不是 subdir。後續 `vercel deploy --prebuilt` 找不到 output、fallback 去讀舊的 `dist/`，結果 deploy 出去的檔案是上次的。

正確流程：**先 `Set-Location <repo-root>` 再 build + deploy**。

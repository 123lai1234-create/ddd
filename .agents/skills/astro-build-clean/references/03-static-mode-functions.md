# output: 'static' 模式對 catchall 函數的影響

## 問題

`astro.config.mjs` 沒有 `@astrojs/vercel` adapter 時：

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
export default defineConfig({
  output: 'static',  // ← 預設
  // 沒有 adapter
});
```

`npm run build` 只產 `dist/`，**不產** `.vercel/output/functions/`。

## 症狀

### Path 1 — Vercel cloud build（`git push` 觸發）

```powershell
cd D:\project
git add -u
git commit -m "..."
git push origin <branch>
```

Vercel cloud 偵測 Astro framework → 用內建 Astro builder：

```
✓ Detected Framework: astro
✓ Running "astro build"
✓ Found 1 function: api/catchall.func
```

cloud 端的 `@astrojs/vercel` adapter 是 Vercel builder 內建，**會自動產 catchall.func + static assets**。這條路徑 OK。

### Path 2 — 本地 CLI prebuilt（從 astro/ 跑）

```powershell
cd D:\project\astro
npx vercel deploy --prebuilt --prod
```

CLI 讀 `astro/vercel.json`（或 fallback 上層）拼路徑 → `outputDirectory: "dist"` 相對 `rootDirectory: "astro"` → 變成 `astro/astro/dist` 不存在 → deploy 全壞。

### Path 3 — 本地 CLI prebuilt（從 repo root 跑）

```powershell
cd D:\project
npx vercel deploy --prebuilt --prod
```

CLI 讀 repo root `vercel.json` 拼路徑 → 對的，但 `.vercel/output/functions/` 沒產（因為本地 `astro build` 沒 `@astrojs/vercel` adapter）→ functions 是空的 → API 404。

## 唯一能用的本地 CLI deploy

```powershell
cd D:\project
$env:VERCEL_TOKEN = "<full_access_token>"
$env:VERCEL_TOKEN_STORAGE = "file"
$env:VERCEL_API_TOKEN = $env:VERCEL_TOKEN
npx vercel deploy --prod --yes
```

這個走 Vercel cloud build（**不**走 `--prebuilt`），cloud 端有完整 Astro builder → 產 catchall。

但實測：2026-10-01 親測，Vercel cloud build 也只跑 astro build，**沒有 functions** → production API 全部 404。

所以**最可靠路徑仍是 git push**：

```powershell
cd D:\project
git add -u
git commit -m "..."
git push origin <branch>
```

Vercel GitHub integration 觸發 cloud build → 用內建 Astro builder → 產 catchall + static → deploy 成功。

## Rollback（如果新 deploy 炸）

git push 完自動 deploy 壞，aliases production 不退：

```powershell
npx vercel alias "<working-prev-host>.vercel.app" "<project>.vercel.app"
```

例如：

```powershell
npx vercel alias donttalk-7xxwdgjv6-donttalk.vercel.app donttalk.vercel.app
```

從 `npx vercel ls` 拿「上次 work 的」host。

## 驗證 production 有 functions

```powershell
curl.exe -sS -o /dev/null -w "%{http_code}\n" "https://<project>.vercel.app/api/healthz"
```

- 200 = 有 catchall function
- 404 = 函數沒被 deploy 出來（astro build 沒建）

## GitHub deployments API 看 Preview deploy 狀態

不用 token 也能查 Vercel auto-deploy 觸發了什麼，透過 GitHub CLI：

```powershell
gh api "repos/<owner>/<repo>/deployments?per_page=5" --jq ".[] | (.id|tostring) + \" \" + .environment + \" \" + (.sha[:7]) + \" \" + .created_at"
gh api "repos/<owner>/<repo>/deployments/<id>/statuses" --jq ".[] | .state, .description, .target_url"
```

- `target_url` 就是 Preview URL（`https://<project>-<hash>-<team>.vercel.app`）
- 兩個 environment 並存：`Preview – <project>` (success 通常) + `Preview – project` (經常 failure 是 type=LAMBDAS 空 output memory 警告)
- 確認 fix 上線直接 curl Preview URL，不用 deploy 到 prod

## git push auto-deploy 觸發的不是 Production

這個專案的 Vercel project 配置對 main branch push 只跑 **Preview**。要 Production 必須 `--prod` 旗標（要 CLI token）。

驗證 fix 不必 deploy prod — push 後 30s 內會有 Preview URL，curl 那邊確認就夠了。

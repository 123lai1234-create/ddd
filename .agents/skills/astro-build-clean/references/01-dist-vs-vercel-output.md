# dist/ vs .vercel/output/ 同步機制

## 問題陳述

```
astro build   → 寫 astro/dist/        (source of truth for static)
vercel build  → 寫 .vercel/output/    (Vercel CLI 看的)
```

兩者**不自動同步**。`@vercel/static-build` 內部把 `outputDirectory` (astro/dist/) copy 到 `.vercel/output/static/`，**但不是冪等**。

## 症狀

local `astro/dist/scripts/music-player.js` hash `9101fe84`（新）
`.vercel/output/static/scripts/music-player.js` hash `5516c8ac`（舊）

部署出去仍 serve 舊檔，即使 `vercel deploy --prebuilt`。

驗證方式：

```powershell
$local = (Get-FileHash "astro\dist\scripts\music-player.js" -Algorithm SHA256).Hash
$out = (Get-FileHash ".vercel\output\static\scripts\music-player.js" -Algorithm SHA256).Hash
Write-Host "local: $local"
Write-Host "out:   $out"
# 兩個必須相同
```

## 為什麼不是冪等

`@vercel/static-build` 用 recursive copy 但不刪除 dest 才有的檔案：

- src 改了 → copy 過去 ✅
- src 刪了 → dest 留著 ❌
- src 加了 → copy 過去 ✅

結果：rename / delete 的檔案殘留在 `.vercel/output/static/`，部署出去仍存在。

## 修法：每次清 cache 後重 build

```powershell
mavis-trash .vercel/output astro/.vercel/output astro/node_modules/.vite
& "$env:APPDATA\npm\vercel.cmd" build --prod --yes
```

清三個：
- `.vercel/output` — repo root 的 Vercel output
- `astro/.vercel/output` — 萬一從 astro 跑 build 殘留
- `astro/node_modules/.vite` — Vite chunk cache

## 替代方案：vercel buildCommand 改寫

`vercel.json`：

```json
{
  "buildCommand": "node ./vercel-build.mjs"
}
```

`vercel-build.mjs`：

```js
import { rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
rmSync('.vercel/output', { recursive: true, force: true });
rmSync('astro/.vercel/output', { recursive: true, force: true });
rmSync('astro/node_modules/.vite', { recursive: true, force: true });
execSync('cd astro && npm run build', { stdio: 'inherit' });
```

但這個走 Vercel cloud build 觸發，**不會**在本地 `vercel build --prod` 跑。所以本地 SOP 還是要手動清。

## 自動驗證 deploy 後 hash

deploy 後抓遠端檔案比對：

```powershell
$local = (Get-FileHash "astro\dist\scripts\<file>.js" -Algorithm SHA256).Hash.Substring(0,16)
$remote = (Invoke-WebRequest -Uri "https://<project>.vercel.app/scripts/<file>.js").Content
$remoteHash = [System.BitConverter]::ToString(
  [System.Security.Cryptography.SHA256]::Create().ComputeHash(
    [System.Text.Encoding]::UTF8.GetBytes($remote)
  )
).Replace("-","").Substring(0,16).ToLower()
if ($local -ne $remoteHash) { Write-Warning "Stale: $local vs $remoteHash" }
```

## Git push auto-deploy 在 Hobby plan 壞掉

**症狀**：commit push + Vercel auto-deploy Ready，但 `https://<project>.vercel.app/*` 全 404。

**根因**：
- Dashboard 顯示 Production Ready ≠ 內容齊全（Ready = pipeline 沒 crash）
- 自動 build 跑 `cd astro && npm install --ignore-scripts && npm run build`，但 output 有時沒完整 populate `.vercel/output/static/`
- 特別是達到 12-function cap 或前次 build 留 stale state 時

**修法**：`git push` 後**永遠**再手動 `vercel deploy --prebuilt`，並用 `Invoke-WebRequest -Method Head` 實打驗證。

## Vercel CLI cache path 細節

`vercel build` 預設把 output 寫到 `<project-root>/.vercel/.vercel/output/`（注意兩層 `.vercel`）。

Monorepo 結構（`D:\project` 是 root, `astro/` 是 framework root）：
- 預期 output 在 `D:\project\.vercel\.vercel\output\`
- 不是 `D:\project\astro\.vercel\.vercel\output\`

PowerShell 寫法：

```powershell
$projectRoot = "D:\project"
$astroDir = "D:\project\astro"
$cacheFunc = Join-Path $projectRoot ".vercel\.vercel\output\functions\api\catchall.func"
```

`vercel-build.mjs` 內要對：

```js
const projectRoot = path.dirname(astroDir);
const cacheFunc = path.join(projectRoot, '.vercel', '.vercel', 'output', 'functions', 'api', 'catchall.func');
```

不然 Vercel CLI re-link 會 cache 對不上 Vercel dashboard Settings 顯示的 deploy 對應 function bundle。

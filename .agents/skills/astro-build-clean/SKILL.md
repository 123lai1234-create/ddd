---
name: astro-build-clean
description: "Astro 6.x build + 部署前清理完整 SOP。當用戶說「build 壞掉」「dist 沒更新」「.vercel/output stale」「pagefind 沒索引」「Astro static 模式」「catchall function 404」「Hobby plan 12 functions cap」時使用。涵蓋 astro build vs vercel build 互動、dist/ 跟 .vercel/output/ 不同步問題、@astrojs/vercel adapter 必要性、output: 'static' 對 .vercel/output/functions/ 影響、pagefind 1.3.0 build step、stale cache 預防、monorepo 結構的 Vercel CLI cache path。應用：astro 6.x + Vercel Hobby 部署、任何 Astro 6 + git push auto-deploy 壞掉情境。"
license: MIT
metadata:
  author: donttalk-deploy
  version: "1.0.0"
  tags:
    - astro
    - build
    - vercel
    - pagefind
    - dist
    - static
    - hobby-plan
    - monorepo
---

# Astro Build Clean

> `astro build` 寫 `dist/`，`vercel deploy --prebuilt` 讀 `.vercel/output/`。兩者**不自動同步** — 沒清 stale cache 就 deploy = 上去是舊檔。

## 核心關係

| 動作 | 寫到 | 誰讀 |
|---|---|---|
| `astro build` | `astro/dist/` | 瀏覽器（直接 serve） |
| `vercel build` | `.vercel/output/` | `vercel deploy --prebuilt` 上傳 |
| `npx pagefind --site dist --output-path dist/pagefind` | `dist/pagefind/` | 瀏覽器搜尋 |

**問題**：`astro build` 只寫 `dist/`，**不會**自動同步到 `astro/.vercel/output/static/`。但 `vercel deploy --prebuilt` 從 `.vercel/output/` 上傳，**不是** `dist/`。

**結果**：build 改了 dist，deploy 還是上傳舊的 `.vercel/output/`（Vercel 用 stale 26,499 bytes 的 HTML，不看隨請求的 Last-Modified）。

## Build SOP

### Step 1 — 清 stale cache

```powershell
mavis-trash .vercel/output astro/.vercel/output astro/node_modules/.vite
```

三個都清：repo root 跟 astro/ 下的 .vercel/output、Vite cache（會留 stale chunks）。

### Step 2 — astro build

```powershell
cd D:\project\astro
npm run build
# 產出 dist/ + dist/pagefind/（pagefind script 自動跑）
```

`package.json` 內 `build` script：
```json
"build": "astro build && npx pagefind --site dist --output-path dist/pagefind"
```

pagefind 1.3.0 自動索引 `dist/**/*.html` 到 `dist/pagefind/`。

### Step 3 — vercel build（從 repo root）

```powershell
cd D:\project
& "$env:APPDATA\npm\vercel.cmd" build --prod --yes
```

`vercel.json` 在 repo root，設定：

```json
{
  "framework": null,
  "outputDirectory": "astro/dist",
  "buildCommand": null,
  "installCommand": null,
  "trailingSlash": true,
  "functions": { ... }
}
```

`@vercel/static-build` 把 `outputDirectory` (astro/dist/) copy 到 `.vercel/output/static/`，**但不是冪等** — 舊檔可能不被覆蓋。

### Step 4 — 驗證 hash

```powershell
$local = (Get-FileHash "astro\dist\<file>" -Algorithm SHA256).Hash.Substring(0,16)
$out = (Get-FileHash ".vercel\output\static\<file>" -Algorithm SHA256).Hash.Substring(0,16)
if ($local -ne $out) { Write-Warning "Stale cache: $local vs $out" }
```

local `astro/dist/<file>` 跟 `.vercel/output/static/<file>` hash 必須相同。

### Step 5 — deploy

詳見 `deploy-vercel-prebuilt` skill。

## 為什麼一定要從 repo root 跑 `vercel build`

`vercel.json` 在 `D:\project\vercel.json`。

**不要從 `D:\project\astro` 跑**。Vercel CLI 會 walk up 找 vercel.json，然後把 `.vercel/output/` 寫到 `D:\project\.vercel\output`（repo root），不是 `D:\project\astro\.vercel\output`。

後續 `vercel deploy --prebuilt` 找不到 output、fallback 去讀舊的 `astro/dist/`，結果 deploy 出去的檔案是上次的。

正確流程：**先 `Set-Location "D:\project"` 再 build + deploy**。

## output: 'static' 模式不生 functions

`astro.config.mjs` 沒有 `@astrojs/vercel` adapter → `npm run build` 只生 static output，不生 `.vercel/output/functions/`。

**症狀**：
- `npx vercel deploy --prod`（無 `--prebuilt`）→ Vercel cloud 跑 `astro build` 只產 static，沒有 functions → production API 全部 404
- `npx vercel deploy --prebuilt` 從 `D:\project/astro/` 跑 → CLI 讀 local astro/vercel.json 拼出 `outputDirectory: "dist"` 相對 rootDirectory `astro` → 變成 `astro/astro/dist` 不存在
- `npx vercel deploy --prebuilt --local-config ../vercel.json` 從 astro 跑 → 一樣會撞 outputDirectory 解析

**唯一能用的 deploy 路徑**：

```powershell
cd D:\project
git add -u
git commit -m "..."
git push origin <branch>
# Vercel 自動從 branch 觸發 build + production deploy
# 透過 GitHub integration，OAuth scope 設好
# Vercel cloud 偵測 Astro framework → 自動用內建 Astro builder
# 產出 .vercel/output/functions/（含 catchall）+ static assets
```

或 fallback CLI（git push 失敗時）：

```powershell
cd D:\project
$env:VERCEL_TOKEN = "<full_access_token>"
$env:VERCEL_TOKEN_STORAGE = "file"
$env:VERCEL_API_TOKEN = $env:VERCEL_TOKEN
npx vercel deploy --prod --yes
```

## catchall function 在 production

Vercel Astro builder 對 catchall route 自動產 `api/catchall.func/catchall.mjs`（edge runtime）。

驗證 production 有 functions：

```powershell
curl.exe -sS -o /dev/null -w "%{http_code}\n" "https://<project>.vercel.app/api/healthz"
```

200 = 有 catchall function；404 = 函數沒被 deploy 出來（astro build 沒建）。

## Pagefind Build

`astro/pagefind/` 已 commit index（`pagefind.js` + `.pf_meta`）— 但這是上次 build 的 snapshot，**改內容後要重建**。

### 自動 build

`package.json` 內 `build` script 已配：

```json
"build": "astro build && npx pagefind --site dist --output-path dist/pagefind"
```

`astro build` 跑完自動觸發 `npx pagefind --site dist --output-path dist/pagefind`：
- 掃 `dist/**/*.html`
- 寫 index 到 `dist/pagefind/`
- 生成 `pagefind.js` + 各語言的 `.pf_meta`

### 手動 rebuild

```powershell
cd D:\project\astro
npx pagefind --site dist --output-path dist/pagefind
```

### 哪些頁會被索引

預設所有 `dist/**/*.html`。要排除：

```powershell
npx pagefind --site dist --output-path dist/pagefind --exclude-selectors "nav,footer,.no-index"
```

或 astro 前端加 `data-pagefind-meta="hidden"`：

```html
<div data-pagefind-meta="hidden">這段不索引</div>
```

### Pages with `<html>` wrapper required

Astro 預設每個 `.astro` 頁都包 `<html>`，Pagefind 才能 parse。**如果頁面用 `<Fragment>` 而不是 `<html>` 開頭，Pagefind 會跳過**。

檢查：

```powershell
Get-Content astro\dist\index.html -TotalCount 5
# 預期第一行是 <!DOCTYPE html><html ...>
```

## 不要信 Ready，要實際打

Vercel CLI 顯示 Ready **不代表頁面有內容**（Ready = pipeline 沒 crash）。每個改動的 path 都要 `Invoke-WebRequest -Method Head` 驗證：

```powershell
Invoke-WebRequest -Uri "https://donttalk.vercel.app/<changed-path>/" -Method Head
```

預期 `200`，出現 `404`：
1. 檢查 `npx vercel inspect <id> --json` 的 `builds[0].config.vercelConfig` 有沒有 rewrites
2. 檢查 `npx vercel ls --prod` 確認 deployment 對的 project
3. 重跑 SOP 帶清 cache
4. 如果還是壞，把 `framework` PATCH 回 `"astro"` 重 build

## 部署後目錄結構

```
D:\project\                              # repo root
├── .vercel\output\                      # ← vercel build 產
│   ├── static\                          # ← 從 astro/dist/ copy
│   └── functions\api\catchall.func\     # ← Vercel Astro builder 產
├── astro\
│   ├── dist\                            # ← astro build 產
│   │   ├── index.html
│   │   ├── scripts\
│   │   └── pagefind\                    # ← pagefind index
│   └── .vercel\                         # ← 不要 commit（已 .gitignore）
└── vercel.json
```

`.vercel/output/static/` 內容**必須 == astro/dist/ 內容**（除了 `outputDirectory` 改寫）。

## References

- [`01-dist-vs-vercel-output.md`](references/01-dist-vs-vercel-output.md) — dist/ 跟 .vercel/output/ 同步機制細節
- [`02-pagefind-config.md`](references/02-pagefind-config.md) — Pagefind 1.3.0 設定、exclude selectors、HTML wrapper
- [`03-static-mode-functions.md`](references/03-static-mode-functions.md) — `output: 'static'` 不生 functions、catchall 404 fallback、rollback

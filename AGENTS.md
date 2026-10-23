# AGENTS.md — D:\project 專案層設定

> Agent 工作在這個 repo 時要讀的設定。短、可用、不重複 agent memory。
> 完整主題記憶在 agent memory 的 `donttalk-project.md` / `vercel-deploy.md`。

## 部署（Vercel Hobby plan）

- ✅ **`git push origin main` 就會自動部署正式站**（2026-10-23 實測驗證，clean URL 全 200）
- 🚨 **但它會搶走 prebuilt 部署的 alias**。`git push` 後約 60 秒出現 `Queued`、約 3 分鐘
  `Ready` 並已 alias 到 `donttalk.vercel.app`。兩條路徑**行為不一致**：

  | | prebuilt | git build |
  |---|---|---|
  | URL | 尾斜線 `/games/` | cleanUrls `/games`（根 `vercel.json` 寫死 `cleanUrls:true`）|
  | 快取 | 靠 `prepare-deploy.ps1` 產的 config.json | 沒有 |

  站台是 Astro 產出的、站內連結全部尾斜線 → git build 之下**每個內部連結多一次 308**，
  且快取最佳化全失效。**兩個方式不要混用**：走 prebuilt 就別 push 到 main；要 push 就得
  接受 git build 的規則。走 prebuilt 記得 push 完用
  `vercel deploy --prebuilt --prod --yes --archive tgz` 把 alias 搶回來，並實測
  `Cache-Control` 確認真的切回去了
- **Build Output API v3 沒有 top-level `headers` 鍵**（塞了會被靜默忽略，部署照樣 Ready）。
  快取 header 必須掛在 `routes[]` 項目上，格式是**扁平 `{名稱: 值}` map**（不是
  `[{key,value}]`），並加 `"continue": true` + 結尾 `{"handle":"filesystem"}`
- **曾經「state=READY 但全站 404」的真正原因**：根 `.vercelignore` 有一行 `/vercel.json`，
  把帶 `installCommand`/`buildCommand`/`outputDirectory` 的設定檔濾掉了 → Vercel 退回 Dashboard
  預設（buildCommand=null）→ 不跑 build → `astro/dist` 不存在。**已移除那行。改它之後務必確認還在**
- 專案 `rootDirectory = null`（repo 根），所以用的是**根目錄**那份 `vercel.json`，
  不是 `astro/vercel.json`（那份只有 rootDirectory=astro 時才生效）
- Production Branch = `main`（`main` 已指向 active branch `123lai1234-create`；
  舊 main 保留在 `main-backup-20261023`）
- 要手動部署才用：`npm run build` → `prepare-deploy.ps1` → `npx vercel deploy --prebuilt --prod --yes --scope donttalk`
- ❌ **不要帶 `--token`**。`.vercel/.env.development.local` 存的是 `VERCEL_OIDC_TOKEN`（JWT 含 `-` `.`），
  CLI 會擋掉（`Must not contain: "-", "."`）。CLI 已有既存登入，`npx vercel whoami` 可確認
- `vercel.json` 是嚴格 schema，**不准加自訂註解欄位**（加 `_comment_*` 會讓 CLI 直接拒絕部署）
- 細節 → agent memory `vercel-deploy.md`

## Stock-app 硬規則（股票/LINE bot）

- 個股只抓 `https://donttalk.vercel.app/api/stock/<ticker>`，**不準** fallback Yahoo
- 大盤指數 / ETF 才用 Yahoo（donttalk 沒這些）
- 一定要 `?_=${Date.now()}` cache-buster（每次不同，固定常數會 cache hit）
- 後端會靜默回 2330 給沒向「universe」中的 ticker → 前端必須比對 `d.symbol === ticker`
- `astro/public/stock-app/` 整資料夾是靜態資產；改檔直接改 astro 那邊，不要去動 `dontalk-import/...`
- 完整內容 → agent memory `donttalk-project.md`

## Music / LRC（音樂頁）

- `music.astro` 寫死 `?v=N` cache buster，改 JS 後**手動 bump** 版本號
- LRC 檔放 `astro/public/music/*.lrc`，UTF-8 no BOM
- 編碼：CJK 用 `new TextDecoder('utf-8').decode(buf)` 處理 binary 來源

## Branch 策略

- HEAD 通常在 `123lai1234-create`（user active branch）
- `main` 跟 `123l` 對 .lrc 走相反路線（main 砍 inline、123l 保留 .lrc）
- commit 前必跑 `git branch --show-current` 確認
- 想 push 到 main：先 checkout main → cherry-pick --no-commit → 解 MODIFY/DELETE conflict → commit

## 工作目錄注意

- `astro/` 是公共產物。`dist/` **已被 gitignore**（根 `.gitignore:2`），`git ls-files` 確認沒進版控
  → git build 必須自己跑 `npm run build`（根 `vercel.json` 的 `buildCommand` 會做這件事）
- Vercel Hobby 靜態上傳上限 **100MB**。站台 static 原本 227.7MB，平台只收前段、尾端檔案
  全 404。`prepare-deploy.ps1` 有排除清單把它壓到 ~50MB — **新增大檔（音訊／影片／模型）
  時要順便確認沒有超過 100MB**
- `dontalk-import/artifacts/portfolio/public/stock-app/` 是 stock-app **canonical source**
- `frontend/scripts|styles|games|templates/` 是前端 **canonical source**，`astro/public/` 是鏡像
  → 改 JS/CSS **只改 `frontend/`**，再跑 `node astro/scripts/sync_frontend.mjs`（會 wipe + 重拷 `astro/public/scripts/`）
  → 兩份都手動改會漂移；diving 的 `cwa-loader.js` 2026-10-20 就是這樣才兩邊都改到
- 不要動 `node_modules/` `.venv/` `.wrangler/` `.mavis/` `.opencode/`
- 寫 UTF-8 檔案**不要**用 PowerShell `Add-Content`（會腐蝕編碼）

## 測試 / 驗證

- Lint：`npm run lint`（astro/ 內）
- Build：`npm run build`（astro/ 內）
- 部署驗證：`Invoke-WebRequest -Uri "https://donttalk.vercel.app/<path>/" -Method Head` 預期 200

## 公開身份

- 個人識別統一用「不說」
- meta author、schema.org Person、chatbot 人設都套用
- GitHub / LinkedIn / Email 不外露
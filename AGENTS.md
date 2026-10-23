# AGENTS.md — D:\project 專案層設定

> Agent 工作在這個 repo 時要讀的設定。短、可用、不重複 agent memory。
> 完整主題記憶在 agent memory 的 `donttalk-project.md` / `vercel-deploy.md`。

## 部署（Vercel Hobby plan）

- 🚨🚨 **生產站只能用 CLI prebuilt 部署。`git push origin main` 會部署出一個沒有 API 的站。**
  這是 2026-10-23 親自踩出來的：push 觸發的自動部署約 3 分鐘後搶走 alias，
  頁面、搜尋、快取看起來全部正常，但**所有 `/api/*` 都回 404**（股票後端掛掉）。
  對照實測：`/api/stock/2330` 在 git build 的 3 個部署（8q9276295 / ct9w81tw4 /
  7ip7k8nrv）全是 404，在 prebuilt 的部署是 200。
  - **真正原因**：Astro `output: "static"` 不會 build 出 edge function。`/api/*`
    靠的是 `prepare-deploy.ps1` 把 `catchall.func` 複製進 `.vercel/output/functions/`
    —— 這一步 git build 沒有、也不做得到。
  - 所以：**改完部署 → 跑 `npm run build` → `prepare-deploy.ps1` → `vercel deploy --prebuilt --prod`。
    不要把東西 push 到 main。** 真的需要 push 的話（版本紀錄），push 完**立刻**重跑
    prebuilt 部署把 alias 搶回來，否則 API 會死到下一次手動部署為止。
  - 驗證一定要打 `/api/stock/2330`，不能只看頁面 200 —— 這個故障在頁面上完全看不出來。
- git build 與 prebuilt 的**靜態產出**現在是一致的（2026-10-23 對齊）：
  - `vercel-build.mjs` 在 pagefind 之後套用與 `prepare-deploy.ps1` **完全相同**的排除清單。
    沒有這步時 git build 會把 207MB 的 dist 原封不動上傳，遠超 Vercel Hobby 的 100MB 上限；
    加上後是 495 檔 / 47.3MB。**改一邊就要同步改另一邊**。
  - 根 `vercel.json` 的 `headers[]` 也有 `/games/confinement-escape/*` 與 `/_astro/*`
    的 immutable 規則，快取最佳化一致。
  - 網址規則一致：prebuilt 的 config.json 加了
    `{src: "/(.*)/", status: 308, headers: {Location: "/$1"}}` 放在
    `{"handle":"filesystem"}` **之前**（站內連結本來就全是無尾斜線的，實測 9 個 href）。
  - ⚠️ **`prepare-deploy.ps1` 的 inline python 必須維持純 ASCII**。PowerShell 5.1 用
    ANSI 讀 .ps1，python 裡寫中文註解會被解成亂碼並**靜默吞掉後面的 route**，
    腳本還照樣報 ok 不報錯（2026-10-23 踩過）。中文說明寫在 here-string 外面。
    同理 `'$1'` 會被 PowerShell 變數插值吃掉，要用 `'/' + chr(0x24) + '1'`。
- ⚠️ **剛部署完約 5 分鐘內不要下結論**。Vercel 邊緣傳播期間會零星回 404，
  2026-10-23 因此誤判「中文搜尋壞掉」。驗證前先等，且要重跑確認穩定。
  另外比對線上檔案清單時，**不要拿本機 dist 的檔名去對** —— Pagefind 的檔名是
  內容雜湊，本機有未提交變更時兩邊 hash 本來就不同。
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
# AGENTS.md — D:\project 專案層設定

> Agent 工作在這個 repo 時要讀的設定。短、可用、不重複 agent memory。
> 完整主題記憶在 agent memory 的 `donttalk-project.md` / `vercel-deploy.md`。

## 部署（Vercel Hobby plan）

- 🚨🚨 **正式站要 API 穩定就走 CLI prebuilt。`git push origin main` 也會上 production，但 `/api/*` 有就緒競態。**
  - **真正原因**：根目錄的 `api/[...catchall].mjs` 會被 Vercel 自動偵測成 serverless function，
    所以 **git build 其實「有」`/api/*`**。問題是**就緒順序**：靜態部分先 READY 並搶走 alias，
    edge function 還沒起來 —— 那段窗口 `/api/*` 會回 504（逾時）或 404（還沒路由到）。
  - **實測對照**（2026-10-23，同一個 commit `daca6fbd`）：
    | deployment | 時間 | /api/healthz | /api/stock/2330 |
    |---|---|---|---|
    | dpl_9Hb6p15v | 23:11 | 200 | 200 |
    | dpl_UUZ6ijaz | 23:08 | 504 | 404 |
    | dpl_26BsQe1J | 23:00 | 504 | 404 |
    | dpl_BJrGxvZu | 22:58 | 504 | 404 |
    | dpl_6uD2pPGu | 22:57 | 504 | 404 |
    同一個 commit 23:08 是壞的、23:11 是好的 → **不是「git build 一定沒有 API」，是競態**。
  - 所以：**改完部署 → 跑 `npm run build` → `prepare-deploy.ps1` → `vercel deploy --prebuilt --prod`，
    這條路徑會確定把 `catchall.func` 複製進 `.vercel/output/functions/`**，API 一定在。
    只改靜態內容、且能接受 API 短暫失效時，`git push origin main` 也有 production
    （production branch = `main`，約 3 分鐘後生效）。
  - 驗證一定要打 `/api/stock/2330` 或 `/api/healthz`，不能只看頁面 200 —— 這個故障在頁面上完全看不出來。
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

## 3D mascot（`/3d-mascot`）

- **模型來源：`blender/chibi_build.py`（Blender 4.5 LTS 從零手建）**，
  參考圖就是 `astro/public/images/chibi-hero.png`（跟首頁浮動立繪同一隻）。
  量測腳本 `blender/measure_hero.py` 會把參考圖的輪廓/眼睛/配色印出來，
  換設計稿時重跑它，不要憑眼睛估數字。
- **不要再走 AI 重建**（TripoSR / Hunyuan3D / Meshy）：餵 2D chibi 設定圖只會得到
  胖 blob，五官還得靠貼圖投影 → 臉頰鋸齒。純色材質 + 參數化曲面才可控。
  舊的 Meshy 流程（`chibi_restyle.py` / `chibi_polish.py` / `face_texture.py`）
  已經不是線上模型，別回頭改那條線。
- **相機：`camera-orbit="0deg 82deg 4.4m"` 才是正面**（頁面 `3d-mascot.astro`）。
  - model-viewer theta **0°=正正面**、90°=側面、180°=後腦勺、270°=另一側。
  - **正面角會隨 build 換而變**，換模型後一定要重測：
    用 model-viewer 的相機公式在 Blender 模擬 ——
    `offset = r·(sinφ·sinθ, cosφ, sinφ·cosθ)`，gltf(x,y,z) → blender(x, −z, y)，
    渲染 theta = 0/90/180/270 四張。
  - 判角度**一定**要另開乾淨的對照 viewer 並排截圖，不要用頁面原生那個。
  - `camera-target="0m 0.9m 0.2m"`：model-viewer 是 Y-up，**第二個數字才是垂直高度**。
- **頭髮 = 貼頭皮薄殼 + 弧形尖瓣（crescent locks），不要用錐體**（2026-10-30 重寫）：
  - 參考圖的頭髮是**一片片弧形尖瓣**堆出來的，尖端位置就是輪廓。
    `HAIR_LOCKS` 每筆 = `(z_root, a_root, tip(x,y,z), bow_dir, bow, r_base)`，
    `tip` 全部來自 `measure_hero.py` 量出來的正面輪廓。
  - **帽殼只要貼住頭皮就夠**（`HEAD_PROFILE + HAIR_CAP_MARGIN` 的 loft，
    margin 0.032）。舊的球殼半寬 0.330 會蓋過輪廓 → 整顆頭變「圓頂＋海膽刺」。
    輪廓要讓尖瓣去畫，不要讓殼去畫。
  - **`chibi_lib.blade()`** 才是對的髮瓣函式：寬軸 = `tangent × Y`，
    髮瓣固定在螢幕平面、正面看得到完整寬度。
    `chibi_lib.strand()` 用路徑自己的 up-vector 取向 → 髮片翻成直立薄片、變一根根刺。
  - **殼層必須保持封閉（watertight）**才能跑 EXACT 布林切臉部開口。
    舊流程把帽子和髮片 join + voxel remesh 一起做才會封閉；
    拆開做時若刪掉帽子底面，布林會**啃穿帽子前端 → 整隻變光頭**。
  - **髮片尖端的座標是絕對值**：埋進頭裡（y 太靠後）就整片看不見；
    戳出來（y 太前）就變成一根根朝著鏡頭的刺。額前瀏海要**平貼在額頭上**。
  - 髮片**不要跟帽子一起 remesh**：remesh 會把尖端吃掉。
  - **臉部開口要切「曲線髮際線」，不能切方塊**：方塊會在額頭留一條水平邊
    → 看起來像戴帽子。用 `hairline_z(x)` 的剖面做成沿 Y 的 prism 再 EXACT 布林。
  - **瀏海必須貼著「額頭」而不是帽子**：帽子比臉前 32 mm，瀏海若從頭頂垂下來
    會整段埋進頭顱裡 → 只剩尖端露出 → 看起來就是一排黑三角。
    路徑要從 `hairline_z(x)` 起、沿 `face_point()` 往下，最後才收尖。
  - **髮瓣埋在殼裡就只剩尖端**（看起來像一排黑牙齒）。瀏海要浮在殼外面 0.022。
  - **`_tip()` 的角度鏡像是 `-a` 不是 `180-a`**：`sin(180-a)==sin(a)`，
    用 180-a 會讓左右兩邊的鎖片**全部長在同一側**，整隻看起來像轉身。
  - **耳朵會埋在帽子裡**（帽子是包住頭顱的實心球）：要沿 X 開一個貫通的
    橢圓柱槽才看得到耳朵；只挖內部會變成一個藏耳朵的空腔。
  - 鎖片粗細 `THICK` 別調太大：太胖會從「尖刺」變成「花瓣」。
  - `_groove_strands()` 的刻紋深度別超過 0.005，否則殼面變成一格格「甲板」。
- **眼睛是四層**（眼白 → 虹膜 → 瞳孔 → 高光），再加一條**睫毛上緣**：
  - 睫毛必須**坐在眼白上**。黑線壓在黑色虹膜上等於看不見。
  - 眼白要比虹膜大，否則整顆眼睛是「黑豆＋白圈」，不像畫出來的眼睛。
  - **睫毛線要沿「眼框外緣」走**（`_eye_rim()` 沿眼白那個橢圓取樣）。
    另畫一條獨立弧線會**橫切過虹膜** → 瞳孔上多一道黑斜槍。
  - **虹膜必須比眼框小**（rx 0.055 / rz 0.050 vs 眼框 0.077 / 0.050），
    而且眼白要**比虹膜平**（`out` 小、`dome=1.0`），否則眼白會從虹膜底下穿出來，
    瞳孔上多一道白色斜紋（z-fighting）。
- **配色直接抄參考圖的線性值**（sRGB → linear 後填 Base Color）。
  燈光過曝會把膚色洗成 255,255,252 → 整隻看起來像塑膠。
- **格紋腰結是頂點色不是節點貼圖**：程序化節點在 glTF 匯出時會整個消失，變白圍裙。
- 匯出**必須開 Draco**（`export_draco_mesh_compression_enable=True, level=6`）：
  84k 三角面沒開會是 MB 級的怪物。
- **本地預覽（比部署快 100 倍）**：`cd astro/public` 跑 `python -m http.server 8899`，
  放一個 `model-viewer` 測試頁，`<model-viewer src="/models/mascot-3d.glb">`。
  改完 GLB 直接複製到 `astro/public/models/` 就會重載（記得加 `?cb=` 破快取）。
- 統計數字（`STAT_TRIS` / `STAT_MATS` / `STAT_SIZE`）**不要手填**：
  `cd astro && npm run mascot:stats` 會直接解析 GLB 產生。改完 GLB 一定要重跑。
- 改 GLB 後的部署順序：`npm run build` → `prepare-deploy.ps1` → prebuilt 部署，
  並且一定要打 `/api/healthz` 確認 200（見部署章節的競態）。
- 建模細節 → skill `blender-chibi-parametric`（`.agents/skills/blender-chibi-parametric/`）

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
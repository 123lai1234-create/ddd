# AGENTS.md — D:\project 專案層設定

> Agent 工作在這個 repo 時要讀的設定。短、可用、不重複 agent memory。
> 完整主題記憶在 agent memory 的 `donttalk-project.md` / `vercel-deploy.md`。

## 部署（Vercel Hobby plan）

- 🚨🚨 **2026-11-02 起 API 搬到 Render，部署以 `git push origin main` 為準，不要盲目跑 prebuilt。**
  - **現況**：真正的後端是 `https://donttalk-catchall.onrender.com/api/*`；
    `astro/src/pages/stock.astro` 會先探 Render 再退回 `/api/healthz`，所以頁面還能用。
    Vercel 端仍留著 `api/[...catchall].mjs`（477KB）與 `api/games/[...all].mjs` 兩個 function
    原始碼在 git 裡，2026-11-02 實測兩者都逾時不回應（`/api/healthz` 連線逾時、
    `/api/stock/2330` 404、`/api/games/*` 逾時），Render 同一支則 200。
  - ⚠️ **`prepare-deploy.ps1` 對現在的架構已經過時**：它從 Vercel CLI 快取複製
    `.vercel/.vercel/output/functions/api/catchall.func/catchall.mjs`，那是 **2026-08 的 229KB 舊版**，
    而 main 上是 477KB 新版；新的 `api/games/[...all].mjs` **也不在 prebuilt 輸出裡**。
    跑 prebuilt 等於把舊 catchall 灌回去、還漏掉 facility 遊戲的 API → **會回退。**
    要用 prebuilt 前，先把 catchall 來源更新成 main 的版本並把 `api/games/` 一起放進 functions。
  - 所以：**改完 → `git push origin main` → 等 Vercel 自動部署（約 3 分鐘）→ 打 API 驗證**。
    剛部署完那幾分鐘 `/api/*` 可能還在就緒中（2026-10-23 實測同 commit 23:08 是壞的、23:11 是好的，
    是**競態**不是「git build 一定沒有 API」），等一下再驗。
  - 驗證一定要打 `/api/stock/2330` 或 `/api/healthz`，不能只看頁面 200 —— 這個故障在頁面上完全看不出來。
  - `vercel` CLI **不在 `astro/node_modules`**（在 repo 根的 `D:\project\node_modules\.bin\vercel.cmd`），
    用相對路徑 `& node_modules\.bin\vercel.cmd` 會被 PowerShell 當成模組名稱而失敗。
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
- **頭髮 = 厚殼（hood）+ 寬身長尾的花瓣狀髮瓣，不是薄帽殼 + 尖刺**（2026-10-30 重寫）：
  - 參考圖的頭髮是**厚厚一坨**，上面鋪滿**寬身體＋長尖尾**的花瓣狀髮瓣，
    一層層疊像屋瓦。之前的「貼頭皮薄殼 + 細尖刺」會變海膽頭。
  - 數字全部來自量測：`blender/measure_hero.py`（輪廓表）＋
    `blender/measure_fringe.py`（**左右極值分開印** + 眼框暗色 blob 的 bbox）。
    只印「半寬」看不出頭頂是**一支角**還是**兩支角**，一定要印 L / R 兩欄。
  - `HAIR_MASS` = 厚殼剖面 `(z, x_left, x_right, half_depth)`，
    **左右不對稱**：參考圖頭髮往左梳（z 1.58 左到 -0.294，右只有 +0.144）。
  - `HAIR_LEAVES` 每筆 = `(p0, p1, p2, half_width)`，
    `p2`（尖端）全部落在量測出來的輪廓上；`p1` 決定弧線鼓出去的方向。
  - ⚠️ **髮瓣寬度曲線決定成敗**：`_leaf_radii()` 必須是
    「根部 0.18 內長到滿寬 → hold 0.55 維持滿寬 → 之後才收尖」。
    從根部一路收成三角形 → 每片都變尖刺 → 又回到海膽頭。
  - **髮瓣根部要埋進殼裡**（控制點往頭軸拉），這樣髮瓣像從整坨毛裡長出來，
    而不是貼上去的薄片。
  - **`chibi_lib.blade()`** 才是對的髮瓣函式：寬軸 = `tangent × Y`，
    髮瓣固定在螢幕平面、正面看得到完整寬度。
    `chibi_lib.strand()` 用路徑自己的 up-vector 取向 → 髮片翻成直立薄片。
  - **殼層必須保持封閉（watertight）**才能跑 EXACT 布林切臉部開口。
  - 臉部開口用沿 Y 的 prism，剖面 = `hairline_z(x)` 曲線，
    `y_face=-0.215`、`x_max=0.30`（殼的前緣要在額頭前方，但別切到太陽穴）。
  - **耳朵會埋在殼裡**：要沿 X 開一個貫通的橢圓柱槽才看得到耳朵；
    只挖內部會變成一個藏耳朵的空腔。
  - 瀏海**只有 10 片**、每片半寬 ≥ 0.11 才會互相重疊；
    24 片窄片會排成一排鋸齒黑三角。瀏海要浮在額頭前方 0.012~0.032 分層。
  - `_groove_strands()` 的刻紋深度別超過 0.005，否則殼面變成一格格「甲板」。
- **眼睛是四層**（眼白 → 虹膜 → 瞳孔 → 高光），再加一條**睫毛上緣**：
  - 參考圖眼框 = x 0.080..0.219、z 1.155..1.284（`measure_fringe.py` 找暗色 blob）。
    眼睛 **0.139 寬 × 0.129 高**，比舊值又高又寬。
  - 虹膜要**幾乎填滿眼框**（rx 0.064 / rz 0.051 vs 眼框 0.070 / 0.058），
    白眼只剩**下方外側一道月牙**。差 0.005 就會變成「黑豆＋一圈白框」。
  - 睫毛必須**坐在眼白上**，而且要**夠粗**（半徑 0.017）才蓋得住虹膜上緣。
  - **睫毛線要沿「眼框外緣」走**（`_eye_rim()` 沿眼白那個橢圓取樣）。
    另畫一條獨立弧線會**橫切過虹膜** → 瞳孔上多一道黑斜槍。
  - 眼白要比虹膜平（`out` 小、`dome=1.0`），否則眼白會從虹膜底下穿出來，
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

## 遊戲鏡像同步（禁閉逃殺：文字獄）

- **上游 canonical source 是 `github.com/gagatim/confinement-escape-text`**，不是本 repo。
  `astro/public/games/confinement-escape/` 只是**鏡像**，靠 `astro/scripts/` 兩個腳本維持。
- ⚠️ **鏡像上還有上游沒有的功能**（每日任務、主線第 16 章、強化保底…），
  細節與重套步驟在 `astro/public/games/confinement-escape/MIRROR_FEATURES.md`。
  **同步會覆蓋 index.html → 覆蓋後務必照那份文件把鏡像專屬功能重套回來。**
- 同步流程（照順序跑，**不要手改 index.html**）：
  1. 從上游 `main` 取 `index.html` + `images/` + `voice/` + `music/` 覆蓋到鏡像資料夾
  2. `python astro/scripts/ogg-to-mp3.py` → 上游用 .ogg，**iOS Safari 解不了 Ogg 會整個沒聲音**，統一轉 mp3
  3. 刪掉 .ogg（這個鏡像只出 mp3，兩種格式都放只會多一倍 payload；轉碼反而省 8MB）
  4. `python astro/scripts/patch-game-html.py` → 套本地補丁（冪等，可重複跑）
- **本地補丁只有兩件事**（都由 patch 腳本負責）：
  - `<base href="/games/confinement-escape/">` —— 上游沒有這個標籤，沒有它 `images/`、`music/`、`voice/`
    的相對路徑會全部 404。**覆蓋 index.html 後一定要確認它在**
  - 移除 YouTube 內嵌播放器 —— 戰鬥／逃出成功改播 `music/` 裡的 CC0 曲子
    （戰鬥→Epic Boss Battle、逃出成功→Triumphant），donttalk 維持零第三方請求
- ⚠️ **patch 腳本靠 exact string 匹配，上游改版會靜默失效**（count==0 不報錯）。
  2026-11-02 上游重排了 BGM 區塊並改寫頁尾標示，舊規則字串對不上 → 補丁整個沒套到。
  **同步後一定要看 patch 腳本印的 `youtube edits applied` 是不是 0**，是 0 就是沒套到，要更新規則。
  規則要同時保留上游改版前後兩種寫法。
- 音檔轉碼後**檔名不變但內容可能變**，而 `music/` 是 immutable 快取 → 舊檔會留在玩家瀏覽器。
  同步後用 `git status` 看既有 mp3 有沒有變成 `M`；有變就要 bump 版本或另命名。
- 遊戲資料夾約 38MB，部署 payload 目前 69.6MB（Vercel Hobby 上限 100MB）。
  新增大檔前先算一下餘裕。

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
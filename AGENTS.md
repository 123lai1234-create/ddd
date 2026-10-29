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

- 模型來源：`blender/chibi_restyle.py`（pipeline）→ `blender/chibi_polish.py`（後處理）。
  底模是 `chibi-tinted-full.glb`，**不要換回 `chibi-tinted-low.glb`** ——
  low 版會把 Meshy 的圓潤髮束壓成稜角碎片。
- **相機：`camera-orbit="0deg 82deg 3.9m"` 才是正面。**
  - 2026-10-27 這顆 build（`chibi_polish.glb`）實測：model-viewer theta **0°=正正面**、
    90°=側面、180°=後腦勺、270°=另一側。
  - **正面角會隨 pipeline 換 build 而變**，不要沿用舊筆記。歷史紀錄：2026-10-25 那顆 45°、
    2026-10-26 那顆 315°、2026-10-27 這顆 **0°**。換模型後一定要重測。
  - **怎麼重測（不用開瀏覽器）**：用 model-viewer 的相機公式在 Blender 模擬 ——
    `offset = r·(sinφ·sinθ, cosφ, sinφ·cosθ)`，gltf(x,y,z) → blender(x, −z, y)，
    渲染 theta = 0/90/180/270 四張，哪張是正臉就定那個角。
  - 判角度**一定**要另開乾淨的對照 viewer 並排截圖。不要用頁面原生那個 ——
    頁面的內嵌腳本有 `viewer.autoRotate = true`，會**覆蓋**你的 `removeAttribute('auto-rotate')`，
    截到的圖永遠是轉到一半的角度。踩過三次誤判。
  - **2026-10-29 起頁面不再自動旋轉。** 理由：這顆模型只有正面是乾淨的，
    轉到側背面就會露出臉殼的背面與下緣碎邊，而訪客看到的時間遠多於正面的 1.4 秒。
    頁面固定停在 `theta=0` 的正臉，使用者自己拖曳。要加回旋轉前先想清楚這一點。
  - `camera-target="0m 0.9m 0.2m"`：model-viewer 是 Y-up，**第二個數字才是垂直高度**
    （0.9m ≈ 模型中心），第三個是水平微偏移。別動它。
- **臉部鋸齒的病根在「貼圖來源」，不是 mesh。**
  - 貼圖有兩條路：`face_texture.project_reference()`（把 Meshy 參考照投影到頭上）
    vs `face_texture._paint_face()`（程式手繪）。**照片版會把參考照自己的瀏海
    一起帶進來**，被圓柱投影拉成眼周／額頭的黑色鋸齒。
  - 證明方法：在瀏覽器把 Hair mesh 隱藏 —— 鋸齒**還在** → 它在貼圖裡，不在幾何裡。
  - `chibi_polish.repaint_face_painted()` 已改用**手繪版**，乾淨無鋸齒。
    手繪版跟照片版**同寬高（2240×928）、同 frame（z0/z1/cx/cy）**，
    所以既有 UV 不用重算就對得上。
  - **踩坑**：`face_texture.bake()` 會 `materials.new("Face")`，但舊的 "Face" 還在 →
    Blender 命名成 **"Face.001"**。而 `_face_slot()` 是**完全匹配** "face"，
    於是 `close_face_shell` / `smooth_shell_border` / `deborder_jaw` **全部靜默跳過**，
    臉部等於沒修。要先把舊材質改名讓出 "Face"，再把新的命名回 "Face"。
- 後處理順序有講究：`trim_hair_over_face` 要跑**兩次** ——
  第一次在 `close_face_shell` 之前（清大塊頭髮），第二次在之後
  （眼窩封起來之後，前投影測試才判得出「這裡有臉」，才能砍掉眼睛上方的鋸齒）。
- `chibi_polish.drop_jaw_plug()`：JawPlug 是一塊獨立的下巴皮片，正面看是下巴底下
  一道亮白刀片。直接刪掉整個物件。
- `chibi_polish.reskin_jaw()`：殼的下緣被吸成臉材質後，圓柱投影把貼圖下緣擠成一排
  直立細條，下巴看起來像一排牙齒。把下顎的殼面改回 Skin 材質就接回脖子了。
- **本地預覽（比部署快 100 倍）**：`cd astro/public` 跑 `python -m http.server 8899`，
  放一個 `model-viewer` 測試頁，`<model-viewer src="/models/mascot-3d.glb">`。
  改完 GLB 直接複製到 `astro/public/models/` 就會重載（記得加 `?cb=` 破快取）。
  這個迴路才是 QA 的主場，Blender 渲染只當交叉驗證。
- 統計數字（`STAT_TRIS` / `STAT_MATS` / `STAT_SIZE`）**不要手填**：
  `cd astro && npm run mascot:stats` 會直接解析 GLB 產生。改完 GLB 一定要重跑。
- 匯出**必須開 Draco**（`export_draco_mesh_compression_enable=True, level=6`）：
  180k 三角面 raw float 屬性 9.6 MB → 壓縮後 1.7 MB。沒開會產出 10 MB 的怪物。
- 改 GLB 後的部署順序：`npm run build` → `prepare-deploy.ps1` → prebuilt 部署，
  並且一定要打 `/api/healthz` 確認 200（見部署章節的競態）。
- 細節 → agent memory `mascot-colorize.md`

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
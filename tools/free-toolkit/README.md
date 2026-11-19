# free-toolkit — 免費創意工具鏈（智能體可驅動）

把這台機器上裝好的免費軟體（GIMP / Inkscape / FFmpeg / kdenlive / Blender / Stirling-PDF / darktable）
包成四條**可重複執行**的產線。每條產線都是一支 Python 腳本，可以手動跑、可以丟給智能體跑、
可以丟進 CI 跑。輸出目錄 `out/` 可以直接被網站或上傳流程吃掉。

位置：`D:\project\tools\free-toolkit\`（donttalk 專案內，與 `tools/n8n` 並列）

---

## 快速開始

```powershell
cd D:\project\tools\free-toolkit
$env:PYTHONIOENCODING='utf-8'
python run_all.py            # 跑完四條產線
python run_all.py --only 3   # 只跑產線 3
```

每條產線也可以單獨跑：

```powershell
python line1_mv_platforms.py --input D:\music\mv-master.mp4
python line2_site_assets.py --manifest data\songs.json --limit 8
python line3_lyric_cards.py --manifest data\songs.json --limit 8
python line4_pdf_batch.py images
```

所有腳本結束都會印一張 PASS/FAIL 表，全綠時 exit code 0，可以直接拿來當 CI 判定。

---

## 前置服務

| 服務 | 何時需要 | 怎麼開 |
|---|---|---|
| Stirling-PDF（`http://127.0.0.1:8080`） | 產線 4 | 開始選單「Stirling-PDF (網頁版 :8080)」或 `D:\Tools\stirling-pdf\Start-Stirling-PDF.cmd` |

產線 1/2/3 不需要任何背景服務。

---

## 用自己的歌曲資料

donttalk 的音樂素材在 `astro/public/music/`（126 份歌詞 .txt、39 支 mp3、`covers/` 封面圖）。
不用手動維護清單，用內附的產生器掃一次就好：

```powershell
python build_manifest.py --music-dir D:\project\astro\public\music --out data\songs.json
```

它會：

- 從 `===== 歌名 =====` 抬出標題（沒有就用檔名去掉編號前綴）
- 找到 `【Chorus】` 段的第一行當成卡片的 hook line
- 自動配對同名的 `.mp3` 與 `covers/` 裡的封面圖
- 依序套用 6 組配色，讓一批卡片有節奏感

`data/songs.json` 裡的 `audio` / `cover` 寫的是**相對路徑**，頂層另有 `music_dir`，
整包搬到別的機器也不會壞。

常用參數：

```powershell
python build_manifest.py --music-dir ... --limit 5       # 只取前 5 首
python build_manifest.py --music-dir ... --only-audio    # 只收有 mp3 的歌
```

---

## 產線總覽

| 產線 | 產出 | 腳本 |
|---|---|---|
| 1 | 音樂 MV 多平台版本 | `line1_mv_platforms.py` |
| 1+ | 真實歌曲歌詞影片 | `line1_mv_lyric.py` |
| 1++ | 場景圖（SDXL） | `line1_mv_frames.py` |
| 1+S | 直式 Shorts（原生 9:16） | `line1_mv_shorts.py` |
| 1+AI | 直式 Shorts（AI 動態畫面） | `line1_mv_ai.py` |
| 1+AI/S | 直式 Shorts（AI 前 N 段 + 靜態漂移鋪底，混合模式） | `line1_mv_ai.py --ai-segments N` |
| 2 | donttalk 網站素材批次 | `line2_site_assets.py` |
| 2b | 場景圖 → 網站 OG／分享卡（直接發佈到 astro） | `line2_scene_cards.py` |
| 3 | 歌詞卡 / 封面圖批次 | `line3_lyric_cards.py` |
| 4 | PDF 批次處理 | `line4_pdf_batch.py` |
| 4+ | 真實歌詞手冊 PDF | `line4_lyric_book.py` |
| 5 | YouTube 上傳 | `youtube_upload.py` |


### 產線 1：音樂 MV 多平台版本 → `out/line1_mv/`

輸入一支母版影片，產出各平台可直接上傳的版本。

- `youtube_1080p.mp4`（1920×1080，H.264+AAC）
- `vertical_1080x1920.mp4`（Shorts / Reels / TikTok 直式）
- `square_1080x1080.mp4`（IG 方形）
- `audio.m4a` / `audio.mp3`（抽出的音軌）
- `title_card.mp4` + `title_card.mlt`（**用 kdenlive 的 melt.exe 由 .mlt XML 無頭算繪**，證明時間軸也能腳本化）
- `thumb_yt_1280x720.jpg` / `thumb_ig_1080x1080.jpg`（FFmpeg 抽幀 → **GIMP 批次**改尺寸）

```powershell
python line1_mv_platforms.py --input D:\music\mv-master.mp4
python line1_mv_platforms.py            # 不給 input 會自動生一支 10 秒測試母片
```

### 產線 1+：真實歌曲歌詞影片 → `out/line1_lyric_mv/<曲名>/`

不是測試母片，是拿 `astro/public/music/` 裡的**真實音檔 + 真實歌詞**直接生 MV。
一首歌約 90 秒跑完。

- 解析歌詞 txt → 分段（Verse / Pre-Chorus / Chorus / Bridge / Outro）
- 依音檔長度把每一行**配時**（字數加權），產生 ASS 字幕；副歌換色加大
- 背景：封面圖 → 模糊 → 慢速推近（zoompan）→ 進度條 → libass 燒中文字幕
- 產出跟產線 1 同一套：`youtube_1080p.mp4` / `vertical_1080x1920.mp4` /
  `square_1080x1080.mp4` / `audio.m4a` / `audio.mp3` / `title_card.mp4`(+`.mlt`) /
  `thumb_yt_1280x720.jpg` / `thumb_ig_1080x1080.jpg`，外加 `lyrics.ass` 字幕檔

```powershell
python line1_mv_lyric.py --list            # 看會跑哪些（有音檔的 19 首）
python line1_mv_lyric.py --limit 3          # 只跑前 3 首
python line1_mv_lyric.py --song 07_愛的模樣   # 只跑一首
```

### 產線 1++：場景圖（SDXL）→ `out/line1_scenes/<曲名>/`

給每首歌生成**無文字**的場景圖，補上產線 1+ 一直缺的那一層素材。

現在產線 1+ 的背景是「封面圖 → 模糊 → 慢推」，但 19 首有音檔的歌裡**只有 6 首有真實封面**，
其餘只能拿產線 3 的 1080×1080 卡片 fallback —— 卡片上面有歌名字，既不能當影片首幀
（AI 會把文字扭成亂碼），正方形裁成 16:9 / 9:16 也會壞構圖。

這條產線用 **SDXL** 原生生成三種比例（不是裁切）：

| 檔名 | 尺寸 | 用途 |
|---|---|---|
| `scene_16x9.png` | 1344×768 | 橫式 MV 背景（也是 H3 / Pika Flex 1.0MP 的原生尺寸） |
| `scene_9x16.png` | 768×1344 | 直式 Shorts 背景 |
| `scene_1x1.png` | 1024×1024 | 方形（封面 / 社群卡） |

場景提示詞在 `data/scenes.json`（19 首，每首一段英文描述 + 方形封面描述）。

`data/scenes.json` 的每首可以有三個欄位：

| 欄位 | 用途 |
|---|---|
| `scene` | 16:9 / 9:16 影片背景用的場景描述 |
| `cover` | 1x1 方形封面描述（沒給就用 `scene`） |
| `negative` | **逐曲覆寫**共用 negative（`_negative`） |

`negative` 是對症下藥用的：SDXL 對「霓虹招牌 / 便利商店」這種提示詞很愛自己生亂碼文字
（實測「城市的夜」生出 `TIME GOOO`、`PIGPOY OOOE`），共用 negative 擋不住，
要針對那幾首加 `signage, sign, storefront sign, billboard, typography, words, letters…`。
同理「風箏的故鄉」容易跑成卡通插畫 → 加 `cartoon, illustration, flat colors, vector art…`。

```powershell
python line1_mv_frames.py --list            # 看會跑哪些
python line1_mv_frames.py --limit 3          # 只跑前 3 首
python line1_mv_frames.py --song 07_愛的模樣
python line1_mv_frames.py --sizes 16x9       # 只出某一種比例
python line1_mv_frames.py --force            # 已存在的也重畫（預設跳過）
```

> 已存在的圖預設會跳過（resume），所以中斷後直接重跑就好，不用加 `--force`。
> 單張約 31 秒（1344×768 / 28 步），19 首 × 3 比例 ≈ 30 分鐘。

### 產線 1+S：直式 Shorts（原生 9:16 場景版）→ `out/line1_lyric_mv/<曲名>/`

**這是產線 1+ 的直式版本缺陷修復，不是新產物**。

產線 1+ 的 `vertical_1080x1920.mp4` 是**從 1920×1080 母片中心裁切**來的 —— 16:9 裁成 9:16
等於切掉三分之二畫面，實測「04_老家的巷子」直式畫面糊成一片無主體色塊，完全沒有構圖。

這條線改用 **產線 1++ 的 `scene_9x16.png`** 當背景：原生 9:16 構圖，不是裁切、不是去背。

| 項目 | 產線 1+（舊） | 產線 1+S（新） |
|---|---|---|
| 背景來源 | 1920×1080 母片中心裁切 | SDXL 原生 768×1344 場景圖 |
| 畫面 | 糊成色塊、沒主體 | 有主體、有構圖 |
| 字幕 | 橫式 ASS 縮到 0.5625 倍、落在中央 | **另燒直式 ASS**（PlayRes 1080×1920、字幕壓下三分之一、標題移到上方置中） |
| 輸出檔 | `vertical_1080x1920.mp4`（**不動**） | `vertical_scene_1080x1920.mp4` + `shorts_thumb_1080x1920.jpg` |

字幕**配時邏輯完全沿用** `line1_mv_lyric.build_ass(..., vertical=True)`，同一首歌的
字幕行數與時間軸跟橫式母片一致，只是版面改成直式。

```powershell
python line1_mv_shorts.py --list             # 看哪些歌已有 9:16 場景圖
python line1_mv_shorts.py --song 04_老家的巷子
python line1_mv_shorts.py --limit 3
python line1_mv_shorts.py --force             # 已存在的也重算
python line1_mv_shorts.py --all --cinema      # 推近＋橫移的連續運鏡版（另存，不動既有）
```

> **`--cinema`（免費運鏡強化版）**：原本是「置中純推近 1.00→1.08」，
> `--cinema` 改成 **zoompan 1.00→1.16 推近的同時緩緩往右漂**（同一段時間內連續運鏡，
> 比純推近更像真的鏡頭）。輸出另存 `vertical_scene_cinema_1080x1920.mp4`
> 與 `shorts_thumb_cinema_1080x1920.jpg`，**不動**既有的 `vertical_scene_1080x1920.mp4`。
> 這是 **AI 額度用盡期間的免費替代品**（本機算圖，零 credits）。

> 已存在的預設跳過（resume），所以中斷後直接重跑就好。
> 產出索引 `out/line1_lyric_mv/index_shorts.json` 是**合併寫入**，單曲重跑不會把整份索引清掉。
>
> ⚠️ 產線 1+ 重跑時會 `rmtree` 掉整個歌曲資料夾，會連帶刪掉 `vertical_scene_1080x1920.mp4`。
> 重跑完記得再跑一次 `line1_mv_shorts.py`。

**目前狀態（2026-11-17）**：
- 場景圖：19 首 × 3 比例 = **57 張全部產出**（1344×768 / 768×1344 / 1024×1024）。
- 直式 Shorts（產線 1+S）：**19 支全部產出**，ffprobe 驗證 1080×1920 / H.264+AAC 全數合格（共 201MB）。
- 免費運鏡強化版（`--cinema`）：**19 支全部產出並 QA 通過**（共 214MB），
  檔名 `vertical_scene_cinema_1080x1920.mp4` + `shorts_thumb_cinema_1080x1920.jpg`。


### 產線 1+AI：直式 Shorts 的 AI 動態畫面 → `out/line1_lyric_mv/<曲名>/vertical_ai_1080x1920.mp4`

**產線 1+S 是靜態場景圖 + zoompan 慢推；這條線是真的 AI 動態影片。**

用 **MiniMax-Hailuo-2.3**（最便宜、靜音）做首幀 image-to-video：
場景圖當第 1 段首幀 → 每段 10 秒 → **上一段的最後一幀當下一段的第一幀**（FL2VA 式串接）
→ 整首歌一鏡到底 → 上采 1080×1920 → 漸層遮罩 → 進度條 → 直式字幕 → 原曲。

實測（13_時光膖囊 66 秒）：7 段 × 10.125 秒 → 裁到 66.0 秒，
成品 1080×1920 / H.264+AAC / 25fps / 17.9MB，**接縫看不出來**（上一段末幀與下一段首幀幾乎一致）。

> ⚠️ **每一段都是付費呼叫，單價實測 280 credits/段**（Hailuo-2.3 / 768P / 10 秒，
> 數字取自服務端 402 錯誤訊息）。19 首 = 236 段 = **66,080 credits**。
> 額度用盡會回 **HTTP 402** 且**回應沒有 task_id** → 絕對不要重送，否則重複燒錢。

```powershell
python line1_mv_ai.py --list              # 看每首要幾段 + 運鏡 + credits 合計
python line1_mv_ai.py --song 13_時光膖囊    # 只跑一首（會產生費用）
python line1_mv_ai.py --song-index 15      # 只跑第 15 首（中文歌名在指令列會壞掉時用）
python line1_mv_ai.py --all --jobs 5      # 全部 19 首 = 236 段，5 首平行
python line1_mv_ai.py --all --budget 5000 # 只花到 5,000 credits 就停
python line1_mv_ai.py --all --ai-segments 3   # 混合模式：每首只做前 3 段 AI
```

> `--budget` 是額度保險：算出「下一段會超過上限」時就全批中止，不會超花。
> 遇到 402 也會立刻全批中止（不會一首一首慢慢撞）。

**混合模式（`--ai-segments N`）——省 credits 的主要槓桿**

一首歌只有前 10~30 秒決定觀眾要不要看下去（Shorts 的黃金 3 秒）。
所以可以只讓 **前 N 段** 用 AI，其餘時間用「AI 最後一段的末幀」做
**慢速推近 + 橫向漂移**鋪滿 —— 來源就是 AI 末幀，**接縫完全看不出來**。

| 模式 | 每首段數 | 19 首合計 | 成品 |
|---|---|---|---|
| 全段 AI（`--ai-segments 0`） | 236 | **66,080 credits** | `vertical_ai_1080x1920.mp4` |
| 混合 AI 3 段 | 57 | **15,960 credits**（省 4.1 倍） | `vertical_ai_1080x1920.partial3.mp4` |
| 混合 AI 1 段 | 19 | **5,320 credits**（省 12.4 倍） | `vertical_ai_1080x1920.partial1.mp4` |

`--list` 會直接算好每首與合計的 credits（每段 280）。
混合模式的成品檔名帶 `.partialN`，不會蓋掉全段版，兩個版本可以並存比較。

> ⚠️ 靜態鋪底不是「凍結一張圖」：來源放大 1.25 倍後用 zoompan 做
> 1.00 → 1.10 的慢速推近，同時緩緩往右漂移 → 觀眾看到的是持續運鏡。

**運鏡（`data/scenes.json` 的 `motion` 欄位）**：
段落串接會逐段推近，66 秒下來會推到極近特寫 → 靜物特寫適合推近，
但大外景推到底會糊成一片，所以大外景要換運鏡：

| motion | 適用 | 描述 |
|---|---|---|
| `push_in` | 靜物特寫、有明確主體（預設） | very slow push in，景深愈推愈淺 |
| `drift` | 大外景（城市的夜、機場、公路） | very slow truck right，橫移不收緊 |
| `tilt_up` | 天空／大地（故鄉的雲、風箏的故鄉） | very slow tilt up，往上移不收緊 |
| `pull_out` | 想慢慢揭露環境 | very slow pull back |

**續跑**：段落層級快取在 `out/_ai_stage/<曲名>/seg_NN.mp4`，
中斷後直接重跑同一個命令就好 —— 已產好的段落會沿用（不重花額度），
成品 `vertical_ai_1080x1920.mp4` 已存在也會跳過。

- `--force` → 只重算最後的合成影片，**不會**重燒 AI 段落的額度。
- `--force-segments` → 連 AI 段落也重做（**會重新燒額度**，慎用）。

**其他參數**：`--seconds 6|10`（Hailuo 只支援 6/10 秒）、`--resolution 768P|1080P`
（1080P 只支援 6 秒段）、`--segment-cost N`（改每段 credits 成本，用於預算試算）。

> **狀態（2026-11-17）**：MiniMax 帳戶的 **M Plan 週額度已用盡**，
> 所有送出都回 `{"code":402, "message":"... this task costs 280 credits
> (where the M Plan weekly limit applies, it counts at its credit-equivalent value)"}`，
> **回應不含 task_id → 必須當 ambiguous 不重送**（被拒在生成前，所以沒扣款）。
> 額度恢復後直接續跑同一個命令即可，已產好的段落不會重花。

### 零花費計費規則（2026-11-17 查證，重要）

`connector__matrix__submit_video_generation` 的工具說明裡寫得很清楚：

> on M Plan tiers that cover the model, a video is paid **from the M Plan weekly limit**
> when the remaining weekly limit can cover the whole video; **otherwise it is paid with
> account credits**. Legacy Token Plan usage limits **cannot** pay for MiniMax-H3 /
> MiniMax-H3-Max; **MiniMax-Hailuo-2.3 can still use them**.

推論出的三條結論：

1. **Hailuo-2.3 是唯一能用「已付費的週額度」付的影片模型** → 要零花費就用它。
   H3 / H3-Max 只能走帳戶點數（= 花錢），**不要碰**。
2. 週額度不夠時會**自動改用帳戶點數**。所以零花費的前提是「帳戶點數也要是 0」，
   否則會在你不注意的時候花掉點數 → 402 反而是好事，代表兩邊都不夠、被擋在生成前。
3. 額度視窗是**滾動 7 天、從首次使用起算**（影片只受週視窗管，5 小時視窗救不了影片）。
   本機目前這窗是 **2026-11-16 11:48 → 2026-11-23 11:48 (GMT+8)**。

**查用量的指令**（`mmx-cli`，`npm install -g mmx-cli`）：

```powershell
mmx auth status --output json     # 看 key 類型 / 區域 / 週視窗起訖
mmx quota show --output json       # model_remains[] → current_weekly_remaining_percent
```

> ⚠️ 本機 `~/.mmx/config.json` 的 key 是 **`sk-cp-…`**（M Plan / Token Plan key，region cn），
> 但它的**套餐層級不支援影片模型**（Hailuo-2.3 與 H3 都回
> 「当前 Token Plan 套餐等级不支持该模型，请升级套餐后使用」）。
> → 就算它顯示週額度還剩 92%，影片也生不出來。**這兩把 key 是不同的權限**，
> 別被 quota 百分比騙了。

**已排自動續跑**：cron「歌詞影片 AI 動態產線 每日續跑（零花費）」
（每天 0:13 / 8:13 / 16:13 Asia/Taipei）→ 自動跑
`python line1_mv_ai.py --all --jobs 3 --ai-segments 1`，
額度一重置就自己接著做，全程不買 credits、不升級方案。

**接縫怎麼串**：Hailuo-2.3 不支援 last_frame，所以是手動的 ——
下載第 N 段 → `ffmpeg -sseof -0.25` 抽最後一幀 → 上傳 → 當第 N+1 段的首幀。
提示詞要保持同一套物件描述、只改「推近程度」，否則模型會漂移出不同場景。

**段落串接會逐段推近**：66 秒下來會推到極近特寫。靜物特寫（鐵盒/眼鏡/相機）效果最好，
大場景反而會推得太近（這也是為什麼先試 13_時光膖囊 而不是大外景）。

### 產線 2：donttalk 網站素材批次 → `out/line2_site/`

**站點層**（`_site/`）
- `favicon-32 / 180 / 192 / 512.png`
- `logo-1024.png`

**歌曲層**（每首歌一個資料夾）
- `og-image.png`（1200×630，社群分享用）
- `share-card.png`（1200×1200）
- 兩張的 `.jpg` 版（**GIMP 批次轉檔**）
- `meta.json`（現成的 `og:` / `twitter:` 標籤，直接貼進頁面）
- 若清單有指定 `audio` → 轉 `m4a` / `ogg` / `mp3` 三種 web 格式

### 產線 2b：場景圖 → donttalk 網站 OG／分享卡 → `astro/public/music/cards/<slug>/`

把產線 1++ 的 SDXL 場景圖（`scene_1x1.png`）接進 donttalk 網站，
讓每首歌的社群分享卡從「純向量漸層」換成「自己的場景照 + 歌詞」。

**這條產線會直接寫進網站的素材目錄**，因為網站的歌曲頁
（`astro/src/pages/music/songs/[id].astro`）就是按固定檔名抓圖的：

| 檔名 | 尺寸 | 站上用途 |
|---|---|---|
| `square-1080.jpg` | 1080×1080 | 頁面左欄主視覺 + IG 方形 |
| `story-1080x1920.jpg` | 1080×1920 | IG 故事圖 |
| `yt-1280x720.jpg` | 1280×720 | YouTube 縮圖 |
| `og-image.jpg` | 1200×630 | **OG meta（社群平台抓這張）** |
| `share-card.jpg` | 1200×1200 | 方形分享卡 |

```powershell
python line2_scene_cards.py --list          # 看 19 首對應到哪些 slug
python line2_scene_cards.py --song-index 3   # 先產一首試（中文曲名別打指令列）
python line2_scene_cards.py                  # 全 19 首 + 發佈到網站
python line2_scene_cards.py --no-publish     # 只產不覆蓋站上
```

**版面**：Inkscape SVG 模板（`templates/*_bg.svg`）＋ `<image>` 底圖。
底圖用 `preserveAspectRatio="xMidYMid slice"` 鋪滿裁切，
上面疊一層全域壓暗 0.30 ＋ 文字帶漸層（band 0.74）＋ 邊緣 vignette，
文字固定米白 `#F5F1E8`（照片背景不能用 `readable_on` 那套依亮度選色）。

**slug 必須自己算**：`site_slug()` 對應網站的
`astro/src/lib/musicSongs.ts` 的 `slugify()`——非「字母/數字/底線/減號」
的字元一律換成 `-`。所以 `03_不服輸(優化版)` 在網站上是
`03_不服輸-優化版`，而 `common.safe_name()` 會保留括號 → 兩邊對不起來，
頁面永遠抓不到卡片（見坑 44）。

### 產線 3：歌詞卡 / 封面圖批次 → `out/line3_cards/`

每首歌產出四種尺寸 + JPG 版：

| 檔名 | 尺寸 | 用途 |
|---|---|---|
| `square_1080.png` | 1080×1080 | IG 方形 |
| `story_1080x1920.png` | 1080×1920 | IG 故事 |
| `yt_1280x720.png` | 1280×720 | YouTube 縮圖 |
| `cover_3000x3000.png` | 3000×3000 | Spotify 封面（向量模板直接放大，不糊） |

同時保留 `card_square.svg`，之後要改字直接改向量重出，不用回頭重做圖。

### 產線 4：PDF 批次處理 → `out/line4_pdf/`

用 Stirling-PDF 的 REST API，子命令：

```powershell
python line4_pdf_batch.py images      # 圖片 → PDF（合併版 + 單張版）
python line4_pdf_batch.py merge       # 合併資料夾內所有 PDF
python line4_pdf_batch.py split       # 拆成單頁
python line4_pdf_batch.py watermark   # 加浮水印（--text 可指定文字）
python line4_pdf_batch.py compress    # 壓縮（會回報前後位元組與比率）
python line4_pdf_batch.py pages       # 加頁碼
python line4_pdf_batch.py raster      # PDF → PNG
python line4_pdf_batch.py info        # 讀出每個 PDF 的頁數與大小
python line4_pdf_batch.py all         # 依序跑完以上全部
```

> 產線 4 是子命令式，**不帶參數只會印說明**（exit code 2）。`run_all.py` 會自動帶 `all`。

### 產線 4+：真實歌詞手冊 PDF → `out/line4_lyric_book/`

把 125 首真實歌詞排成一本可發行的 PDF 手冊（取代 Acrobat / InDesign 那條路）。

1. 解析歌詞 → 排版成 HTML（封面頁 + 目錄 + 每首一頁）
2. **Chrome 無頭列印**成 PDF（真的排版引擎，不是把圖片塞進 PDF）
3. **Stirling-PDF**：合併 → 加頁碼 → 壓縮 → 最終成品

產出：

| 檔案 | 內容 |
|---|---|
| `lyric_book.pdf` | **最終成品**（加頁碼 + 壓縮） |
| `lyric_book_numbered.pdf` | 加頁碼版 |
| `lyric_book_all.pdf` | 手冊原始版 |
| `single/01_*.pdf` … | 每首歌一份單曲 PDF（125 份） |
| `singles-index.json` | 曲序 / 頁數 / 檔名對照 |

目錄頁碼是**先量每一首幾頁、再回頭組版**，組版後會比對總頁數並自動收斂。

```powershell
python line4_lyric_book.py --limit 10   # 只做前 10 首（測試）
python line4_lyric_book.py              # 全 125 首
```

### 產線 5：YouTube 上傳 → `out/youtube/`

把產線 1+ 的 MV 直接上架 YouTube：標題、描述、標籤、縮圖、播放清單全自動。

```powershell
python youtube_upload.py meta             # 產生 metadata（JSON + Studio 匯入 CSV）
python youtube_upload.py auth             # OAuth 授權（瀏覽器點一次「允許」）
python youtube_upload.py status           # 看 token／頻道／可讀性
python youtube_upload.py upload          # 批次上傳（resumable + 縮圖 + 播放清單）
python youtube_upload.py csv              # 只輸出 YouTube Studio 匯入用 CSV
```

- `--privacy public|unlisted|private`（預設 private）
- `--kinds long,shorts`（長片 / 直式 Shorts）
- `--limit N`（只上傳前 N 支）

憑證來源：`YT_CLIENT_ID` / `YT_CLIENT_SECRET` 讀自
`C:\Users\User\.minimax\agents\mavis\.env`；refresh token 存在 repo 外的
`D:\Tools\youtube-oauth\token.json`（不進版控）。

> ⚠️ OAuth 回呼預設用 `http://localhost:8080`（要跟 GCP 的 Authorized redirect URIs 一致）。
> 8080 同時是 Stirling-PDF 的埠，授權前要先停掉它：
> `Stop-Process -Id (Get-NetTCPConnection -LocalPort 8080 -State Listen).OwningProcess -Force`
> 授權完成後再把 Stirling 開回來。

---

## 資料格式

### `data/songs.json`

```json
{
  "music_dir": "../../astro/public/music",
  "songs": [
    {
      "id": "01-這個城市的捷運",
      "title": "這個城市的捷運",
      "artist": "不說",
      "lyric": "這個城市的捷運",
      "subtitle": "donttalk.vercel.app",
      "color1": "#E8A33D",
      "color2": "#101820",
      "audio": "01-這個城市的捷運.mp3",
      "cover": null
    }
  ]
}
```

- `id` → 產出資料夾名與網址路徑
- `color1` = 點綴色、`color2` = 底色（文字色會自動依底色亮度挑黑或白）
- `audio` → 填音檔就會自動轉碼；留 `null` 就跳過
- 沒給 `color1` / `color2` 就用 `data/site.json` 的站點配色

### `data/site.json`

站點層設定（logo、favicon、預設配色、網址）。

---

## 模板在哪、怎麼改

所有版型都是 `templates/` 底下的 SVG，裡面用 `{{PLACEHOLDER}}` 佔位：

| 模板 | 尺寸 | 對應 |
|---|---|---|
| `card_square.svg` | 1080×1080 | IG 方形 / Spotify 封面 |
| `card_story.svg` | 1080×1920 | IG 故事 |
| `card_yt.svg` | 1280×720 | YouTube 縮圖 |
| `og_image.svg` | 1200×630 | 網站 OG 圖 |
| `share_square.svg` | 1200×1200 | 網站分享卡 |
| `favicon.svg` | 512×512 | 網站 icon |

可用的 placeholder：`{{COLOR1}}` `{{COLOR2}}` `{{COLOR3}}` `{{TEXTCOLOR}}` `{{TITLE}}`
`{{ARTIST}}` `{{SUBTITLE}}` `{{FONT}}` `{{LYRIC_LINES}}` `{{INITIAL}}`

歌詞區的**位置、字級、斷行規則**集中在 `cardkit.py` 的 `LAYOUTS` 表，
改那一張表就能一次調整所有模板的排版，不用動 SVG。

中文字型用 Windows 內建的 **Microsoft JhengHei**（`C:\Windows\Fonts\msjh.ttc`），
繁體中文直接開，不用另外裝字型。

---

## 共用層：`common.py`

| 函式 | 用途 |
|---|---|
| `tool(name)` | 取工具路徑並確認存在 |
| `run(cmd, timeout)` | subprocess（utf-8 + errors=replace，避開 cp950 解碼爆掉） |
| `out_dir(name)` | 建立 `out/<name>` |
| `gimp_job(job_src, log_path)` | **跑 GIMP 3.2 無頭批次**（已處理 `--quit`、`-b` 必須回傳數值、直譯器名大小寫敏感三個坑） |
| `ffprobe(path)` | 讀影片尺寸 / codec / 時長 |
| `png_size(path)` | 直接讀 PNG 頭的寬高 |
| `svg_to_png(...)` | Inkscape 匯出 |
| `Report` / `.step()` / `.finish()` | 產生 PASS/FAIL 表格 |

新增產線時直接 `import common` 就有全部工具可用。

---

## 已知的坑（照抄上面的做法就不會踩）

1. **GIMP 3.2 的 Python-Fu API 跟 2.x 完全不一樣**，網路上幾乎都是 2.x 教學，
   照抄會全錯。下面列的是實測踩過的差異。
2. **批次直譯器名大小寫敏感**：`python-fu-eval` 才行，寫 `python-Fu-eval` 會直接回
   「不是有效的批次直譯器」並停用批次模式。
3. **沒有 `--quit` GIMP 會留在背景空轉**，批次跑完主行程不退出，智能體每次都等到 timeout。
4. **`-b` 的內容必須回傳數值**，否則 GIMP 報「python-fu-eval 未回傳任何數值」並中止後續批次指令。
   → 用無空格的寫法：`(exec(open(r'<job.py>',encoding='utf-8').read()),0)[1]`
5. **GIMP job 檔裡的 `open()` 一定要明確寫 `encoding='utf-8'`**：
   GIMP 內嵌的 Python 預設用系統 locale（這台機器是 cp950），job 檔裡只要有中文路徑
   就會 `UnicodeDecodeError: 'cp950' codec can't decode byte 0xe9`。
6. **GIMP job 檔裡不要呼叫 `os._exit(0)`**：它會讓批次解譯器來不及回傳數值，
   GIMP 以 exit code 64 結束。要結束就靠命令列的 `--quit`。
7. **GIMP 的前景色是 `Gegl.Color`**，不是 tuple、不是 `Gdk.RGBA`。
   → `Gegl.Color.new("R'G'B'A float")` + `.set_rgba(r, g, b, a)`
8. **PNG 的 PDB 名是 `file-png-export`**，`file-png-save` 已經不存在（`procedure_exists` 回 False）。
9. **想知道 PDB 裡有什麼 procedure**：`Gimp.PDB().dump_to_file(Gio.File.new_for_path(r'<dump.txt>'))`
   dump 成純文字再搜，比猜名字快一百倍。
10. **melt 的 avformat consumer 不要傳 `width=` `height=`**，否則 MLT 會把 profile 再等比留白，
    左右各多 54px 黑邊。改用 .mlt 內的 profile 才是滿版。
11. **.mlt 裡的資源路徑要用相對路徑**，清掉中間目錄後才重算得起來。
12. **Stirling-PDF 的 multipart 欄位名必須是 `fileInput` 且要帶 filename**，否則 400。
13. **Stirling `split-pages` 的 `pageNumbers` 是「切割點」不是「抽哪幾頁」**：
    N 頁要切單頁要傳 `"1,2,...,N-1"`，回應是 ZIP 不是 JSON。
14. **Stirling `add-watermark` 要同時給 `alphabet` 與 `customColor`**，缺一就 500 NPE；
    且 `alphabet` 必須 `roman`（`arabic` 是 NotoSansArabic，沒有拉丁字母字形）。
15. **Stirling `ocr-pdf` 在 3.2.2 是 403 disabled**（語言包未啟用），不要拿別的端點假冒 OCR。
16. **Stirling 啟動時要指定工作目錄**（`-WorkingDirectory`），否則它會把
    `configs/ logs/ pipeline/` 灑在你的專案資料夾裡。
17. **Windows cp950**：含中文的 `.ps1` 要存 UTF-8 **with BOM**；Python 檔用 UTF-8 無 BOM。
    Python 讀子行程輸出一律 `encoding="utf-8", errors="replace"`。
18. **melt 與 GIMP 都吃不了中文路徑**：
    - melt：`Failed to load "…\\07_愛的模樣\\title_card.mlt"`（libxml2 誤報 out of memory）
    - GIMP：批次 job 檔含非 ASCII 字元 → 直接拒跑
    → 解法：搬到純 ASCII 的暫存目錄做，做完再搬回去（`line1_mv_lyric.py` 的 `_stage/`）。
19. **ffmpeg 的 `subtitles` 濾鏡不能吃 Windows 絕對路徑**（冒號被當成選項分隔符）：
    把工作目錄設成歌曲資料夾、用相對檔名 `lyrics.ass` 就正常。
20. **Chrome headless 同一時間只能開一個實例**（共用 profile 會報 profile in use）：
    平行跑一定要各自給 `--user-data-dir`。
21. **Chrome `--print-to-pdf` 預設會加頁首頁尾**（網址 + 日期），要 `--no-pdf-header-footer`。
22. **圖片用 `file://` 絕對路徑載入不穩**，改成 base64 data URI 內嵌最可靠。
23. **zoompan 逐幀做很慢**：先把背景圖模糊成一張 PNG 再對它 zoompan，速度差一個數量級。
24. **系統預設 python 是 CPU 版 torch**（`2.14.1+cpu`），SDXL / 影片模型跑不動。
    有 CUDA 的直譯器在 `C:\ComfyUI\.venv\Scripts\python.exe`（torch `2.10.0+cu130`，
    4060 Laptop 8GB，CUDA 可用）。`line1_mv_frames.py` 會**自動改用**它再把自己跑一遍
    （用 `subprocess.run` + `MAVIS_FRAMES_REEXEC` 旗標防迴圈）。
25. **SDXL 權重約 6.95GB**，HF 下載速度實測約 2.2 MB/s → 首次約 50 分鐘。
    快取在 `C:\Users\User\.cache\huggingface\hub\models--stabilityai--stable-diffusion-xl-base-1.0`
    （只抓 `*.fp16.safetensors`，不要抓 bf16 全套）。
    實測 18 檔並行下載只要 **15.8 分鐘**（比單檔估算的快）。
26. **8GB 顯存放不下 SDXL 全套** → 要開 `enable_model_cpu_offload()` + `enable_vae_tiling()`，
    1344×768 單張約 8–12 秒。
27. **SDXL 原生 fp16 VAE 會出黑圖**：改用 `madebyollin/sdxl-vae-fp16-fix`（167MB）覆蓋 `pipe.vae`。
    ⚠️ repo 名不是 `stabilityai/sdxl-vae-fp16-fix`（那個會 401）。
28. **Windows 上 `os.execve` 會 ACCESS_VIOLATION**（0xC0000005）→ 換直譯器要用
    `subprocess.run([target, __file__] + sys.argv[1:])` 再 `sys.exit(proc.returncode)`。
29. **`pip install diffusers` 會把 huggingface_hub 升到 2.4，弄壞 transformers 5.0.0**：
    裝完 diffusers 要再 `pip install "huggingface_hub<2.0"` 降回 1.33.0。
30. **diffusers 0.43 把 `enable_vae_tiling` / `enable_attention_slicing` 搬家了**（部分版本直接移除）：
    用 `getattr` + try/except 的 `_enable()` helper 做版本容錯，不要硬呼叫。
31. **直式 Shorts 不能沿用橫式的 ASS**：橫式 ASS 是 PlayRes 1920×1080，libass 套到
    1080×1920 會等比縮到 0.5625 倍（字變小、落在畫面中央偏上）。
    → 直式要另燒一份 ASS（PlayRes 1080×1920、字幕 MarginV 430 壓下三分之一、
      標題 alignment 改成 8 = 上方置中）。`build_ass(..., vertical=True)` 已處理。
32. **SDXL 很愛在招牌上生亂碼文字**：霓虹街景 / 便利商店 / 機場看板這類提示詞，
    光靠共用 `_negative` 擋不住。→ 在 `data/scenes.json` 該首加 `negative` 欄位覆寫
    （`signage, sign, storefront sign, billboard, typography, words, letters, license plate…`）。
    同理容易跑成卡通插畫的場景要加 `cartoon, illustration, flat colors, vector art…`。
    **橫式 MV 背景因為整張會被 `gblur sigma=20` 蓋掉所以看不出來，直式清晰版才會暴露。**
33. **`mcode-tools` 是 `.cmd` 套件**：Python `subprocess` 呼叫一定要 `shell=True`，
    否則 `WinError 2`（CreateProcess 不會自動補 `.cmd`）。路徑用
    `D:\.minimax\bin\mcode-tools.cmd`。
34. **中文路徑不能直接餵給 mcode-tools**（上傳素材、素材 URL 都會失敗）：
    先複製到純 ASCII 的暫存目錄（`out/_ai_stage/`）再上傳，位元組完全不變。
    Python 端要用 `os.environ` 傳中文路徑 —— 直接把中文寫在 `python -c` 字串裡會壞掉。
35. **PowerShell `>` 重導向寫出的是 UTF-16LE**（BOM `0xFF`）：
    Python 讀 JSON 要依序試 `utf-8-sig` / `utf-16` / `utf-16-le` / `utf-8`。
    （`Out-File -Encoding utf8` 才是真的 UTF-8。）
36. **模組自己的 `run()` 一定要支援 `cwd`**：ffmpeg 的 `subtitles=` 濾鏡不吃絕對路徑
    （C: 的冒號被當選項分隔符），所以合成時必須把 cwd 設成歌曲資料夾用相對檔名。
    少了 `cwd` 參數會在**最後合成那一步**才爆 → 前面花的額度全白費。
37. **`--force` 只能重算最後的合成**，不能連 AI 段落一起重做（那會重燒額度）。
    段落重做要另外的 `--force-segments`。
38. **402 的 JSON 裡是 `"code": 402`（冒號後有空格）**：比對字串時要先 `raw.replace(" ", "")`，
    或另外比對 `insufficient allowance`，不然會漏掉額度耗盡而繼續燒。
39. **中文歌名不能寫在 bash 指令列**（編碼會壞掉 → 找不到檔案）：
    用 `--song-index N`（第 N 首）或 `Get-ChildItem` 動態組路徑。
40. **混合模式的靜態鋪底不能只是凍結一張圖**：那 116 秒會像死掉的畫面。
    來源放大 1.25 倍後用 `zoompan` 做 1.00→1.10 慢速推近 + 緩緩右漂，才有持續運鏡感。
    （`zoom>1` 需要輸入比輸出大，否則沒有推近的餘裕。）
41. **批次被中止 → 最後寫入的影片檔會是壞的**：ffmpeg 被砍時 mp4 沒有寫完 moov atom，
    之後 ffprobe 會直接報「moov atom not found / Invalid data found」。
    → 產完務必跑一次**全量 ffprobe QA**（19 支一次巡完，順便比對音檔長度），
    壞檔要刪掉重算，不然「已存在就跳過」的 resume 邏輯會永遠跳過壞檔。
42. **SDXL 提示詞裡只要出現 taxi，就幾乎一定會生出車頂牌亂碼（TAXI → TAI/TAU）**：
    就算 negative 已經寫了 `text, letters, signage` 也擋不住。
    → 要「車內往窗外看」的構圖，就把 `car exterior, street view, taxi exterior` 加進 negative，
    並在正向提示詞明確寫 `seen from inside the car`。
    05_雨夜出租 就是這樣修掉的（原本畫成外部計程車外觀 → 改成車內雨窗散景）。
43. **negative 超過 CLIP 77 token 會被截斷**，而且截斷點不同 → 換一個 negative 字串
    就會換掉整張圖（就算 seed 相同）。改 negative 前後要重新挑圖。
    `data/scenes.json` 可用 `seed_<比例>` / `seed` 欄位覆寫 seed，讓換完 prompt 仍能重現同一張圖。
44. **工具鏈的 `safe_name()` 跟網站的 `slugify()` 不是同一套規則**：
    `safe_name()` 保留括號（`03_不服輸(優化版)`），但網站的
    `astro/src/lib/musicSongs.ts` 用 `id.replace(/[^\p{L}\p{N}_-]+/gu, '-')`
    會把括號換成 `-`（`03_不服輸-優化版`）。
    → 任何要寫進 `astro/public/music/cards/<slug>/` 的產線都必須用
    `line2_scene_cards.py` 裡的 `site_slug()`，不能用 `common.safe_name()`，
    否則網站永遠抓不到圖（頁面 `hasCards` 判定失準）。
45. **Inkscape 的 `<image>` 要用 `file:///` URI，不是 Windows 反斜線路徑**：
    `file:///D:/path/scene_1x1.png`。好消息是**未 percent-encode 的中文路徑實測可用**
    （`cardkit.file_uri()` 只編碼 `% # & ?`），不必像坑 22 那樣全塞 base64。
    底圖鋪滿用 `preserveAspectRatio="xMidYMid slice"`。
46. **PowerShell 直接 `& inkscape.exe` 會把 Inkscape 的 stderr 警告當成錯誤**：
    Inkscape 1.x 啟動固定噴一串 `WARNING **: Duplicate option text ...`，
    在 `$ErrorActionPreference='Stop'` 下會直接中止指令串，看起來像「匯出失敗」，
    其實 exit code 是 0、圖也產出來了。
    → 要看真實 exit code 就用 `Start-Process -Wait -PassThru -RedirectStandardError`，
    或在 Python 端用 `common.run()`（它 `capture_output` 不會炸）。
47. **照片背景不能用 `readable_on()` 選文字色**：那是依「背景色塊亮度」算的，
    對照片沒意義（照片的平均亮度不代表主體區亮度）。帶背景的模板一律固定米白
    `#F5F1E8`，靠疊一層壓暗 band 來保證可讀性。

---

## donttalk 網站部署（Vercel）

```powershell
cd D:\project\astro
npm run build                                              # astro build + pagefind
powershell -ExecutionPolicy Bypass -File scripts\prepare-deploy.ps1   # 組 .vercel/output
npx vercel deploy --prebuilt --prod --yes --token $env:VERCEL_TOKEN
npx vercel alias set <deployment-url> donttalk.vercel.app  # 切正式站 alias
```

**必須自己 HTTP 驗證，不能只看 CLI 的 "Ready"**：

```powershell
Invoke-WebRequest -Uri 'https://donttalk.vercel.app/music/cards/05_雨夜出租/og-image.jpg' -Method Head
```

48. **Vercel CLI 在 Windows 上會「靜默跳過」含非 ASCII 字元的路徑**：
    部署顯示 Ready、alias 成功，但線上 `/music/cards/**` 全 404、`/games/**` 正常。
    實測 `.vercel/output` 有 1654 個檔案，CLI 只找到 **889** 個
    = 純 ASCII 的 887 + 2 個 functions；被跳過的 767 個正好是 `music/` 底下
    所有中文曲名目錄（音樂卡、歌詞頁、封面都在裡面）。
    Windows 的 `tar.exe` 同病（中文路徑上 ACCESS_VIOLATION，只寫出 5 個條目），
    所以 `vercel deploy --archive tgz` 也會產生截斷的 archive。
    → **解法**：`astro/scripts/ascii_mirror.py` 把每個含非 ASCII 的路徑再複製一份
    percent-encoded 的 ASCII 副本（`05_雨夜出租` → `05_%E9%9B%A8...`）。
    瀏覽器與爬蟲本來就把中文路徑編碼後去請求 → 剛好對上，
    **公開網址與 Astro 端一行都不用改**。已整合進 `prepare-deploy.ps1` 步驟 1.5。
49. **部署壞掉時 `npx vercel rollback <舊部署url> --yes` 是最快的止血手段**（3 秒）。
    線上壞掉要立刻 rollback，不要一直 try 新部署。
50. **不要走 `vercel deploy`（非 prebuilt）**：會把整個 repo 當 source 上傳
    （實測 3.8GB），`.vercelignore` 沒擋掉，且要等雲端 build。
    `--prebuilt` 才是這台機器上唯一可行的路徑。
51. **payload 136.6MB 不是問題**：Vercel Hobby 的 100MB 限制沒有在這裡生效
    （雲端 build 的舊部署同樣大小且完整上線）。真正砍掉整個 `music/` 的是坑 48。
52. **不要對 `donttalk.vercel.app` 手動 `vercel alias set`**：它是專案自己的
    production domain（`GET /v10/projects/<id>/domains` 會列出、verified=true），
    Vercel 會在每次 production 部署完成時自動指過去 —— 也就是說 **push 到
    production branch（`main`）就會自動更新正式站**。
    一旦手動 `alias set`，manual alias 會**蓋掉自動指派**：
    實測 2026-11-18，`alias set` 之後 push main 產生了 Ready 的 production 部署，
    但 `donttalk.vercel.app` 完全沒動，網站靜靜地繼續跑舊版本。
    → 要恢復自動更新：`npx vercel alias rm donttalk.vercel.app`，
    再 push 一次讓 Vercel 重新指派。
53. **Vercel 的 production branch 是 `main`**（`link.productionBranch`）：
    push 到 `main` → **Production** 部署（自動更新正式站）；
    push 到其他分支（例如 `123lai1234-create`）→ 只有 **Preview** 部署，
    正式站不會變動。這個欄位**只能用 Vercel API 的 `link` 改（已被 v9 拒絕），
    只能走 Dashboard**。
54. **`vercel deploy --prebuilt` 會打出「退版」版本**：它用**本地工作區** build，
    不含 `origin/main` 還沒合併進來的 commit。2026-11-18 就是這樣把線上打成
    缺 firmware、浮動人偶、小豬等功能的舊版（首頁 78643 vs main 的 85313）。
    → **部署前必須先 `git merge origin/main`**，否則線上會退版。
    → 正確做法是走 git push（見 `astro/scripts/deploy-production.ps1`：
    檢查分支是否含 origin/main → push main → 等部署 → 驗證 alias 與關鍵路徑）。
55. **manual alias 移除後，git push 的自動指派就會恢復**（實測 2026-11-18 22:09）：
    `vercel alias rm donttalk.vercel.app` 之後，下一次 push main 的 production 部署
    自動把 `donttalk.vercel.app`、`donttalk-donttalk.vercel.app`、
    `donttalk-git-main-donttalk.vercel.app` 三個 alias 全部指過去，
    正式站自動換版（內容含「不說廚房」那次 push 的成果）。

---

## 附錄

| 路徑 | 內容 |
|---|---|
| `docs/free-adobe-replacement-cheatsheet.md` | 免費取代 Adobe CC + 剪映的完整對應表、快捷鍵對照、17 條踩坑紀錄 |
| `docs/AI動態畫面_取代評估.md` | Pika H3 Flex / Comfy Cloud / RunPod / 授權成本評估，以及「不取代長片、加變體產線」的結論 |
| `docs/Pika_H3_Flex_實測摘要.md` | 《最新Pika H3 Flex實測》影片的完整逐字稿摘要、節點參數、耗時基準 |
| `demo/agent-pipeline-demo.py` | 智能體驅動示範管線：GIMP 批次改圖 / FFmpeg 轉檔 / melt 算繪 / Stirling-PDF 批次，逐項印 PASS/FAIL |

示範管線獨立於四條產線，跑法：

```powershell
cd demo
python agent-pipeline-demo.py     # 全過會 exit 0
```

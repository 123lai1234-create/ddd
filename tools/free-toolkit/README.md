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

## 四條產線

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

---

## 附錄

| 路徑 | 內容 |
|---|---|
| `docs/free-adobe-replacement-cheatsheet.md` | 免費取代 Adobe CC + 剪映的完整對應表、快捷鍵對照、17 條踩坑紀錄 |
| `demo/agent-pipeline-demo.py` | 智能體驅動示範管線：GIMP 批次改圖 / FFmpeg 轉檔 / melt 算繪 / Stirling-PDF 批次，逐項印 PASS/FAIL |

示範管線獨立於四條產線，跑法：

```powershell
cd demo
python agent-pipeline-demo.py     # 全過會 exit 0
```

# Pika H3 Flex 能否取代 free-toolkit 歌詞影片產線的動態畫面？

**評估對象**：`D:\project\tools\free-toolkit\line1_mv_lyric.py`（產線 1+ 真實歌曲歌詞影片）
**評估日期**：2026-11-13
**依據**：Pika H3 Flex 官方文件 + 配飯Studio 實測影片 + 本機產線實際資料 + ComfyUI 核心工作流 JSON

---

## 結論（先講）

**不建議「取代」，建議「加一條變體產線」，而且第一優先不是長片，是直式 Shorts。**

三個理由：

1. **長片（16:9）的動態畫面是「封面模糊 + 慢推」，這是刻意設計**，跟網站卡片系統（每首歌的 color1/color2）綁在一起。全換成 AI 會斷掉視覺識別，而且那個畫面本身質感不差。
2. **但直式 Shorts 現在是壞的**。`vertical_1080x1920.mp4` 是從 1920×1080 中心裁切，16:9 裁成 9:16 等於切掉三分之二畫面。實測擷取「城市的夜」直式畫面：霓虹雨夜糊成一片無主體色塊，完全沒有構圖。**而 Pika H3 Flex 原生支援 9:16**（ComfyUI 核心 `ResolutionSelector` 比例表：`1:1` / `2:3` / `3:2` / `3:4` / `4:3` / `9:16` / `16:9` / `21:9`）。這才是 AI 動態畫面真正的價值點。
3. **現有架構本來就換得了**。`render_master(out, bg, audio, duration, accent)` 的 `bg` 參數就是背景來源，字幕是獨立燒的 ASS（配時依音檔長度算），**跟背景完全解耦**。換背景 = 換掉那個輸入，字幕對齊一行都不用改。

---

## 一、現有產線的實測規模（2026-11-13 量測）

| 項目 | 數值 |
|---|---|
| manifest 總曲數 | 125 首 |
| **有音檔可跑** | **19 首** |
| 音檔總長 | **37.6 分鐘** |
| 音檔長度 | 最短 66.0s / 中位 123.2s / 最長 179.6s |
| **有真實封面圖** | **6 / 19 首**（其餘靠產線 3 卡片 fallback） |
| 成品 master.mp4 | 1920×1080 / H.264+AAC / 25fps / ~481 kbps |
| 單首本地算繪耗時 | ~90 秒 |

已產出 19 首（`out/line1_lyric_mv/`），每首含 `master.mp4` / `youtube_1080p.mp4` / `vertical_1080x1920.mp4` / `square_1080x1080.mp4` / `audio.m4a` / `audio.mp3` / `title_card.mp4`(+`.mlt`) / `lyrics.ass` / 兩張縮圖。產線 5 已能直接上架 YouTube（配額 100 次/天）。

**目前背景下視**：封面圖 → `scale+crop 2304×1296` → `gblur sigma=20` → `eq` 調暗加飽和 → `zoompan` 慢推（1.07x）→ `vignette` → `drawbox` 進度條 → libass 燒字幕。

---

## 二、Pika H3 Flex 能不能吃下這條線？——技術對接表

| 產線需求 | H3 Flex 對應能力 | 判定 |
|---|---|---|
| 直式 1080×1920 | `ResolutionSelector` 比例表有 `9:16 (Portrait Widescreen)`；設 megapixels=2.07 即得 1080×1920 | ✅ 原生支援 |
| 長度控制 | `PrimitiveFloat (Duration)` 秒數 → `ComfyMathExpression` 換算影格並對齊 **17k+5 網格**：3s→73、5s→124、8s→192、10s→243、15s→362 影格 | ✅ 可控 |
| 每段最長 | 實測 8s；同架構的 FastH3 Omni 文件記載訓練區間 124/243/362 影格（5/10/15 秒 @24fps） | ✅ 可到 ~15 秒 |
| 解析度 | 1.0MP 16:9 = 1344×768；1.5MP ≈ 1664×936。**低於現有 master 的 1920×1080** | ⚠️ 需上采样 |
| 片段接縫 | **FL2VA（首尾幀）** 可把上一段末幀當下一段首幀 → 連續鏡頭 | ✅ 有解 |
| 角色一致性 | **Ref2VA**：最多 9 圖 + 3 影片 + 3 音訊參考 | ✅ 有解 |
| 音軌 | H3 原生生成立體聲（同 pass 出來） | ⚠️ 浪費但不要錢（同 pass，不加成本）→ **丟掉用原曲** |
| 字幕 | 產線的 ASS 配時依音檔長度算，與背景解耦 | ✅ 不用動 |
| LoRA 強度 | 官方要求 strength=1.0，且**不可再疊 turbo/Lightning LoRA** | ⚠️ 硬規則 |
| 採樣 | `ManualSigmas = 1.0, 0.972973, 0.923077, 0.8, 0.571429, 0.333333, 0.0`（7 值 = 6 步）、sampler `lcm`、CFG 1.0 | ✅ 直接用官方模板 |

**工作流結構**（官方 `video_pika_h3_flex_ref2va.json` 22 節點）：
`UNETLoader` → `LoraLoaderModelOnly` → `CLIPLoader` → `VAELoader`×2 → `MiniMaxH3ReferenceToVideo` → `BasicGuider` + `KSamplerSelect(lcm)` + `ManualSigmas` + `RandomNoise` → `SamplerCustomAdvanced` → `VAEDecode` + `VAEDecodeAudio` → `CreateVideo` → `SaveVideo`
＋ `ResolutionSelector`（比例/百萬像素）、`PrimitiveFloat`（秒數）、`ComfyMathExpression`（17k+5 影格換算）。

---

## 三、關鍵難題：第一幀從哪來

**只有 6/19 首有真實封面**，而且產線 3 的 fallback 卡片是 **1080×1080 且上面有歌名字**——**不能直接當 AI 影片的首幀**，AI 會把文字扭成亂碼，而且正方形轉 16:9 構圖會壞掉。

**解法（成本最低的分工）**：

1. **首幀在本機生成**：這台 RTX 4060 Laptop **8GB 跑 SDXL / Flux schnell 生 1920×1080 首幀綽綽有餘**（單張圖而已，不是影片）。用 `data/songs.json` 裡的 `color1`/`color2` 寫進 prompt，維持每首歌的配色識別。
2. **首幀餵給 H3**：
   - 想要「從封面動開」→ **FL2VA**（封面當首幀）
   - 想要「同一個角色跑完整首歌」→ **Ref2VA**（角色參考圖 + 提示詞）
3. 同一首歌的多段鏡頭：把上一段的末幀當下一段的首幀 → 無縫。

---

## 四、成本模型

### 單段生成時間基準（RTX 3090 24GB，影片實測）

| 設定 | 耗時 |
|---|---|
| 1.0MP / 16:9 / 8 秒（192 影格） | 278 秒 |
| 1.5MP / 16:9 / 8 秒 | 459 秒 |

### Comfy Cloud 計價換算

Comfy Cloud 跑 **Blackwell RTX PRO 6000 96GB**，API 報價 **$3.49/hr = 736.39 credits/hr** → **0.2046 credits/秒**。96GB 對比 3090 保守抓 2–2.5 倍加速。

| 方案 A：只做直式 Shorts（建議） | 數量 |
|---|---|
| 每首 30 秒 Shorts = 4 段 × 8 秒 | — |
| 19 首 | **76 段** |
| 單段（9:16 / 2.07MP / 8 秒）估計 ~250–280 秒 | **~53 credits** |
| **合計** | **~4,000 credits ≈ 5.4 小時 96GB GPU ≈ $19** |
| 對照：Comfy Cloud Standard $20/mo = 4,200 credits/月 | **剛好涵蓋整批** |

| 方案 B：長片也全面改 AI（不建議） | 數量 |
|---|---|
| 10 秒/段（243 影格） | 233 段 |
| 8 秒/段（192 影格） | 292 段 |
| 單段（16:9 / 1.0MP）估計 ~130 秒 | ~27 credits |
| **合計（10 秒/段）** | **~6,300 credits ≈ 8.5 小時 96GB GPU ≈ $30** |
| 對照：Creator $35/mo = 7,400 credits/月 | 財務上可行，但**視覺識別會斷** |

> 官方公布的「5 秒 768p 單卡約 1 分鐘」跟實測差了 3 倍，估成本請用實測值。

### RunPod 自架對照

| GPU | Community Cloud | Secure Cloud |
|---|---|---|
| RTX 3090 24GB | ~$0.46–0.50/hr | ~$0.50/hr |
| RTX 4090 24GB | ~$0.34–0.74/hr | ~$0.74–1.10/hr |
| A40 / A6000 48GB | ~$0.33–0.53/hr | ~$1.22/hr |

- 儲存：network storage <1TB $0.07/GB/mo（42GB ≈ $3/mo）
- 隱藏成本：**42GB 模型下載**。本機實測下載只有 ~80KB/s（146 小時），但雲端機房頻寬通常 100MB/s 以上 → 約 7–15 分鐘。開機+裝 ComfyUI+下載 ≈ 30–60 分鐘付費 GPU 時間（≈ $0.50）
→ **損益平衡**：Comfy Cloud 約 $0.25–0.30/支直式 Shorts；RunPod 24 小時開著 A6000 = $12.72/天。**一天要產 40 支以上，RunPod 才贏**。19 首 × 4 段 = 76 段 → 一次跑完約 $8–10，但之後沒素材時就是在燒錢。

### 商用授權（會決定走哪條路）

| 路線 | 商用權利 |
|---|---|
| **Comfy Cloud** | 已包含在訂閱內 |
| 本地 / 自架 Pod 跑開源權重 | 需 MiniMax Commercial License，Comfy 是唯一官方轉售商：**Professional 從 $5,000/月起**（含 ~46,250 video-seconds，$0.108/秒，超出 $0.036/秒） |
| 免費 Community License | 有地域與商用限制 |

→ **要用 AI 動態畫面又要商用，就走 Comfy Cloud**，別自架。

---

## 五、風險清單

| # | 風險 | 說明 | 緩解 |
|---|---|---|---|
| 1 | **解析度不足** | H3 最高 1.5MP（1664×936）< master 的 1920×1080 | 上采样（Real-ESRGAN / Topaz）；**但現有背景下視本來就是模糊的，模糊背景對上采样瑕疵相容度高** |
| 2 | **片段跳接** | 8–15 秒一刀，硬接會跳 | 用 FL2VA 末幀→首幀串接；或挑有明顯場景切換的鏡頭分段 |
| 3 | **AI 文字亂碼** | 產線 3 卡片有歌名字，不能當首幀 | 首幀一律另外生（無文字）；官方說「畫面上的短標籤會清楚」，但別賭 |
| 4 | **主體被字幕擋住** | 直式字幕在下三分之一 | 生成時把主體構圖放上 2/3（官方提醒：「廣角」要寫成「主體在大空房間裡很小」這種內容式描述） |
| 5 | **成本失控** | 長片全改 AI = 233 段起跳 | 先只做 Shorts；先用 Comfy Cloud 免費 5 次試跑量實際 credits |
| 6 | **授權** | 本地跑商用要 $5,000/月 | 走 Comfy Cloud |
| 7 | **AI 音軌是浪費** | H3 同 pass 生音，但要用原曲 | 直接忽略 AI 音軌輸出，不加成本 |
| 8 | **既有坑會重現** | 中文路徑（melt/GIMP/ffmpeg subtitles 濾鏡） | 影片素材要用純 ASCII 暫存區（現有 `stage_dir()` 已處理） |

---

## 六、建議的落地順序

### 步驟 1（零成本，先做）：本機首幀生成器
在 `free-toolkit` 加一條 `line1_mv_frames.py`：
- 讀 `data/songs.json` 的 `color1`/`color2` + 歌詞主題 → 用本機 SDXL/Flux 生 1920×1080 無文字場景圖
- 順手修掉「只有 6/19 有封面」的缺口，**沒有 AI 影片也先有比卡片好的封面**

### 步驟 2：直式 Shorts 變體（真正的痛點）
- Comfy Cloud 免費 5 次試跑 → 實測 credits/段，校準上面的估算
- 用 FL2VA：首幀 = 步驟 1 的場景圖，末幀 = 下一段的首幀
- 產出 `vertical_ai_1080x1920.mp4`，跟現有 `vertical_1080x1920.mp4` 並存比較

### 步驟 3（視需要）：長片 AI 背景變體
- 保留現有封面模糊慢推版作預設
- 新增 `--bg ai` 參數切換到 AI 背景版
- `render_master()` 改成吃「影片」而不是「圖片」：`-loop 1 -i blur` → `-f concat.txt -i concat.txt`

### 步驟 4：全自動化的關鍵設計
把「歌詞 → 提示詞」也交給 H3 的 **AUCASR**（官方 Ref2VA 模板內建的提示詞生成路徑，影片裡 332s 就在用），提示詞結構照官方規範：
`subject_definitions` / `summary` / `retention_analysis` / `detailed_description` / `overall_soundscape` / `non_diegetic_music`，
參考素材標成 `<Subject 1>` / `<Picture 1>` / `<Video 1>` / `<Audio 1>`。

---

## 七、怎樣算是「成功」

| 指標 | 門檻 |
|---|---|
| 直式 Shorts 畫面 | 有明確主體與構圖，不再是糊色塊 |
| 單支 30 秒 Shorts 成本 | < $0.35（Comfy Cloud credits 計） |
| 19 首 Shorts 總成本 | < $25（= Creator 方案一個月內） |
| 字幕對齊 | 與現有產線完全一致（不動 ASS 邏輯就應該一致） |
| 與現有產線並存 | 兩版共存，由 flag 切換，不破壞既有 19 首成品 |

---

## 附錄：其他可能更划算的替代方案

**本地小模型跑背景**：這台的 4060 8GB 跑 **Wan2.1-T2V-1.3B** 或 **LTX-Video**（768×512、5 秒）綽綽有餘，**零雲端成本、零授權問題**。品質不如 H3，但對「模糊氛圍背景」這個需求可能就夠了。建議先跑一支試片比較，再決定要不要上 H3。

**FastH3 Omni**（FastVideo + Nuva Lab）：H3 的另一個蒸餾版，**8 步、純核心節點**，檔案有 INT8 22.2GB / FP8 23.0GB / **NVFP4 QAD 13.8GB（僅 Blackwell）**。官方模板 `video_fasth3_ominiref_r2v.json`。16GB 卡可用 0.5MP（960×544）+ 5 秒起步 —— **比 Pika H3 Flex 更省記憶體，也沒有 Pika LoRA 的限制（不用顧「不能疊加速 LoRA」）**。

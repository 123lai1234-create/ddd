# Pika H3 Flex 實測摘要

**來源影片**：[最新Pika H3 Flex實測！表現優秀且生成速度快](https://www.youtube.com/watch?v=ZXlNFvK2EPc)（配飯Studio / @PayRiceStudio，2026-10-30，7分22秒，14,008次觀看，112讚）

**官方文件**：<https://docs.comfy.org/tutorials/video/pika/pika-h3-flex>
（影片無字幕、無章節，本摘要由影片音軌（faster-whisper large-v3 轉錄）+ 逐幀截圖交叉比對整理）

---

## 一句話結論

Pika H3 Flex = MiniMax H3 的 **6 步蒸餾 LoRA**，在 ComfyUI 裡跑得又快又不錯；官方版 H3 主模型在「五官輪廓 / 髮束集中度」上比 Singularity 版更銳利，但 Singularity 版運球等物理動作偶爾更自然。

---

## Pika H3 Flex 是什麼

- Pika 發布的 MiniMax H3 後訓練版本，**開源權重**，以兩個 LoRA adapter 形式提供（`pika_h3_flex_fl2va_v1_bf16` / `pika_h3_flex_ref2va_v1_bf16`）
- 用 DMD 蒸餾把 50 步生成器壓到 **6 步**，再用 reward feedback + preference optimization 精修
- 底模不變（沿用你本來就有的 MiniMax H3），所以不用換架構，只加 LoRA
- 一次生成 **原生立體聲**：對白、SFX、音樂與畫面同 pass 出來
- 最多 12 個參考素材：9 圖 + 3 影片 + 3 音訊（影片/音訊參考各 2–15 秒）
- 授權：MiniMax H3 Community License（**商用條款要自己看**）

---

## 影片流程

1. **開頭（0–16s）**：直接放對比成品 —「官方 H3 + Pika H3 LoRA」vs「Singularity + Pika H3 LoRA」
2. **官網（16–80s）**：開 [ComfyUI 官方 Pika H3 Flex 頁](https://docs.comfy.org/tutorials/video/pika/pika-h3-flex)
   - 重點就是「**一個走六步的工作流**」，支援文生視頻(T2V) / 參考生成影片(Ref2VA) / 首尾幀(FL2VA)
   - 官網頁面直接給模型下載連結與放置路徑
3. **匯入工作流（80–96s）**：ComfyUI → Configure UI → 把下載的 workflow JSON 拖進去 → 看有沒有缺模型，缺的自己下載
   - 他評價：「相當簡單的一個工作流」「整個看起來相當乾淨」
   - 節點組成：`Load Diffusion Model` → `Load LoRA` → `Load CLIP` → `Load VAE` → `MiniMax H3 Reference to Video` → `Basic Guider` + `KSamplerSelect(lcm)` + `ManualSigmas` → `SamplerCustomAdvanced` → `Create Video` / `Save Video`
4. **自己加料（96–132s）**：他在官方工作流上**多加兩個加速節點**（注意力稀疏 / TeaCache 類）
   - `Model Attention Backend`：attention_percent 10.0、start 0.20 / end 1.00、steps 12288、extra_cnames 256、first_block_skipping `exact_fp8_and_low`
   - `Block/Sparse Attention`：同系列參數
   - 心得：「我自己又加入了一些加速節點，整體的品質也沒有下降太多」
5. **實測（132s–433s）**：兩個主模型 × 兩組參考圖 × 兩種解析度，跑完對比

---

## 硬體與實測數據

| 項目 | 數值 |
|---|---|
| GPU | RTX 3090 **24GB** |
| 系統記憶體 | 48GB |
| 單次生成佔用 | 3090 吃到 ~20GB VRAM、系統記憶體 ~22GB |
| GPU 溫度 | ~60°C |

| # | 主模型 | 解析度 / 長度 | 耗時 | 備註 |
|---|---|---|---|---|
| 1 | 官方 `minimax_h3_ref2va_pruned_int8_convrot` | 1.0MP / 768p / 8 秒 | **278 秒** | 遠景臉部有點模糊，近景還不錯；籃球有多一顆 |
| 2 | 同上（固定 seed 再抽卡） | 同上 | **240 秒** | 運球比較正常，至少沒多出球 |
| 3 | Singularity `Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8` | 1.0MP / 768p / 8 秒 | （未報數字） | 同 seed、同 prompt、同解析度，只換主模型 |
| 4 | Singularity | 1.5MP / 928p / 8 秒 | **459 秒** | 比 1.0MP 慢約 3 分鐘（畢竟是 928p） |
| 5 | 官方版 | 1.5MP / 928p / 8 秒 | （已跑出，無數字） | 同 seed 再跑一遍做對照 |

**關鍵參數**：`ManualSigmas = 1.0, 0.987987, 0.923077, 0.8, 0.571429, 0.333333, 0.0`（7 個值 = 6 步）、KSampler = `lcm`、LoRA strength = 1.00、fps 24、16:9。

---

## 官方 H3 vs Singularity v1.3（影片自製對比字幕）

**1.0MP / 768p**
- 官方 H3 + Pika H3 LoRA：**五官輪廓較清楚 · 髮束邊界較集中**
- Singularity + Pika H3 LoRA：五官呈現較柔和 · 髮束邊緣較柔
- （取自原片第 6.5 秒局部放大）

**1.5MP / 928p**
- 官方 H3 + Pika H3 LoRA：髮束較集中 · 髮尾可見細絲
- Singularity + Pika H3 LoRA：髮絲向外散開 · 結絲與背景對比明顯
- （取自原片第 4.5 秒局部放大）

---

## 官方文件重點（影片沒講但很重要）

- **六步就是訓練出來的 schedule**：提高 step 數不會增加細節；把 sigma list 降到 7 個值以下會直接壞掉
- **不要疊加速 LoRA**：adapter 本身已蒸餾到 6 步，再疊 turbo / Lightning LoRA 會直接壞掉輸出。sigma list 與 adapter strength 都保持 1.0
- **攝影機幅度只是建議值**：明寫幾度、幾秒切都會偏差 0.2–0.3 秒，甚至方向相反
- **「廣角」要寫成內容**：`Wide shot` 單獨寫會變中景，要寫「主體在一個很大的空房間裡很小」
- **細微接觸不可靠**：手要停在幾公分外通常會直接碰到，設計劇本時要預留
- **畫面上的文字會清楚**：道具上的短標籤在鏡頭移動中仍可辨識
- **想沿用既有 MiniMax H3 模板**：把 sampler 改成 `lcm`、scheduler 換成 `ManualSigmas` 即可
- Ref2VA 的 prompt 要用完整參考格式：`subject_definitions` / `summary` / `retention_analysis` / `detailed_description` / `overall_soundscape` / `non_diegetic_music`，並把參考標成 `<Subject 1>` `<Picture 1>` `<Video 1>` `<Audio 1>`

## 官方宣稱 vs 影片實測（落差要注意）

官方頁面寫「5 秒 1344x768 單卡約 1 分鐘完成」；但影片在 3090 上跑 **8 秒 768p 花了 278 秒（4.6 分鐘）**，換算約 35 秒／秒輸出，比官方數字慢約 3 倍。合理推測原因：實測含參考圖 + 原生音訊生成、且套了他自己加的注意力稀疏節點。**要估成本請以實測值為準，不要用官方「一分鐘」去估。**

---

## 對這台環境的實用性（重要）

| 項目 | 狀況 |
|---|---|
| 本機 GPU | RTX 4060 Laptop **8GB** |
| 需求 VRAM | ~20–22GB |
| 結論 | **本機跑不動**，必須上雲（Comfy Cloud / RunPod / Vast / fal 等），或等 Pika 官方 API |

其他提醒：
- 模型檔很大（`qwen3vl_32b_minimax_h3_nvfp4_awq` text encoder + int8 diffusion model），雲端要確認磁碟
- 授權走 MiniMax H3 Community License，**要商用得先看條款**（有地域與商用限制）
- 如果只是要「有聲音的短影片」，先用 Comfy Cloud 的模板（`cloud.comfy.org/?template=video_pika_h3_flex_ref2va`）試水，別急著自己架

---

## 部署與成本（2026-11-13 查證）

### 模型檔案實際大小（HuggingFace `Comfy-Org/MiniMax-H3`）

| 檔案 | 大小 | 放置位置 |
|---|---|---|
| `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | **20.97 GB** | `models/diffusion_models/` |
| `minimax_h3_ref2va_pruned_int8_convrot.safetensors` | **20.97 GB** | `models/diffusion_models/` |
| `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | **15.69 GB** | `models/text_encoders/` |
| `minimax_h3_video_vae_int8_convrot.safetensors` | 2.81 GB | `models/vae/` |
| `pika_h3_flex_fl2va_v1_bf16.safetensors` | 1.96 GB | `models/loras/` |
| `pika_h3_flex_ref2va_v1_bf16.safetensors` | 1.96 GB | `models/loras/` |
| `minimax_h3_audio_vae_fp32.safetensors` | 0.61 GB | `models/vae/` |

- **只要 Ref2VA 一套 = 42.04 GB**；兩個 workflow 全要 = **64.96 GB**
- 開源權重共 7 個檔，官方頁面的「五個模型」其實是同一組在不同模板中換 fl2va/ref2va

### 官方三個模板的工作流結構

| 模板 | 節點數 | 用到的核心節點 |
|---|---|---|
| `video_pika_h3_flex_t2v.json` | 4 | 只是 subgraph 包裝（引用 fl2va 流程） |
| `video_pika_h3_flex_ref2va.json` | 22 | `MiniMaxH3ReferenceToVideo` / `UNETLoader` / `LoraLoaderModelOnly` / `CLIPLoader` / `VAELoader`×2 / `VAEDecode`+`VAEDecodeAudio` / `ResolutionSelector` / `ManualSigmas` / `KSamplerSelect` / `BasicGuider` / `RandomNoise` / `SamplerCustomAdvanced` / `CreateVideo` / `SaveVideo` |
| `video_pika_h3_flex_fl2va.json` | 6 | subgraph 包裝 + `LoadImage`×2 + `GetImageSize` + `SaveVideo` |

**官方模板裡沒有稀疏注意力節點** —— 影片裡那兩個加速節點是使用者自己加的。

### 影片裡那兩個「加速節點」是什麼（重要好消息）

**不是第三方插件，是 ComfyUI 核心內建的**：

| 節點 | 來源 | 說明 |
|---|---|---|
| `Model Attention Backend` | ComfyUI 核心 | 選 comfy-kitchen attention，負責 dense 注意力後端 |
| `Block Sparse Attention` | ComfyUI 核心（PR #16072，2026-09-06 合併，`comfy_extras/nodes_sparse_attention.py`） | 塊稀疏注意力，MiniMax H3 專用選項 |

- 影片中看到的參數：`attention_percent 10.0`、`start_percent 0.20` / `end_percent 1.00`、`steps 12288`、`extra_cnames 256`、`first_block_skipping = exact_fp8_and_low`
- 核心節點三種後端：**Sol-Attn**（自適應 tau，不需特殊訓練權重）／**top-k (SLA)**（配 LightX2V SLA turbo LoRA）／**VSA (FastVideo)**（配 FastH3-VSA 蒸餾權重，keep 10%）
- H3 專用選項：`sink_conditioning`（約 +3% 成本，保護打包的文字/音訊/參考列，避免 prompt 與音訊劣化）、`extra_tokens`、`min_tokens` 保護門檻（短序列維持 dense）
- 連接順序：**model loader → LoRA → (sigma shift) → Model Attention Backend → Block Sparse Attention → guider/sampler**。順序錯了稀疏覆蓋會被蓋掉
- 另有一個核心 **Comfy Compiler**（PR #15861）減少 CUDA 配置開銷。已知坑：稀疏 + Compiler 同時開可能 OOM（已修，但 `--disable-comfy-compiler` 可當退路）
- 需求 ComfyUI ≥ 0.42、comfy-kitchen ≥ 0.2.33、comfy-aimdo 0.5.2

### 替代方案：FastH3 Omni

另一個 H3 蒸餾版（FastVideo + Nuva Lab），**8 步、只用核心節點**：
INT8 ConvRot 22.2 GB / FP8 23.0 GB / **NVFP4 QAD 13.8 GB（僅 Blackwell）**。16GB 卡可用 0.5MP（960×544）+ 5 秒起步。官方模板 `video_fasth3_ominiref_r2v.json`。

### 雲端成本比較

**A. Comfy Cloud（官方路徑，模型已內建，不用下載）**

| 方案 | 價格 | 額度 | 可生成（官方口徑 5 秒影片） | 重點 |
|---|---|---|---|---|
| Free | $0 | 5 次 GPU run | — | 先試水 |
| Standard | $20/mo（年付 $192） | 50,400 credits/年 | ~4,560 | 單次工作流最長 30 分 |
| Creator | $35/mo（年付 $336） | 88,800 credits/年 | ~8,040 | **可匯入自己的模型/LoRA** |
| Pro | $100/mo（年付 $960） | 253,200 credits/年 | ~22,980 | 單次最長 1 小時 |

- 硬體：**Blackwell RTX PRO 6000 96GB**（不是 24GB 卡，H3 完全塞得下）
- 計費：**只算 active GPU 時間**，閒置不收費；排隊上限 100，可平行跑
- 官方口徑：5 秒影片 ≈ 11 credits（Wan 2.2 I2V 基準）。依 3090 實測比例推估，**Pika H3 Flex 8 秒 768p ≈ 20–30 credits**
- Comfy API 另計：RTX PRO 6000 96GB = $3.49/hr（736.39 credits/hr）、48GB MIG = $1.75/hr、H100 = $6.23/hr；網路儲存 $0.20/GB/mo
- 試跑入口：<https://cloud.comfy.org/?template=video_pika_h3_flex_ref2va>

**B. RunPod 自架（自己管 ComfyUI）**

| GPU | Community Cloud | Secure Cloud |
|---|---|---|
| RTX 3090 24GB | ~$0.46–0.50/hr | ~$0.50/hr |
| RTX 4090 24GB | ~$0.34–0.74/hr | ~$0.74–1.10/hr |
| A40 / A6000 48GB | ~$0.33–0.53/hr | ~$1.22/hr |
| RTX PRO 6000 96GB | ~$2.09/hr | $3.49/hr |

- 儲存：network storage <1TB = $0.07/GB/mo（42GB ≈ **$3/mo**）；volume disk running $0.10/GB/mo
- 隱藏成本：**42GB 模型要下載**。本次實測這台機器的下載速度只有 ~80KB/s → 42GB 要 146 小時，開一台新 pod 等於賠上數小時的 GPU 費用（便宜機型約 $0.50/次）
- **損益平衡點**：Comfy Cloud 約 $0.11/支 8 秒影片；RunPod 24 小時開著 = $12.72/天（A6000）。**一天要產出約 100 支以上，RunPod 才會比 Comfy Cloud 便宜**。低產量 → Comfy Cloud 完勝（免下載、免維護）

### 商用授權（最容易踩雷的地方）

| 路線 | 商用權利 |
|---|---|
| **Comfy Cloud** | 已包含在訂閱內（「All available models can be used for commercial purposes」「Comfy Cloud already includes commercial use」） |
| **本地跑開源權重** | 需要 MiniMax Commercial License。Comfy 是**唯一官方轉售商**：Professional 從 **$5,000/月**起，含 ~46,250 video-seconds，$0.108/video-second，超出 $0.036/video-second；含 LoRA 訓練與客戶交付權 |
| 免費的 Community License | 有**地域與商用限制**，商用前必須自己讀條款 |

→ 如果要商用：**走 Comfy Cloud** 最省事；要在本地或自架 Pod 跑還要商用，$5,000/月 的 Professional 門檻要先算過。

---

## 影片逐字稿

完整帶時間軸轉錄見同目錄 `transcript.txt`（無字幕版影片的完整內容）。

```
[  16.85 ->   21.73] 前面看到的片段就是我用 Minimax H3 的兩種模型
[  21.73 ->   28.54] 配上 Pica H3 LoRa 跑出來的測試影片
[  28.54 ->   31.82] 我們現在在 CombiUI 的官網上
[  31.82 ->   37.71] 現在看到的這個就是 Pica H3 Flex 的工作流的頁面
[  37.71 ->   40.91] 它這邊也會做一些簡單介紹
[  40.91 ->   43.91] 簡單來講它就是一個走六步的工作流
[  43.91 ->   52.10] 當然它也可以做文生飾品跟參考生飾品
[  52.10 ->   55.73] 那我這次來測試參考生飾品
[  55.73 ->   58.73] 官網這邊就可以下載工作流下來
[  58.73 ->   61.73] 這個頁面有跟你講一些使用的模型
[  61.73 ->   63.73] 然後要放到哪裡去
[  63.73 ->   65.23] 都相當的清楚
[  65.23 ->   68.23] 那主要就是加入這個Lola
[  68.23 ->   72.73] 其他的都跟官方的工作流其實都差不多
[  72.73 ->   77.05] 那就是加入了這個Picard X3 Flex的這個Lora
[  77.05 ->   80.18] 那我們現在到Configure UI那邊
[  80.18 ->   82.18] 打開Configure UI之後呢
[  82.18 ->   85.21] 就可以把剛剛下載的工作流拉進來
[  85.21 ->   87.21] 拉進來之後呢
[  87.21 ->   89.21] 就可以看自己的模型有沒有缺喔
[  89.21 ->   91.21] 有的話就去下載喔
[  91.21 ->   93.37] 那它這個工作流相當簡單喔
[  93.37 ->   96.37] 整個看起來相當的乾淨喔
[  96.37 ->   98.37] 那這邊可以自己加參考圖啊
[  98.37 ->  100.37] 參考影片啊,參考音頻
[ 100.37 ->  103.37] 這都是最基礎的節點
[ 103.37 ->  105.87] 然後後面的這個採樣區
[ 105.87 ->  108.37] 就是一個六步的SIGMA
[ 108.37 ->  111.37] 相當簡單的一個工作流
[ 111.37 ->  115.37] 我已經有跑過COMFET官方提供的這個工作流了
[ 115.37 ->  116.37] 速度還可以
[ 116.37 ->  119.63] 可是我自己又加入了一些加速的節點
[ 119.63 ->  122.63] 整體的品質也沒有下降太多
[ 122.63 ->  124.63] 修改過後就是長這個樣子
[ 124.63 ->  127.66] 其實就只加入這兩個節點
[ 127.66 ->  131.76] 對,就是分散注意力的加速的接點
[ 132.26 ->  133.80] 好的,那我現在來試跑了
[ 134.32 ->  137.14] 那先講一下我的配備,我的配備是3090
[ 137.38 ->  141.48] RTX 3090 20GB,然後記憶體是48GB
[ 142.00 ->  144.04] 然後這次會測試兩個主模型
[ 144.56 ->  146.86] 我這次會用一個是參考生飾品的
[ 147.38 ->  148.90] 參考生飾品的一般的版本
[ 149.42 ->  152.24] 然後再用一個是Singularity的版本
[ 153.35 ->  156.93] 然後Lola就是用這個,主要就是這個Pika H3
[ 157.19 ->  157.97] Flex
[ 158.01 ->  160.01] 這一個參考生視頻的裸裸
[ 160.01 ->  161.85] 好的,那我現在開始下提示詞
[ 161.85 ->  163.13] 然後放參考圖
[ 163.13 ->  164.67] 準備開始跑了
[ 164.67 ->  166.71] 然後跑16比9的比例
[ 166.71 ->  168.77] 然後1.0的Megapixel
[ 168.77 ->  170.55] 然後跑一個8秒的
[ 170.55 ->  175.80] 參考圖放了一個女性多角度參考圖
[ 175.80 ->  179.52] 我叫他幫我寫在室內籃球場走動運球的
[ 179.52 ->  182.08] 好的,那現在提示詞也已經貼上了
[ 182.08 ->  184.38] 好,那我現在就直接開始
[ 184.38 ->  186.98] 好的,目前已經進入六步採樣了
[ 186.98 ->  189.54] 那看工作館裡面可以看到我的
[ 190.46 ->  192.52] 3090已經吃了20GB左右
[ 193.02 ->  195.58] 然後記憶體是使用22GB左右
[ 195.84 ->  197.38] 現在影片已經跑出來了
[ 198.18 ->  199.70] 那以我人啟動來講
[ 200.55 ->  202.59] 8秒鐘768P
[ 203.37 ->  204.89] 只跑了278秒
[ 205.15 ->  205.93] 算是蠻快的
[ 206.69 ->  207.97] 現在來稍微看一下
[ 208.23 ->  213.03] 可以看到遠景
[ 213.27 ->  214.55] 臉部有點模糊
[ 215.33 ->  217.11] 近景的表現是還不錯
[ 218.65 ->  220.45] 以這個速度來講算是合格
[ 220.45 ->  224.09] 那因為生成出來的籃球有多了一點問題
[ 224.09 ->  225.75] 所以我打算再偷卡一次
[ 225.75 ->  228.25] 順便測試一下不是人啟動的狀況
[ 228.25 ->  229.35] 速度會不會變快
[ 229.35 ->  231.47] 那現在把種子先固定
[ 231.47 ->  233.47] 那等一下就可以直接換主模型
[ 233.47 ->  235.53] 換成Singularity直接測試
[ 235.53 ->  240.73] 然後現在還是一樣是官方的這個模型
[ 240.73 ->  242.43] 那就繼續跑第二次
[ 242.43 ->  244.81] 跑第二次的影片已經跑出來了
[ 244.81 ->  247.30] 這次用240秒而已
[ 247.30 ->  248.64] 快了30幾秒
[ 248.64 ->  249.74] 沒什麼差啦
[ 249.74 ->  254.96] 這次的運球
[ 255.46 ->  257.52] 這次抽卡運球有比較正常一點
[ 258.44 ->  260.24] 至少沒有多出一顆球
[ 271.47 ->  273.25] 那我就用同樣這個Seed
[ 274.03 ->  276.33] 換一個主模型然後泡泡看
[ 276.83 ->  279.15] 主要就是要對比Singlaryty跟
[ 279.39 ->  283.49] 官方模型配上這個Pika H3 Flex的差別
[ 284.01 ->  286.83] 我現在已經換上Singlaryty這個
[ 287.07 ->  288.11] V1.3
[ 288.35 ->  289.13] Interbar版本
[ 289.89 ->  290.91] 現在開始跑
[ 291.76 ->  293.30] 所有設定都是一樣的
[ 293.30 ->  298.30] 參考圖、提示詞、描述、分辨率全部都是一樣
[ 298.30 ->  299.30] 就只有主模型
[ 299.30 ->  306.50] 從一般的H3模型改成Singularity的模型
[ 306.50 ->  309.59] 那Singularity的版本已經跑出來了
[ 309.59 ->  310.59] 現在來看一下
[ 310.59 ->  326.37] 那現在我再來測試另外一組參考圖
[ 326.37 ->  328.37] 然後現在用Archeia
[ 328.37 ->  331.78] 我會把提示詞改成比較動態的
[ 331.78 ->  334.85] 我有教他寫了一段灌籃的
[ 334.85 ->  335.85] 一樣貼上
[ 335.85 ->  340.21] 這次就跑1.5MP
[ 340.21 ->  342.25] 一樣都是8秒鐘
[ 342.25 ->  345.07] 這次先跑Singularity
[ 345.07 ->  346.35] 開始
[ 346.35 ->  350.19] 目前阿克雅灌籃這一段也在生成中
[ 350.19 ->  353.25] 這次跑的是1.5MP
[ 353.25 ->  356.59] 那就是928P
[ 356.59 ->  360.69] 前面幾次都是跑1.0
[ 360.69 ->  362.73] 就是768P
[ 362.73 ->  366.57] 影片已經跑出來了
[ 366.57 ->  368.57] 這是1.5MP的
[ 368.57 ->  370.73] 所以比剛剛都慢了一些
[ 370.73 ->  374.83] 這次跑了459秒左右
[ 374.83 ->  378.83] 大概比1.0MP的慢了3分鐘左右
[ 378.83 ->  381.83] 畢竟是928P的
[ 381.83 ->  382.83] 好我們現在來看一下
[ 382.83 ->  396.22] 那整體的畫面看起來還可以
[ 396.22 ->  399.38] 好我們現在換一個主模型
[ 399.38 ->  401.73] 變成官方版的
[ 401.73 ->  403.73] 配上PKI H3 Blacks
[ 403.73 ->  404.73] 好一樣
[ 404.73 ->  411.73] 同樣的SEED一樣繼續再跑一遍
[ 411.73 ->  416.29] 官方版的參考生視頻的模型也已經散熱出來了
[ 416.29 ->  431.60] 好的以上就是這一次Pika H3 Flex
[ 431.60 ->  433.66] 這個Lora的測試
[ 433.66 ->  436.51] 這個工作流在官網都找得到
[ 436.51 ->  440.09] 我自己感覺下來其實整體的速度跟畫質是還挺不錯的
[ 440.09 ->  441.37] 感謝大家收看
```

> 註：原始 ASR 對專有名詞有誤（Picard=Pika、Singlaryty=Singularity、CombiUI=ComfyUI、文生飾品=文生視頻、Interbar=int8 等），已在本摘要正文校正。

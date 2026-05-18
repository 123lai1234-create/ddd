# MiniMax API 整合指南

本文件說明如何將 MiniMax API (MiniMax-M2、music-2.6) 整合到你的 Portfolio 專案中。

---

## 已建立的檔案

### 1. `litellm_config.yaml`

LiteLLM Proxy 設定檔。將此檔案放到你的 LiteLLM Proxy 部署中：

```bash
# 在 LiteLLM Proxy 伺服器上
cp litellm_config.yaml /path/to/your/litellm/config.yaml
export MINIMAX_API_KEY=your_key_here
litellm --config /path/to/your/litellm/config.yaml
```

**包含的模型：**

- `minimax-m2` — MiniMax-M2 文字生成
- `minimax-music` — music-2.6 音樂生成
- `gpt-4o` — OpenAI GPT-4o
- `claude-3-5-sonnet` — Anthropic Claude

---

### 2. `site_api/minimax_client.py`

Python 用戶端，直接呼叫 MiniMax API 或透過 LiteLLM Proxy。

**主要功能：**

- `chat_completion()` — MiniMax-M2 對話
- `stream_chat_completion()` — 流式回應
- `text_to_speech()` — TTS 語音合成
- `generate_music()` — 音樂生成
- `poll_music_task()` — 輪詢長任務狀態

**環境變數：**

```bash
MINIMAX_API_KEY=your_key_here           # 必填
MINIMAX_API_BASE=https://api.minimaxi.com/v1  # 預設
LITELLM_PROXY_URL=https://your-tunnel.public01.dev  # 可選
```

---

### 3. `site_api/routes_minimax.py`

FastAPI 路由，提供以下端點：

| 端點                         | 方法 | 說明                  |
| ---------------------------- | ---- | --------------------- |
| `/ai/status`                 | GET  | 檢查 MiniMax 連線狀態 |
| `/ai/chat`                   | POST | 發送對話請求          |
| `/ai/chat/stream`            | POST | 流式對話回應          |
| `/ai/tts`                    | POST | 文字轉語音            |
| `/ai/music`                  | POST | 生成音樂              |
| `/ai/music/{task_id}/status` | GET  | 查詢音樂任務狀態      |

**範例请求：**

```bash
# 健康檢查
curl https://your-api.com/ai/status

# 生成音樂
curl -X POST https://your-api.com/ai/music \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Ambient electronic music", "duration": 30}'

# TTS
curl -X POST https://your-api.com/ai/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "藥物動力學研究發現...", "model": "e2all-turbo"}'
```

---

### 4. `astro/src/pages/demo/music.astro`

展示頁面，位於 `/demo/music`。

**功能：**

- 音樂生成表單
- 快速預設（Biotech 風格）
- 即時狀態回饋
- 音訊播放器

**部署後訪問：** `https://donttalk.vercel.app/demo/music`

---

### 5. `astro/public/styles/demo.css`

共用的 Demo 頁面樣式，可用於其他 demo 頁面。

---

## 部署步驟

### 短期（5 分鐘內）

1. **設定 MiniMax API Key：**

   ```bash
   # Railway/Render 環境變數
   MINIMAX_API_KEY=your_key_here
   ```

2. **重啟 API 服務：**

   ```bash
   # Railway
   railway up

   # 或手動重啟
   ```

### 中期（LiteLLM Proxy 整合）

1. 把 `litellm_config.yaml` 放到 LiteLLM 伺服器
2. 設定 Cloudflare Tunnel 公開端點
3. 設定環境變數：
   ```bash
   LITELLM_PROXY_URL=https://your-tunnel.public01.dev
   MINIMAX_API_KEY=your_key_here
   ```

### 長期（Portfolio Demo）

1. 確認 `/demo/music` 頁面正常運作
2. 可以在 `/demo` 下新增更多功能：
   - `/demo/tts` — 語音合成展示
   - `/demo/video` — 結合 Seedance 影片生成

---

## API Key 安全

所有 API Key 都在 FastAPI 後端管理，不會暴露給前端：

```
Astro Frontend → FastAPI (/ai/*) → MiniMax API
                              ↑
                        Key 在這裡
```

---

## 與 MLOps Platform 面試的關聯

這個整合展示了你：

- **多模態 API 串接能力**（文字、語音、音樂、影片）
- **API 代理設計**（統一計費、監控）
- **系統整合經驗**（LiteLLM + Cloudflare Tunnel）
- **Portfolio 技術展示**（Demo 頁面）

這些都是 MLOps Platform 工程師職位的加分項。

---

## 新增功能（2025/05）

### 🚀 歌詞生成 `/ai/lyrics`

```bash
curl -X POST http://localhost:8000/ai/lyrics \
  -H "Content-Type: application/json" \
  -d '{"theme": "工程師的深夜告白", "style": "electronic"}'
```

### 👁️ 圖片理解 `/ai/vision`

```bash
curl -X POST http://localhost:8000/ai/vision \
  -H "Content-Type: application/json" \
  -d '{"image_url": "https://example.com/diagram.png", "prompt": "請分析這個系統架構圖"}'
```

### 🔍 網絡搜索 `/ai/search`

```bash
curl -X POST http://localhost:8000/ai/search \
  -H "Content-Type: application/json" \
  -d '{"query": "最新 AI 製藥研究趨勢", "num_results": 5}'
```

### 📚 RAG 搜索 `/ai/rag`

```bash
curl -X POST http://localhost:8000/ai/rag \
  -H "Content-Type: application/json" \
  -d '{"query": "這個藥物的作用機制是什麼？", "context": "藥物名稱：ABC123"}'
```

### 🎤 音樂翻唱 `/ai/music/cover`

```bash
curl -X POST http://localhost:8000/ai/music/cover \
  -H "Content-Type: application/json" \
  -d '{"source_audio_url": "https://example.com/song.mp3", "style": "jazz"}'
```

### 🎸 AI Band 完整管道 `/ai/ai-band`

一鍵完成：歌詞生成 + 音樂生成

```bash
curl -X POST http://localhost:8000/ai/ai-band \
  -H "Content-Type: application/json" \
  -d '{"theme": "工程師的日常", "style": "electronic", "duration": 30}'
```

---

## 命令列展示腳本

```bash
# 設定 API Key
export MINIMAX_API_KEY=your_key_here

# 歌詞 + 音樂演示
python scripts/minimax_demo.py --theme "工程師的日常" --style "電子搖滾"

# 網絡搜索演示
python scripts/minimax_demo.py --mode web-search --query "AI製藥最新進展"

# 圖片分析演示
python scripts/minimax_demo.py --mode vision --image-url "https://example.com/arch.png"

# 完整管道演示（所有功能串聯）
python scripts/minimax_demo.py --mode full --theme "深夜程式碼" --style "ambient"
```

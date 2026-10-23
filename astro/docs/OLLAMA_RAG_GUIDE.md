# Local Ollama + RAG 整合指南

> **Status**: ✅ dev 環境跑通。生產仍走 Vercel catchall。

## 架構

```
┌─────────────────┐  POST /api/chat?stream=1   ┌──────────────────────┐
│ Browser Chatbot │ ─────────────────────────► │ Astro dev server     │
│  (Chatbot.astro)│                            │  astro integration   │
│  SSE consumer   │ ◄─────────────────────────│  - ollama-chat       │
└─────────────────┘   text/event-stream        │  - rag-search        │
         │                                    └──────────────────────┘
         │  RAG citations accordion                   │       │
         │                                            │       │
         │  ┌─── /api/rag/search (JSON) ─────────────┘       │
         │  │                                                 │
         │  └─── /api/chat (Ollama SSE) ──────────────┐      │
         │                                              │      │
         ▼                                              ▼      ▼
   RAG context in                                Ollama      nomic-embed
   reply + collapsible                          llama3.2 /    768-dim
   accordion                                    qwen2.5:3b
```

## 快速開始

```powershell
# 0. 確認 ollama 跑著 + 必要 models
ollama list
# 預期看到: llama3.2 / qwen2.5:3b / nomic-embed-text
# 沒的話:
ollama pull qwen2.5:3b          # 1.9GB, 中文最佳
ollama pull nomic-embed-text    # 274MB, embedding

# 1. (一次性或資料改動時) 建 RAG index
cd D:\project
python astro\scripts\rag-ingest.py          # 1300+ chunks from astro pages / PDF / repo
python astro\scripts\uniprot-ingest.py      # +5 個 UniProt 蛋白質 (Insulin/GFP/Lysozyme/Hb/Myoglobin)

# 2. 啟 dev server (帶 qwen 環境變數)
cd D:\project\astro
$env:OLLAMA_CHAT_MODEL = 'qwen2.5:3b'
npm run dev
# 預期輸出: [ollama-chat] /api/chat → http://localhost:11434 (model: qwen2.5:3b, rag: on, stream: SSE)
#           [rag] /api/rag/search + /api/rag/stats ready (index: D:\project\.rag\index.json)
#           [rag] index loaded: 1314 chunks from all

# 3. 開瀏覽器 http://localhost:4321 → 點 chat avatar → 繁中問句
```

## API 端點 (dev only)

| 端點 | 方法 | 用途 | 回應 |
|---|---|---|---|
| `/api/chat` | POST | LLM chat (non-stream) | `{ reply, tokens, rag, ms, model }` |
| `/api/chat?stream=1` | POST | LLM chat (SSE) | `event: rag` → `event: token*N` → `event: done` |
| `/api/rag/search` | POST | 純向量檢索 `{query, topK}` | `{ hits, embed_ms, total_docs }` |
| `/api/rag/stats` | GET | 索引 metadata | `{ ok, count, source, dim, model }` |

## 環境變數

| 變數 | 預設 | 用途 |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama endpoint |
| `OLLAMA_CHAT_MODEL` | `llama3.2` | **推薦 `qwen2.5:3b`** |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model |
| `RAG_INDEX_PATH` | `D:\project\.rag\index.json` | Index 位置 |
| `RAG_ENABLED` | `1` | `0` 關 RAG |
| `RAG_TOPK` | `5` | 注入 context 數量 |
| `RAG_MIN_SCORE` | `0.30` | 過濾低於此分的 hit |

## Scripts

| Script | 用途 |
|---|---|
| `astro/scripts/rag-ingest.py` | 從 astro pages / PDFs / repo 收集 + chunk + embed → `index.json` |
| `astro/scripts/uniprot-ingest.py` | UniProt REST API 拉特定蛋白質 (預設 5 個 entry) |
| `astro/scripts/ollama-bench.mjs` | Latency / Throughput / VRAM / 10 題繁中 smoke |
| `astro/scripts/qa-compare.mjs` | 兩 model 跑同 5 個問題對照 |
| `astro/scripts/stream-test.mjs` | SSE 端到端測試 (event: rag / token / done) |
| `astro/scripts/smoke-test.mjs` | 簡單 RAG + chat smoke |
| `astro/scripts/lance-migrate.mjs` | `index.json` → LanceDB (migrate 一次性) |
| `astro/scripts/lance-bench.mjs` | LanceDB backend 速度測試 (with/without rerank) |
| `astro/scripts/cache-test.mjs` | query cache 4 輪 (cold/warm/variant/new) |

### 常見用法

```powershell
# 加新 model
ollama pull qwen2.5:7b              # 4.4GB, 7B 需 partial offload RAM

# 加新 UniProt entry
python astro\scripts\uniprot-ingest.py --accession P12345,P67890

# 換 chat model (重啟 dev)
$env:OLLAMA_CHAT_MODEL = 'qwen2.5:3b'; npm run dev

# 跑 benchmark
node astro\scripts\ollama-bench.mjs --model qwen2.5:3b
node astro\scripts\qa-compare.mjs

# 重 build RAG index (資料變動時)
python astro\scripts\rag-ingest.py
python astro\scripts\uniprot-ingest.py
```

## SSE 串流格式

### 請求
```
POST /api/chat?stream=1
Content-Type: application/json
Accept: text/event-stream

{
  "system": "你是 元嬰不說, ...",
  "messages": [{ "role": "user", "content": "..." }]
}
```

### 回應 frames
```
event: rag
data: {"enabled":true,"queried":"ProteinMPNN 是什麼","hits":[...],"ms":5384,"error":null}

event: token
data: {"text":"Pro"}

event: token
data: {"text":"tein"}

... (每 token 一 frame)

event: done
data: {"ms":7146,"model":"qwen2.5:3b","tokens":{"prompt":1033,"completion":44}}
```

## 已知限制 / 效能數據

### 4GB VRAM (RTX 4060 Laptop) 環境

| Model | VRAM | Throughput (tok/s) | CJK ratio | Hallucination |
|---|---|---|---|---|
| **qwen2.5:3b** ✅ | 2.16GB | 104 | 50% | 極少 |
| llama3.2:3b | 2.55GB | 103 | 44% | 中 (RAG 題會編「針織」) |
| qwen2.5-coder:7b | 4.7GB (>VRAM) | 5-8 | - | 慢不可用 |
| glm4:9b | 5.5GB (>VRAM) | 3-5 | - | 慢不可用 |

### 延遲分布
- 首次 cold start: 6-17s (model 載入 VRAM)
- warm 純 chat: 200ms-3.5s median
- warm 並發 4×5: aggregate 99-102 tok/s
- RAG search (LanceDB warm): 5-10ms
- RAG search (LanceDB cold open): ~1.5s (openTable + warmup)
- Query cache hit: 1-3ms (variant 標點/空格也 hit)

### 優化方向
- **RAG backend**: LanceDB (預設, 1300+ chunks 在 5-10ms 內檢索) / JSON brute-force (後備) / Chroma / Qdrant (更大 corpus 替代)
- **Reranker**: ⚠️ ollama 0.40.3 沒 `/api/rerank` (0.5+ 才有), 跳過. 真要 rerank: 升 ollama 或自架 sentence-transformers
- **Query cache**: 已經做 (LRU + TTL, 1-3ms hit)
- **TTFT streaming**: 已經做 (SSE), 200ms-1s 內第一 token

## 檔案結構

```
D:\project\astro\dev\ollama-chat.mjs          # /api/chat integration (含 RAG 注入 + SSE)
D:\project\astro\dev\rag-search.mjs           # /api/rag integration (LanceDB primary, JSON 後備)
D:\project\astro\scripts\rag-ingest.py        # 4-source ingest (astro/pdf/repo) → JSON
D:\project\astro\scripts\uniprot-ingest.py    # UniProt REST API
D:\project\astro\scripts\lance-migrate.mjs    # JSON → LanceDB (migrate 一次性)
D:\project\astro\scripts\lance-bench.mjs      # LanceDB 速度測試
D:\project\astro\scripts\ollama-bench.mjs     # benchmark
D:\project\astro\scripts\qa-compare.mjs       # 兩 model 對比
D:\project\astro\scripts\stream-test.mjs      # SSE 端到端
D:\project\astro\scripts\smoke-test.mjs       # 基本 smoke
D:\project\astro\scripts\cache-test.mjs       # query cache 4 輪
D:\project\astro\astro.config.mjs             # 注入兩個 integration
D:\project\astro\src\components\Chatbot.astro # frontend: SSE consumer + accordion
D:\project\.rag\index.json                    # RAG index (JSON, ~22 MB, 1300+ chunks)
D:\project\.rag\lance/                         # LanceDB 索引 (chunks.lance 目錄 + meta.json)
D:\project\astro\docs\OLLAMA_RAG_GUIDE.md     # 本文件
```

## Production 影響

**沒有**。兩個 integration 透過 `command === 'build'` 早退, 不会注入到 production build。
Production 仍走 Vercel catchall → 原 LLM API。

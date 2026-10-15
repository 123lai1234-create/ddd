---
name: local-ollama-rag
description: "本機 LLM + RAG 開發鏈接 — Ollama + LanceDB + Astro Vite middleware + SSE streaming。當用戶說「本機 LLM」「Ollama」「RAG」「chatbot 串接」「LLaMA」「bge-m3」「nomic-embed」「vector search」「SSE」「stream chat」「chatbot 整合」時使用。涵蓋 4GB VRAM 限制下的 model 選擇（qwen2.5:3b vs llama3.2:3b vs qwen2.5-coder:7b）、LanceDB 0.0.x 踩坑（L2 不 normalize、Vector class、select vector 才能算 cosine）、Astro 6.x Vite middleware integration（astro:config:setup hook）、SSE streaming pattern、PowerShell env var 陷阱、CJK 50% 亂碼問題。應用：dev-only 本機 chatbot / RAG 系統 / 不靠外部 API 的 LLM 應用。"
license: MIT
metadata:
  author: donttalk-deploy
  version: "1.0.0"
  tags:
    - ollama
    - rag
    - llm
    - lancedb
    - astro
    - vite
    - sse
    - streaming
    - nomic-embed
    - chatbot
---

# Local Ollama + RAG 開發鏈接

> 本機 RTX 4060 Laptop 4GB VRAM + 65GB RAM + Windows 11，跑 LLM + RAG 接 Astro static frontend。Production 仍走 Vercel catchall（無 RAG），這條路徑是 dev-only。

## 鏈接

```
Browser chatbot
  ↓ POST /api/chat?stream=1
  ↓ Astro dev server (Vite middleware via astro:config:setup hook)
  ↓ POST /api/rag/search → 拿 top-K (Ollama nomic-embed + LanceDB cosine)
  ↓ RAG context 塞進 system prompt
  ↓ POST Ollama /api/chat stream=true → SSE 流回前端
```

## 安裝

```powershell
# Ollama
winget install Ollama.Ollama

# 拉 model
ollama pull qwen2.5:3b           # 2.16 GB VRAM
ollama pull nomic-embed-text     # 768-dim embed

# LanceDB（用 @lancedb/lancedb，新名稱，舊 lancedb 0.0.1 已廢）
cd D:\project\astro
npm install --no-save @lancedb/lancedb@latest
# ↑ --no-save 避免清掉 289 個 devDeps（含 vercel CLI 58）
```

## 4GB VRAM model 選擇

| Model | Size | VRAM | CJK | 用途 |
|---|---|---|---|---|
| `qwen2.5:3b` | 2.16 GB | ✅ fit | ✅ 50% 精準 | 對話首選 |
| `llama3.2:3b` | 2 GB | ✅ fit | ❌ 易 hallucinate | 英文輕量 |
| `qwen2.5-coder:7b` | 4.7 GB | ❌ 5-8 tok/s | ✅ | code generation（慢） |

CJK 表現 qwen2.5:3b >> llama3.2:3b。chatbot 場景優先 qwen2.5。

## Ollama 0.40.3 限制

- 沒有 `/api/rerank` endpoint（0.5+ 加的，2025 H1）
- `bge-reranker-v2-m3` 不在 ollama library（用 `qllama/bge-reranker-large` 替代但無法用）
- 解法：LanceDB 已夠快，跳過 reranker 階段。真要 rerank 需升 ollama 0.5+ 或自架 sentence-transformers

## Astro 6.x Vite middleware integration

Astro static mode 本身不支援 `/api/chat`。解法：用 Vite middleware 從 `astro:config:setup` hook 注入。

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import ollamaChatIntegration from './dev/ollama-chat-integration.mjs';
import ragIntegration from './dev/rag-integration.mjs';

export default defineConfig({
  integrations: [
    react(),
    ollamaChatIntegration(),
    ragIntegration(),
  ],
});
```

```js
// dev/ollama-chat-integration.mjs
export default function ollamaChatIntegration() {
  return {
    name: 'ollama-chat',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [{
              name: 'ollama-chat-middleware',
              configureServer(server) {
                server.middlewares.use('/api/chat', async (req, res) => {
                  // ... handle stream
                });
              },
            }],
          },
        });
      },
    },
  };
}
```

**注意**：
- `apply: 'serve'` 不行（Astro 6.4 預設會用 framework root）→ **不要設 `apply`**，讓 middleware 全部 hook
- Vite plugin `configureServer` 拿到 `server.middlewares.use(path, handler)` 是 path-prefix，不是 exact match

## SSE streaming pattern

### Server side

```js
server.middlewares.use('/api/chat', async (req, res) => {
  const { message } = await parseBody(req);
  
  // RAG 預先塞 metadata
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  
  const ragHits = await ragSearch(message, 5);
  res.write(`event: rag\ndata: ${JSON.stringify(ragHits)}\n\n`);
  
  // 串 Ollama
  const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_CHAT_MODEL,
      messages: [
        { role: 'system', content: `RAG context:\n${formatHits(ragHits)}` },
        { role: 'user', content: message },
      ],
      stream: true,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  
  const reader = ollamaRes.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value).split('\n').filter(Boolean)) {
      try {
        const json = JSON.parse(line);
        if (json.message?.content) {
          res.write(`event: token\ndata: ${JSON.stringify(json.message.content)}\n\n`);
        }
      } catch {}
    }
  }
  res.write(`event: done\ndata: {}\n\n`);
  res.end();
});
```

### Client side

```js
const evtSource = new EventSource(`/api/chat?stream=1&message=${encodeURIComponent(msg)}`);
const placeholder = document.querySelector('#response');
placeholder.innerHTML = '<span class="cursor">▍</span>';

evtSource.addEventListener('rag', (e) => {
  const hits = JSON.parse(e.data);
  // 顯示 RAG accordion
  document.querySelector('#rag-context').innerHTML = hits.map(h => `<li>${h.text}</li>`).join('');
});
evtSource.addEventListener('token', (e) => {
  const token = JSON.parse(e.data);
  placeholder.insertAdjacentHTML('beforeend', token);
});
evtSource.addEventListener('done', () => {
  placeholder.querySelector('.cursor')?.remove();
  evtSource.close();
});
```

## LanceDB 0.0.x 踩坑

### `npm install lancedb` 自動移除 289 個 devDeps

```powershell
# ❌ 會清掉 vercel CLI 58 等 devDeps
npm install lancedb

# ✅ 用 @lancedb/lancedb（新名稱）+ --no-save
npm install --no-save @lancedb/lancedb@latest
```

### 0.0.x `lancedb` 套件已廢棄

```
npm warn deprecated lancedb@0.0.1: Use @lancedb/lancedb instead
```

用 `@lancedb/lancedb`。

### 預設 metric 是 L2 但 `_distance` 回傳值是 raw L2 不 normalize

對 768-dim vector 會是 200-500，用 `1 - d^2/2` 變負數。**必須自己用 `row.vector.toArray()` (Vector class) 算 cosine**，不要信 `_distance`。

### `row.vector` 不是 plain array

是 LanceDB 自家的 `Vector` class (FloatVector<Float>). 用 `v.toArray()` 拿 Float32Array，或 `v.get(i)` 單點讀.

### API 用 `.search(q).limit(k).toArray()`

非 `execute()`. `toArray()` 回 Array，`execute()` 回 AsyncIterator 沒 length.

### 預設不 return `vector` column

太大。改用 `tbl.search(q).select(['id','text','vector',...])` 才能拿到 vector 做 cosine.

### 有效 pattern

```js
import { connect } from '@lancedb/lancedb';
const db = await connect(LANCE_DIR);
const tbl = await db.createTable('chunks', data, { mode: 'overwrite' });
await tbl.add(moreData);  // batch insert
// query
const rows = await tbl.search(queryVec).limit(topK).select(['id','text','vector','source','path']).toArray();
for (const r of rows) {
  const v = r.vector.toArray();  // Float32Array
  const score = cosine(queryVec, v);
}
```

### 效能對比 (1300 chunks, 768-dim, RTX 4060)

- JS brute-force cosine: 5.4s / query
- LanceDB L2 + 自己的 cosine: 5-10ms search + 1ms cosine recompute ≈ **500x 加速**
- Warmup cold start: ~1.5s (vs 0ms for JS in-memory)

## PowerShell 環境變數陷阱

PowerShell 不能用 bash 風格的 `KEY=value cmd`。改用：

```powershell
# ❌ bash 風格，PS 不支援
KEY=value cmd

# ✅ PS 風格
$env:KEY='value'; cmd
```

相關 env vars（`dev/.env` 或 `astro/.env`）：

| Var | Default | 說明 |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama daemon |
| `OLLAMA_CHAT_MODEL` | `llama3.2` | 改 `qwen2.5:3b` 推中文 |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | 768-dim |
| `RAG_INDEX_PATH` | `<repo>/.rag/index.json` | 預設 JS in-memory index |
| `RAG_ENABLED` | `1` | 0 關掉 RAG |
| `RAG_TOPK` | `5` | 撈幾條 context |
| `RAG_MIN_SCORE` | `0.30` | cosine 門檻 |

## Ollama keep_alive

```python
import requests
requests.post(f"{OLLAMA_URL}/api/generate", json={
  "model": "qwen2.5:3b",
  "keep_alive": "30m"  # model 留 VRAM 30 分鐘
})
```

預設 5m cold start 6+ 秒，keep_alive=30m 之後 0.5s 內回應。

## PowerShell Unicode / emoji crash

PowerShell cp950 codec 對 `靘?` / emoji 會 crash。解法：用 ASCII (`+`, `*`, `OK`) 而非特殊字元在 console 輸出。

## References

- [`01-astro-vite-middleware.md`](references/01-astro-vite-middleware.md) — `astro:config:setup` 完整 pattern、framework root 坑、apply: 'serve' 為何不 work
- [`02-lancedb-internals.md`](references/02-lancedb-internals.md) — Vector class、L2 不 normalize、select 拿 vector、效能 benchmark
- [`03-sse-streaming.md`](references/03-sse-streaming.md) — Server / Client SSE 完整 pattern、AbortSignal.timeout、Ollama streaming
- [`04-ollama-4gb-vram.md`](references/04-ollama-4gb-vram.md) — model 選擇基準、CJK 表現、keep_alive、caching
- [`05-rag-ingest-pipeline.md`](references/05-rag-ingest-pipeline.md) — PDF chunker、target=600 vs 300、Neon HTTP SQL bulk insert

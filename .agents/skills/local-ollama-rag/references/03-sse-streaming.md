# SSE Streaming 完整 Pattern

## Server side（Vite middleware）

```js
// dev/ollama-chat-integration.mjs
import { ragSearch } from './rag-search.mjs';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || 'qwen2.5:3b';

function sseHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',  // 防 nginx buffer
  });
}

function sseEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function handleChat(req, res) {
  sseHeaders(res);
  
  // 1. Parse body
  const body = await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
  
  const { message, topK = 5 } = body;
  if (!message) { res.end(); return; }
  
  // 2. RAG search
  const ragHits = await ragSearch(message, topK);
  sseEvent(res, 'rag', ragHits.map(h => ({
    id: h.id, text: h.text.slice(0, 200), source: h.source, score: h.score
  })));
  
  // 3. Call Ollama with RAG context
  const systemPrompt = `你是一個 helpful assistant。回答時優先參考以下 context：\n\n${
    ragHits.map((h, i) => `[${i+1}] ${h.text}`).join('\n\n')
  }`;
  
  const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_CHAT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      stream: true,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  
  if (!ollamaRes.ok) {
    sseEvent(res, 'error', { status: ollamaRes.status, statusText: ollamaRes.statusText });
    sseEvent(res, 'done', {});
    res.end();
    return;
  }
  
  // 4. Stream Ollama response
  const reader = ollamaRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    
    // Ollama 用 \n 分隔 JSON 物件
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';  // 留未完成的 line
    
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        if (json.message?.content) {
          sseEvent(res, 'token', json.message.content);
        }
        if (json.done) {
          sseEvent(res, 'done', { totalDuration: json.total_duration });
        }
      } catch (e) {
        // partial line, skip
      }
    }
  }
  
  res.end();
}

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
                server.middlewares.use('/api/chat', async (req, res, next) => {
                  if (req.method !== 'POST') return next();
                  try { await handleChat(req, res); }
                  catch (err) {
                    console.error('[ollama-chat]', err);
                    sseEvent(res, 'error', { message: err.message });
                    res.end();
                  }
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

## Client side

```html
<div id="chatbot">
  <div id="rag-context" style="display:none"></div>
  <div id="response">
    <span class="cursor">▍</span>
  </div>
</div>
```

```js
async function chat(message) {
  const placeholder = document.querySelector('#response');
  const ragEl = document.querySelector('#rag-context');
  
  // 清空 + 加 cursor
  placeholder.innerHTML = '<span class="cursor">▍</span>';
  ragEl.innerHTML = '';
  ragEl.style.display = 'none';
  
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, topK: 5 }),
  });
  
  if (!res.ok) {
    placeholder.textContent = '錯誤：' + res.statusText;
    return;
  }
  
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let ragShown = false;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    
    // SSE 格式：event: xxx\ndata: yyy\n\n
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    
    for (const evt of events) {
      const lines = evt.split('\n');
      let eventName = 'message';
      let dataStr = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) eventName = line.slice(7);
        else if (line.startsWith('data: ')) dataStr += line.slice(6);
      }
      if (!dataStr) continue;
      
      let data;
      try { data = JSON.parse(dataStr); } catch { continue; }
      
      switch (eventName) {
        case 'rag':
          if (data.length > 0 && !ragShown) {
            ragEl.innerHTML = '<details><summary>參考資料 (' + data.length + ')</summary><ol>' +
              data.map(h => `<li><small>${h.source} (${h.score.toFixed(2)})</small><br>${h.text}</li>`).join('') +
              '</ol></details>';
            ragEl.style.display = 'block';
            ragShown = true;
          }
          break;
        case 'token':
          fullText += data;
          placeholder.innerHTML = escapeHtml(fullText) + '<span class="cursor">▍</span>';
          break;
        case 'error':
          placeholder.textContent = '錯誤：' + data.message;
          break;
        case 'done':
          placeholder.innerHTML = escapeHtml(fullText);
          break;
      }
    }
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
```

## AbortSignal.timeout

```js
const ollamaRes = await fetch(OLLAMA_URL, {
  // ...
  signal: AbortSignal.timeout(60_000),  // 60s timeout
});
```

超過 60s 自動 abort。streaming 場景必要（client 可能斷線）。

## CORS

dev mode 同源（`localhost:4321` 對 `localhost:4321/api/chat`）不需 CORS。

Production 跨域要 CORS headers：

```js
res.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Access-Control-Allow-Origin': 'https://donttalk.vercel.app',
  // ...
});
```

## nginx buffering 防雷

`X-Accel-Buffering: no` 防止 nginx / Vercel CDN 累積 buffer 才送 client。SSE 必須 stream 出來才有效。

## Client abort

```js
const controller = new AbortController();
const res = await fetch('/api/chat', { signal: controller.signal, /* ... */ });

// user 點取消
cancelBtn.onclick = () => controller.abort();
```

server side 會從 `req.on('aborted')` 偵測，關掉 Ollama stream。

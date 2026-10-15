# Astro Vite Middleware Integration（細節）

## 為什麼需要

Astro 6.x static mode 不支援 server endpoints — `/api/*` 在 build 後會 404。

但 dev mode 我們要 `/api/chat` 串 Ollama。解法：用 Vite middleware 從 `astro:config:setup` hook 注入。

## 完整 pattern

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [
    react(),
    // 自訂 integrations
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
                server.middlewares.use('/api/chat', async (req, res, next) => {
                  // 只處理 POST
                  if (req.method !== 'POST') return next();
                  
                  try {
                    await handleChat(req, res);
                  } catch (err) {
                    console.error('[ollama-chat]', err);
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: err.message }));
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

## 關鍵陷阱

### 1. 不要設 `apply: 'serve'`

```js
// ❌ 會壞
vite: {
  plugins: [{
    name: 'ollama-chat-middleware',
    apply: 'serve',  // Astro 6.4 framework root 會用 build mode
    configureServer(server) { ... }
  }]
}
```

`apply: 'serve'` 在 Astro 6.4 預設用 framework root 跑 → middleware 不啟用。

**修法**：拿掉 `apply`，讓 middleware 全部 hook。

### 2. Vite middleware 是 path-prefix，不是 exact match

```js
server.middlewares.use('/api/chat', handler);
```

會 match `/api/chat`、`/api/chat/abc`、`/api/chat?stream=1` 等。

**確認 handler 內有 method check 跟 sub-path 處理**。

### 3. `astro:config:setup` 在 Vite plugin 之前跑

順序：
1. Astro 跑 `astro:config:setup` hooks
2. Astro 跑所有 integrations 的 `astro:config:setup`
3. Astro 收集 `updateConfig` 的 vite plugins
4. Vite 啟動 server，載入 plugins → 跑 `configureServer`

所以 `updateConfig` 注入的 plugin 會在 Vite 啟動時註冊，但要先被 Astro 認可。

### 4. Body parsing

`req` 沒有 `req.body`，要自己讀 stream：

```js
async function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
```

或用 `body-parser` style：

```js
import bodyParser from 'body-parser';
// 注意 body-parser 是 Express middleware，不直接支援 Vite middleware
// 改用 raw stream parsing
```

### 5. SSE response headers

```js
res.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',  // 防止 nginx buffering
});
```

少了 `X-Accel-Buffering: no` 在 nginx 後面會 buffer 到整段收完才送 client。

## 測試

dev server 啟動後：

```powershell
# 驗 middleware 有註冊
curl.exe -X POST http://localhost:4321/api/chat/test `
  -H "Content-Type: application/json" `
  -d '{"message":"hello"}'
# 應回 SSE stream（或 404 if 不在 middleware path）
```

或從 browser DevTools Network 看 fetch 是不是 200 + `text/event-stream`。

## 部署考量

這個 middleware **只在 dev mode 跑**（`astro dev`）。Production build 仍走 Vercel catchall function（無 RAG）。

要 production 也跑 RAG：
- 改用 Astro hybrid mode（`output: 'hybrid'`）+ API routes
- 或部署 Ollama 到雲端（Railway / Render GPU）
- 或用 Vercel Edge + Upstash Vector

當前設計：dev 用本機 RAG，production 用 catchall（無 RAG 但接 Railway API）。production 部署詳見 `astro-build-clean` + `deploy-vercel-prebuilt` skill。

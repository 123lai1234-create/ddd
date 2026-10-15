# api-server-src Build 流程（細節）

## 為什麼分兩個地方

D:\project 有兩個 backend 程式碼位置：

| 位置 | 用途 | 語言 |
|---|---|---|
| `D:\project\api-server-src/` | TypeScript source，bundled 成 `_backend.mjs` | TS |
| `D:\project\astro/api/` | Vercel catchall function 入口 | JS/TS |

**production 邏輯在 `api-server-src/`**，bundle 後塞進 `astro/api/_backend.mjs`，由 `astro/api/index.mjs` (catchall) 動態 require。

## Build script

`api-server-src/scripts/build-backend.mjs`：

```js
import { build } from 'esbuild';
import { writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, '../astro/api/_backend.mjs');

await build({
  entryPoints: [resolve(ROOT, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: OUT,
  external: [
    // node built-ins
    'node:*',
    // native modules（不能在 esbuild bundle）
    '@line/bot-sdk',  // 如果有 native deps
    'pg',  // postgres native
  ],
  minify: true,
  sourcemap: false,
  banner: { js: '// Built at ' + new Date().toISOString() },
});

console.log(`✅ Built → ${OUT}`);
```

或用 `tsc` + `esbuild` 兩階段：

```js
// 1. tsc compile TS → JS
execSync('tsc -p tsconfig.json', { stdio: 'inherit' });

// 2. esbuild bundle + minify
await build({
  entryPoints: ['dist/index.js'],
  bundle: true,
  outfile: '../astro/api/_backend.mjs',
  // ...
});
```

## 跑 build

```powershell
Set-Location D:\project\api-server-src
npm install            # 第一次或加新 dep 後
node scripts/build-backend.mjs
# 或
npm run build
```

build 完後：

```powershell
Test-Path "D:\project\astro\api\_backend.mjs"
Get-Item "D:\project\astro\api\_backend.mjs" | Select-Object Length, LastWriteTime
```

預期：檔案存在，LastWriteTime 是剛剛。

## Catchall 怎麼 require _backend.mjs

`astro/api/index.mjs`：

```js
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Lazy import 避免 cold start 慢
let backend;
async function getBackend() {
  if (!backend) {
    const backendPath = path.join(import.meta.dirname, '_backend.mjs');
    backend = await import(pathToFileURL(backendPath).href);
  }
  return backend;
}

export default async function handler(req, res) {
  const { default: app } = await getBackend();
  // Express app 直接處理
  return app(req, res);
}
```

`pathToFileURL` 是 Node 24 ESM 對 Windows 絕對路徑的必要修法（見 `glb-asset-pipeline/01-meshy-decrypt.md` 的同樣 pattern）。

## Express app 結構

`api-server-src/src/index.ts`：

```ts
import express from 'express';
import { lineRouter } from './routes/line.js';
import { stockRouter } from './routes/stock.js';

const app = express();
app.use(express.json());  // 但 line webhook 要 raw body，要 bypass
app.use('/api/line', lineRouter);
app.use('/api/stock', stockRouter);
// ...

export default app;
```

注意：`/api/line` route 是 Express 內部，跟 Vercel `api/line/webhook.js` function 沒關。

## LINE webhook 的 raw body 問題

Express `express.json()` middleware 會把 body parsed 掉，後面 handler 拿不到 raw bytes → HMAC 驗證失敗。

解法：LINE webhook route 在 `express.json()` 之前掛 raw body parser：

```ts
import express from 'express';
import { lineRouter } from './routes/line.js';

const app = express();

// LINE webhook raw body parser（必須在 express.json() 之前）
app.use('/api/line/webhook', express.raw({ type: '*/*' }), (req, _res, next) => {
  req.rawBody = req.body;  // Buffer
  next();
});

app.use(express.json());  // 對其他 route

app.use('/api/line', lineRouter);  // webhook 用 raw body
app.use('/api/stock', stockRouter);
```

或在 webhook handler 內自己讀 stream（同 `deploy-vercel-prebuilt/references/05-webhook-raw-body.md`）。

## Build artifact 必須 commit

`_backend.mjs` 是 Vercel build 看的 source-of-truth（Vercel 不會自動 rebuild）。所以：

```powershell
git add api-server-src/src/routes/line.ts astro/api/_backend.mjs
git commit -m "feat(line): 新功能"
```

`astro/api/_backend.mjs` 必須 commit，否則 Vercel deploy 用舊的。

## watch mode（開發期）

```json
// api-server-src/package.json
"scripts": {
  "build": "node scripts/build-backend.mjs",
  "watch": "node scripts/build-backend.mjs --watch"
}
```

esbuild watch mode 自動 rebuild：

```js
// scripts/build-backend.mjs
import { context } from 'esbuild';

if (process.argv.includes('--watch')) {
  const ctx = await context({ /* ... */ });
  await ctx.watch();
  console.log('👀 Watching...');
} else {
  await build({ /* ... */ });
}
```

或用 `tsx watch` 直接跑：

```powershell
npx tsx watch src/index.ts
```

但 Vercel 部署要的是 bundle（`_backend.mjs`），不是 source — dev watch 跟 deploy build 兩條路徑。

## Vercel Hobby plan function cap

12 function cap 對 api-server-src 沒影響（只有 catchall 一個 function），但 `api/line/*.js` 等 dead code 仍 build 出 function → 占 cap。

**修法**：

```json
// astro/.vercelignore
api/line/
api/index.js
```

或 `vercel.json`：

```json
{
  "functions": {
    "api/index.mjs": { "maxDuration": 26 }
  }
}
```

只列 public endpoint，library / dead code 不 deploy。

## Common pitfalls

1. **改 `api/line/*.js` 以為生效** — 永遠不會，是 dead code
2. **build artifact 沒 commit** — Vercel 用舊的
3. **HMAC 算錯** — 用了 parsed body 而非 raw body
4. **`_backend.mjs` 路徑找不到** — 用了相對路徑在 catchall 內部，要 `import.meta.dirname`
5. **express.json() 跟 raw body 衝突** — LINE webhook 要在 json middleware 之前掛 raw parser

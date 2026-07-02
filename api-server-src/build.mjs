// build.mjs — bundle the api-server (Vercel Serverless Function target)
import { build } from '../dontalk-import/artifacts/api-server/node_modules/esbuild/lib/main.js';
import { mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });

const result = await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/backend.mjs',
  logLevel: 'info',
  // Add the api-server's real node_modules + the lib/db's + workspace root
  // so esbuild can resolve `express`, `drizzle-orm`, `yahoo-finance2`, etc.
  nodePaths: [
    '../dontalk-import/artifacts/api-server/node_modules',
    '../dontalk-import/lib/db/node_modules',
    '../dontalk-import/node_modules',
  ],
  // NOTE: For Vercel Serverless Functions the bundle is loaded from a single
  // file, so we inline *all* runtime deps (express, yahoo-finance2, etc.) and
  // mark only true native modules as external. Vercel resolves relative
  // imports from the function's own directory.
  external: [
    '*.node',
  ],
  banner: {
    js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);`,
  },
});

if (result.errors.length) {
  console.error('Build errors:', result.errors);
  process.exit(1);
}
console.log('Built dist/backend.mjs');

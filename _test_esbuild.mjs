// Use esbuild via npx
import { build } from 'esbuild';
try {
  await build({
    entryPoints: ['d:/project/astro/api/catchall.mjs'],
    bundle: false,
    write: false,
    format: 'esm',
    target: 'esnext',
    platform: 'neutral',
  });
  console.log('esbuild OK');
} catch (e) {
  console.log('esbuild ERR:', e.message);
  console.log('Loc:', JSON.stringify(e.errors));
}

// Cross-platform build wrapper for Vercel CLI (runs from D:\project\astro)
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const astroDir = path.resolve(here, 'astro');

// 1. 拉 LFS 物件（dist/ 與 public/ 下的 mp3/wav/flac/ogg/m4a/aac/lrc 都靠它）。
//    Vercel 用淺 clone，dist 已 commit 但 LFS 物件是 pointer；沒這步 dist/*.mp3 會是 132 bytes pointer，音樂就壞了。
try {
    console.log('[build] git lfs install --local...');
    execSync('git lfs install --local', { stdio: 'inherit' });
    console.log('[build] git lfs pull (music assets)...');
    execSync('git lfs pull', { stdio: 'inherit' });
    console.log('[build] LFS pull OK');
} catch (err) {
    console.error('[build] LFS pull FAILED — dist 中會留下 LFS pointer（132 bytes），音樂/影片資產會壞。');
    throw err;
}

// 2. 跑 astro build
console.log('[build] cd to', astroDir, 'and running astro build...');
execSync('npx --no-install astro build', { cwd: astroDir, stdio: 'inherit' });

// 3. pagefind 索引
console.log('[build] running pagefind index...');
execSync('npx --no-install pagefind --site dist --output-path dist/pagefind', { cwd: astroDir, stdio: 'inherit' });

console.log('[build] done');

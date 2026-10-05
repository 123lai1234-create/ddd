// Cross-platform build wrapper for Vercel CLI (runs from D:\project/astro)
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const astroDir = path.resolve(here, 'astro');
const repoRoot = path.resolve(here);  // D:\project
const apiSrcDir = path.join(astroDir, 'api');
const apiDestDir = path.join(repoRoot, 'api');

// 1. 拉 LFS 物件（dist/ 與 public/ 下的 mp3/wav/flac/ogg/m4a/aac/lrc 都靠它）。
//    Vercel 用淺 clone，dist 已 commit 但 LFS 物件是 pointer；沒這步 dist/*.mp3 會是 132 bytes pointer，音樂就壞了。
//    但 Vercel build container 是 shallow snapshot 沒 .git/,`git lfs install` 會 fail — 跳過。
if (existsSync(path.join(repoRoot, '.git'))) {
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
} else {
    console.log('[build] (skip LFS: no .git/ in build container — Vercel deploys LFS files directly)');
}

// 1.5. Sync astro/api/* → repo-root api/ AND into astro/dist/api/ so Vercel
//      sees the functions inside outputDirectory (which it auto-scans).
//      Without copying into astro/dist/api/, framework=astro + outputDirectory
//      = astro/dist makes Vercel only look inside dist/ for functions, so
//      repo-root api/ files are built but never routed.
//      The repo-root copy is kept as a fallback in case outputDirectory
//      config changes back to repo-root.
if (existsSync(apiSrcDir)) {
    if (!existsSync(apiDestDir)) mkdirSync(apiDestDir, { recursive: true });
    for (const f of readdirSync(apiSrcDir)) {
        const src = path.join(apiSrcDir, f);
        const dst = path.join(apiDestDir, f);
        copyFileSync(src, dst);
        console.log('[build] synced repo-root api/' + f);
    }
    // Also place functions inside outputDirectory so Vercel's framework=astro
    // adapter finds them and auto-creates /api/<*> routes.
    const distApiDir = path.join(astroDir, 'dist', 'api');
    if (!existsSync(distApiDir)) mkdirSync(distApiDir, { recursive: true });
    for (const f of readdirSync(apiSrcDir)) {
        const src = path.join(apiSrcDir, f);
        const dst = path.join(distApiDir, f);
        copyFileSync(src, dst);
        console.log('[build] synced astro/dist/api/' + f);
    }
}

// 2. 跑 astro build
console.log('[build] cd to', astroDir, 'and running astro build...');
execSync('npx --no-install astro build', { cwd: astroDir, stdio: 'inherit' });

// 3. pagefind 索引
console.log('[build] running pagefind index...');
execSync('npx --no-install pagefind --site dist --output-path dist/pagefind', { cwd: astroDir, stdio: 'inherit' });

console.log('[build] done');
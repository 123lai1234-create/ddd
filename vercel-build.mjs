// Cross-platform build wrapper for Vercel CLI (runs from D:\project/astro)
import { execSync } from 'node:child_process';
import { readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const astroDir = path.resolve(here, 'astro');
const repoRoot = path.resolve(here);  // D:\project

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

// 2. 跑 astro build
console.log('[build] cd to', astroDir, 'and running astro build...');
execSync('npx --no-install astro build', { cwd: astroDir, stdio: 'inherit' });

// 3. pagefind 索引
console.log('[build] running pagefind index...');
execSync('npx --no-install pagefind --site dist --output-path dist/pagefind', { cwd: astroDir, stdio: 'inherit' });

// 4. 排除清單 —— 必須跟 astro/scripts/prepare-deploy.ps1 的 EXCLUDE 維持一致。
//
//    為什麼需要：git build 會把整個 astro/dist 原封不動上傳，而 dist 未過濾時約 207MB，
//    遠超過 Vercel Hobby 的 100MB 上限。平台不會報錯，只會靜默截斷成只收前段 ——
//    2026-10-23 實測就掉了 38 個 zh-tw Pagefind 檔，中文站內搜尋直接壞掉。
//    prebuilt 那條路由由 prepare-deploy.ps1 做同一件事，兩邊結果必須一樣，
//    否則 push 觸發的自動部署會把 prebuilt 的成果洗掉。
//
//    必須在 pagefind 之後跑：Pagefind 自己的輸出不在清單裡，但先刪再索引順序容易出問題。
const EXCLUDE = [
    // 只有舊版 ImmersiveBackground 用過的背景影片
    (rel) => /^bg[^/]*\.mp4$/.test(rel),
    // 備份檔
    (rel) => /\.(old|bak)$/.test(rel),
    // 已被取代的 3D 模型（頁面現在只用 models/mascot-3d.glb）
    (rel) => /^models\/(?:mascot-3d-full|mascot-3d-tiny|chibi-blender-v1|chibi-restyle-v1)\.glb$/.test(rel),
    // 2026-10-23: 原本這裡還排除了 img/mascot-*.png，理由寫「沒有任何頁面引用」——
    // 已經不成立。/3d-mascot/ 把它當 kawaii fallback 載入
    // (/img/mascot-front.png)，排除掉會讓兩條部署路徑都 404。
    // 四張加起來約 1.2MB，對 100MB 上限來說是雜訊，不值得為省它而壞頁面。
    (rel) => rel === 'images/chibi-hero-run.jpg',
    // 站台音檔走 jsDelivr CDN（tracks.json 的 url 欄位），歌詞已內嵌在 tracks.json
    // 的 lyricsTimed —— 本地副本不需要部署。
    (rel) => /^music\/[^/]*\.(?:mp3|txt|lrc)$/.test(rel),
];

console.log('[build] applying exclude list to dist...');
{
    const distDir = path.join(astroDir, 'dist');
    let removed = 0;
    let freed = 0;
    let remaining = 0;
    let bytes = 0;

    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else {
                const rel = path.relative(distDir, full).split(path.sep).join('/');
                if (EXCLUDE.some((test) => test(rel))) {
                    freed += statSync(full).size;
                    unlinkSync(full);
                    removed += 1;
                } else {
                    remaining += 1;
                    bytes += statSync(full).size;
                }
            }
        }
    };

    walk(distDir);
    console.log('[build] exclude list: removed %d file(s), freed %.1f MB', removed, freed / 1048576);
    console.log('[build] dist after exclude: %d file(s), %.1f MB (Vercel Hobby limit 100MB)',
        remaining, bytes / 1048576);
    if (bytes > 100 * 1048576) {
        console.warn('[build] WARNING: dist still exceeds the upload limit — tail files will be dropped');
    }
}

console.log('[build] done');

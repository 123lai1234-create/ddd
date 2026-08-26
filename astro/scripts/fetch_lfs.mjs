#!/usr/bin/env node
// 在 Vercel 端用 GitHub LFS media URL 把 LFS pointer 換成真實檔案
// 比 `git lfs pull` 在 Vercel 沙盒更可靠（有些 Vercel runner 沒裝 git-lfs）
//
// 平行下載（concurrency=8）+ timeout 30s + retry 2 次
//
// 用法：
//   node fetch_lfs.mjs <paths-glob>... [--branch=<branch>] [--user=<user>] [--repo=<repo>]
// 範例：
//   node fetch_lfs.mjs "astro/public/music/**/*" "astro/dist/music/**/*"

import { readFile, writeFile, stat, open } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptFile = fileURLToPath(import.meta.url);
// 此腳本位於 astro/scripts/。在 Vercel 端 process.cwd() = astro/ (rootDirectory)
const projectRoot = resolve(scriptFile, '..', '..'); // astro/
const repoPrefix = 'astro';

const args = process.argv.slice(2);
let user = '123lai1234-create';
let repo = 'ddd';
let branch = '123lai1234-create';
const globs = [];

for (const a of args) {
    const m = a.match(/^--(user|repo|branch)=(.*)$/);
    if (m) {
        if (m[1] === 'user') user = m[2];
        else if (m[1] === 'repo') repo = m[2];
        else if (m[1] === 'branch') branch = m[2];
    } else {
        globs.push(a);
    }
}

if (globs.length === 0) {
    globs.push('public/music/**/*', 'dist/music/**/*');
}

const LFS_POINTER_RE = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:[0-9a-f]+\nsize (\d+)\n?$/;
const FETCH_TIMEOUT_MS = 30000;
const CONCURRENCY = 8;
const RETRIES = 2;

async function* walk(pattern) {
    for await (const p of glob(pattern, { cwd: projectRoot })) {
        yield resolve(projectRoot, p);
    }
}

// 收集所有 pointer file
const tasks = [];
for (const pattern of globs) {
    for await (const filePath of walk(pattern)) {
        try {
            const s = await stat(filePath);
            if (!s.isFile()) continue;
            // 讀前 200 bytes 判斷是不是 LFS pointer
            const fd = await open(filePath, 'r');
            const buf = Buffer.alloc(200);
            const { bytesRead } = await fd.read(buf, 0, 200, 0);
            await fd.close();
            const head = buf.subarray(0, bytesRead).toString('utf8');
            if (!head.startsWith('version https://git-lfs.github.com/spec/v1')) continue;
            const m = head.match(LFS_POINTER_RE);
            if (!m) {
                console.warn(`[fetch_lfs] cannot parse pointer: ${filePath}`);
                continue;
            }
            const size = parseInt(m[1], 10);
            const relPath = relative(projectRoot, filePath).split('\\').join('/');
            const urlPath = `${repoPrefix}/${relPath}`;
            const url = `https://media.githubusercontent.com/media/${user}/${repo}/${branch}/${urlPath}`;
            tasks.push({ filePath, relPath, url, size });
        } catch (err) {
            if (err && err.code === 'ENOENT') continue;
        }
    }
}

console.log(`[fetch_lfs] found ${tasks.length} LFS pointers to fetch`);

let replaced = 0;
let errors = 0;

// 平行下載（worker pool）
async function worker() {
    while (true) {
        const task = tasks.shift();
        if (!task) return;
        let attempt = 0;
        let lastErr = null;
        while (attempt <= RETRIES) {
            attempt++;
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
                const r = await fetch(task.url, { redirect: 'follow', signal: controller.signal });
                clearTimeout(timer);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const data = Buffer.from(await r.arrayBuffer());
                if (data.length !== task.size) {
                    throw new Error(`size mismatch: expected ${task.size}, got ${data.length}`);
                }
                await writeFile(task.filePath, data);
                replaced++;
                process.stdout.write('.');
                return;
            } catch (err) {
                lastErr = err;
                if (attempt > RETRIES) break;
                // 短暫退避後重試
                await new Promise(r => setTimeout(r, 500 * attempt));
            }
        }
        errors++;
        console.error(`\n[fetch_lfs] FAILED ${task.relPath}: ${lastErr && lastErr.message}`);
    }
}

const workers = [];
for (let i = 0; i < Math.min(CONCURRENCY, tasks.length); i++) {
    workers.push(worker());
}
await Promise.all(workers);
console.log(`\n[fetch_lfs] done: replaced=${replaced} errors=${errors}`);

if (errors > 0 && replaced === 0) {
    // 完全失敗時不要讓 build 死（player 還是有 URL，只是會是 pointer）
    console.warn(`[fetch_lfs] WARN: all fetches failed, LFS files will be served as pointers`);
    process.exit(0);
}
process.exit(errors > 0 ? 1 : 0);

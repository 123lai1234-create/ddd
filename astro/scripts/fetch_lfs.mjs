#!/usr/bin/env node
// 在 Vercel 端用 GitHub LFS media URL 把 LFS pointer 換成真實檔案
// 比 `git lfs pull` 在 Vercel 沙盒更可靠（有些 Vercel runner 沒裝 git-lfs）
//
// 用法：
//   node fetch_lfs.mjs <paths-glob>... [--branch=<branch>] [--user=<user>] [--repo=<repo>]
// 範例：
//   node fetch_lfs.mjs "astro/public/music/**/*" "astro/dist/music/**/*"

import { readFile, writeFile, stat } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { resolve, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptFile = fileURLToPath(import.meta.url);
// 此腳本位於 astro/scripts/。在 Vercel 端 process.cwd() = astro/ (rootDirectory)
// 檔案實體路徑：D:\project\astro\public\music\...
// 但 git 內路徑：astro/public/music/...（GitHub media URL 要這個）
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

async function* walk(pattern) {
    for await (const p of glob(pattern, { cwd: projectRoot })) {
        yield resolve(projectRoot, p);
    }
}

let total = 0;
let replaced = 0;
let skipped = 0;
let errors = 0;

for (const pattern of globs) {
    console.log(`[fetch_lfs] glob pattern: ${pattern} (cwd: ${projectRoot})`);
    for await (const filePath of walk(pattern)) {
        try {
            const s = await stat(filePath);
            if (!s.isFile()) continue;
            total++;
            // 讀前 200 bytes 判斷是不是 LFS pointer
            const fh = await import('node:fs/promises');
            const fd = await fh.open(filePath, 'r');
            const buf = Buffer.alloc(200);
            const { bytesRead } = await fd.read(buf, 0, 200, 0);
            await fd.close();
            const head = buf.subarray(0, bytesRead).toString('utf8');
            if (!head.startsWith('version https://git-lfs.github.com/spec/v1')) {
                skipped++;
                continue;
            }
            const m = head.match(LFS_POINTER_RE);
            if (!m) {
                console.warn(`[fetch_lfs] cannot parse pointer: ${filePath}`);
                errors++;
                continue;
            }
            const size = parseInt(m[1], 10);
            const relPath = relative(projectRoot, filePath).split('\\').join('/');
            const urlPath = `${repoPrefix}/${relPath}`;
            const url = `https://media.githubusercontent.com/media/${user}/${repo}/${branch}/${urlPath}`;
            console.log(`[fetch_lfs] GET ${relPath} (${size} bytes)`);
            const r = await fetch(url, { redirect: 'follow' });
            if (!r.ok) {
                console.error(`[fetch_lfs] ${r.status} ${url}`);
                errors++;
                continue;
            }
            const data = Buffer.from(await r.arrayBuffer());
            if (data.length !== size) {
                console.error(`[fetch_lfs] size mismatch: expected ${size}, got ${data.length} for ${relPath}`);
                errors++;
                continue;
            }
            await writeFile(filePath, data);
            replaced++;
        } catch (err) {
            if (err && err.code === 'ENOENT') continue; // glob 多餘的空殼
            console.error(`[fetch_lfs] ${filePath}: ${err && err.message}`);
            errors++;
        }
    }
}

console.log(`[fetch_lfs] scanned=${total} replaced=${replaced} skipped=${skipped} errors=${errors}`);
process.exit(errors > 0 ? 1 : 0);

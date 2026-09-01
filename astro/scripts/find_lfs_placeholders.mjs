#!/usr/bin/env node
// 掃描所有 git LFS pointer，找出疑似 placeholder（size 異常小）的物件
//
// 用途：
//   node scripts/find_lfs_placeholders.mjs [--threshold=1024]
//
// 輸出格式（純文字，方便 grep / 重導向到檔案）：
//   <LFS pointer file path>    <pointer size in bytes>    <LFS oid>
//
// 範例輸出：
//   astro/public/music/01_兄弟本色.mp3    79    sha256:abc123...
//   astro/public/music/02_未曾一个對老闆.mp3    79    sha256:def456...

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';

const scriptFile = fileURLToPath(import.meta.url);
// 此腳本位於 astro/scripts/。process.cwd() 在 build 中是 astro/
const projectRoot = resolve(scriptFile, '..', '..');

const args = process.argv.slice(2);
let thresholdBytes = 1024; // 1KB — 小於 1KB 視為可疑 placeholder
for (const a of args) {
    const m = a.match(/^--threshold=(\d+)$/);
    if (m) thresholdBytes = parseInt(m[1], 10);
}
if (Number.isNaN(thresholdBytes) || thresholdBytes < 1) {
    console.error(`[find_lfs_placeholders] invalid --threshold=${args.find(a => a.startsWith('--threshold='))}`);
    process.exit(2);
}

// 用 git lfs ls-files 列出所有 LFS pointer（格式：「<oid> <status> <path>」）
let stdout;
try {
    stdout = execFileSync('git', ['lfs', 'ls-files', '--long'], {
        cwd: projectRoot,
        encoding: 'utf8',
    });
} catch (err) {
    console.error(`[find_lfs_placeholders] git lfs ls-files failed: ${err.message}`);
    process.exit(1);
}

const lines = stdout.split(/\r?\n/).filter(Boolean);
const placeholders = [];

for (const line of lines) {
    // git lfs ls-files --long 格式：
    //   <oid sha256:...> * <path>
    // 星號 * 表示 staged/working tree pointer
    const m = line.match(/^([0-9a-f]{64}|sha256:[0-9a-f]+)\s+\*\s+(.+)$/);
    if (!m) continue;
    const oid = m[1].startsWith('sha256:') ? m[1] : `sha256:${m[1]}`;
    const filePath = m[2].trim();

    // 讀 git object 內容，看 LFS pointer 中的 size
    let pointerText;
    try {
        pointerText = execFileSync('git', ['cat-file', '-p', `HEAD:${filePath}`], {
            cwd: projectRoot,
            encoding: 'utf8',
        });
    } catch {
        continue; // 檔案可能不在 HEAD（只在 working tree）
    }
    const sizeMatch = pointerText.match(/^size\s+(\d+)/m);
    if (!sizeMatch) continue;
    const size = parseInt(sizeMatch[1], 10);

    if (size < thresholdBytes) {
        // 把路徑轉成相對 repo root（git lfs ls-files 已經是相對路徑）
        const rel = relative(projectRoot, filePath) || filePath;
        placeholders.push({ path: rel, size, oid });
    }
}

if (placeholders.length === 0) {
    console.log(`[find_lfs_placeholders] no LFS placeholder found (threshold=${thresholdBytes} bytes)`);
    process.exit(0);
}

// 表格輸出（用 tab 分隔，方便 awk / cut 處理）
console.log(`path\tsize_bytes\toid`);
for (const p of placeholders) {
    console.log(`${p.path}\t${p.size}\t${p.oid}`);
}
console.error(`[find_lfs_placeholders] found ${placeholders.length} LFS placeholder(s) below ${thresholdBytes} bytes`);
process.exit(0);

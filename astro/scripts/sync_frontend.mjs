// Copy frontend/scripts, frontend/styles, frontend/games, favicons and OG image
// into astro/public/ so Astro build picks up the latest source of truth.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const frontendDir = path.resolve('../frontend');
const publicDir = path.resolve('public');

async function copyDir(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}

async function copyFileIfExists(src, dest) {
    try {
        await fs.copyFile(src, dest);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
}

const dirs = ['scripts', 'styles', 'games', 'templates'];
for (const dir of dirs) {
    const src = path.join(frontendDir, dir);
    const dest = path.join(publicDir, dir);
    try {
        await fs.access(src);
    } catch {
        console.log(`skipped ${dir}/ (source not present — keeping existing public/${dir})`);
        continue;
    }
    try {
        // games/ uses merge mode to preserve Godot web exports alongside source
        if (dir !== 'games') {
            await fs.rm(dest, { recursive: true, force: true });
        }
        await copyDir(src, dest);
        console.log(`synced ${dir}/`);
    } catch (err) {
        throw err;
    }
}

const files = ['favicon.ico', 'favicon.svg', 'og-image.svg', 'manifest.json', 'sw.js'];
for (const file of files) {
    await copyFileIfExists(path.join(frontendDir, file), path.join(publicDir, file));
    console.log(`synced ${file}`);
}

console.log('frontend → astro/public sync complete');

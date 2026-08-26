// Cross-platform install wrapper for Vercel CLI (runs from D:\project\astro)
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const astroDir = path.resolve(here, 'astro');

console.log('[install] cd to', astroDir, 'and running npm ci...');
execSync('npm ci', { cwd: astroDir, stdio: 'inherit' });

console.log('[install] done');

// Cross-platform build wrapper for Vercel CLI (runs from D:\project\astro)
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const astroDir = path.resolve(here, 'astro');

console.log('[build] cd to', astroDir, 'and running astro build...');
execSync('npx --no-install astro build', { cwd: astroDir, stdio: 'inherit' });

console.log('[build] running pagefind index...');
execSync('npx --no-install pagefind --site dist --output-path dist/pagefind', { cwd: astroDir, stdio: 'inherit' });

console.log('[build] done');

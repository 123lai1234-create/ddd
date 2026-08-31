import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';

const distDir = 'D:/project/astro/dist';

const dirs = readdirSync(distDir).filter(f => {
  try { return require('fs').statSync(join(distDir, f)).isDirectory(); } catch { return false; }
});

const wrong = [];
for (const dir of dirs) {
  const idxPath = join(distDir, dir, 'index.html');
  try {
    const html = readFileSync(idxPath, 'utf8');
    // Find src="scripts/..." patterns (relative, not /scripts/...)
    const matches = [...html.matchAll(/src=["'](?![\/]|https?:)([^"']*scripts\/[^"']+)["']/g)];
    if (matches.length) {
      wrong.push({ dir, matches: matches.map(m => m[1]) });
    }
    // Also find href="scripts/..." patterns for stylesheets
    const hrefMatches = [...html.matchAll(/href=["'](?![\/]|https?:)([^"']*scripts\/[^"']+)["']/g)];
    if (hrefMatches.length) {
      wrong.push({ dir, type: 'href', matches: hrefMatches.map(m => m[1]) });
    }
  } catch {}
}

console.log('Dirs with wrong relative script paths:');
for (const w of wrong) {
  console.log(w.dir + ':', w.matches.join(', '));
}

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const srcDir = 'D:/project/astro/src/pages';
const files = readdirSync(srcDir).filter(f => f.endsWith('.astro'));

const wrong = [];
for (const file of files) {
  const content = readFileSync(join(srcDir, file), 'utf8');
  // Find script src="scripts/..." (relative, no leading /)
  const matches = [...content.matchAll(/<script[^>]+src=["'](?![\/]|https?:|data:)([^"']+)["'][^>]*>/g)];
  if (matches.length) {
    wrong.push({ file, matches: matches.map(m => m[1]) });
  }
}

console.log('Files with wrong relative script paths:');
for (const w of wrong) {
  console.log(w.file + ':', w.matches.join(', '));
}

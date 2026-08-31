import { readFileSync } from 'fs';

const file = 'D:/project/astro/src/pages/about.astro';
const c = readFileSync(file, 'utf8');
const idx = c.indexOf('scripts/app-config.js');
if (idx >= 0) {
  // show raw bytes around the match
  const before = c.slice(Math.max(0, idx - 60), idx);
  const after = c.slice(idx, idx + 80);
  console.log('BEFORE (raw):', JSON.stringify(before));
  console.log('AFTER (raw):', JSON.stringify(after));
}

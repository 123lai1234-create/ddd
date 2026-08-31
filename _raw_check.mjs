import { readFileSync } from 'fs';

const c = readFileSync('D:/project/astro/src/pages/about.astro', 'utf8');
const marker = 'scripts/app-config.js';
const idx = c.indexOf(marker);
console.log('total file len:', c.length);
console.log('marker at:', idx);
if (idx > 0) {
  // Show raw bytes from idx-30 to idx+80
  const slice = c.slice(idx - 30, idx + 80);
  console.log('SRAW around marker:', JSON.stringify(slice));
}

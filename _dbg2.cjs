const fs = require('fs');

const file = 'D:/project/astro/src/pages/about.astro';
const content = fs.readFileSync(file, 'utf8');
const marker = 'scripts/app-config.js';
const idx = content.indexOf(marker);
console.log('marker at byte index:', idx);
if (idx > 0) {
  // show 20 chars BEFORE the marker
  const before = content.slice(Math.max(0, idx - 20), idx);
  const after = content.slice(idx, idx + 80);
  console.log('BEFORE (20 chars):', JSON.stringify(before));
  console.log('AFTER (80 chars):', JSON.stringify(after));
  // check: is there a '<' right before the 'script'?
  const possibleStart = content.slice(idx - 10, idx);
  console.log('10 chars before marker:', JSON.stringify(possibleStart));
}

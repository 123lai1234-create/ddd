import { readFileSync } from 'fs';

const file = 'D:/project/astro/src/pages/about.astro';
const c = readFileSync(file, 'utf8');
const tag = '<script src="scripts/app-config.js"></script>';
const idx = c.indexOf(tag);
console.log('file length:', c.length);
console.log('tag found at:', idx);
if (idx >= 0) {
  console.log('found context:', JSON.stringify(c.slice(idx - 5, idx + tag.length + 5)));
} else {
  // find partial
  const partial = 'scripts/app-config.js';
  const idx2 = c.indexOf(partial);
  console.log('partial found at:', idx2);
  if (idx2 >= 0) {
    const before = c.slice(Math.max(0, idx2 - 60), idx2);
    const after = c.slice(idx2 + partial.length, idx2 + partial.length + 60);
    console.log('before:', JSON.stringify(before));
    console.log('after:', JSON.stringify(after));
  }
}

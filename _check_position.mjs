import fs from 'node:fs';
const code = fs.readFileSync('d:/project/astro/api/catchall.mjs', 'utf8');
// Count chars up to L53 col 100
const lines = code.split('\n');
let pos = 0;
for (let i = 0; i < 52; i++) pos += lines[i].length + 1; // +1 for newline
pos += 99; // col 100 (0-indexed col 99)
console.log('Char at L53:100:', JSON.stringify(code[pos]));
console.log('Around:', JSON.stringify(code.substr(pos - 5, 15)));

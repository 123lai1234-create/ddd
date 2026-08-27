import fs from 'node:fs';
const code = fs.readFileSync('d:/project/astro/api/catchall.mjs', 'utf8');
const lines = code.split('\n');
console.log('Total lines:', lines.length);
console.log('Line 53:', JSON.stringify(lines[52]));

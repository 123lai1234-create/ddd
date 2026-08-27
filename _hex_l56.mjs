import fs from 'node:fs';
const lines = fs.readFileSync('d:/project/astro/api/catchall.mjs', 'utf8').split('\n');
const l56 = lines[55];
const bytes = Buffer.from(l56, 'utf8');
console.log('L56:', JSON.stringify(l56));
console.log('Hex:', bytes.toString('hex').match(/.{1,2}/g).join(' '));

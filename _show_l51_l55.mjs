import fs from 'node:fs';
const lines = fs.readFileSync('d:/project/astro/api/catchall.mjs', 'utf8').split('\n');
for (let i = 50; i < 56; i++) {
  console.log(`L${i+1}: ${JSON.stringify(lines[i])}`);
}

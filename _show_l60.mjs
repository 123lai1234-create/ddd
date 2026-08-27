import fs from 'node:fs';
const lines = fs.readFileSync('d:/project/astro/api/catchall.mjs', 'utf8').split('\n');
for (let i = 58; i < 70; i++) {
  console.log(`L${i+1} [${lines[i].length}]: ${JSON.stringify(lines[i])}`);
}

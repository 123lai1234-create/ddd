const fs = require('fs');

const file = 'D:/project/astro/public/stock/dashboard.html';
const c = fs.readFileSync(file, 'utf8');

// Test the regex directly
const testRegex = /href="([^\/"'][^"\s]*\.html)"/g;
const matches = [...c.matchAll(testRegex)];
console.log('Matches found:', matches.length);
for (const m of matches) {
  console.log('Full match:', JSON.stringify(m[0]));
  console.log('Group 1:', JSON.stringify(m[1]));
}

// Try a simpler replacement
let count = 0;
const result = c.replace(/href="([^"]+\.html)"/g, (m, fn) => {
  if (!fn.startsWith('/') && !fn.startsWith('http')) {
    count++;
    return `href="/stock/${fn}"`;
  }
  return m;
});
console.log('\nReplacements:', count);
if (count > 0) {
  fs.writeFileSync(file, result, 'utf8');
  console.log('WRITTEN');
}

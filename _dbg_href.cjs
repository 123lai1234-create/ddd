const fs = require('fs');

const file = 'D:/project/astro/public/stock/dashboard.html';
const c = fs.readFileSync(file, 'utf8');
// Find all href values with .html
const matches = [...c.matchAll(/href="([^"]+\.html)"/g)];
console.log('All href .html links in dashboard.html:');
for (const m of matches) {
  console.log(' ', JSON.stringify(m[1]));
}

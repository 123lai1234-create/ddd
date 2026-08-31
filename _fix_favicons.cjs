const fs = require('fs');
const path = require('path');

const stockDir = 'D:/project/astro/public/stock/';
const files = fs.readdirSync(stockDir).filter(f => f.endsWith('.html'));

let totalFixed = 0;
for (const file of files) {
  const filepath = path.join(stockDir, file);
  let content = fs.readFileSync(filepath, 'utf8');
  const original = content;

  // Fix favicon links - change `static/favicon.svg` to `favicon.svg`
  content = content.replace(/href="static\/favicon\.svg"/g, 'href="favicon.svg"');
  content = content.replace(/href='static\/favicon\.svg'/g, "href='favicon.svg'");

  if (content !== original) {
    fs.writeFileSync(filepath, content, 'utf8');
    console.log('FIXED:', file);
    totalFixed++;
  }
}
console.log(`\nTotal files fixed: ${totalFixed}`);
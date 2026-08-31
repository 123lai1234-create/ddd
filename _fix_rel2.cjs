const fs = require('fs');

const stockDir = 'D:/project/astro/public/stock/';
const files = fs.readdirSync(stockDir).filter(f => f.endsWith('.html'));

let totalFixed = 0;
let totalReplaced = 0;

for (const file of files) {
  const filepath = stockDir + file;
  let content = fs.readFileSync(filepath, 'utf8');
  const origLen = content.length;

  let count = 0;
  content = content.replace(/href="([^"]+\.html)"/g, (match, filename) => {
    if (!filename.startsWith('/') && !filename.startsWith('http') && !filename.startsWith('#') && filename.endsWith('.html')) {
      count++;
      return `href="/stock/${filename}"`;
    }
    return match;
  });

  if (count > 0) {
    fs.writeFileSync(filepath, content, 'utf8');
    console.log('FIXED:', file, '-', count, 'links fixed');
    totalFixed++;
    totalReplaced += count;
  }
}

console.log('\nTotal files fixed:', totalFixed, '| Total links fixed:', totalReplaced);

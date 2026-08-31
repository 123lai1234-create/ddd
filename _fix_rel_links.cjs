const fs = require('fs');
const path = require('path');

const stockDir = 'D:/project/astro/public/stock/';
const files = fs.readdirSync(stockDir).filter(f => f.endsWith('.html'));

let totalFixed = 0;
for (const file of files) {
  const filepath = stockDir + file;
  let content = fs.readFileSync(filepath, 'utf8');
  const origLen = content.length;

  // Replace relative .html href links: href="xxx.html" → href="/stock/xxx.html"
  // But NOT if it already starts with / or http
  // Pattern: href="FILENAME.html" where FILENAME doesn't start with / or "
  content = content.replace(/href="([^\/"'][^"\s]*\.html)"/g, (match, filename) => {
    // Only replace if it's a simple relative filename.html reference
    if (filename && !filename.startsWith('/') && !filename.startsWith('http') && filename.endsWith('.html')) {
      return `href="/stock/${filename}"`;
    }
    return match;
  });

  if (content.length < origLen) {
    fs.writeFileSync(filepath, content, 'utf8');
    console.log('FIXED:', file, 'removed', origLen - content.length, 'chars');
    totalFixed++;
  }
}
console.log('\nTotal files fixed:', totalFixed);

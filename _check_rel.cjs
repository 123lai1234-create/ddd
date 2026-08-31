const fs = require('fs');

const stockDir = 'D:/project/astro/public/stock/';
const files = fs.readdirSync(stockDir).filter(f => f.endsWith('.html'));

const remaining = [];
for (const file of files) {
  const content = fs.readFileSync(stockDir + file, 'utf8');
  const matches = [...content.matchAll(/href="([^"]+\.html)"/g)];
  const rel = matches.filter(m => !m[1].startsWith('/') && !m[1].startsWith('http') && !m[1].startsWith('#'));
  if (rel.length) {
    remaining.push({ file, links: rel.map(m => m[1]) });
  }
}

if (remaining.length === 0) {
  console.log('ALL CLEAN - no relative HTML links remain');
} else {
  console.log('Files still with relative links:');
  for (const r of remaining) {
    console.log(r.file + ':', r.links.join(', '));
  }
}

const fs = require('fs');

const stockPages = fs.readdirSync('D:/project/astro/public/stock').filter(f => f.endsWith('.html'));
const bad = [];

for (const page of stockPages) {
  const file = 'D:/project/astro/public/stock/' + page;
  const c = fs.readFileSync(file, 'utf8');
  const matches = [...c.matchAll(/href=["']([^"']+\.html)["']/g)];
  const rel = matches.filter(m => !m[1].startsWith('/') && !m[1].startsWith('http') && !m[1].startsWith('#'));
  if (rel.length) {
    bad.push({ page, links: rel.map(m => m[1]) });
  }
}

console.log('Pages with relative HTML links:');
for (const b of bad) {
  console.log(b.page + ':', b.links.join(', '));
}

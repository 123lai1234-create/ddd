const fs = require('fs');
const path = require('path');

const stockDir = 'D:/project/astro/public/stock/';
const htmls = fs.readdirSync(stockDir).filter(f => f.endsWith('.html'));

// 1. Audit: all <a href> links in all stock pages — check if targets exist
console.log('=== AUDIT 1: Broken internal links ===');
const allLinks = [];
for (const file of htmls) {
  const content = fs.readFileSync(path.join(stockDir, file), 'utf8');
  const matches = [...content.matchAll(/href="([^"]+)"/g)];
  for (const m of matches) {
    const href = m[1];
    // Only check relative /stock/ links
    if (href.startsWith('/stock/') && !href.includes('http')) {
      const target = path.join(stockDir, href.replace('/stock/', ''));
      const exists = fs.existsSync(target);
      if (!exists) {
        allLinks.push({ from: file, href, status: 'BROKEN' });
      } else {
        allLinks.push({ from: file, href, status: 'ok' });
      }
    }
  }
}
const broken = allLinks.filter(l => l.status === 'BROKEN');
if (broken.length) {
  console.log('FOUND BROKEN LINKS:');
  for (const l of broken) console.log(`  ${l.from}: ${l.href}`);
} else {
  console.log('No broken internal links found.');
}

// 2. Audit: all buttons without onclick or href
console.log('\n=== AUDIT 2: Buttons without click handlers ===');
for (const file of htmls) {
  const content = fs.readFileSync(path.join(stockDir, file), 'utf8');
  const buttons = [...content.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)];
  for (const m of buttons) {
    const tagStart = m[0].split('>')[0];
    const text = m[1].trim().slice(0, 30);
    if (!tagStart.includes('onclick') && !tagStart.includes('type="submit"')) {
      console.log(`  ${file}: <button>${text}</button> (NO ONCLICK)`);
    }
  }
}

// 3. Check fetch URLs that might be wrong
console.log('\n=== AUDIT 3: fetch() calls without error handling ===');
for (const file of htmls) {
  const content = fs.readFileSync(path.join(stockDir, file), 'utf8');
  const fetches = [...content.matchAll(/fetch\(([^)]+)\)/g)];
  for (const m of fetches) {
    if (!m[0].includes('.catch') && !m[0].includes('await')) {
      console.log(`  ${file}: ${m[0].slice(0,80)} (no error handling)`);
    }
  }
}

console.log('\nDone.');
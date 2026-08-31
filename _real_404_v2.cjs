const fs = require('fs');
const path = require('path');
const https = require('https');

const stockDir = 'D:/project/astro/public/stock/';
const files = fs.readdirSync(stockDir).filter(f => f.endsWith('.html'));

// Better detection: find lines that look like HTML href attrs (not JS strings)
const linksToCheck = [];
for (const file of files) {
  const content = fs.readFileSync(path.join(stockDir, file), 'utf8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Only consider href= inside actual HTML tags (not inside JS string concatenation)
    // HTML href pattern: <a ... href="..." ...> or <link href="...">
    // Skip lines that have JS template literal markers
    if (line.includes('${') || line.includes('\\n')) continue;
    // Find all href="..." or href='...'
    const matches = [...line.matchAll(/href=["']([^"'\s]+)["']/g)];
    for (const m of matches) {
      const href = m[1];
      // Skip URL templates, JS placeholders, dynamic strings
      if (href.includes('${') || href.includes('+') || href.includes('(')) continue;
      // Skip javascript: and mailto:
      if (href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
      // Skip external
      if (href.startsWith('http') || href.startsWith('//')) continue;
      // Skip anchors
      if (href.startsWith('#')) continue;

      let target = href;
      if (!href.startsWith('/')) {
        target = '/stock/' + href;
      } else if (href.startsWith('/stock/')) {
        target = href;
      }
      target = target.split('?')[0];

      linksToCheck.push({ from: file, line: i + 1, href, target });
    }
  }
}

function fetchStatus(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search, method: 'HEAD', timeout: 4000,
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location }));
    });
    req.on('error', () => resolve({ status: 0, location: null }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, location: null }); });
    req.end();
  });
}

(async () => {
  console.log(`Found ${linksToCheck.length} literal HTML href links\n`);

  // Dedup
  const targetMap = new Map();
  for (const l of linksToCheck) {
    if (!targetMap.has(l.target)) targetMap.set(l.target, []);
    targetMap.get(l.target).push(`${l.from}:${l.line} (${l.href})`);
  }

  const results = [];
  let n = 0;
  for (const [target, sources] of targetMap) {
    n++;
    const r = await fetchStatus('https://donttalk.vercel.app' + target);
    let finalStatus = r.status;
    if (r.status === 308 && r.location) {
      const r2 = await fetchStatus('https://donttalk.vercel.app' + r.location);
      finalStatus = r2.status;
    }
    results.push({ target, sources, status: finalStatus });
  }

  const bad = results.filter(r => r.status !== 200);
  const ok = results.filter(r => r.status === 200);

  console.log(`✓ ${ok.length} OK, ✗ ${bad.length} broken\n`);
  if (bad.length) {
    console.log('BROKEN LINKS:');
    for (const b of bad) {
      console.log(`\n  [${b.status}] ${b.target}`);
      for (const src of [...new Set(b.sources)].slice(0, 8)) {
        console.log(`     ← ${src}`);
      }
    }
  } else {
    console.log('All literal HTML links resolve correctly!');
  }
})();
const fs = require('fs');
const path = require('path');
const https = require('https');

const stockDir = 'D:/project/astro/public/stock/';
const files = fs.readdirSync(stockDir).filter(f => f.endsWith('.html'));

// Find all literal href= values that don't look like template literals
const linksToCheck = [];
for (const file of files) {
  const content = fs.readFileSync(path.join(stockDir, file), 'utf8');
  // Match href="..." where the content doesn't contain $ or { (template literal markers)
  const matches = [...content.matchAll(/href="([^"$\n]+)"/g)];
  for (const m of matches) {
    const href = m[1];
    if (!href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('javascript:')) {
      let target = href;
      // Make absolute
      if (!href.startsWith('/')) {
        target = '/stock/' + href;
      } else if (href.startsWith('/stock/')) {
        target = href;
      } else {
        target = href; // already absolute path
      }
      // Normalize ./ and ../ paths (simple)
      target = target.replace(/\/\.\//g, '/');
      target = target.split('?')[0];
      linksToCheck.push({ from: file, href, target });
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
  console.log(`Found ${linksToCheck.length} literal href links to check\n`);

  // Dedup targets, keep list of sources
  const targetMap = new Map();
  for (const l of linksToCheck) {
    if (!targetMap.has(l.target)) targetMap.set(l.target, []);
    targetMap.get(l.target).push(l.from);
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
      console.log(`  [${b.status}] ${b.target}`);
      for (const src of [...new Set(b.sources)].slice(0, 8)) {
        console.log(`     ← ${src}`);
      }
    }
  } else {
    console.log('All literal links resolve correctly!');
  }
})();
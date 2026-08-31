const fs = require('fs');
const path = require('path');
const https = require('https');

const stockDir = 'D:/project/astro/public/stock/';
const files = fs.readdirSync(stockDir).filter(f => f.endsWith('.html'));

// Find ALL href values (both relative + absolute) - skip JS template literals
const allLinks = new Set();
const linkSources = new Map();

for (const file of files) {
  const content = fs.readFileSync(path.join(stockDir, file), 'utf8');
  // Match href="..." but skip those containing ${ or concatenation
  const matches = [...content.matchAll(/href="([^"\s]+)"/g)];
  for (const m of matches) {
    const href = m[1];
    // Filter out template literals and dynamic JS strings
    if (href.includes('${') || href.includes('+')) continue;
    // Skip external and special
    if (href.startsWith('http') || href.startsWith('//') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('#')) continue;

    let target;
    if (href.startsWith('/')) {
      // Absolute path - normalize
      if (href.startsWith('/stock/')) {
        target = href.split('?')[0];
      } else if (href === '/' || href.startsWith('/stock')) {
        // page-level root like /etf
        target = href.split('?')[0];
      } else {
        target = href.split('?')[0];
      }
    } else {
      // Relative path - resolve from /stock/
      target = '/stock/' + href.split('?')[0];
    }

    allLinks.add(target);
    if (!linkSources.has(target)) linkSources.set(target, []);
    linkSources.get(target).push(`${file} (${href}")`);
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
  console.log(`Checking ${allLinks.size} unique links from ${files.length} files\n`);

  const results = [];
  let n = 0;
  for (const target of allLinks) {
    n++;
    const r = await fetchStatus('https://donttalk.vercel.app' + target);
    let finalStatus = r.status;
    if (r.status === 308 && r.location) {
      const r2 = await fetchStatus('https://donttalk.vercel.app' + r.location);
      finalStatus = r2.status;
    }
    results.push({ target, status: finalStatus });
  }

  const bad = results.filter(r => r.status !== 200);
  const ok = results.filter(r => r.status === 200);

  console.log(`✓ ${ok.length} OK, ✗ ${bad.length} broken`);
  if (bad.length) {
    console.log('\nBROKEN LINKS:');
    for (const b of bad) {
      console.log(`  [${b.status}] ${b.target}`);
      for (const src of (linkSources.get(b.target) || []).slice(0, 5)) {
        console.log(`     ← ${src}`);
      }
    }
  }
})();
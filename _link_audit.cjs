const https = require('https');
const fs = require('fs');
const path = require('path');

const PAGES = [
  'dashboard', 'heatmap', 'ranking', 'ai-warroom', 'btc', 'futures',
  'buyback', 'line-push', 'index', 'sitemap', 'currency',
  'signal-filter', 'stock-damo-filter', 'etf-filter',
  'etf', 'uptrend-watch', 'sold-too-early',
  'revenue', 'conference', 'macro', 'ai-capex',
  'price-compare', 'rebalance',
  'etf_holdings', 'etf_holdings_pivot', 'etf_holdings_tracker',
  'marker_history', 'warming', 'exdiv',
  'backtest', 'admin_logs'
];

// Collect all internal links from all stock pages
const stockDir = 'D:/project/astro/public/stock/';
const linkMap = new Map(); // page -> [{href, text}]

for (const file of PAGES) {
  try {
    const content = fs.readFileSync(path.join(stockDir, file + '.html'), 'utf8');
    const links = [...content.matchAll(/href="([^"]+)"/g)].map(m => m[1])
      .filter(h => !h.startsWith('http') && !h.startsWith('#') && !h.startsWith('mailto:'));
    linkMap.set(file, links);
  } catch (e) {}
}

function fetchStatus(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'HEAD',
      timeout: 4000,
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
  // Collect unique target links (deduplicated)
  const targetSet = new Map(); // target -> [from pages]
  for (const [from, links] of linkMap) {
    for (const link of links) {
      let target;
      if (link.startsWith('/stock/')) {
        target = link.split('?')[0];
      } else if (link.endsWith('.html') && !link.startsWith('/')) {
        target = '/stock/' + link.split('?')[0];
      } else if (!link.startsWith('/')) {
        target = '/stock/' + link.split('?')[0];
      } else if (link.startsWith('/')) {
        target = link.split('?')[0];
      } else {
        target = link;
      }
      if (!targetSet.has(target)) targetSet.set(target, []);
      targetSet.get(target).push({ from, link });
    }
  }

  console.log(`Checking ${targetSet.size} unique targets from ${PAGES.length} pages...\n`);
  const results = [];
  let i = 0;
  for (const [target, sources] of targetSet) {
    i++;
    if (i % 20 === 0) console.log(`  ...checked ${i}/${targetSet.size}`);
    const url = `https://donttalk.vercel.app${target}`;
    let r = await fetchStatus(url);
    // 308 redirect is OK (cleanUrls)
    if (r.status === 308 && r.location) {
      const r2 = await fetchStatus('https://donttalk.vercel.app' + r.location);
      r = r2;
    }
    results.push({ target, sources, status: r.status });
  }

  const bad = results.filter(r => r.status !== 200);
  const ok = results.filter(r => r.status === 200);
  console.log(`✓ ${ok.length} OK, ✗ ${bad.length} broken\n`);

  if (bad.length) {
    console.log('BROKEN LINKS:');
    for (const b of bad) {
      console.log(`  [${b.status}] ${b.target}`);
      for (const src of b.sources.slice(0, 5)) {
        console.log(`     ← ${src.from}.html: ${src.link}`);
      }
      if (b.sources.length > 5) console.log(`     ... and ${b.sources.length - 5} more`);
    }
  } else {
    console.log('All links OK!');
  }

  console.log('\nAll unique targets checked:');
  for (const r of results.sort((a,b) => a.target.localeCompare(b.target))) {
    const icon = (r.status === 200) ? '✓' : '✗';
    console.log(`  ${icon} [${r.status}] ${r.target}`);
  }
})();
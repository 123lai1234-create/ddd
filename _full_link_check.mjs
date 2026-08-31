const BASE = 'https://donttalk.vercel.app';

async function status(url, method = 'GET') {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { method, redirect: 'follow', signal: ctrl.signal });
    clearTimeout(tid);
    return r.status;
  } catch {
    clearTimeout(tid);
    return 'ERR';
  }
}

async function getLinks(html, baseUrl) {
  const links = new Set();
  // href/src
  for (const m of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
    let u = m[1];
    if (!u || u.startsWith('data:') || u.startsWith('javascript:') || u.startsWith('#') || u.startsWith('mailto:') || u.includes('${')) continue;
    if (u.startsWith('http')) links.add(u);
    else if (u.startsWith('//')) links.add('https:' + u);
    else if (u.startsWith('/')) links.add(BASE + u);
    else links.add(baseUrl + '/' + u);
  }
  // fetch() URLs
  for (const m of html.matchAll(/fetch\(\s*["'`]([^"'`]+)["'`]/g)) {
    let u = m[1];
    if (u.includes('${') || u.includes("'+")) continue;
    if (u.startsWith('/')) links.add(BASE + u);
    else if (u.startsWith('http')) links.add(u);
  }
  // inline style background-image etc
  for (const m of html.matchAll(/url\(\s*["']?([^"')]+)["']?\)/g)) {
    let u = m[1];
    if (u.startsWith('data:') || !u) continue;
    if (u.startsWith('http')) links.add(u);
    else if (u.startsWith('/')) links.add(BASE + u);
  }
  return links;
}

// All site pages to scan
const pages = [
  '/',
  '/blog/',
  '/blog/genetic-algorithm-trading/',
  '/blog/esm2-protein-language-model/',
  '/blog/ngs-sequencing-design/',
  '/stock',
  '/stock/dashboard',
  '/stock/etf',
  '/stock/heatmap',
  '/stock/signal-filter',
  '/stock/backtest',
  '/stock/warming',
  '/stock/ai-capex',
  '/stock/macro',
  '/stock/exdiv',
  '/privacy/',
  '/terms/',
  '/about',
  '/works',
  '/music',
  '/video-gen',
  '/xian-godot',
  '/games/xian-godot',
  '/about_me',
  '/gene_ai',
  '/ngs',
  '/report',
  '/thesis',
  '/protein-mpnn',
  '/stem-cell',
  '/interview',
  '/firmware',
  '/diving',
  '/ai-demo',
  '/ingest',
  '/interactive-showcase',
];

const allBad = [];
const checked = new Map();

for (const path of pages) {
  const url = BASE + path;
  const r = await status(url);
  if (r >= 400) {
    allBad.push({ page: path, link: url, status: r, type: 'PAGE' });
    continue;
  }
  let html;
  try {
    html = await fetch(url).then(x => x.text());
  } catch {
    continue;
  }
  const links = await getLinks(html, url);
  // dedupe and probe
  for (const link of links) {
    if (checked.has(link)) continue;
    checked.set(link, true);
    const s = await status(link);
    if (s >= 400) {
      allBad.push({ page: path, link, status: s, type: 'RESOURCE' });
    }
  }
}

// Categorize
const byType = {};
for (const b of allBad) {
  if (!byType[b.type]) byType[b.type] = [];
  byType[b.type].push(b);
}

console.log('=== TOTAL 404/ERRORS:', allBad.length, '===\n');

if (byType.PAGE) {
  console.log('=== PAGE 404s ===');
  for (const b of byType.PAGE) console.log(`  ${b.status} ${b.link}`);
  console.log('');
}

if (byType.RESOURCE) {
  // categorize by reason
  const external = byType.RESOURCE.filter(b => b.link.startsWith('http') && !b.link.includes('donttalk.vercel.app'));
  const internal = byType.RESOURCE.filter(b => b.link.includes('donttalk.vercel.app'));

  console.log('=== INTERNAL RESOURCE 404s ===');
  for (const b of internal) console.log(`  ${b.status}  ${b.link}`);
  console.log('');

  console.log('=== EXTERNAL RESOURCE ERRORS ===');
  for (const b of external) console.log(`  ${b.status}  ${b.link}`);
}

process.exit(0);

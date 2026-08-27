const BASE = 'https://donttalk.vercel.app';

async function status(url) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal });
    clearTimeout(tid);
    return r.status;
  } catch (e) {
    clearTimeout(tid);
    return 'ERR:' + (e.name || e.message);
  }
}

const r = await fetch(BASE + '/stock-app');
const html = await r.text();
console.log('page status:', r.status, 'len:', html.length);

const urls = new Set();
for (const m of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
  const u = m[1];
  if (!u || u.startsWith('data:') || u.startsWith('javascript:') || u.startsWith('#') || u.startsWith('mailto:')) continue;
  if (u.startsWith('http')) urls.add(u);
  else if (u.startsWith('/')) urls.add(BASE + u);
  else urls.add(BASE + '/stock-app/' + u);
}
const apis = [
  '/api/stocks',
  '/api/stock/2330?days=120&strategy=original',
  '/api/stock/2330/events?days=120',
  '/api/stock/2330/news?days=120',
  '/api/stock/intro/2330',
  '/api/heatmap?scope=watchlist',
  '/api/market_gaps?lookback=60&min_gap=0.3',
  '/api/intraday_check/2330',
  '/api/position_history?days=120',
];
for (const a of apis) urls.add(BASE + a);

const all = [...urls];
console.log('=== probing', all.length, 'URLs (concurrency 6, timeout 12s) ===');
const results = [];
let idx = 0;
async function worker() {
  while (idx < all.length) {
    const u = all[idx++];
    const s = await status(u);
    results.push({ s, u });
    const line = String(s).padEnd(14) + u.replace(BASE, '');
    console.log(line);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log('=== done ===');

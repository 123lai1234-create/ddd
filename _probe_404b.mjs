const BASE = 'https://donttalk.vercel.app';

async function status(url) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 10000);
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

// extract fetch('...') / fetch("...") URLs from inline JS (absolute or /api paths)
const fetchUrls = new Set();
for (const m of html.matchAll(/fetch\(\s*["'`]([^"'`]+)["'`]/g)) {
  const u = m[1];
  if (u.startsWith('/')) fetchUrls.add(BASE + u);
  else if (u.startsWith('http')) fetchUrls.add(u);
  else if (u.startsWith('${')) continue;
}
// also extract dynamic '/api/stock/'+code style patterns
for (const m of html.matchAll(/["'`](\/api\/[a-zA-Z0-9_\/\-]+)["'`]/g)) {
  const u = m[1];
  if (u.includes('${') || u.includes('+')) continue;
  fetchUrls.add(BASE + u);
}

console.log('=== actual fetch() URLs in deployed page:', fetchUrls.size, '===');
const results = [];
for (const u of fetchUrls) {
  const s = await status(u);
  results.push({ s, u });
}
for (const { s, u } of results.sort((a, b) => (typeof a.s === 'number' ? a.s : 999) - (typeof b.s === 'number' ? b.s : 999))) {
  console.log(String(s).padEnd(10), u.replace(BASE, ''));
}

// verify the two correct endpoints explicitly
for (const p of ['/api/news/2330', '/api/stock/2330/intro']) {
  const s = await status(BASE + p);
  console.log(String(s).padEnd(10), p, '<- explicit check');
}

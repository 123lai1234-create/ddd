// Check production after fresh deploy
const paths = [
  'stock-app', 'stock-app/index.html', 'stock-app/dashboard.html', 'stock-app/heatmap.html',
  'api/stock/2330', 'api/stock/2330/intro', 'api/stock/2330/etf_membership', 'api/stock/2330/events?days=120',
  'api/heatmap'
];
for (const p of paths) {
  try {
    const r = await fetch('https://donttalk.vercel.app/' + p, { method: 'GET', signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    console.log(p, r.status, t.slice(0, 100));
  } catch (e) { console.log(p, 'ERR', e.message); }
}

const bust = Date.now();
const r = await fetch(`https://donttalk.vercel.app/api/heatmap?bust=${bust}`, {
  cache: 'no-store',
  headers: { 'Cache-Control': 'no-cache' }
});
const d = await r.json();
console.log('cache:', r.headers.get('x-vercel-cache'));
console.log('x-vercel-id:', r.headers.get('x-vercel-id'));
console.log('first stock keys:', Object.keys(d.stocks[0]));
console.log('first stock:', JSON.stringify(d.stocks[0], null, 2));
console.log('total stocks:', d.stocks.length, 'with change_pct:', d.stocks.filter(s => s.change_pct !== undefined).length);

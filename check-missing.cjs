// Check each watchlist stock for market data, slow (1s delay) to avoid rate limit
const codes = process.argv.slice(2);
if (codes.length === 0) { console.log('Usage: node check-missing.cjs <code1> <code2> ...'); process.exit(1); }
const RAILWAY = 'https://api-server-production-676d.up.railway.app';

async function checkOne(code) {
  try {
    const r = await fetch(RAILWAY + '/api/stock/' + code + '?days=5&strategy=original', { cache: 'no-store' });
    const t = await r.text();
    if (t.includes('No data found') || t.includes('404')) return { code, status: 'MISSING' };
    if (t.startsWith('Cannot GET')) return { code, status: 'ENDPOINT_404' };
    if (t.includes('error')) return { code, status: 'ERR', body: t.substring(0, 100) };
    const j = JSON.parse(t);
    const last = j.candles && j.candles[j.candles.length - 1];
    return { code, status: 'OK', lastClose: last?.close, lastDate: last?.time };
  } catch (e) { return { code, status: 'THROW', err: e.message }; }
}

(async () => {
  const results = [];
  for (const c of codes) {
    const r = await checkOne(c);
    results.push(r);
    process.stdout.write(r.status + ' ' + c + (r.lastClose ? ' close=' + r.lastClose : '') + '\n');
    await new Promise(r => setTimeout(r, 1500));
  }
  const missing = results.filter(r => r.status === 'MISSING' || r.status === 'ENDPOINT_404');
  console.log('\n--- Summary ---');
  console.log('Total:', results.length, 'Missing:', missing.length);
  console.log('Missing codes:', missing.map(r => r.code).join(','));
})();

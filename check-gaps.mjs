// System audit: what's still missing
const base = 'https://donttalk.vercel.app';
const checks = [];

// 1. Crontab — what does Vercel actually run? Hobby plan limit
const crons = (await fetch('https://donttalk.vercel.app/api/admin/logs/recent').catch(() => null));

// 2. heatmap 60 stocks content depth
const hm = await (await fetch(base + '/api/heatmap')).json();

// 3. find 0-hits or empty pages
const pages = [
  ['/stock-app/heatmap.html',     hm],
  ['/api/sold_too_early',         await (await fetch(base + '/api/sold_too_early')).json()],
  ['/api/etf_signal_filter',      await (await fetch(base + '/api/etf_signal_filter')).json()],
  ['/api/etf_filter',             await (await fetch(base + '/api/etf_filter')).json()],
  ['/api/etf_diff?code=0050',     await (await fetch(base + '/api/etf_diff?code=0050')).json()],
  ['/api/warming_zone_scan',      await (await fetch(base + '/api/warming_zone_scan')).json()],
  ['/api/marker_history',         await (await fetch(base + '/api/marker_history')).json()],
  ['/api/signal_filter',          await (await fetch(base + '/api/signal_filter')).json()],
  ['/api/strategy_signals',       await (await fetch(base + '/api/strategy_signals')).json()],
  ['/api/stock_damo_filter',      await (await fetch(base + '/api/stock_damo_filter')).json()],
  ['/api/uptrend_watch',          await (await fetch(base + '/api/uptrend_watch')).json()],
  ['/api/rebalance',              await (await fetch(base + '/api/rebalance')).json()],
];

console.log('=== Page count audit ===');
for (const [path, j] of pages) {
  const c = j?.count ?? j?.items?.length ?? j?.stocks?.length ?? '?';
  const note = j?.note || j?.message || '';
  console.log(`${path.padEnd(45)}  count=${c}  ${note ? '['+note+']' : ''}`);
}

console.log('\n=== Heatmap industries ===');
for (const i of hm.industries) {
  console.log(`  ${i.label.padEnd(20)}  count=${i.count}  cap=${(i.market_cap/1e12).toFixed(2)}T`);
}

console.log('\n=== Crontab in vercel.json ===');
const fs = await import('fs');
const vj = JSON.parse(fs.readFileSync('D:/project/vercel.json', 'utf-8'));
console.log(`Total crons: ${vj.crons.length}`);
for (const c of vj.crons) console.log(`  ${c.schedule.padEnd(18)}  ${c.path}`);

console.log('\n=== Synth vs real data ===');
const fs2 = await import('fs');
const api = fs2.readFileSync('D:/project/api/[[...slug]].mjs', 'utf-8');
const synthCount = (api.match(/source=['"]synth/g) || []).length;
const finmindCount = (api.match(/source=['"]finmind/g) || []).length;
console.log(`  synth references: ${synthCount}`);
console.log(`  finmind references: ${finmindCount}`);

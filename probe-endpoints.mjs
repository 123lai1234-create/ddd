// Verify production edge function shape mismatch
const bust = Date.now();
console.log('=== /api/stocks ===');
const r1 = await fetch(`https://donttalk.vercel.app/api/stocks?bust=${bust}`, { cache: 'no-store' });
const d1 = await r1.json();
console.log('  isArray:', Array.isArray(d1));
console.log('  len:', d1.length || d1.stocks?.length);
console.log('  keys top:', Array.isArray(d1) ? 'array' : Object.keys(d1));
console.log('  first:', JSON.stringify(Array.isArray(d1) ? d1[0] : d1.stocks?.[0] || d1));

console.log('\n=== /api/heatmap ===');
const r2 = await fetch(`https://donttalk.vercel.app/api/heatmap?bust=${bust}`, { cache: 'no-store' });
const d2 = await r2.json();
console.log('  ok:', d2.ok, 'as_of:', d2.as_of, 'count:', d2.count, 'stocks.len:', d2.stocks?.length);
console.log('  first stock keys:', Object.keys(d2.stocks?.[0] || {}));
console.log('  has change_pct:', d2.stocks?.[0]?.change_pct !== undefined);
console.log('  has chg_1d:', d2.stocks?.[0]?.chg_1d !== undefined);
console.log('  first chg_1d:', d2.stocks?.[0]?.chg_1d);

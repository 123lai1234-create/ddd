const r = await fetch('https://donttalk.vercel.app/api/heatmap');
const j = await r.json();
console.log('Total:', j.stocks.length);
const short = [];
for (const s of j.stocks) {
  if (!s.chg_5d || !s.chg_60d) short.push(s.code + ' chg_5d=' + s.chg_5d + ' chg_60d=' + s.chg_60d);
}
if (short.length) {
  console.log('Missing 5d/60d:');
  for (const s of short) console.log(' ', s);
} else {
  console.log('All 60 stocks have full 5d/60d chg');
}
console.log('\nIndustries:');
for (const i of j.industries) {
  console.log(`  ${i.label}  count=${i.count}  chg_5d=${i.chg_5d}  chg_20d=${i.chg_20d}  chg_60d=${i.chg_60d}`);
}

import fs from 'fs';

function scan(name, arr) {
  if (!Array.isArray(arr)) { console.log(`  ${name}: NOT AN ARRAY (${typeof arr})`); return; }
  const bad = [];
  const times = new Map();
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i];
    const t = d && d.time;
    const tNum = typeof t === 'number' ? t : (typeof t === 'string' ? NaN : NaN);
    if (t == null || Number.isNaN(tNum) || (typeof t === 'string' && !t)) bad.push(`idx ${i}: time=${JSON.stringify(t)}`);
    if (d && typeof tNum === 'number' && !Number.isNaN(tNum)) {
      if (times.has(tNum)) bad.push(`idx ${i}: DUPLICATE time ${tNum} (first at idx ${times.get(tNum)})`);
      else times.set(tNum, i);
    }
    if (d && 'open' in d && [d.open, d.high, d.low, d.close].some(v => v == null || Number.isNaN(Number(v)))) {
      bad.push(`idx ${i}: bad OHLC ${JSON.stringify({ o: d.open, h: d.high, l: d.low, c: d.close })}`);
    }
    if (d && 'value' in d && (d.value == null || Number.isNaN(Number(d.value)))) {
      bad.push(`idx ${i}: bad value ${JSON.stringify(d.value)}`);
    }
    if (d && 'volume' in d && (d.volume == null || Number.isNaN(Number(d.volume)))) {
      bad.push(`idx ${i}: bad volume ${JSON.stringify(d.volume)}`);
    }
  }
  // ordering check
  let orderBad = 0;
  const nums = arr.map(d => (d && typeof d.time === 'number' ? d.time : NaN));
  for (let i = 1; i < nums.length; i++) if (!Number.isNaN(nums[i - 1]) && !Number.isNaN(nums[i]) && nums[i] <= nums[i - 1]) orderBad++;
  console.log(`  ${name}: n=${arr.length} bad=${bad.length}${bad.length ? ' :: ' + bad.slice(0, 8).join(' | ') : ''} orderViolations=${orderBad}`);
}

async function main() {
  const codes = process.argv.slice(2);
  for (const code of codes) {
    console.log(`\n===== /api/stock/${code}?days=120&strategy=original =====`);
    try {
      const r = await fetch(`https://donttalk.vercel.app/api/stock/${code}?days=120&strategy=original`);
      const j = await r.json();
      console.log('  ok:', j.ok, 'source:', j.source, 'count:', j.count, 'keys:', Object.keys(j).join(','));
      scan('candles', j.candles);
      scan('volumes', j.volumes);
      if (j.ma) for (const k of Object.keys(j.ma)) scan('ma.' + k, j.ma[k]);
      scan('channelHigh', j.channelHigh);
      scan('channelLow', j.channelLow);
      scan('supportLine', j.supportLine);
      scan('markers', j.markers);
      if (j.macd) { scan('macd.histogram', j.macd.histogram); scan('macd.macd_line', j.macd.macd_line); scan('macd.signal_line', j.macd.signal_line); }
      const lt = j.latest;
      if (lt) {
        const badLatest = Object.entries(lt).filter(([k, v]) => v == null && ['close', 'ma5', 'ma10', 'ma20', 'ma60', 'ma240'].includes(k));
        if (badLatest.length) console.log('  latest nulls:', JSON.stringify(Object.fromEntries(badLatest)));
      }
      if (j.tradePlan) console.log('  tradePlan:', JSON.stringify(j.tradePlan));
      if (j.rollingVolLow) console.log('  rollingVolLow:', JSON.stringify(j.rollingVolLow));
    } catch (e) { console.log('  ERROR:', e.message); }
  }
}
main();

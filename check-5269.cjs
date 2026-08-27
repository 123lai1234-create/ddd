// Check 5269.TW vs 5269.TWO on Yahoo
const http = require('http');
const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

(async () => {
  const a = await get('https://query1.finance.yahoo.com/v8/finance/chart/5269.TW?range=1y&interval=1d');
  const m1 = a.chart && a.chart.result && a.chart.result[0] && a.chart.result[0].meta;
  console.log('5269.TW (listed):', m1 && m1.symbol, 'price:', m1 && m1.regularMarketPrice, 'bars:', a.chart?.result?.[0]?.timestamp?.length);

  const b = await get('https://query1.finance.yahoo.com/v8/finance/chart/5269.TWO?range=1y&interval=1d');
  const m2 = b.chart && b.chart.result && b.chart.result[0] && b.chart.result[0].meta;
  console.log('5269.TWO (OTC):', m2 ? m2.symbol : 'NO result', 'err:', b.chart && b.chart.error);

  // Also check 5347 (real .TWO) to confirm the loader works for legit OTC
  const c = await get('https://query1.finance.yahoo.com/v8/finance/chart/5347.TWO?range=1y&interval=1d');
  const m3 = c.chart && c.chart.result && c.chart.result[0] && c.chart.result[0].meta;
  console.log('5347.TWO (real OTC):', m3 ? m3.symbol : 'NO', 'bars:', c.chart?.result?.[0]?.timestamp?.length);
})();

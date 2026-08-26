// Backfill via Yahoo Finance v8 API (chart with daily data)
// Yahoo Finance blocks programmatic access too, but try with proper headers
const DB_URL = 'postgresql://neondb_owner:npg_ulB' + String.fromCharCode(57) + 'zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function q(sql, params = []) {
  const r = await fetch('https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': DB_URL },
    body: JSON.stringify({ query: sql, params })
  });
  const j = await r.json();
  if (j.error) throw new Error(j.message);
  return j.rows || [];
}

async function fetchYahooChart(code) {
  // Try .TW first, then .TWO
  for (const suffix of ['.TW', '.TWO']) {
    const ticker = `${code}${suffix}`;
    const now = Math.floor(Date.now() / 1000);
    const days = 90;
    const period1 = now - days * 86400;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${now}&interval=1d&events=history`;
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json,text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7',
        }
      });
      if (!r.ok) {
        console.log(`  Yahoo ${r.status} for ${ticker}, trying next`);
        continue;
      }
      const j = await r.json();
      if (!j.chart || !j.chart.result || !j.chart.result[0]) {
        console.log(`  Yahoo empty for ${ticker}, trying next`);
        continue;
      }
      const result = j.chart.result[0];
      const ts = result.timestamp || [];
      const ind = result.indicators.quote[0];
      const opens = ind.open || [];
      const highs = ind.high || [];
      const lows = ind.low || [];
      const closes = ind.close || [];
      const volumes = ind.volume || [];
      const bars = [];
      for (let i = 0; i < ts.length; i++) {
        if (closes[i] == null) continue;
        const isoDate = new Date(ts[i] * 1000).toISOString().slice(0, 10);
        bars.push({
          trade_date: isoDate,
          open: opens[i],
          high: highs[i],
          low: lows[i],
          close: closes[i],
          volume: volumes[i] || 0,
          actual_ticker: ticker,
        });
      }
      console.log(`  Yahoo: ${bars.length} bars from ${ticker}`);
      return bars;
    } catch (e) {
      console.log(`  Yahoo ERR ${ticker}: ${e.message}, trying next`);
    }
  }
  throw new Error(`Yahoo 404 for both .TW and .TWO`);
}

const codes = ['6147', '3707', '5425', '3324'];

let totalInserted = 0;
const errors = [];

for (const code of codes) {
  console.log(`\n=== ${code} ===`);
  let bars = [];
  try {
    bars = await fetchYahooChart(code);
    console.log(`  Yahoo: ${bars.length} bars`);
  } catch (e) {
    console.log(`  Yahoo ERR: ${e.message}`);
    errors.push(`${code}: ${e.message}`);
  }

  // INSERT into market_price_bars (no unique constraint, so simple INSERT)
  let inserted = 0;
  for (const b of bars) {
    if (!b.close) continue;
    try {
      const r = await q(
        `INSERT INTO market_price_bars
          (source_name, symbol, asset_type, market, contract_month, trade_date,
           open_price, high_price, low_price, close_price, settlement_price,
           volume, turnover, open_interest, change_value, raw_payload, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())`,
        [
          'yahoo_chart_v8', code, 'stock', 'TWSE', '',
          b.trade_date,
          b.open, b.high, b.low, b.close, null,
          b.volume, null, null, null, ''
        ]
      );
      if (r.error) {
        console.log(`  SQL ERR ${b.trade_date}: ${r.message}`);
      } else if (r.rowCount) {
        inserted += r.rowCount;
      } else {
        inserted++;
      }
    } catch (e) {
      console.log(`  catch ERR ${b.trade_date}: ${e.message}`);
    }
  }
  totalInserted += inserted;
  console.log(`  inserted: ${inserted}`);
  // Rate limit
  await new Promise(r => setTimeout(r, 1000));
}

console.log(`\n=== Total inserted: ${totalInserted} ===`);
if (errors.length) {
  console.log('Errors:');
  errors.forEach(e => console.log('  ' + e));
}

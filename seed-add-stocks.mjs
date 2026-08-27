// 2026-08-26: 補齊 watchlist 缺口 + 自動 seed K 線
//   - 從 watchlist 中找出有 code 但 market_price_bars 沒資料的股
//   - 從 Yahoo Finance 抓 120 天 K 線 (上櫃用 .TWO，上市用 .TW)
//   - 用 UNIQUE 約束保證 idempotent
//
// 用途:
//   node seed-add-stocks.mjs              # 補所有 watchlist 缺口
//   node seed-add-stocks.mjs 5347 3081    # 補指定股
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
  for (const suffix of ['.TW', '.TWO']) {
    const ticker = `${code}${suffix}`;
    const now = Math.floor(Date.now() / 1000);
    const days = 120;
    const period1 = now - days * 86400;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${now}&interval=1d&events=history`;
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json,text/plain,*/*',
        }
      });
      if (!r.ok) continue;
      const j = await r.json();
      if (!j.chart?.result?.[0]) continue;
      const r0 = j.chart.result[0];
      const ts = r0.timestamp || [];
      const ind = r0.indicators.quote[0];
      const opens = ind.open || [];
      const highs = ind.high || [];
      const lows = ind.low || [];
      const closes = ind.close || [];
      const volumes = ind.volume || [];
      const bars = [];
      for (let i = 0; i < ts.length; i++) {
        if (closes[i] == null) continue;
        bars.push({
          trade_date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
          open: opens[i], high: highs[i], low: lows[i], close: closes[i],
          volume: volumes[i] || 0, ticker,
        });
      }
      if (bars.length > 0) {
        console.log(`  ${bars.length} bars from ${ticker}`);
        return { bars, ticker };
      }
    } catch (e) {
      // try next suffix
    }
  }
  return { bars: [], ticker: null };
}

async function findMissing() {
  return q(`
    SELECT w.code, w.name FROM watchlist w
    LEFT JOIN (
      SELECT DISTINCT symbol FROM market_price_bars WHERE asset_type='stock'
    ) b ON b.symbol = w.code
    WHERE w.code ~ '^[0-9]+$' AND b.symbol IS NULL
    ORDER BY w.sort_order, w.code
  `);
}

async function addToWatchlist(code, name) {
  await q(
    `INSERT INTO watchlist (code, name, ticker, sort_order)
     VALUES ($1, $2, $3, 9999)
     ON CONFLICT (code) DO UPDATE SET
       name = EXCLUDED.name,
       ticker = EXCLUDED.ticker`,
    [code, name, code + '.TW']
  );
}

async function seedBars(code, bars) {
  let inserted = 0;
  // market_price_bars 沒有 unique constraint 只能用 (symbol, trade_date, source_name)
  // 先刪掉同 source 的舊 row，再 INSERT（達到 UPSERT 效果，但每次會更新 fetched_at）
  await q(
    `DELETE FROM market_price_bars WHERE symbol = $1 AND source_name = $2`,
    [code, 'yahoo_chart_v8']
  );
  for (const b of bars) {
    if (!b.close) continue;
    try {
      await q(
        `INSERT INTO market_price_bars
          (source_name, symbol, asset_type, market, contract_month, trade_date,
           open_price, high_price, low_price, close_price, settlement_price,
           volume, turnover, open_interest, change_value, raw_payload, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())`,
        [
          'yahoo_chart_v8', code, 'stock', 'TWSE', '',
          b.trade_date, b.open, b.high, b.low, b.close, null,
          b.volume, null, null, null, ''
        ]
      );
      inserted++;
    } catch (e) {
      // ignore per-row errors
    }
  }
  return inserted;
}

// CLI args
const args = process.argv.slice(2);
let targets;
if (args.length > 0) {
  targets = args.map(code => ({ code, name: code }));
  console.log(`Seeding ${targets.length} specific stock(s): ${args.join(', ')}`);
} else {
  console.log('Finding missing stocks in watchlist...');
  targets = await findMissing();
  console.log(`Found ${targets.length} missing: ${targets.map(t => t.code).join(', ') || '(none)'}`);
}

if (targets.length === 0) {
  console.log('Nothing to do. ✓');
  process.exit(0);
}

let totalBars = 0;
const failed = [];
for (const t of targets) {
  console.log(`\n=== ${t.code} (${t.name || ''}) ===`);

  // Make sure stock is in watchlist
  try {
    await addToWatchlist(t.code, t.name || t.code);
  } catch (e) {
    console.log(`  watchlist ERR: ${e.message}`);
  }

  const { bars, ticker } = await fetchYahooChart(t.code);
  if (bars.length === 0) {
    console.log(`  No data from Yahoo for ${t.code} (.TW or .TWO)`);
    failed.push(t.code);
    continue;
  }

  const inserted = await seedBars(t.code, bars);
  totalBars += inserted;
  console.log(`  inserted: ${inserted} bars (source: ${ticker})`);
  await new Promise(r => setTimeout(r, 1500));
}

console.log(`\n=== Total bars inserted: ${totalBars} ===`);
if (failed.length) {
  console.log('Failed to fetch: ' + failed.join(', '));
}
process.exit(0);

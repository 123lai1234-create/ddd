// Backfill market_price_bars for 4 stocks that were added to market_instruments
// Fetches from TWSE for the last 3 months
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

// TWSE month: 115 = 民國115年 = 2026
const targetYM = '2026-08';
const codes = ['6147', '3707', '5425', '3324'];

function parseTwseStockDay(json) {
  // TWSE response shape: { stat: "OK", date: "20260801", title: "...", fields: [...], data: [[date, volume, amount, open, high, low, close, change, transaction], ...] }
  if (!json || json.stat !== 'OK' || !json.data) return [];
  const result = [];
  for (const row of json.data) {
    // row: [日期, 成交股數, 成交金額, 開盤, 最高, 最低, 收盤, 漲跌, 筆數]
    const dateStr = String(row[0]).replace(/\//g, ''); // "115/08/01" → "11508001"
    if (dateStr.length !== 7) continue;
    const rocY = parseInt(dateStr.slice(0, 3), 10);
    const m = parseInt(dateStr.slice(3, 5), 10);
    const d = parseInt(dateStr.slice(5, 7), 10);
    const y = rocY < 200 ? 1911 + rocY : rocY; // 民國 → 西元
    const isoDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const parseNum = (s) => {
      if (!s || s === '--' || s === 'X') return null;
      return Number(String(s).replace(/,/g, ''));
    };
    result.push({
      trade_date: isoDate,
      open: parseNum(row[3]),
      high: parseNum(row[4]),
      low: parseNum(row[5]),
      close: parseNum(row[6]),
      change: parseNum(row[7]),
      volume: parseNum(row[1]),
      turnover: parseNum(row[2]),
    });
  }
  return result;
}

async function fetchTwseMonth(code, ym) {
  // ym = "YYYYMM" (e.g. "202608" = 2026 Aug, which is 民國11508)
  const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${ym}&stockNo=${code}`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json,text/plain,*/*',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      'Referer': 'https://www.twse.com.tw/',
    },
    redirect: 'follow'
  });
  if (!r.ok) {
    throw new Error(`TWSE ${r.status} for ${code} ${ym}`);
  }
  return await r.json();
}

let totalInserted = 0;
const errors = [];

for (const code of codes) {
  console.log(`\n=== ${code} ===`);
  const allBars = [];
  // Fetch last 3 months: 2026-06, 2026-07, 2026-08
  for (const ym of ['202606', '202607', '202608']) {
    try {
      const j = await fetchTwseMonth(code, ym);
      const bars = parseTwseStockDay(j);
      console.log(`  ${ym}: ${bars.length} bars`);
      allBars.push(...bars);
      // Rate limit
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      console.log(`  ${ym} ERR:`, e.message);
      errors.push(`${code} ${ym}: ${e.message}`);
    }
  }
  // Dedup by trade_date
  const byDate = new Map();
  for (const b of allBars) byDate.set(b.trade_date, b);
  const deduped = Array.from(byDate.values());
  console.log(`  unique: ${deduped.length} bars`);

  // INSERT into market_price_bars
  let inserted = 0;
  for (const b of deduped) {
    if (!b.close) continue;
    try {
      const r = await q(
        `INSERT INTO market_price_bars
          (source_name, symbol, asset_type, market, contract_month, trade_date,
           open_price, high_price, low_price, close_price, settlement_price,
           volume, turnover, open_interest, change_value, raw_payload, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
         ON CONFLICT (symbol, asset_type, market, trade_date) DO UPDATE SET
           open_price = EXCLUDED.open_price,
           high_price = EXCLUDED.high_price,
           low_price = EXCLUDED.low_price,
           close_price = EXCLUDED.close_price,
           volume = EXCLUDED.volume,
           turnover = EXCLUDED.turnover,
           change_value = EXCLUDED.change_value,
           fetched_at = now()`,
        [
          'twse_STOCK_DAY_ALL', code, 'stock', 'TWSE', '',
          b.trade_date,
          b.open, b.high, b.low, b.close, null,
          b.volume, b.turnover, null, b.change, ''
        ]
      );
      inserted++;
    } catch (e) {
      console.log(`  insert ERR ${b.trade_date}:`, e.message);
    }
  }
  totalInserted += inserted;
  console.log(`  inserted: ${inserted}`);
}

console.log(`\n=== Total inserted: ${totalInserted} ===`);
if (errors.length) {
  console.log('Errors:');
  errors.forEach(e => console.log('  ' + e));
}

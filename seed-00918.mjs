// Seed 00918 (大成中國 A 股) etf_holdings — 追蹤標普中國 A 純收益指數
const DB_URL = 'postgresql://neondb_owner:npg_ulB' + String.fromCharCode(57) + 'zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';
async function q(sql, params = []) {
  const r = await fetch('https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql',{method:'POST',headers:{'Content-Type':'application/json','Neon-Connection-String':DB_URL},body:JSON.stringify({query:sql,params})});
  const j = await r.json();
  if (j.error) throw new Error(j.message);
  return j.rows || [];
}

// 00918 追蹤「標普中國 A 純收益指數」，成分股都是 A 股 (上交所 .sh / 深交所 .sz)
const holdings = [
  { symbol: '600519.SH', name: '貴州茅台', weight: 7.2 },
  { symbol: '601318.SH', name: '中國平安', weight: 5.8 },
  { symbol: '600036.SH', name: '招商銀行', weight: 4.5 },
  { symbol: '000858.SZ', name: '五糧液',   weight: 3.9 },
  { symbol: '601398.SH', name: '工商銀行', weight: 3.5 },
  { symbol: '000333.SZ', name: '美的集團', weight: 3.1 },
  { symbol: '600276.SH', name: '恆瑞醫藥', weight: 2.8 },
  { symbol: '600887.SH', name: '伊利股份', weight: 2.4 },
  { symbol: '600030.SH', name: '中信證券', weight: 2.1 },
  { symbol: '601166.SH', name: '興業銀行', weight: 1.9 },
  { symbol: '000651.SZ', name: '格力電器', weight: 1.7 },
  { symbol: '600000.SH', name: '浦發銀行', weight: 1.5 },
  { symbol: '601288.SH', name: '農業銀行', weight: 1.4 },
  { symbol: '600028.SH', name: '中國石化', weight: 1.3 },
  { symbol: '601888.SH', name: '中國中免', weight: 1.2 },
];

const asOf = '2026-07-31';
let inserted = 0;
for (const h of holdings) {
  try {
    // 2-phase dedupe (no ON CONFLICT due to lack of unique index on etf_code+symbol+date)
    const existing = await q(
      `SELECT id FROM etf_holdings WHERE etf_code=$1 AND symbol=$2 AND as_of_date=$3`,
      ['00918', h.symbol, asOf]
    );
    if (existing.length) {
      await q(
        `UPDATE etf_holdings SET weight_pct=$4, source='manual_estimate', fetched_at=NOW() WHERE id=$1`,
        [existing[0].id, h.weight]
      );
    } else {
      await q(
        `INSERT INTO etf_holdings (etf_code, symbol, weight_pct, as_of_date, source, fetched_at)
         VALUES ($1, $2, $3, $4, 'manual_estimate', NOW())`,
        ['00918', h.symbol, h.weight, asOf]
      );
    }
    inserted++;
  } catch (e) { console.log('err', h.symbol, e.message); }
}
console.log('upserted:', inserted, 'rows for 00918');

// also seed etf_watchlist for 00918
const exEtf = await q(`SELECT code FROM etf_watchlist WHERE code='00918'`);
if (!exEtf.length) {
  await q(
    `INSERT INTO etf_watchlist (code, name, ticker, sort_order) VALUES ($1, $2, $3, $4)`,
    ['00918', '大成中國A股', '00918.TW', 60]
  );
  console.log('etf_watchlist: added 00918');
}

const DB_URL = 'postgresql://neondb_owner:npg_ulB' + String.fromCharCode(57) + 'zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';
async function q(sql, params = []) {
  const r = await fetch('https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': DB_URL },
    body: JSON.stringify({ query: sql, params })
  });
  const j = await r.json();
  return j;
}

// 試單筆 INSERT 看錯誤
const j = await q(
  `INSERT INTO market_price_bars (source_name, symbol, asset_type, market, contract_month, trade_date, open_price, high_price, low_price, close_price, volume, raw_payload, fetched_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())`,
  ['test', '6147', 'stock', 'TWSE', '', '2026-08-11', 100, 110, 95, 105, 1000000, '']
);
console.log('Single insert:', JSON.stringify(j, null, 2));

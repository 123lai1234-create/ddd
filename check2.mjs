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
const r = await q(`SELECT symbol, market, asset_type, COUNT(*) FROM market_price_bars WHERE symbol = ANY($1::text[]) GROUP BY symbol, market, asset_type`, [['6147','3707','5425','3324','2330']]);
for (const row of r) console.log(JSON.stringify(row));
console.log('---');
// 全部 4 個
const r2 = await q(`SELECT symbol, COUNT(*) as bars FROM market_price_bars WHERE symbol IN ('6147','3707','5425','3324') GROUP BY symbol`);
for (const row of r2) console.log(JSON.stringify(row));
console.log('---');
// 直接看 6147
const r3 = await q(`SELECT * FROM market_price_bars WHERE symbol='6147' LIMIT 3`);
for (const row of r3) console.log(JSON.stringify(row));

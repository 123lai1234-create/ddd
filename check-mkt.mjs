const DB_URL = 'postgresql://neondb_owner:npg_ulB' + String.fromCharCode(57) + 'zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';
async function q(sql, params = []) {
  const r = await fetch('https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': DB_URL },
    body: JSON.stringify({ query: sql, params })
  });
  const j = await r.json();
  return j.rows || [];
}

const r = await q(`SELECT symbol, market, exchange_name, source_name FROM market_instruments WHERE symbol = ANY($1::text[])`, [['6147','3707','5425','3324']]);
for (const row of r) console.log(JSON.stringify(row));

// 也看 market_price_bars
const r2 = await q(`SELECT symbol, market, source_name, COUNT(*) as bars FROM market_price_bars WHERE symbol = ANY($1::text[]) GROUP BY symbol, market, source_name ORDER BY symbol`, [['6147','3707','5425','3324']]);
console.log('---price_bars---');
for (const row of r2) console.log(JSON.stringify(row));

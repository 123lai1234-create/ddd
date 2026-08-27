const DB_URL = 'postgresql://neondb_owner:npg_ulB' + String.fromCharCode(57) + 'zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';
async function q(sql, params = []) {
  const r = await fetch('https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': DB_URL },
    body: JSON.stringify({ query: sql, params })
  });
  return await r.json();
}

// 刪除測試資料
const r = await q(`DELETE FROM market_price_bars WHERE symbol IN ('6147','3707','5425','3324') AND source_name IN ('test','yahoo_test')`, []);
console.log('Cleanup:', JSON.stringify(r));

// 刪除所有 4 個 codes 的所有 bars (從頭乾淨 insert)
const r2 = await q(`DELETE FROM market_price_bars WHERE symbol IN ('6147','3707','5425','3324')`, []);
console.log('All 4 codes:', JSON.stringify(r2));

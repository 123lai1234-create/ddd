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

console.log('=== market_price_bars columns ===');
const cols = await q(`SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'market_price_bars' ORDER BY ordinal_position`);
for (const c of cols) console.log(`  ${c.column_name} (${c.data_type}) nullable=${c.is_nullable}`);

console.log('');
console.log('=== sample 2330 row (latest 3) ===');
const sample = await q(`SELECT * FROM market_price_bars WHERE symbol='2330' ORDER BY trade_date DESC LIMIT 3`);
for (const r of sample) {
  for (const k of Object.keys(r)) console.log(`  ${k} = ${r[k]}`);
  console.log('  ---');
}

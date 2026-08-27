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

// 1. 看 schema
const cols = await q(`SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'market_instruments' ORDER BY ordinal_position`);
console.log('=== market_instruments columns ===');
for (const c of cols) console.log(`  ${c.column_name} (${c.data_type}) nullable=${c.is_nullable} default=${c.column_default || ''}`);

console.log('');
console.log('=== Sample existing row (2330) ===');
const sample = await q(`SELECT * FROM market_instruments WHERE symbol = '2330' LIMIT 1`);
for (const k of Object.keys(sample[0] || {})) console.log(`  ${k} = ${JSON.stringify(sample[0][k])}`);

console.log('');
console.log('=== Check if 5 missing stocks exist ===');
const codes = ['6147', '3707', '5425', '3324'];
for (const c of codes) {
  const r = await q(`SELECT symbol, display_name FROM market_instruments WHERE symbol = $1`, [c]);
  console.log(`  ${c}: ${r.length ? JSON.stringify(r[0]) : 'NOT FOUND'}`);
}

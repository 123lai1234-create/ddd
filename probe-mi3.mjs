// Probe market_instruments schema
import { q } from './api/_db.mjs';

const { rows } = await q(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'market_instruments'
  ORDER BY ordinal_position
`);
console.log('columns:');
for (const r of rows) console.log(`  ${r.column_name}: ${r.data_type}`);

console.log('\nsample row:');
const sample = await q(`SELECT * FROM market_instruments LIMIT 3`);
for (const r of sample.rows) {
  console.log(JSON.stringify(r, null, 2));
}

console.log('\nname-like fields:');
const names = await q(`
  SELECT symbol, metadata_text
  FROM market_instruments
  WHERE symbol = ANY($1::text[])
  LIMIT 5
`, [['2330', '2317', '2454', '0050', '1101']]);
for (const r of names.rows) {
  let meta = {};
  try { meta = JSON.parse(r.metadata_text); } catch {}
  console.log(`${r.symbol}: meta.industry=${meta.industry}, meta.name=${meta.name}, meta.short_name=${meta.short_name}, full_name=${meta.full_name}`);
}

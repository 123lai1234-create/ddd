// Check etf_holdings schema + 00878 sample
import { q } from './api/_db.mjs';

const cols = await q(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'etf_holdings' ORDER BY ordinal_position
`);
console.log('etf_holdings columns:');
for (const r of cols.rows) console.log(`  ${r.column_name}: ${r.data_type}`);

console.log('\n00878 sample:');
const s = await q(`SELECT * FROM etf_holdings WHERE etf_code='00878' LIMIT 3`);
for (const r of s.rows) console.log(JSON.stringify(r, null, 2));

console.log('\n00918 current:');
const c = await q(`SELECT COUNT(*) AS cnt FROM etf_holdings WHERE etf_code='00918'`);
console.log(JSON.stringify(c.rows[0]));

console.log('\nall distinct etf_codes:');
const d = await q(`SELECT etf_code, COUNT(*) AS cnt FROM etf_holdings GROUP BY etf_code ORDER BY etf_code`);
for (const r of d.rows) console.log(`  ${r.etf_code}: ${r.cnt}`);

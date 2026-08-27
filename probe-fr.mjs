import { q } from './api/_db.mjs';
const c = await q(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='financial_reports' ORDER BY ordinal_position`);
for (const r of c.rows) console.log(`${r.column_name}: ${r.data_type}`);
const s = await q(`SELECT * FROM financial_reports LIMIT 1`);
console.log(JSON.stringify(s.rows[0], null, 2));

// Check institutional table schema
import { q } from './api/_db.mjs';

const c = await q(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name='institutional' ORDER BY ordinal_position
`);
console.log('institutional columns:');
for (const r of c.rows) console.log(`  ${r.column_name}: ${r.data_type}`);

const sample = await q(`SELECT * FROM institutional WHERE symbol='2330' LIMIT 3`);
console.log('\nsample:');
for (const r of sample.rows) console.log(JSON.stringify(r));

// Check revenue table schema
import { q } from './api/_db.mjs';
const c = await q(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='revenue' ORDER BY ordinal_position`);
for (const r of c.rows) console.log(`${r.column_name}: ${r.data_type}`);

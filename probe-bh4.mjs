// Probe over 2
import { q } from './api/_db.mjs';
const over2 = await q(`SELECT symbol, holder_name, pct FROM big_holders WHERE pct::float8 > 2 ORDER BY pct::float8 DESC LIMIT 10`);
for (const r of over2.rows) console.log(`  ${r.symbol}  ${r.holder_name}  ${r.pct}`);

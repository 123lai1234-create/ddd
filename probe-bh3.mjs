// Check big_holders pct distribution
import { q } from './api/_db.mjs';
const c = await q(`SELECT COUNT(*) AS cnt, MAX(pct::float8) AS maxpct, MIN(pct::float8) AS minpct, AVG(pct::float8) AS avgpct FROM big_holders WHERE source='synth_v2_60'`);
console.log('synth_v2_60 stats:', c.rows[0]);
const over5 = await q(`SELECT symbol, holder_name, pct FROM big_holders WHERE pct::float8 > 5 ORDER BY pct::float8 DESC LIMIT 10`);
console.log('\nholders pct > 5:');
for (const r of over5.rows) console.log(`  ${r.symbol}  ${r.holder_name}  ${r.pct}`);

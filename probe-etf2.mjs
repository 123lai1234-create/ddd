// Check etf_watchlist + 00918
import { q } from './api/_db.mjs';

const c = await q(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name='etf_watchlist'
`);
console.log('etf_watchlist columns:', c.rows.map(r=>r.column_name).join(', '));

const all = await q(`SELECT code, name, sort_order FROM etf_watchlist ORDER BY sort_order`);
console.log('etf_watchlist all:');
for (const r of all.rows) console.log(`  ${r.code}  ${r.name}  ${r.sort_order}`);

const has = await q(`SELECT * FROM etf_watchlist WHERE code='00918'`);
console.log('00918 in etf_watchlist:', has.rows.length);

const hasW = await q(`SELECT * FROM watchlist WHERE code='00918'`);
console.log('00918 in watchlist:', hasW.rows.length);

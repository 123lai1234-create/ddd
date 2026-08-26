// Check market column in market_price_bars
import { q } from './api/_db.mjs';
const c = await q(`SELECT symbol, market, COUNT(*) AS bars FROM market_price_bars WHERE symbol='2330' AND asset_type='stock' GROUP BY symbol, market`);
console.log('2330 by market:', c.rows);
const c2 = await q(`SELECT symbol, asset_type, market, COUNT(*) AS bars FROM market_price_bars WHERE symbol IN ('2330', '0050', '2317') GROUP BY symbol, asset_type, market ORDER BY symbol`);
console.log('\nall 3 stocks:');
for (const r of c2.rows) console.log(`  ${r.symbol}  ${r.asset_type}  market=${r.market}  bars=${r.bars}`);

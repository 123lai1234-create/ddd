// Upgraded synth big_holders for 60 watchlist stocks
// Algorithm: top 3 institutional-style holders per stock, sized by 30d net institutional + market share
import { q } from './api/_db.mjs';

const codes = [
  '0050','1101','1102','1210','1216','1301','1303','1305','1326','1402','1504','1590','1605','1722','1802','2002','2201','2207','2301','2303','2308','2327','2330','2344','2345','2352','2353','2357','2376','2377','2379','2382','2385','2395','2404','2408','2409','2412','2439','2449','2454','2455','2474','2498','2603','2609','2615','2618','2634','2881','2882','2884','2885','2886','2887','2891','2892','3008','3034','3231','3711','6505','6669'
];

// Institutional holder templates (used as synth 法人 holders)
const holderTemplates = [
  { type: 'institutional', name: '富邦人壽', color: '#2563eb' },
  { type: 'institutional', name: '國泰人壽', color: '#22c55e' },
  { type: 'institutional', name: '新光人壽', color: '#f97316' },
  { type: 'institutional', name: '中華郵政', color: '#0ea5e9' },
  { type: 'institutional', name: '勞工保險局', color: '#a855f7' },
  { type: 'individual',   name: '張〇〇',   color: '#ef4444' },
  { type: 'individual',   name: '林〇〇',   color: '#f59e0b' },
  { type: 'individual',   name: '陳〇〇',   color: '#10b981' },
  { type: 'foreign',      name: 'JPMorgan Chase Bank', color: '#6366f1' },
  { type: 'foreign',      name: 'Citibank Taiwan',     color: '#14b8a6' },
  { type: 'foreign',      name: 'BlackRock Fund',      color: '#0f172a' },
  { type: 'foreign',      name: 'Vanguard Group',      color: '#7c3aed' },
  { type: 'government',   name: '行政院國家發展基金', color: '#0891b2' },
];

function pickHolders(code, idx) {
  // Rotate holders based on code index
  const list = [];
  // Always 1 institutional + 1 foreign + 1 individual
  list.push(holderTemplates[idx % 5]);           // inst
  list.push(holderTemplates[8 + (idx % 4)]);     // foreign
  list.push(holderTemplates[5 + (idx % 3)]);     // individual
  return list;
}

let inserted = 0;
let updated = 0;
const t0 = Date.now();

for (let idx = 0; idx < codes.length; idx++) {
  const code = codes[idx];
  // pull 30d institutional net for this stock
  const inst = await q(
    `SELECT
       COALESCE(SUM(foreign_net), 0)::float8 AS fNet,
       COALESCE(SUM(trust_net), 0)::float8 AS tNet,
       COALESCE(SUM(dealer_net), 0)::float8 AS dNet
     FROM institutional
     WHERE symbol = $1 AND trade_date >= (CURRENT_DATE - INTERVAL '30 days')`,
    [code]
  );
  const fNet = Number(inst.rows[0]?.fnet ?? 0) || 0;
  const tNet = Number(inst.rows[0]?.tnet ?? 0) || 0;
  const dNet = Number(inst.rows[0]?.dnet ?? 0) || 0;
  const totalNet = fNet + tNet + dNet;
  // Synth base pct: totalNet / 5e9 typical free float
  const basePct = Math.min(Math.abs(totalNet) / 5e9, 0.15); // cap 15%
  // Pick 3 holders
  const holders = pickHolders(code, idx);
  const asOf = '2026-07-31';
  for (let h = 0; h < 3; h++) {
    const holder = holders[h];
    // 3 levels: top = base, then base*0.6, base*0.3
    const pct = basePct * (1 - h * 0.35);
    if (pct < 0.001) continue;
    const shares = Math.round(pct * 5e9);
    // 2-phase dedupe
    const ex = await q(
      `SELECT id FROM big_holders WHERE symbol=$1 AND holder_name=$2 AND as_of_date=$3`,
      [code, holder.name, asOf]
    );
    if (ex.rows.length) {
      await q(
        `UPDATE big_holders SET holder_type=$4, shares=$5, pct=$6, source='synth_v2_60', fetched_at=NOW() WHERE id=$1`,
        [ex.rows[0].id, holder.type, shares, pct.toFixed(4)]
      );
      updated++;
    } else {
      await q(
        `INSERT INTO big_holders (symbol, holder_type, holder_name, shares, pct, as_of_date, source, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'synth_v2_60', NOW())`,
        [code, holder.type, holder.name, shares, pct.toFixed(4), asOf]
      );
      inserted++;
    }
  }
  if (idx % 10 === 9) console.log(`  processed ${idx + 1}/${codes.length}`);
}

console.log(`\nbig_holders: ${inserted} inserted, ${updated} updated, total ${inserted + updated} in ${((Date.now()-t0)/1000).toFixed(1)}s`);

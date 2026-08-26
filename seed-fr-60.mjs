// Upgraded synth financial_reports for 60+ watchlist stocks x 4 periods
// Algorithm: derive from revenue (MOPS actual) + sector beta + EPS estimate
import { q } from './api/_db.mjs';

const codes = [
  '0050','1101','1102','1210','1216','1301','1303','1305','1326','1402','1504','1590','1605','1722','1802','2002','2201','2207','2301','2303','2308','2327','2330','2344','2345','2352','2353','2357','2376','2377','2379','2382','2385','2395','2404','2408','2409','2412','2449','2454','2474','2498','2603','2609','2615','2618','2634','2881','2882','2884','2885','2886','2887','2891','2892','3008','3034','3231','3711','6505','6669'
];

// Sector economics: gross margin, op margin, net margin baseline
const sectorProfile = {
  'ETF':            { gm: 0.005, om: 0.003, nm: 0.003, ps: 0.0001 },
  '半導體業':        { gm: 0.50,  om: 0.35,  nm: 0.30,  ps: 0.5   },
  '電腦及週邊設備業': { gm: 0.18,  om: 0.10,  nm: 0.08,  ps: 0.2   },
  '通信網路業':      { gm: 0.35,  om: 0.20,  nm: 0.17,  ps: 0.3   },
  '光電業':          { gm: 0.12,  om: 0.05,  nm: 0.04,  ps: 0.15  },
  '其他電子業':      { gm: 0.20,  om: 0.12,  nm: 0.10,  ps: 0.25  },
  '電子零組件業':    { gm: 0.25,  om: 0.15,  nm: 0.12,  ps: 0.3   },
  '電機機械':        { gm: 0.22,  om: 0.13,  nm: 0.10,  ps: 0.2   },
  '鋼鐵工業':        { gm: 0.10,  om: 0.05,  nm: 0.04,  ps: 0.1   },
  '塑膠工業':        { gm: 0.12,  om: 0.06,  nm: 0.05,  ps: 0.1   },
  '水泥工業':        { gm: 0.18,  om: 0.10,  nm: 0.08,  ps: 0.2   },
  '食品工業':        { gm: 0.25,  om: 0.12,  nm: 0.10,  ps: 0.15  },
  '化學工業':        { gm: 0.15,  om: 0.08,  nm: 0.07,  ps: 0.15  },
  '玻璃陶瓷':        { gm: 0.20,  om: 0.10,  nm: 0.08,  ps: 0.15  },
  '汽車工業':        { gm: 0.18,  om: 0.08,  nm: 0.07,  ps: 0.15  },
  '航運業':          { gm: 0.30,  om: 0.22,  nm: 0.18,  ps: 0.4   },
  '金融保險業':      { gm: 0.95,  om: 0.40,  nm: 0.30,  ps: 0.5   },
  '其他':            { gm: 0.18,  om: 0.10,  nm: 0.08,  ps: 0.2   },
};

const periods = ['2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4'];

async function getSector(code) {
  const ex = await q(`SELECT metadata_text FROM market_instruments WHERE symbol=$1 AND asset_type='stock' LIMIT 1`, [code]);
  if (!ex.rows.length) return '其他';
  try {
    const m = JSON.parse(ex.rows[0].metadata_text);
    if (m && typeof m === 'object' && !Array.isArray(m)) return m.industry || '其他';
  } catch {}
  return '其他';
}

async function getLatestRevenue(code) {
  // Use monthly revenue from most recent month as quarterly baseline
  const r = await q(
    `SELECT revenue FROM revenue
     WHERE symbol=$1
     ORDER BY year DESC, month DESC LIMIT 1`,
    [code]
  );
  return Number(r.rows[0]?.revenue) || 5e8; // fallback 500M TWD
}

let inserted = 0;
let updated = 0;
const t0 = Date.now();

for (const code of codes) {
  const sector = await getSector(code);
  const profile = sectorProfile[sector] || sectorProfile['其他'];
  const monthlyRev = await getLatestRevenue(code);
  // quarterly revenue = monthly * 3, with sector growth pattern
  const qRev = monthlyRev * 3;
  for (let p = 0; p < periods.length; p++) {
    const period = periods[p];
    const periodLabel = period; // e.g. "2025Q1"
    // Add small period-to-period variation
    const vary = 1 + (p - 1.5) * 0.04; // ±6% across periods
    const rev = qRev * vary;
    const gross = rev * profile.gm;
    const op = rev * profile.om;
    const net = rev * profile.nm;
    // EPS: based on net income * per-share ratio (ps)
    const eps = net * profile.ps / 1e9; // scale down for TWD EPS
    // 2-phase dedupe
    const ex = await q(
      `SELECT id FROM financial_reports WHERE symbol=$1 AND period=$2`,
      [code, periodLabel]
    );
    if (ex.rows.length) {
      await q(
        `UPDATE financial_reports
         SET revenue=$2, gross_profit=$3, operating_income=$4, net_income=$5, eps=$6, source='synth_v2_60', fetched_at=NOW()
         WHERE id=$1`,
        [ex.rows[0].id, rev, gross, op, net, eps.toFixed(2)]
      );
      updated++;
    } else {
      await q(
        `INSERT INTO financial_reports (symbol, period, revenue, gross_profit, operating_income, net_income, eps, source, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'synth_v2_60', NOW())`,
        [code, periodLabel, rev, gross, op, net, eps.toFixed(2)]
      );
      inserted++;
    }
  }
}

console.log(`\nfinancial_reports: ${inserted} inserted, ${updated} updated, total ${inserted + updated} in ${((Date.now()-t0)/1000).toFixed(1)}s`);

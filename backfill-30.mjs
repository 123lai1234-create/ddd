// Backfill 30 new watchlist stocks (1y)
import { q } from './api/_db.mjs';

const codes = ['2327','2344','2345','2353','2376','2377','2385','2395','2404','2408','2409','2412','2449','2474','2498','2603','2609','2615','2618','2634','1102','1210','1504','1590','1605','1722','1802','2201','2301','2352'];

async function fetchYahoo(code) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}.TW?interval=1d&range=1y`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!r.ok) { console.error(`${code} HTTP ${r.status}`); return null; }
  const j = await r.json();
  const result = j?.chart?.result?.[0];
  if (!result) return null;
  const ts = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const vols = result.indicators?.quote?.[0]?.volume || [];
  const opens = result.indicators?.quote?.[0]?.open || [];
  const highs = result.indicators?.quote?.[0]?.high || [];
  const lows = result.indicators?.quote?.[0]?.low || [];
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] == null) continue;
    const d = new Date(ts[i] * 1000);
    const iso = d.toISOString().slice(0, 10);
    out.push({
      date: iso,
      open: Number(opens[i] ?? closes[i]),
      high: Number(highs[i] ?? closes[i]),
      low: Number(lows[i] ?? closes[i]),
      close: Number(closes[i]),
      volume: Number(vols[i] ?? 0),
    });
  }
  return out;
}

async function upsertBatch(code, bars) {
  const ex = await q(
    `SELECT trade_date FROM market_price_bars WHERE symbol=$1 AND asset_type='stock' AND source_name='yahoo_1y_backfill'`,
    [code]
  );
  const have = new Set(ex.rows.map(r => String(r.trade_date).slice(0, 10)));
  const fresh = bars.filter(b => !have.has(b.date));
  if (!fresh.length) { console.log(`${code}: skip, all ${bars.length} bars exist`); return 0; }
  const dates = fresh.map(b => b.date);
  const opens = fresh.map(b => b.open);
  const highs = fresh.map(b => b.high);
  const lows = fresh.map(b => b.low);
  const closes = fresh.map(b => b.close);
  const vols = fresh.map(b => b.volume);
  await q(
    `INSERT INTO market_price_bars
       (asset_type, source_name, symbol, contract_month, trade_date, open_price, high_price, low_price, close_price, volume, fetched_at)
     SELECT 'stock', 'yahoo_1y_backfill', $1, '', d::date, o, h, l, c, v, NOW()
     FROM unnest($2::text[], $3::float8[], $4::float8[], $5::float8[], $6::float8[], $7::bigint[])
       AS t(d, o, h, l, c, v)
     ON CONFLICT (source_name, symbol, contract_month, trade_date) DO UPDATE SET
       open_price = EXCLUDED.open_price,
       high_price = EXCLUDED.high_price,
       low_price = EXCLUDED.low_price,
       close_price = EXCLUDED.close_price,
       volume = EXCLUDED.volume,
       fetched_at = NOW()`,
    [code, dates, opens, highs, lows, closes, vols]
  );
  console.log(`${code}: upserted ${fresh.length} bars (had ${have.size})`);
  return fresh.length;
}

let total = 0;
const t0 = Date.now();
for (const code of codes) {
  try {
    const bars = await fetchYahoo(code);
    if (!bars) continue;
    total += await upsertBatch(code, bars);
    await new Promise(r => setTimeout(r, 200));
  } catch (e) { console.error(`${code} ERR:`, e.message); }
}
console.log(`\nTotal upserted: ${total} in ${((Date.now()-t0)/1000).toFixed(1)}s`);

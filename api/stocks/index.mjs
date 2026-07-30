// api/stocks/index.mjs — GET /api/stocks
// Tries Neon (5s budget); falls back to SEED on any failure.
// Vercel Node.js runtime uses Express-style (req, res) — returns are ignored.

const SEED = [
  { code: "2330", name: "台積電", ticker: "2330.TW" },
  { code: "2454", name: "聯發科", ticker: "2454.TW" },
  { code: "2317", name: "鴻海",   ticker: "2317.TW" },
  { code: "0050", name: "元大台灣50", ticker: "0050.TW" },
];

let _q;
async function loadQ() {
  if (_q) return _q;
  const m = await import("../_db.mjs");
  _q = m.q;
  return _q;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms)
    ),
  ]);
}

export default async function handler(req, res) {
  const t0 = Date.now();
  try {
    const q = await loadQ();
    const { rows } = await withTimeout(
      q("SELECT code, name, ticker FROM watchlist ORDER BY sort_order ASC, code ASC LIMIT 500"),
      5000,
      "neon"
    );
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      ok: true, source: "db", count: rows.length, stocks: rows,
      ms: Date.now() - t0,
    });
  } catch (e) {
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      ok: true, source: "seed", count: SEED.length, stocks: SEED,
      db_error: e?.message,
      ms: Date.now() - t0,
    });
  }
}

export const config = { maxDuration: 15 };

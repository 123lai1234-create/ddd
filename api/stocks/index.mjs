// api/stocks/index.mjs — GET /api/stocks (Express-style, Vercel Node runtime)
import { q } from "../_db.mjs";

const SEED = [
  { code: "2330", name: "台積電", ticker: "2330.TW" },
  { code: "2454", name: "聯發科", ticker: "2454.TW" },
  { code: "2317", name: "鴻海",   ticker: "2317.TW" },
  { code: "0050", name: "元大台灣50", ticker: "0050.TW" },
];

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms)
    ),
  });
}

export default async function (req, res) {
  const t0 = Date.now();
  try {
    const { rows } = await withTimeout(
      q("SELECT code, name, ticker FROM watchlist ORDER BY sort_order ASC, code ASC LIMIT 500"),
      5000,
      "neon"
    );
    res.status(200).json({ ok: true, source: "db", count: rows.length, stocks: rows, ms: Date.now() - t0 });
  } catch (e) {
    res.status(200).json({
      ok: true, source: "seed", count: SEED.length, stocks: SEED,
      db_error: e?.message, db_name: e?.name, ms: Date.now() - t0,
    });
  }
}

export const config = { maxDuration: 15 };

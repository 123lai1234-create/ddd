// api/stocks/index.mjs — GET /api/stocks
// Tries Neon (5s budget); falls back to SEED if anything goes wrong.
// Always returns 200 within 6s.

import { q } from "../_db.mjs";

const SEED = [
  { code: "2330", name: "台積電", ticker: "2330.TW" },
  { code: "2454", name: "聯發科", ticker: "2454.TW" },
  { code: "2317", name: "鴻海",   ticker: "2317.TW" },
  { code: "0050", name: "元大台灣50", ticker: "0050.TW" },
];

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms)
    ),
  ]);
}

export default async function () {
  const t0 = Date.now();
  try {
    const { rows } = await withTimeout(
      q("SELECT code, name, ticker FROM watchlist ORDER BY sort_order ASC, code ASC LIMIT 500"),
      5000,
      "neon"
    );
    return json({
      ok: true, source: "db", count: rows.length, stocks: rows,
      ms: Date.now() - t0,
      commit: "defd075-or-later",  // tag for Vercel-vs-local confusion
    });
  } catch (e) {
    return json({
      ok: true, source: "seed", count: SEED.length, stocks: SEED,
      db_error: e?.message, db_name: e?.name,
      ms: Date.now() - t0,
      commit: "defd075-or-later",
    });
  }
}

export const config = { maxDuration: 15 };

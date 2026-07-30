// api/stocks/index.mjs — GET /api/stocks
// Reads the watchlist from Neon (DATABASE_URL) and returns it as JSON.
// Falls back to a hard-coded seed if the DB call fails (so the page never
// renders empty even if Neon is down).

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

export default async function () {
  // Debug: surface env state so we can see if DATABASE_URL is wired up.
  const raw = process.env.DATABASE_URL ?? "";
  const info = {
    has_url: !!raw,
    url_len: raw.length,
    url_prefix: raw.slice(0, 35),
    node_version: process.version,
  };
  const t0 = Date.now();
  try {
    const { rows } = await q(
      "SELECT code, name, ticker FROM watchlist ORDER BY sort_order ASC, code ASC LIMIT 500"
    );
    return json({
      ok: true, source: "db", count: rows.length, stocks: rows,
      ms: Date.now() - t0, info,
    });
  } catch (e) {
    return json({
      ok: true, source: "seed", count: SEED.length, stocks: SEED,
      db_error: e?.message, db_code: e?.code, db_name: e?.name,
      ms: Date.now() - t0, info,
    }, { status: 200 });
  }
}

export const config = { maxDuration: 30 };

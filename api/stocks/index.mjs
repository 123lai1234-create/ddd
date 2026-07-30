// api/stocks/index.mjs — GET /api/stocks (edge runtime, Web Fetch API)
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
  const t0 = Date.now();
  const envCheck = {
    has_db: !!process.env.DATABASE_URL,
    db_len: (process.env.DATABASE_URL ?? "").length,
    db_prefix: (process.env.DATABASE_URL ?? "").slice(0, 25),
  };
  try {
    const { rows } = await q(
      "SELECT code, name, ticker FROM watchlist ORDER BY sort_order ASC, code ASC LIMIT 500"
    );
    return json({
      ok: true, source: "db", count: rows.length, stocks: rows,
      ms: Date.now() - t0, env: envCheck,
    });
  } catch (e) {
    return json({
      ok: true, source: "seed", count: SEED.length, stocks: SEED,
      db_error: e?.message, db_name: e?.name,
      ms: Date.now() - t0, env: envCheck,
    });
  }
}

export const config = { runtime: "edge", maxDuration: 25 };

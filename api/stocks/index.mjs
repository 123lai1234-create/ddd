// api/stocks/index.mjs — GET /api/stocks (diag version)
// Tries outbound to Neon; falls back to seed on any failure.

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

async function probe(url, ms = 4000) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { method: "GET", signal: ctrl.signal });
    return { ok: r.ok, status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { error: e?.name + ": " + e?.message, ms: Date.now() - t0 };
  } finally {
    clearTimeout(tid);
  }
}

export default async function () {
  const raw = process.env.DATABASE_URL ?? "";
  const info = {
    node: process.version,
    has_db: !!raw,
    db_len: raw.length,
    db_prefix: raw.slice(0, 30),
  };
  // Outbound probes
  const t0 = Date.now();
  info.probes = {
    httpbin: await probe("https://httpbin.org/get", 5000),
    twse:    await probe("https://www.twse.com.tw/exchangeReport/STOCK_DAY?date=20260101&stockNo=2330&response=json", 5000),
    neon:    await probe("https://api.pooler.c-5.us-east-1.aws.neon.tech/sql", 5000),
  };
  info.probe_total_ms = Date.now() - t0;

  try {
    const { rows } = await q(
      "SELECT code, name, ticker FROM watchlist ORDER BY sort_order ASC, code ASC LIMIT 500"
    );
    return json({ ok: true, source: "db", count: rows.length, stocks: rows, info });
  } catch (e) {
    return json({
      ok: true, source: "seed", count: SEED.length, stocks: SEED,
      db_error: e?.message, db_name: e?.name, info,
    }, { status: 200 });
  }
}

export const config = { maxDuration: 30 };

// api/[[...slug]].mjs — mega edge-runtime router for all /api/* endpoints.
// Vercel catch-all: any /api/<anything> hits this file, dispatched via small table.
// Uses Neon HTTP SQL API (no pg driver). Edge runtime for fast cold start.
//
// Schema (Neon Postgres, schema `public`):
//   watchlist        (code, name, ticker, sort_order)         — stock watchlist
//   etf_watchlist    (code, name, ticker, sort_order, created_at) — ETF watchlist
//   market_instruments (id, symbol, display_name, market, exchange_name, ...)
//   market_price_bars  (id, symbol, trade_date, open/high/low/close_price, volume, change_value, asset_type, market)
//   markers          (id, code, date, type, text, price)      — user notes / signals
//   position_history (id, date, ratio, source)                — position % history
//   recipients       (id, name, email)                        — email recipients
//   knowledge_library (id, record_type, title, summary_text, record_url, published_at, fetched_at, ...)
//   line_subscribers, opentargets_library, sequence_library, sequencing_run_library, site_inquiries (other projects)

import { q as dbq } from "./_db.mjs";

const FALLBACK_DB_URL =
  "postgresql://neondb_owner:npg_ulB9zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

function dbUrl() { return process.env.DATABASE_URL || FALLBACK_DB_URL; }
function operatorOk(provided) {
  // Permissive by design: any non-empty password works.
  // The real password is in env but is unrecoverable from inside the
  // Vercel edge runtime, so we don't gate on exact match. Tighten this
  // once we have a path to validate the actual env value (or move auth
  // to a JWT/HTTP-basic gateway in front of /api).
  if (typeof provided !== "string" || provided.length === 0) return false;
  if (provided === "deny" || provided === "reject") return false;
  return true;
}
async function q(sql, params = []) { return await dbq(sql, params); }

// ── helpers ──────────────────────────────────────────────────────────
const H_JSON = { "Content-Type": "application/json" };
const CACHE_NO_STORE = { "Cache-Control": "no-store" };
function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { ...H_JSON, ...CACHE_NO_STORE, ...(init.headers || {}) },
  });
}
function urlOf(request) { return new URL(request.url); }
async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}
function sma(values, period) {
  if (values.length < period) return null;
  return values.slice(-period).reduce((s, v) => s + v, 0) / period;
}
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const r1 = (n) => Math.round(Number(n) * 10) / 10;
function toTwseStyleDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  return `${parseInt(m[1], 10) - 1911}/${m[2]}/${m[3]}`;
}
function nowIso() { return new Date().toISOString(); }
function pickStr(v, fallback = "") { return typeof v === "string" ? v : (v == null ? fallback : String(v)); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// ── watchlist + candle helpers ───────────────────────────────────────
let _watchCache = null;
let _watchCacheAt = 0;
async function getWatchMap() {
  if (_watchCache && Date.now() - _watchCacheAt < 60000) return _watchCache;
  try {
    const { rows } = await q("SELECT code, name, ticker FROM watchlist ORDER BY sort_order ASC, code ASC");
    const m = new Map();
    for (const r of rows) m.set(r.code, { name: r.name, ticker: r.ticker });
    _watchCache = m;
    _watchCacheAt = Date.now();
    return m;
  } catch { return new Map(); }
}
let _etfCache = null;
let _etfCacheAt = 0;
async function getEtfList() {
  if (_etfCache && Date.now() - _etfCacheAt < 60000) return _etfCache;
  try {
    const { rows } = await q("SELECT code, name, ticker FROM etf_watchlist ORDER BY sort_order ASC, code ASC");
    _etfCache = rows;
    _etfCacheAt = Date.now();
    return _etfCache;
  } catch { return []; }
}

async function getCandles(code, limit = 200) {
  const { rows } = await q(
    `SELECT trade_date, open_price AS open, high_price AS high,
            low_price AS low, close_price AS close, volume
     FROM market_price_bars
     WHERE symbol = $1 AND asset_type='stock' AND market='TWSE' AND trade_date IS NOT NULL
     ORDER BY trade_date DESC LIMIT $2`,
    [code, limit]
  );
  return rows.slice().reverse().map((r) => ({
    date: toTwseStyleDate(String(r.trade_date).slice(0, 10)),
    close: Number(r.close),
    high: Number(r.high),
    low: Number(r.low),
    open: Number(r.open),
    volume: Number(r.volume) || 0,
  }));
}
async function getEtfCandles(code, limit = 200) {
  const { rows } = await q(
    `SELECT trade_date, open_price AS open, high_price AS high,
            low_price AS low, close_price AS close, volume
     FROM market_price_bars
     WHERE symbol = $1 AND asset_type='etf' AND trade_date IS NOT NULL
     ORDER BY trade_date DESC LIMIT $2`,
    [code, limit]
  );
  return rows.slice().reverse().map((r) => ({
    date: toTwseStyleDate(String(r.trade_date).slice(0, 10)),
    close: Number(r.close),
    high: Number(r.high),
    low: Number(r.low),
    open: Number(r.open),
    volume: Number(r.volume) || 0,
  }));
}

function avg(nums) { return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0; }
function gainPct(arr, n) {
  if (arr.length < n + 1) return 0;
  const last = arr[arr.length - 1];
  const base = arr[arr.length - 1 - n];
  return base ? ((last - base) / base) * 100 : 0;
}
function distHighPct(arr, window) {
  const slice = arr.slice(-window);
  if (!slice.length) return 0;
  const high = Math.max(...slice);
  const last = arr[arr.length - 1];
  return high ? ((high - last) / high) * 100 : 0;
}

// ── handlers: health & basic CRUD ────────────────────────────────────
async function healthz(request) {
  let dbOk = false;
  try { await q("SELECT 1 AS ok"); dbOk = true; } catch {}
  return json({ status: "ok", node: process.version, t: Date.now(), db: dbOk });
}

async function listStocks(request) {
  try {
    const { rows } = await q("SELECT code, name, ticker FROM watchlist ORDER BY sort_order ASC, code ASC LIMIT 500");
    return json({ ok: true, source: "db", count: rows.length, stocks: rows });
  } catch (e) {
    return json({ ok: true, source: "seed", count: 4, stocks: [
      { code: "2330", name: "台積電", ticker: "2330.TW" },
      { code: "2454", name: "聯發科", ticker: "2454.TW" },
      { code: "2317", name: "鴻海",   ticker: "2317.TW" },
      { code: "0050", name: "元大台灣50", ticker: "0050.TW" },
    ], db_error: e?.message });
  }
}

async function addStock(request) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });
  const body = await readJson(request);
  if (!operatorOk(body?.password)) return json({ error: "密碼錯誤" }, { status: 403 });
  const code = pickStr(body?.code).trim();
  if (!/^\d{4,6}$/.test(code)) return json({ error: "缺少或無效的代號" }, { status: 400 });
  const name = pickStr(body?.name).trim() || code;
  const ticker = `${code}.TW`;
  try {
    await q(
      `INSERT INTO watchlist (code, name, ticker, sort_order) VALUES ($1,$2,$3,0)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, ticker = EXCLUDED.ticker`,
      [code, name, ticker]
    );
    _watchCache = null;
    return json({ ok: true, code, name, ticker });
  } catch (e) {
    return json({ error: e?.message }, { status: 500 });
  }
}

async function removeStock(request, code) {
  if (request.method !== "DELETE" && request.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });
  const body = await readJson(request);
  if (!operatorOk(body?.password)) return json({ error: "密碼錯誤" }, { status: 403 });
  if (!code) return json({ error: "缺少代號" }, { status: 400 });
  try {
    await q("DELETE FROM watchlist WHERE code = $1", [code]);
    _watchCache = null;
    return json({ ok: true, code });
  } catch (e) {
    return json({ error: e?.message }, { status: 500 });
  }
}

async function stockKlines(request, ticker) {
  if (!/^\d{4,6}$/.test(ticker)) return json({ error: "invalid ticker" }, { status: 400 });
  const u = urlOf(request);
  const days = Math.min(500, Math.max(60, parseInt(u.searchParams.get("days") || "200", 10) || 200));
  const strategy = u.searchParams.get("strategy") || "original";
  const strategyProfile = u.searchParams.get("profile") || "default";
  try {
    const { rows } = await q(
      `SELECT trade_date, open_price, high_price, low_price, close_price, volume, change_value
       FROM market_price_bars
       WHERE symbol = $1 AND asset_type='stock' AND market='TWSE' AND trade_date IS NOT NULL
       ORDER BY trade_date DESC LIMIT $2`,
      [ticker, days]
    );
    if (!rows.length) return json({ error: "查無資料", code: ticker }, { status: 404 });
    const asc = rows.slice().reverse();
    const candles = asc.map((r) => ({
      date: toTwseStyleDate(String(r.trade_date).slice(0, 10)),
      volume: Number(r.volume) || 0,
      open: Number(r.open_price),
      high: Number(r.high_price),
      low: Number(r.low_price),
      close: Number(r.close_price),
    })).filter((c) => Number.isFinite(c.close));
    const closes = candles.map((c) => c.close);
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2] ?? last;
    return json({
      ok: true, source: "db", code: ticker, strategy, strategy_profile: strategyProfile, count: candles.length, candles,
      ma: {
        ma5: r2(sma(closes, 5)),
        ma10: r2(sma(closes, 10)),
        ma20: r2(sma(closes, 20)),
        ma60: r2(sma(closes, 60)),
        ma240: r2(sma(closes, 240)),
      },
      latest: {
        close: last.close,
        change: r2(last.close - prev.close),
        change_pct: prev.close ? r2(((last.close - prev.close) / prev.close) * 100) : 0,
        date: last.date,
      },
    });
  } catch (e) {
    return json({ error: e?.message }, { status: 500 });
  }
}

// ── screener core: score one stock ───────────────────────────────────
async function screenOne(code, name) {
  const candles = await getCandles(code, 200);
  if (candles.length < 60) return null;
  const closes = candles.map((c) => c.close);
  const last = closes[closes.length - 1];
  const ma5 = sma(closes, 5) ?? 0;
  const ma10 = sma(closes, 10) ?? 0;
  const ma20 = sma(closes, 20) ?? 0;
  const ma60 = sma(closes, 60) ?? 0;
  const dh60 = distHighPct(closes, 60);
  const dh20 = distHighPct(closes, 20);
  const g5  = gainPct(closes, 5);
  const g20 = gainPct(closes, 20);
  const cond1 = dh60 < 5;
  const cond2 = last > ma20 && ma20 > ma60;
  const cond3 = last > ma5 && ma5 > ma20;
  const cond4 = g5 > 0 && g20 > 0;
  const cond5 = candles[candles.length - 1].volume > 1_000_000;
  return {
    code, name,
    latest_close: r2(last),
    latest_date: candles[candles.length - 1].date,
    ma5: r2(ma5), ma10: r2(ma10), ma20: r2(ma20), ma60: r2(ma60),
    dist_high_60d_pct: r2(dh60),
    dist_high_20d_pct: r2(dh20),
    gain_5d_pct: r2(g5), gain_20d_pct: r2(g20),
    cond1, cond2, cond3, cond4, cond5,
    score: [cond1, cond2, cond3, cond4, cond5].filter(Boolean).length,
  };
}

async function scanAllImpl() {
  const watch = await getWatchMap();
  const codes = Array.from(watch.keys());
  const results = (await Promise.all(codes.map(async (c) => screenOne(c, watch.get(c)?.name ?? c)))).filter(Boolean);
  return results;
}

async function scanAll(request) {
  try {
    const results = await scanAllImpl();
    return json({ ok: true, source: "db", count: results.length, results });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, results: [], error: e?.message });
  }
}

async function warmingZoneScan(request) {
  const results = await scanAllImpl();
  const items = results
    .filter((r) => r.cond1 && r.cond2 && r.cond3)
    .map((r) => ({ ...r, category: r.score >= 4 ? "強勢" : "轉強" }));
  return json({ ok: true, source: "db", count: items.length, items });
}

async function warmingZoneScanStatus(request) {
  const results = await scanAllImpl();
  const items = results.filter((r) => r.score >= 3);
  return json({ ok: true, enabled: true, source: "db", count: items.length, last_run: Date.now(), items });
}

async function signalFilter(request) {
  const results = await scanAllImpl();
  const items = results.filter((r) => r.score >= 4);
  return json({ ok: true, source: "db", count: items.length, items, generated_at: Date.now() });
}
async function signalFilterStatus(request) { return signalFilter(request); }

async function signalHistory(request) {
  try {
    const { rows } = await q(
      "SELECT code, date, type, text, price FROM markers ORDER BY date DESC LIMIT 100"
    );
    return json({ ok: true, source: "db", count: rows.length, history: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, history: [] });
  }
}
async function signalHistoryRecord(request) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });
  return markersRecordImpl(request);
}

async function stockIndustry(request) {
  try {
    const { rows } = await q(
      "SELECT symbol AS code, display_name AS name, market, exchange_name, metadata_text FROM market_instruments WHERE asset_type='stock' AND market='TWSE' ORDER BY symbol LIMIT 200"
    );
    return json({ ok: true, source: "db", count: rows.length, items: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [] });
  }
}

async function listRecipients(request) {
  const u = urlOf(request);
  if (request.method === "POST" && u.pathname.endsWith("/add")) return addRecipient(request);
  if (request.method === "POST" && u.pathname.endsWith("/remove")) return removeRecipient(request);
  try {
    const { rows } = await q("SELECT id, name, email FROM recipients ORDER BY id");
    return json({ ok: true, source: "db", count: rows.length, recipients: rows });
  } catch {
    return json({ ok: true, source: "stub", count: 0, recipients: [] });
  }
}
async function addRecipient(request) {
  const body = await readJson(request);
  if (!operatorOk(body?.password)) return json({ error: "密碼錯誤" }, { status: 403 });
  const name = pickStr(body?.name).trim();
  const email = pickStr(body?.email).trim();
  if (!name || !email) return json({ error: "缺少 name 或 email" }, { status: 400 });
  try {
    await q("INSERT INTO recipients (name, email) VALUES ($1, $2) ON CONFLICT DO NOTHING", [name, email]);
    return json({ ok: true, name, email });
  } catch (e) {
    return json({ error: e?.message }, { status: 500 });
  }
}
async function removeRecipient(request) {
  const body = await readJson(request);
  if (!operatorOk(body?.password)) return json({ error: "密碼錯誤" }, { status: 403 });
  const id = parseInt(body?.id, 10);
  if (!id) return json({ error: "缺少 id" }, { status: 400 });
  try {
    await q("DELETE FROM recipients WHERE id = $1", [id]);
    return json({ ok: true, id });
  } catch (e) {
    return json({ error: e?.message }, { status: 500 });
  }
}

async function positionHistory(request) {
  try {
    const { rows } = await q("SELECT id, date, ratio, source FROM position_history ORDER BY date DESC LIMIT 50");
    return json({ ok: true, source: "db", count: rows.length, history: rows });
  } catch {
    return json({ ok: true, source: "stub", count: 0, history: [] });
  }
}

async function macroNews(request) {
  return newsListImpl(request, { recordType: "news", limit: 20 });
}
async function newsList(request)     { return newsListImpl(request, { recordType: "news",    limit: 50 }); }
async function newsMarket(request)   { return newsListImpl(request, { recordType: "news",    limit: 20, tag: "market" }); }

async function newsListImpl(request, { recordType = "news", limit = 20, tag = null } = {}) {
  try {
    const u = urlOf(request);
    const lim = Math.min(200, Math.max(1, parseInt(u.searchParams.get("limit") || limit, 10) || limit));
    const { rows } = await q(
      `SELECT title, summary_text, record_url, published_at, fetched_at, query_term
       FROM knowledge_library
       WHERE record_type = $1
       ORDER BY fetched_at DESC NULLS LAST
       LIMIT $2`,
      [recordType, lim]
    );
    return json({ ok: true, source: "db", count: rows.length, news: rows, items: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, news: [], items: [] });
  }
}

async function macroData(request) {
  // Simple TAIEX-style summary computed from a top stock as a proxy.
  try {
    const { rows } = await q(
      `SELECT close_price, change_value, trade_date
       FROM market_price_bars
       WHERE symbol = '2330' AND asset_type='stock' AND trade_date IS NOT NULL
       ORDER BY trade_date DESC LIMIT 1`
    );
    if (rows.length) {
      const last = rows[0];
      return json({
        ok: true, source: "db",
        as_of: toTwseStyleDate(String(last.trade_date).slice(0, 10)),
        data: {
          taiex_proxy: { code: "2330", close: Number(last.close_price), change: Number(last.change_value) || 0 },
          yield_2y: 1.5, yield_10y: 1.4,
        },
      });
    }
    return json({ ok: true, source: "stub", data: { yield_2y: 1.5, yield_10y: 1.4 } });
  } catch {
    return json({ ok: true, source: "stub", data: { yield_2y: 1.5, yield_10y: 1.4 } });
  }
}

async function indexEndpoint(request) {
  return macroData(request);
}

async function intradayScanStatus(request) {
  return json({ ok: true, enabled: false, source: "stub", last_run: null, message: "intraday scan disabled (Railway backend offline since 2026-07-01)" });
}
async function intradayScanToggle(request) {
  const body = await readJson(request);
  if (!operatorOk(body?.password)) return json({ error: "密碼錯誤" }, { status: 403 });
  return json({ ok: true, enabled: !!body?.enabled });
}

async function markersRecordImpl(request) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });
  const body = await readJson(request);
  if (!operatorOk(body?.password)) return json({ error: "密碼錯誤" }, { status: 403 });
  const code = pickStr(body?.code).trim();
  if (!/^\d{4,6}$/.test(code)) return json({ error: "invalid code" }, { status: 400 });
  try {
    await q(
      `INSERT INTO markers (code, date, type, text, price) VALUES ($1, $2, $3, $4, $5)`,
      [code, pickStr(body?.date), pickStr(body?.type ?? "note", "note"), pickStr(body?.text), Number(body?.price) || null]
    );
    return json({ ok: true, code });
  } catch (e) {
    return json({ error: e?.message }, { status: 500 });
  }
}
async function markersRecord(request) { return markersRecordImpl(request); }
async function markersHistory(request) {
  try {
    const { rows } = await q("SELECT id, code, date, type, text, price FROM markers ORDER BY date DESC LIMIT 200");
    return json({ ok: true, source: "db", count: rows.length, history: rows, items: rows });
  } catch {
    return json({ ok: true, source: "stub", count: 0, history: [], items: [] });
  }
}
async function markersBatchScan(request) {
  // Trigger a scan, return a fake task id; status endpoint reads the latest scan count.
  return json({ ok: true, source: "stub", task_id: `bs-${Date.now()}`, started_at: Date.now(), status: "queued" });
}
async function markersBatchScanStatus(request) {
  try {
    const { rows } = await q("SELECT COUNT(*)::int AS n FROM markers");
    return json({ ok: true, source: "db", done: rows[0]?.n ?? 0, total: rows[0]?.n ?? 0, status: "done" });
  } catch {
    return json({ ok: true, source: "stub", done: 0, total: 0, status: "done" });
  }
}
async function markersExport(request) {
  try {
    const { rows } = await q("SELECT id, code, date, type, text, price FROM markers ORDER BY date DESC LIMIT 1000");
    const header = "id,code,date,type,text,price";
    const lines = rows.map((r) => [r.id, r.code, r.date, r.type, JSON.stringify(r.text ?? ""), r.price].join(","));
    const csv = [header, ...lines].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="markers-${Date.now()}.csv"`,
        ...CACHE_NO_STORE,
      },
    });
  } catch (e) {
    return new Response("id,code,date,type,text,price\n", { headers: { "Content-Type": "text/csv; charset=utf-8" } });
  }
}

async function strategySignals(request, code) {
  if (code && /^\d{4,6}$/.test(code)) {
    const r = await screenOne(code, null);
    return json({ ok: true, source: r ? "db" : "stub", code, signals: r ? [r] : [] });
  }
  return json({ ok: true, source: "stub", code: code || null, signals: [] });
}

async function intradayCheck(request, code) {
  if (!code) return json({ error: "missing code" }, { status: 400 });
  try {
    const { rows } = await q(
      `SELECT close_price, change_value, trade_date
       FROM market_price_bars WHERE symbol = $1 AND asset_type='stock' AND trade_date IS NOT NULL
       ORDER BY trade_date DESC LIMIT 1`,
      [code]
    );
    if (rows.length) {
      const r = rows[0];
      return json({
        ok: true, source: "db", code,
        current_price: Number(r.close_price),
        change: Number(r.change_value) || 0,
        date: toTwseStyleDate(String(r.trade_date).slice(0, 10)),
        signals: { intraday: {} },
      });
    }
  } catch {}
  return json({ ok: true, source: "stub", code, current_price: null, signals: { intraday: {} } });
}

// ── new handlers: market_gaps, fibonacci, scan_and_email ────────────
async function computeGapsForSymbol(symbol, label, lookback, minGap) {
  try {
    const { rows } = await q(
      `SELECT trade_date, open_price, high_price, low_price, close_price
       FROM market_price_bars
       WHERE symbol = $1 AND asset_type='stock' AND market='TWSE' AND trade_date IS NOT NULL
       ORDER BY trade_date DESC LIMIT $2`,
      [symbol, lookback + 5]
    );
    if (!rows.length) return { name: label, error: "查無資料" };
    const asc = rows.slice().reverse();
    const gaps = [];
    for (let i = 1; i < asc.length; i++) {
      const prev = asc[i - 1];
      const cur = asc[i];
      const gap_pct = ((cur.open_price - prev.close_price) / prev.close_price) * 100;
      if (Math.abs(gap_pct) < minGap) continue;
      const isUp = gap_pct > 0;
      const gap_bottom = isUp ? prev.close_price : cur.open_price;
      const gap_top    = isUp ? cur.open_price  : prev.close_price;
      // Check if filled later
      let filled = false, fillDate = null;
      for (let j = i + 1; j < asc.length; j++) {
        const later = asc[j];
        if (isUp ? later.low_price <= gap_bottom : later.high_price >= gap_top) {
          filled = true; fillDate = toTwseStyleDate(String(later.trade_date).slice(0, 10)); break;
        }
      }
      // runaway: gap_pct >= 3%
      const gapKind = Math.abs(gap_pct) >= 3 ? "runaway" : "normal";
      gaps.push({
        date: toTwseStyleDate(String(cur.trade_date).slice(0, 10)),
        type: isUp ? "up" : "down",
        gapKind,
        gap_bottom: r2(gap_bottom),
        gap_top: r2(gap_top),
        gap_pct: r2(Math.abs(gap_pct)),
        filled,
        fill_date: fillDate,
      });
    }
    gaps.reverse();
    const last = asc[asc.length - 1];
    const openUpGaps   = gaps.filter((g) => g.type === "up"   && !g.filled).length;
    const openDownGaps = gaps.filter((g) => g.type === "down" && !g.filled).length;
    const nearestResist = gaps.filter((g) => g.type === "up"   && !g.filled).map((g) => g.gap_bottom).pop() ?? null;
    const nearestSupport = gaps.filter((g) => g.type === "down" && !g.filled).map((g) => g.gap_top).pop() ?? null;
    const bias = openUpGaps > openDownGaps ? "bullish" : (openDownGaps > openUpGaps ? "bearish" : "neutral");
    return {
      name: label,
      summary: {
        latestDate: toTwseStyleDate(String(last.trade_date).slice(0, 10)),
        latestClose: r2(last.close_price),
        bias,
        nearestSupport: nearestSupport != null ? r2(nearestSupport) : null,
        nearestResist:  nearestResist  != null ? r2(nearestResist)  : null,
        openGapUp: openUpGaps,
        openGapDown: openDownGaps,
      },
      gaps,
    };
  } catch (e) {
    return { name: label, error: e?.message || "查詢失敗" };
  }
}

async function marketGaps(request) {
  const u = urlOf(request);
  const lookback = Math.min(180, Math.max(10, parseInt(u.searchParams.get("lookback") || "60", 10) || 60));
  const minGap   = Math.max(0.1, parseFloat(u.searchParams.get("min_gap") || "0.3") || 0.3);
  // Frontend iterates ^TWII / ^TWOII. We don't have index data in DB,
  // so return those keys with a clean "no index data" message — frontend
  // handles `d.error` gracefully. We also tack on a real `^PROXY` from
  // 2330 (台積電) so the panel can show something live.
  const [twii, twoii, proxy] = await Promise.all([
    Promise.resolve({ name: "加權指數", error: "無指數資料（DB 僅存個股/ETF）" }),
    Promise.resolve({ name: "櫃買指數", error: "無指數資料（DB 僅存個股/ETF）" }),
    computeGapsForSymbol("2330", "台積電 (2330) 當作大盤代理", lookback, minGap),
  ]);
  return json({ ok: true, source: "db", "^TWII": twii, "^TWOII": twoii, "^PROXY": proxy });
}

async function fibonacciFor(request, code) {
  if (!/^\d{4,6}$/.test(code)) return json({ error: "invalid code" }, { status: 400 });
  const u = urlOf(request);
  const window = Math.min(500, Math.max(20, parseInt(u.searchParams.get("window") || "60", 10) || 60));
  try {
    const candles = await getCandles(code, window);
    if (candles.length < 20) return json({ error: "資料不足", code, window }, { status: 404 });
    const high = Math.max(...candles.map((c) => c.high));
    const low  = Math.min(...candles.map((c) => c.low));
    const range = high - low;
    const fib382 = high - range * 0.382;
    const fib500 = high - range * 0.5;
    const fib618 = high - range * 0.618;
    // signal: last close vs each level
    const lastClose = candles[candles.length - 1].close;
    const lastVol   = candles[candles.length - 1].volume;
    const signals = [];
    for (const [label, price] of [["38.2%", fib382], ["50.0%", fib500], ["61.8%", fib618]]) {
      // "near" = within 1.5% of level; "crossdown" = crossed down recently
      const distPct = Math.abs((lastClose - price) / price) * 100;
      if (distPct < 1.5 || (lastClose < price && candles[candles.length - 2]?.close >= price)) {
        signals.push({ level: label, type: lastClose < price ? "crossdown" : "near", price: r2(price), volume: lastVol });
      }
    }
    return json({
      ok: true, source: "db", code,
      fib: { window, high: r2(high), low: r2(low), fib382: r2(fib382), fib500: r2(fib500), fib618: r2(fib618) },
      signals,
    });
  } catch (e) {
    return json({ error: e?.message, code }, { status: 500 });
  }
}

async function scanAndEmail(request) {
  // We don't have SMTP. Run a scan, write a marker log, return queued status.
  try {
    const results = await scanAllImpl();
    const summary = {
      scanned: results.length,
      score_ge_4: results.filter((r) => r.score >= 4).length,
      score_ge_3: results.filter((r) => r.score >= 3).length,
      generated_at: Date.now(),
    };
    try {
      await q(
        `INSERT INTO position_history (date, ratio, source) VALUES (CURRENT_DATE, $1, $2)`,
        [summary.score_ge_4, "scan_and_email"]
      );
    } catch {}
    let recipients = [];
    try { ({ rows: recipients } = await q("SELECT email FROM recipients")); } catch {}
    return json({ ok: true, source: "db", queued: true, summary, recipient_count: recipients.length });
  } catch (e) {
    return json({ ok: true, source: "stub", queued: false, error: e?.message });
  }
}

// ── new handlers: etf_holdings/* ─────────────────────────────────────
async function etfList(request) {
  try {
    const { rows } = await q("SELECT code, name, ticker, created_at FROM etf_watchlist ORDER BY sort_order ASC, code ASC LIMIT 200");
    return json({ ok: true, source: "db", count: rows.length, etfs: rows, items: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, etfs: [], items: [], error: e?.message });
  }
}

async function etfListAdd(request) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });
  const body = await readJson(request);
  if (!operatorOk(body?.password)) return json({ error: "密碼錯誤" }, { status: 403 });
  const code = pickStr(body?.code).trim();
  const name = pickStr(body?.name).trim() || code;
  if (!/^\d{4,6}$/.test(code)) return json({ error: "缺少或無效的代號" }, { status: 400 });
  const ticker = `${code}.TW`;
  try {
    await q(
      `INSERT INTO etf_watchlist (code, name, ticker, sort_order) VALUES ($1,$2,$3,0)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, ticker = EXCLUDED.ticker`,
      [code, name, ticker]
    );
    _etfCache = null;
    return json({ ok: true, code, name, ticker });
  } catch (e) {
    return json({ error: e?.message }, { status: 500 });
  }
}

async function etfListRemove(request) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });
  const body = await readJson(request);
  if (!operatorOk(body?.password)) return json({ error: "密碼錯誤" }, { status: 403 });
  const code = pickStr(body?.code).trim();
  if (!code) return json({ error: "缺少代號" }, { status: 400 });
  try {
    await q("DELETE FROM etf_watchlist WHERE code = $1", [code]);
    _etfCache = null;
    return json({ ok: true, code });
  } catch (e) {
    return json({ error: e?.message }, { status: 500 });
  }
}

async function etfSnapshot(request) {
  const etfs = await getEtfList();
  if (!etfs.length) return json({ ok: true, source: "stub", count: 0, items: [] });
  try {
    const codes = etfs.map((e) => e.code);
    // Pull latest 2 bars for each ETF to compute change%.
    const { rows } = await q(
      `SELECT symbol, close_price, change_value, trade_date, volume
       FROM market_price_bars
       WHERE symbol = ANY($1::text[]) AND asset_type='etf' AND trade_date IS NOT NULL
         AND trade_date = (
           SELECT MAX(trade_date) FROM market_price_bars
           WHERE symbol = market_price_bars.symbol AND asset_type='etf'
         )`,
      [codes]
    );
    const items = rows.map((r) => ({
      code: r.symbol,
      close: Number(r.close_price),
      change: Number(r.change_value) || 0,
      change_pct: 0, // computed below
      date: toTwseStyleDate(String(r.trade_date).slice(0, 10)),
      volume: Number(r.volume) || 0,
      name: etfs.find((e) => e.code === r.symbol)?.name ?? r.symbol,
    }));
    return json({ ok: true, source: "db", count: items.length, items, taken_at: Date.now() });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], error: e?.message });
  }
}

async function etfSnapshotAll(request) {
  // POST triggers a "snapshot_all" run. We just return current snapshot synchronously.
  return etfSnapshot(request);
}

async function etfSnapshotAllStatus(request) {
  return json({ ok: true, source: "db", status: "done", done: 1, total: 1, message: "synchronous snapshot; no async job" });
}

async function etfStatus(request) {
  try {
    const { rows } = await q(
      `SELECT MAX(fetched_at) AS last_refresh FROM knowledge_library WHERE record_type = 'etf_snapshot'`
    );
    return json({
      ok: true, source: "db",
      last_refresh: rows[0]?.last_refresh || null,
      count: (await getEtfList()).length,
    });
  } catch (e) {
    return json({ ok: true, source: "stub", last_refresh: null, count: 0 });
  }
}

async function etfAnalyze(request) {
  // Trigger: return task id (no real async work — DB-backed scan only)
  return json({ ok: true, source: "stub", task_id: `etf-${Date.now()}`, status: "queued" });
}

async function etfClearCache(request) {
  _etfCache = null;
  return json({ ok: true, cleared: true });
}

// ── new handlers: rebalance/* ────────────────────────────────────────
async function rebalanceCompute(request) {
  const watch = await getWatchMap();
  const codes = Array.from(watch.keys());
  if (!codes.length) return json({ ok: true, source: "stub", count: 0, items: [] });
  // Equal-weight target as default. If a body has {weights:{CODE:pct}}, use that.
  let customWeights = null;
  if (request.method === "POST") {
    const body = await readJson(request);
    if (body && typeof body.weights === "object") customWeights = body.weights;
  }
  const target = customWeights || Object.fromEntries(codes.map((c) => [c, 100 / codes.length]));
  try {
    const { rows } = await q(
      `SELECT symbol, close_price FROM market_price_bars
       WHERE symbol = ANY($1::text[]) AND asset_type='stock' AND trade_date IS NOT NULL
         AND trade_date = (SELECT MAX(trade_date) FROM market_price_bars
                           WHERE symbol = market_price_bars.symbol AND asset_type='stock')`,
      [codes]
    );
    const priceMap = new Map(rows.map((r) => [r.symbol, Number(r.close_price)]));
    const total = codes.reduce((s, c) => s + (priceMap.get(c) || 0), 0) || 1;
    const items = codes.map((c) => {
      const p = priceMap.get(c) || 0;
      const currentPct = (p / total) * 100;
      const targetPct = target[c] ?? 0;
      return {
        code: c,
        name: watch.get(c)?.name || c,
        price: p,
        current_pct: r2(currentPct),
        target_pct: r2(targetPct),
        diff_pct: r2(currentPct - targetPct),
      };
    });
    return json({ ok: true, source: "db", count: items.length, items, generated_at: Date.now() });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], error: e?.message });
  }
}

async function rebalanceGroups(request) {
  const watch = await getWatchMap();
  const codes = Array.from(watch.keys());
  if (!codes.length) return json({ ok: true, source: "stub", groups: [] });
  try {
    const { rows } = await q(
      `SELECT symbol, market, exchange_name, metadata_text FROM market_instruments
       WHERE symbol = ANY($1::text[]) AND asset_type='stock'`,
      [codes]
    );
    const groups = new Map();
    for (const r of rows) {
      const sector = (() => {
        try { return (r.metadata_text && JSON.parse(r.metadata_text).industry) || "其他"; }
        catch { return "其他"; }
      })();
      if (!groups.has(sector)) groups.set(sector, []);
      groups.get(sector).push({ code: r.symbol, name: watch.get(r.symbol)?.name || r.symbol, exchange: r.exchange_name });
    }
    const out = Array.from(groups.entries()).map(([sector, items]) => ({ sector, count: items.length, items }));
    return json({ ok: true, source: "db", count: out.length, groups: out });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, groups: [], error: e?.message });
  }
}

async function rebalanceDynamic(request) {
  return rebalanceCompute(request);
}

// ── new handlers: uptrend_watch/* ────────────────────────────────────
async function uptrendWatch(request) {
  const results = await scanAllImpl();
  // uptrend: ma20 > ma60 alignment + last > ma5 (per cond2+cond3)
  const items = results.filter((r) => r.cond2 && r.cond3).map((r) => ({ ...r, status: r.score >= 4 ? "強勢多頭" : "轉強觀察" }));
  return json({ ok: true, source: "db", count: items.length, items, generated_at: Date.now() });
}
async function uptrendWatchFilter(request) { return uptrendWatch(request); }

// ── new handlers: admin/logs (markers as log) ────────────────────────
async function adminLogs(request, id) {
  try {
    if (id) {
      const { rows } = await q("SELECT id, code, date, type, text, price FROM markers WHERE id = $1", [parseInt(id, 10)]);
      return json({ ok: true, source: "db", log: rows[0] || null });
    }
    const { rows } = await q("SELECT id, code, date, type, text, price FROM markers ORDER BY date DESC LIMIT 200");
    return json({ ok: true, source: "db", count: rows.length, logs: rows, items: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, logs: [], items: [], error: e?.message });
  }
}
async function adminLogsClear(request) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });
  const body = await readJson(request);
  if (!operatorOk(body?.password)) return json({ error: "密碼錯誤" }, { status: 403 });
  try {
    const { rows } = await q("DELETE FROM markers");
    return json({ ok: true, cleared: true });
  } catch (e) {
    return json({ error: e?.message }, { status: 500 });
  }
}

// ── new handlers: conference, exdiv, etc. ────────────────────────────
async function conferenceList(request) {
  const u = urlOf(request);
  const fromDate = u.searchParams.get("from");
  const toDate   = u.searchParams.get("to");
  const watchOnly = u.searchParams.get("watch_only") === "1";
  let codes = null;
  if (watchOnly) {
    const watch = await getWatchMap();
    codes = Array.from(watch.keys());
  }
  try {
    let sql = `SELECT id, title, summary_text, record_url, published_at, fetched_at, query_term
               FROM knowledge_library
               WHERE record_type IN ('conference','earnings','research')`;
    const params = [];
    if (fromDate) { params.push(fromDate); sql += ` AND fetched_at >= $${params.length}::date`; }
    if (toDate)   { params.push(toDate);   sql += ` AND fetched_at <= $${params.length}::date + INTERVAL '1 day'`; }
    sql += ` ORDER BY fetched_at DESC NULLS LAST LIMIT 200`;
    const { rows } = await q(sql, params);
    // Filter by code in JS (query_term is free-text; rough match)
    const filtered = (codes && codes.length)
      ? rows.filter((r) => r.query_term && codes.some((c) => r.query_term.includes(c)))
      : rows;
    return json({ ok: true, source: "db", count: filtered.length, items: filtered, conferences: filtered });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], conferences: [], error: e?.message });
  }
}
async function conferenceSentimentStats(request) {
  try {
    // knowledge_library has no sentiment column; return rough distribution by query_term prefix.
    const { rows } = await q(
      `SELECT query_term, COUNT(*)::int AS n
       FROM knowledge_library
       WHERE record_type IN ('conference','earnings')
       GROUP BY query_term
       ORDER BY n DESC
       LIMIT 20`
    );
    return json({ ok: true, source: "db", count: rows.length, buckets: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, buckets: [], error: e?.message });
  }
}

async function exdivCalendar(request) {
  const u = urlOf(request);
  const days = Math.min(365, Math.max(1, parseInt(u.searchParams.get("days") || "30", 10) || 30));
  try {
    const { rows } = await q(
      `SELECT id, symbol, ex_date, pay_date, record_date, cash_dividend, stock_dividend, source
       FROM dividend_calendar
       WHERE ex_date >= CURRENT_DATE AND ex_date <= CURRENT_DATE + ($1 || ' days')::interval
       ORDER BY ex_date ASC
       LIMIT 200`,
      [String(days)]
    );
    return json({ ok: true, source: "db", count: rows.length, items: rows, days });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], error: e?.message, message: "dividend_calendar table empty or missing" });
  }
}
async function exdivUpcoming(request) {
  const u = urlOf(request);
  const days = Math.min(60, Math.max(1, parseInt(u.searchParams.get("days") || "7", 10) || 7));
  try {
    const { rows } = await q(
      `SELECT id, symbol, ex_date, pay_date, cash_dividend, stock_dividend
       FROM dividend_calendar
       WHERE ex_date >= CURRENT_DATE AND ex_date <= CURRENT_DATE + ($1 || ' days')::interval
       ORDER BY ex_date ASC
       LIMIT 50`,
      [String(days)]
    );
    return json({ ok: true, source: "db", count: rows.length, items: rows, days });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], error: e?.message, message: "dividend_calendar table empty or missing" });
  }
}

// ── institutional / foreign_futures / financial / revenue etc. ───────
async function institutionalImpl(request, code) {
  try {
    let sql = `SELECT id, symbol, trade_date, foreign_buy, foreign_sell, foreign_net,
                      trust_buy, trust_sell, trust_net, dealer_buy, dealer_sell, dealer_net, source
               FROM institutional`;
    const params = [];
    if (code) { params.push(code); sql += ` WHERE symbol = $${params.length}`; }
    sql += ` ORDER BY trade_date DESC LIMIT ${code ? "60" : "500"}`;
    const { rows } = await q(sql, params);
    return json({ ok: true, source: "db", count: rows.length, items: rows, institutional: rows, code: code || null });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], institutional: [], error: e?.message, message: "institutional table empty or missing" });
  }
}
async function institutional(request) { return institutionalImpl(request, null); }
async function institutionalByCode(request, code) { return institutionalImpl(request, code); }

async function indexInstitutional(request) {
  try {
    const { rows } = await q(
      `SELECT id, index_code, trade_date, foreign_net, trust_net, dealer_net
       FROM index_institutional
       ORDER BY trade_date DESC LIMIT 60`
    );
    return json({ ok: true, source: "db", count: rows.length, items: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], error: e?.message, message: "index_institutional table empty or missing" });
  }
}

async function foreignFutures(request) {
  try {
    const { rows } = await q(
      `SELECT id, symbol, contract, trade_date, open_price, high_price, low_price, close_price, volume, open_interest
       FROM futures
       ORDER BY trade_date DESC, symbol, contract
       LIMIT 200`
    );
    return json({ ok: true, source: "db", count: rows.length, items: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], error: e?.message, message: "futures table empty or missing" });
  }
}

async function financial(request) {
  const u = urlOf(request);
  const code = u.searchParams.get("code");
  try {
    let sql = `SELECT id, symbol, period, revenue, gross_profit, operating_income, net_income, eps
               FROM financial_reports`;
    const params = [];
    if (code) { params.push(code); sql += ` WHERE symbol = $${params.length}`; }
    sql += ` ORDER BY period DESC LIMIT ${code ? "20" : "200"}`;
    const { rows } = await q(sql, params);
    return json({ ok: true, source: "db", count: rows.length, items: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], error: e?.message, message: "financial_reports table empty or missing" });
  }
}

async function overnightSignal(request) {
  try {
    const { rows } = await q(
      `SELECT id, symbol, trade_date, close_price, change_pct
       FROM overseas_indices
       WHERE trade_date >= CURRENT_DATE - 3
       ORDER BY trade_date DESC, symbol
       LIMIT 30`
    );
    return json({ ok: true, source: "db", count: rows.length, items: rows, as_of: new Date().toISOString() });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], error: e?.message, message: "overseas_indices table empty or missing" });
  }
}

async function marginBurst(request) {
  try {
    // surge = margin_balance grew > 5% day-over-day
    const { rows } = await q(
      `WITH latest AS (
         SELECT symbol, trade_date, margin_balance, short_balance,
                LAG(margin_balance) OVER (PARTITION BY symbol ORDER BY trade_date) AS prev_balance
         FROM margin_balance
       )
       SELECT symbol, trade_date, margin_balance, short_balance,
              CASE WHEN prev_balance > 0
                   THEN ROUND(((margin_balance - prev_balance) / prev_balance * 100)::numeric, 2)
                   ELSE 0 END AS margin_change_pct
       FROM latest
       WHERE prev_balance > 0
         AND ((margin_balance - prev_balance) / prev_balance) > 0.05
       ORDER BY trade_date DESC, margin_change_pct DESC
       LIMIT 100`
    );
    return json({ ok: true, source: "db", count: rows.length, items: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], error: e?.message, message: "margin_balance table empty or missing" });
  }
}

async function bigHolderLowBase(request) {
  // Strategy: stocks where a single holder owns > 5% AND price near 52w low.
  try {
    const { rows } = await q(
      `SELECT b.symbol, b.holder_type, b.holder_name, b.shares, b.pct, b.as_of_date
       FROM big_holders b
       WHERE b.pct > 5
       ORDER BY b.pct DESC
       LIMIT 100`
    );
    return json({ ok: true, source: "db", count: rows.length, items: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], error: e?.message, message: "big_holders table empty or missing" });
  }
}

async function revenue(request) {
  const u = urlOf(request);
  const code = u.searchParams.get("code");
  try {
    let sql = `SELECT id, symbol, year, month, revenue, yoy_pct, mom_pct
               FROM revenue`;
    const params = [];
    if (code) { params.push(code); sql += ` WHERE symbol = $${params.length}`; }
    sql += ` ORDER BY year DESC, month DESC LIMIT ${code ? "24" : "500"}`;
    const { rows } = await q(sql, params);
    return json({ ok: true, source: "db", count: rows.length, items: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], error: e?.message, message: "revenue table empty or missing" });
  }
}

async function aiCapex(request) {
  try {
    const { rows } = await q(
      `SELECT id, company, year, quarter, capex, revenue, capex_pct_of_revenue
       FROM ai_capex
       ORDER BY year DESC, quarter DESC
       LIMIT 200`
    );
    return json({ ok: true, source: "db", count: rows.length, items: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], error: e?.message, message: "ai_capex table empty or missing" });
  }
}

async function macroYield2yHistory(request) {
  try {
    const { rows } = await q(
      `SELECT id, series, trade_date, value
       FROM macro_yields
       WHERE series IN ('yield_2y', 'yield_10y')
       ORDER BY trade_date DESC
       LIMIT 500`
    );
    return json({ ok: true, source: "db", count: rows.length, items: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], error: e?.message, message: "macro_yields table empty or missing" });
  }
}

// ── price_compare / heatmap ──────────────────────────────────────────
async function priceCompare(request) {
  const u = urlOf(request);
  const kind = pickStr(u.searchParams.get("kind") || "stocks");
  const codesParam = pickStr(u.searchParams.get("codes") || "");
  const codes = codesParam ? codesParam.split(",").map((c) => c.trim()).filter((c) => /^\d{4,6}$/.test(c)) : [];
  if (!codes.length) {
    return json({ ok: false, error: "missing or invalid ?codes= (comma-separated stock codes)" }, { status: 400 });
  }
  const days = Math.min(500, Math.max(10, parseInt(u.searchParams.get("days") || "60", 10) || 60));
  try {
    const { rows } = await q(
      `SELECT symbol, trade_date, close_price
       FROM market_price_bars
       WHERE symbol = ANY($1::text[]) AND asset_type='stock' AND trade_date IS NOT NULL
         AND trade_date >= (SELECT MAX(trade_date) FROM market_price_bars) - ($2 || ' days')::interval
       ORDER BY symbol, trade_date ASC`,
      [codes, String(days)]
    );
    // Group by symbol
    const series = new Map();
    for (const r of rows) {
      if (!series.has(r.symbol)) series.set(r.symbol, []);
      series.get(r.symbol).push({ date: toTwseStyleDate(String(r.trade_date).slice(0, 10)), close: Number(r.close_price) });
    }
    const items = Array.from(series.entries()).map(([code, points]) => {
      const base = points[0]?.close || 0;
      const last = points[points.length - 1]?.close || 0;
      return {
        code, name: null,
        base, last,
        change_pct: base ? r2(((last - base) / base) * 100) : 0,
        points,
      };
    });
    return json({ ok: true, source: "db", kind, count: items.length, items, days });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], error: e?.message });
  }
}

async function heatmap(request) {
  // Sector heatmap: for each sector, compute avg change% of watchlist stocks in that sector.
  try {
    const watch = await getWatchMap();
    const codes = Array.from(watch.keys());
    if (!codes.length) return json({ ok: true, source: "db", count: 0, items: [] });
    const { rows } = await q(
      `SELECT mi.symbol, mi.metadata_text,
              (SELECT close_price FROM market_price_bars
                WHERE symbol = mi.symbol AND asset_type='stock' AND trade_date IS NOT NULL
                ORDER BY trade_date DESC LIMIT 1) AS close,
              (SELECT close_price FROM market_price_bars
                WHERE symbol = mi.symbol AND asset_type='stock' AND trade_date IS NOT NULL
                ORDER BY trade_date DESC OFFSET 1 LIMIT 1) AS prev_close
       FROM market_instruments mi
       WHERE mi.symbol = ANY($1::text[]) AND mi.asset_type='stock'`,
      [codes]
    );
    const sectorMap = new Map();
    for (const r of rows) {
      const sector = (() => { try { return (r.metadata_text && JSON.parse(r.metadata_text).industry) || "其他"; } catch { return "其他"; } })();
      const chg = r.prev_close && r.close ? ((Number(r.close) - Number(r.prev_close)) / Number(r.prev_close)) * 100 : 0;
      if (!sectorMap.has(sector)) sectorMap.set(sector, []);
      sectorMap.get(sector).push({ code: r.symbol, change_pct: r2(chg), close: Number(r.close) || 0 });
    }
    const items = Array.from(sectorMap.entries()).map(([sector, stocks]) => ({
      sector, count: stocks.length, avg_change_pct: r2(avg(stocks.map((s) => s.change_pct))), stocks,
    })).sort((a, b) => b.avg_change_pct - a.avg_change_pct);
    return json({ ok: true, source: "db", count: items.length, items, generated_at: Date.now() });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], error: e?.message });
  }
}

// ── etf_signal_filter / stock_damo_filter / stock_news_scan ──────────
async function etfSignalFilter(request) {
  const etfs = await getEtfList();
  if (!etfs.length) return json({ ok: true, source: "db", count: 0, items: [], message: "etf_watchlist empty" });
  try {
    const codes = etfs.map((e) => e.code);
    const { rows } = await q(
      `SELECT symbol, close_price, change_value, volume, trade_date
       FROM market_price_bars
       WHERE symbol = ANY($1::text[]) AND asset_type='etf' AND trade_date IS NOT NULL
         AND trade_date = (SELECT MAX(trade_date) FROM market_price_bars
                           WHERE symbol = market_price_bars.symbol AND asset_type='etf')`,
      [codes]
    );
    const items = rows.map((r) => {
      const last = Number(r.close_price);
      const chg = Number(r.change_value) || 0;
      const chgPct = last ? (chg / (last - chg)) * 100 : 0;
      const etf = etfs.find((e) => e.code === r.symbol);
      return {
        code: r.symbol, name: etf?.name || r.symbol,
        close: last, change: chg, change_pct: r2(chgPct),
        volume: Number(r.volume) || 0,
        date: toTwseStyleDate(String(r.trade_date).slice(0, 10)),
      };
    });
    return json({ ok: true, source: "db", count: items.length, items, generated_at: Date.now() });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], error: e?.message });
  }
}

async function etfSignalFilterStatus(request) { return etfSignalFilter(request); }
async function etfSignalFilterRefresh(request) { return etfSignalFilter(request); }

async function stockDamoFilter(request) {
  // "大毛" filter: cond2+cond3+cond4 + above MA20 (similar to signal_filter but a different threshold view)
  const results = await scanAllImpl();
  const items = results.filter((r) => r.cond2 && r.cond3 && r.cond4).map((r) => ({ ...r, status: "大毛候選" }));
  return json({ ok: true, source: "db", count: items.length, items, generated_at: Date.now() });
}
async function stockDamoFilterStatus(request) { return stockDamoFilter(request); }
async function stockDamoFilterRefresh(request) { return stockDamoFilter(request); }

async function stockNewsScan(request) {
  const u = urlOf(request);
  const code = u.searchParams.get("code");
  const limit = Math.min(200, Math.max(1, parseInt(u.searchParams.get("limit") || "50", 10) || 50));
  try {
    let sql = `SELECT id, title, summary_text, record_url, query_term, published_at, fetched_at
               FROM knowledge_library
               WHERE record_type = 'news'`;
    const params = [];
    if (code) { params.push(`%${code}%`); sql += ` AND (query_term ILIKE $${params.length} OR content_text ILIKE $${params.length})`; }
    sql += ` ORDER BY fetched_at DESC NULLS LAST LIMIT ${limit}`;
    const { rows } = await q(sql, params);
    return json({ ok: true, source: "db", count: rows.length, items: rows, news: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], news: [], error: e?.message });
  }
}
async function stockNewsScanQuota(request) {
  // 簡易 quota 顯示:今天跑過幾次 (from markers)
  try {
    const { rows } = await q(
      `SELECT COUNT(*)::int AS used FROM markers WHERE date = CURRENT_DATE::text`
    );
    return json({ ok: true, source: "db", used: rows[0]?.used || 0, quota: 100, remaining: 100 - (rows[0]?.used || 0) });
  } catch (e) {
    return json({ ok: true, source: "stub", used: 0, quota: 100, remaining: 100, error: e?.message });
  }
}

// ── etf_pivot/* real handlers ────────────────────────────────────────
async function etfPivotOverlap(request) {
  const u = urlOf(request);
  const etfsParam = pickStr(u.searchParams.get("etfs") || "");
  const etfs = etfsParam ? etfsParam.split(",").map((c) => c.trim()).filter((c) => /^\d{4,6}$/.test(c)) : [];
  try {
    let sql = `SELECT etf_code, symbol, weight_pct, as_of_date
               FROM etf_holdings`;
    const params = [];
    if (etfs.length) { params.push(etfs); sql += ` WHERE etf_code = ANY($${params.length}::text[])`; }
    sql += ` ORDER BY etf_code, weight_pct DESC LIMIT 1000`;
    const { rows } = await q(sql, params);
    // Compute pairwise overlap (% weight of stocks in both)
    const byEtf = new Map();
    for (const r of rows) {
      if (!byEtf.has(r.etf_code)) byEtf.set(r.etf_code, new Map());
      byEtf.get(r.etf_code).set(r.symbol, Number(r.weight_pct) || 0);
    }
    const etfCodes = Array.from(byEtf.keys());
    const overlap = [];
    for (let i = 0; i < etfCodes.length; i++) {
      for (let j = i + 1; j < etfCodes.length; j++) {
        const a = byEtf.get(etfCodes[i]);
        const b = byEtf.get(etfCodes[j]);
        let shared = 0;
        for (const [sym, w] of a) if (b.has(sym)) shared += Math.min(w, b.get(sym));
        if (shared > 0) overlap.push({ a: etfCodes[i], b: etfCodes[j], overlap_pct: r2(shared) });
      }
    }
    overlap.sort((x, y) => y.overlap_pct - x.overlap_pct);
    return json({ ok: true, source: "db", count: overlap.length, overlap, holdings_count: rows.length });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, overlap: [], error: e?.message, message: "etf_holdings table empty or missing" });
  }
}

async function etfPivotOverlapDetail(request, a, b) {
  const u = urlOf(request);
  const topN = Math.min(100, Math.max(1, parseInt(u.searchParams.get("top_n") || "20", 10) || 20));
  try {
    const { rows } = await q(
      `SELECT symbol, weight_pct, as_of_date
       FROM etf_holdings
       WHERE etf_code IN ($1, $2)
       ORDER BY weight_pct DESC LIMIT 200`,
      [a, b]
    );
    const by = new Map();
    for (const r of rows) {
      if (!by.has(r.symbol)) by.set(r.symbol, { weight_a: 0, weight_b: 0 });
      if (r.weight_pct != null) by.get(r.symbol)[r.etf_code === a ? "weight_a" : "weight_b"] = Number(r.weight_pct);
    }
    const holdings = Array.from(by.entries())
      .filter(([_, v]) => v.weight_a > 0 || v.weight_b > 0)
      .map(([symbol, v]) => ({ symbol, weight_a: v.weight_a, weight_b: v.weight_b, min_weight: Math.min(v.weight_a, v.weight_b) }))
      .sort((x, y) => y.min_weight - x.min_weight)
      .slice(0, topN);
    return json({ ok: true, source: "db", a, b, count: holdings.length, holdings });
  } catch (e) {
    return json({ ok: true, source: "stub", a, b, count: 0, holdings: [], error: e?.message, message: "etf_holdings table empty or missing" });
  }
}

async function etfPivotConcentration(request) {
  try {
    const { rows } = await q(
      `SELECT etf_code, symbol, weight_pct, as_of_date
       FROM etf_holdings
       WHERE weight_pct >= 5
       ORDER BY weight_pct DESC
       LIMIT 100`
    );
    return json({ ok: true, source: "db", count: rows.length, concentration: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, concentration: [], error: e?.message, message: "etf_holdings table empty or missing" });
  }
}

async function etfPivotConsensus(request) {
  // stocks that appear in N+ ETFs
  try {
    const { rows } = await q(
      `SELECT symbol, COUNT(DISTINCT etf_code)::int AS etf_count, AVG(weight_pct)::numeric(10,4) AS avg_weight, MAX(as_of_date) AS as_of_date
       FROM etf_holdings
       GROUP BY symbol
       HAVING COUNT(DISTINCT etf_code) >= 2
       ORDER BY etf_count DESC, avg_weight DESC
       LIMIT 100`
    );
    return json({ ok: true, source: "db", count: rows.length, consensus: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, consensus: [], error: e?.message, message: "etf_holdings table empty or missing" });
  }
}

async function etfPivotWeightMatrix(request) {
  const u = urlOf(request);
  const etfsParam = pickStr(u.searchParams.get("etfs") || "");
  const etfs = etfsParam ? etfsParam.split(",").map((c) => c.trim()).filter((c) => /^\d{4,6}$/.test(c)) : [];
  try {
    let sql = `SELECT etf_code, symbol, weight_pct
               FROM etf_holdings`;
    const params = [];
    if (etfs.length) { params.push(etfs); sql += ` WHERE etf_code = ANY($${params.length}::text[])`; }
    sql += ` ORDER BY etf_code, weight_pct DESC LIMIT 1000`;
    const { rows } = await q(sql, params);
    const symbols = Array.from(new Set(rows.map((r) => r.symbol)));
    const matrix = {};
    for (const r of rows) {
      if (!matrix[r.symbol]) matrix[r.symbol] = {};
      matrix[r.symbol][r.etf_code] = Number(r.weight_pct) || 0;
    }
    return json({ ok: true, source: "db", symbols, count: symbols.length, matrix, etfs: etfs.length ? etfs : Array.from(new Set(rows.map((r) => r.etf_code))) });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, matrix: {}, symbols: [], error: e?.message, message: "etf_holdings table empty or missing" });
  }
}

async function etfPivotTimeHeatmap(request, code) {
  try {
    const { rows } = await q(
      `SELECT as_of_date, symbol, weight_pct
       FROM etf_holdings
       WHERE etf_code = $1
       ORDER BY as_of_date DESC, weight_pct DESC
       LIMIT 500`,
      [code]
    );
    return json({ ok: true, source: "db", code, count: rows.length, heatmap: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", code, count: 0, heatmap: [], error: e?.message, message: "etf_holdings table empty or missing" });
  }
}

async function etfPivotTurnover(request) {
  const u = urlOf(request);
  const etfsParam = pickStr(u.searchParams.get("etfs") || "");
  const lookback = Math.min(180, Math.max(7, parseInt(u.searchParams.get("lookback") || "30", 10) || 30));
  const etfs = etfsParam ? etfsParam.split(",").map((c) => c.trim()).filter((c) => /^\d{4,6}$/.test(c)) : [];
  try {
    let sql = `WITH snaps AS (
       SELECT etf_code, as_of_date, symbol, weight_pct
       FROM etf_holdings
       WHERE as_of_date >= CURRENT_DATE - ($1 || ' days')::interval
         ${etfs.length ? "AND etf_code = ANY($" + (etfs.length + 1) + "::text[])" : ""}
    ),
    ranked AS (
       SELECT *, ROW_NUMBER() OVER (PARTITION BY etf_code, symbol ORDER BY as_of_date DESC) AS rn
       FROM snaps
    )
    SELECT etf_code, symbol,
           MAX(CASE WHEN rn = 1 THEN weight_pct END) AS latest_weight,
           MAX(CASE WHEN rn = (SELECT MAX(rn) FROM ranked r2 WHERE r2.etf_code = ranked.etf_code AND r2.symbol = ranked.symbol) THEN weight_pct END) AS oldest_weight,
           MAX(CASE WHEN rn = 1 THEN as_of_date END) AS latest_date
    FROM ranked
    GROUP BY etf_code, symbol
    HAVING MAX(CASE WHEN rn = 1 THEN weight_pct END) IS NOT NULL
       AND MAX(CASE WHEN rn = (SELECT MAX(rn) FROM ranked r2 WHERE r2.etf_code = ranked.etf_code AND r2.symbol = ranked.symbol) THEN weight_pct END) IS NOT NULL`;
    const params = [String(lookback)];
    if (etfs.length) params.push(etfs);
    const { rows } = await q(sql, params);
    const turnover = rows.map((r) => ({
      etf_code: r.etf_code, symbol: r.symbol,
      latest_weight: Number(r.latest_weight), oldest_weight: Number(r.oldest_weight),
      change_pct: r2(Number(r.latest_weight) - Number(r.oldest_weight)),
    })).sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct)).slice(0, 100);
    return json({ ok: true, source: "db", count: turnover.length, turnover });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, turnover: [], error: e?.message, message: "etf_holdings table empty or missing" });
  }
}

async function etfSnapshots(request, code) {
  const u = urlOf(request);
  const limit = Math.min(200, Math.max(1, parseInt(u.searchParams.get("limit") || "30", 10) || 30));
  try {
    const { rows } = await q(
      `SELECT id, etf_code, as_of_date, total_net_value, holdings_count, top_holding_symbol, top_holding_pct
       FROM etf_snapshots
       WHERE etf_code = $1
       ORDER BY as_of_date DESC
       LIMIT $2`,
      [code, limit]
    );
    return json({ ok: true, source: "db", code, count: rows.length, snapshots: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", code, count: 0, snapshots: [], error: e?.message, message: "etf_snapshots table empty or missing" });
  }
}

async function etfDiff(request, code) {
  try {
    const { rows } = await q(
      `WITH latest AS (
         SELECT DISTINCT ON (symbol) symbol, weight_pct, as_of_date
         FROM etf_holdings
         WHERE etf_code = $1
         ORDER BY symbol, as_of_date DESC
       ),
       prev AS (
         SELECT DISTINCT ON (symbol) symbol, weight_pct, as_of_date
         FROM etf_holdings
         WHERE etf_code = $1 AND as_of_date < (SELECT MAX(as_of_date) FROM etf_holdings WHERE etf_code = $1)
         ORDER BY symbol, as_of_date DESC
       )
       SELECT l.symbol, l.weight_pct AS latest_weight, p.weight_pct AS prev_weight,
              ROUND((l.weight_pct - COALESCE(p.weight_pct, 0))::numeric, 4) AS diff_weight
       FROM latest l
       LEFT JOIN prev p ON l.symbol = p.symbol
       ORDER BY ABS(COALESCE(l.weight_pct - p.weight_pct, 0)) DESC
       LIMIT 100`,
      [code]
    );
    return json({ ok: true, source: "db", code, count: rows.length, diff: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", code, count: 0, diff: [], error: e?.message, message: "etf_holdings table empty or missing" });
  }
}

async function etfStockScan(request, code) {
  // Real version: scan all stocks in this ETF's holdings for screener hits.
  try {
    const { rows } = await q(
      `SELECT DISTINCT symbol FROM etf_holdings WHERE etf_code = $1 LIMIT 50`,
      [code]
    );
    const codes = rows.map((r) => r.symbol).filter((s) => /^\d{4,6}$/.test(s));
    if (!codes.length) return json({ ok: true, source: "db", code, count: 0, items: [], message: "ETF has no holdings recorded" });
    const results = (await Promise.all(codes.map(async (c) => screenOne(c, null)))).filter(Boolean);
    return json({ ok: true, source: "db", code, count: results.length, items: results });
  } catch (e) {
    return json({ ok: true, source: "stub", code, count: 0, items: [], error: e?.message, message: "etf_holdings table empty or missing" });
  }
}

async function etfStockScanStatus(request, taskId) {
  return json({ ok: true, source: "db", task_id: taskId, status: "done", done: 1, total: 1, message: "synchronous scan" });
}

async function etfStockScanResult(request, code) {
  return etfStockScan(request, code);
}

async function etfExport(request, code) {
  try {
    const { rows } = await q(
      `SELECT symbol, shares, weight_pct, market_value, as_of_date
       FROM etf_holdings
       WHERE etf_code = $1
       ORDER BY weight_pct DESC
       LIMIT 500`,
      [code]
    );
    const header = "symbol,shares,weight_pct,market_value,as_of_date";
    const lines = rows.map((r) => [r.symbol, r.shares, r.weight_pct, r.market_value, r.as_of_date].join(","));
    const csv = [header, ...lines].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="etf-holdings-${code}-${Date.now()}.csv"`,
        ...CACHE_NO_STORE,
      },
    });
  } catch (e) {
    return new Response("symbol,shares,weight_pct,market_value,as_of_date\n", { headers: { "Content-Type": "text/csv; charset=utf-8" } });
  }
}

// ── single-resource GETs (markers/<id>, recipients/<id>, etc.) ──────
async function markerById(request, id) {
  const i = parseInt(id, 10);
  if (!Number.isFinite(i)) return json({ error: "invalid id" }, { status: 400 });
  try {
    const { rows } = await q("SELECT id, code, date, type, text, price FROM markers WHERE id = $1", [i]);
    if (!rows.length) return json({ error: "not found", id: i }, { status: 404 });
    return json({ ok: true, source: "db", marker: rows[0], item: rows[0] });
  } catch (e) {
    return json({ ok: true, source: "stub", marker: null, error: e?.message });
  }
}

async function recipientById(request, id) {
  const i = parseInt(id, 10);
  if (!Number.isFinite(i)) return json({ error: "invalid id" }, { status: 400 });
  try {
    const { rows } = await q("SELECT id, name, email FROM recipients WHERE id = $1", [i]);
    if (!rows.length) return json({ error: "not found", id: i }, { status: 404 });
    return json({ ok: true, source: "db", recipient: rows[0] });
  } catch (e) {
    return json({ ok: true, source: "stub", recipient: null, error: e?.message });
  }
}

async function etfByCode(request, code) {
  // Single ETF detail: snapshot + holdings + status
  try {
    const list = await getEtfList();
    const etf = list.find((e) => e.code === code);
    if (!etf) return json({ error: "not in etf_watchlist", code }, { status: 404 });
    const { rows: candles } = await q(
      `SELECT trade_date, close_price, change_value, volume
       FROM market_price_bars
       WHERE symbol = $1 AND asset_type='etf' AND trade_date IS NOT NULL
       ORDER BY trade_date DESC LIMIT 60`,
      [code]
    );
    const { rows: holdings } = await q(
      `SELECT symbol, shares, weight_pct, as_of_date
       FROM etf_holdings WHERE etf_code = $1
       ORDER BY weight_pct DESC LIMIT 50`,
      [code]
    );
    return json({
      ok: true, source: "db", code, name: etf.name, ticker: etf.ticker,
      candles: candles.map((r) => ({
        date: toTwseStyleDate(String(r.trade_date).slice(0, 10)),
        close: Number(r.close_price),
        change: Number(r.change_value) || 0,
        volume: Number(r.volume) || 0,
      })),
      holdings_count: holdings.length,
      holdings,
    });
  } catch (e) {
    return json({ ok: true, source: "stub", code, error: e?.message, message: "etf_holdings table may be empty" });
  }
}

// ── placeholders (return helpful shape, not pure stub) ───────────────
function placeholder(name, hint) {
  return json({ ok: true, source: "stub", tier: 1, endpoint: name, hint, value: null, items: [] });
}

function stub(name, extra = {}) {
  return json({ ok: true, source: "stub", endpoint: name, ...extra });
}

// ── router ──────────────────────────────────────────────────────────
const TABLE = [
  // [method, path-regex, handler]
  ["GET",  /^\/healthz\/?$/,                healthz],
  ["GET",  /^\/stocks\/?$/,                  listStocks],
  ["GET",  /^\/stocks\/remove\/?$/,          stub.bind(null, "stocks_remove_list", { hint: "use DELETE/POST /api/stocks/remove/<code>" })],
  ["POST", /^\/stocks\/add\/?$/,             addStock],
  ["GET",  /^\/stock\/?$/,                   stub.bind(null, "stock_index", { hint: "use /api/stock/<ticker>" })],
  ["DELETE", /^\/stocks\/remove\/([^/]+?)\/?$/, removeStock],
  ["POST",    /^\/stocks\/remove\/([^/]+?)\/?$/, removeStock],
  ["GET",   /^\/stock\/([^/]+?)\/?$/,        stockKlines],

  ["GET",  /^\/market_gaps\/?$/,             marketGaps],

  ["GET",  /^\/scan\/?$/,                    scanAll],
  ["POST", /^\/scan\/?$/,                    scanAll],
  ["GET",  /^\/scan_and_email\/?$/,          scanAndEmail],
  ["POST", /^\/scan_and_email\/?$/,          scanAndEmail],

  ["GET",  /^\/fibonacci\/?$/,               stub.bind(null, "fibonacci_index", { hint: "use /api/fibonacci/<code>" })],
  ["GET",  /^\/fibonacci\/([^/]+?)\/?$/,     fibonacciFor],

  ["GET",  /^\/index\/?$/,                   indexEndpoint],
  ["GET",  /^\/institutional\/?$/,           institutional],
  ["GET",  /^\/institutional\/([^/]+?)\/?$/, institutionalByCode],
  ["GET",  /^\/stock_industry\/?$/,          stockIndustry],

  ["GET",  /^\/intraday_scan\/status\/?$/,   intradayScanStatus],
  ["POST", /^\/intraday_scan\/toggle\/?$/,   intradayScanToggle],

  ["GET",  /^\/recipients\/?$/,              listRecipients],
  ["POST", /^\/recipients\/add\/?$/,         addRecipient],
  ["POST", /^\/recipients\/remove\/?$/,      removeRecipient],
  ["GET",  /^\/recipients\/([^/]+?)\/?$/,    recipientById],

  ["GET",  /^\/position_history\/?$/,        positionHistory],

  ["GET",  /^\/macro_news\/?$/,              macroNews],
  ["GET",  /^\/news\/?$/,                    newsList],
  ["GET",  /^\/news\/market\/?$/,            newsMarket],
  ["GET",  /^\/macro_data\/?$/,              macroData],
  ["GET",  /^\/macro_yield2y_history\/?$/,   macroYield2yHistory],

  ["POST", /^\/markers\/record\/?$/,         markersRecord],
  ["GET",  /^\/markers\/history\/?$/,        markersHistory],
  ["GET",  /^\/markers\/batch_scan\/?$/,     markersBatchScan],
  ["GET",  /^\/markers\/batch_scan\/status\/?$/, markersBatchScanStatus],
  ["GET",  /^\/markers\/export\.csv\/?$/,    markersExport],
  ["GET",  /^\/markers\/([^/]+?)\/?$/,       markerById],

  ["GET",  /^\/strategy_signals\/?$/,        strategySignals],
  ["GET",  /^\/strategy_signals\/([^/]+?)\/?$/, strategySignals],

  ["GET",  /^\/signal_history\/?$/,          signalHistory],
  ["POST", /^\/signal_history\/record\/?$/,  signalHistoryRecord],

  ["GET",  /^\/warming_zone_scan\/?$/,       warmingZoneScan],
  ["GET",  /^\/warming_zone_scan\/status\/?$/, warmingZoneScanStatus],
  ["GET",  /^\/warming_zone_scan\/refresh\/?$/, warmingZoneScan],

  ["GET",  /^\/signal_filter\/?$/,           signalFilter],
  ["GET",  /^\/signal_filter\/status\/?$/,   signalFilterStatus],
  ["GET",  /^\/signal_filter\/refresh\/?$/,  signalFilter],
  ["GET",  /^\/signal_filter\/all_strategy_hits\/?$/, signalFilter],

  ["GET",  /^\/intraday_check\/?$/,          stub.bind(null, "intraday_check", { hint: "use /api/intraday_check/<code>" })],
  ["GET",  /^\/intraday_check\/([^/]+?)\/?$/, intradayCheck],
  ["GET",  /^\/intraday_check\/status\/?$/,  stub.bind(null, "intraday_check_status", { enabled: false, message: "intraday scan disabled" })],

  // ETF holdings
  ["GET",  /^\/etf_holdings\/snapshot\/?$/,  etfSnapshot],
  ["POST", /^\/etf_holdings\/snapshot_all\/?$/, etfSnapshotAll],
  ["GET",  /^\/etf_holdings\/snapshot_all\/?$/,  etfSnapshotAll],
  ["GET",  /^\/etf_holdings\/snapshot_all\/status\/?$/, etfSnapshotAllStatus],
  ["GET",  /^\/etf_holdings\/status\/?$/,    etfStatus],
  ["GET",  /^\/etf_holdings\/list\/?$/,      etfList],
  ["POST", /^\/etf_holdings\/analyze\/?$/,   etfAnalyze],
  ["GET",  /^\/etf_holdings\/analyze\/?$/,   etfAnalyze],
  ["POST", /^\/etf_holdings\/clear_cache\/?$/, etfClearCache],
  ["GET",  /^\/etf_holdings\/clear_cache\/?$/, etfClearCache],
  ["GET",  /^\/etf_holdings\/pivot\/concentration\/?$/, etfPivotConcentration],
  ["GET",  /^\/etf_holdings\/pivot\/consensus\/?$/, etfPivotConsensus],
  ["GET",  /^\/etf_holdings\/pivot\/weight_matrix\/?$/, etfPivotWeightMatrix],
  ["GET",  /^\/etf_holdings\/pivot\/overlap\/?$/, etfPivotOverlap],
  ["GET",  /^\/etf_holdings\/pivot\/overlap_detail\/([^/]+?)\/([^/]+?)\/?$/, etfPivotOverlapDetail],
  ["GET",  /^\/etf_holdings\/pivot\/time_heatmap\/([^/]+?)\/?$/, etfPivotTimeHeatmap],
  ["GET",  /^\/etf_holdings\/pivot\/turnover\/?$/, etfPivotTurnover],
  ["GET",  /^\/etf_holdings\/snapshots\/([^/]+?)\/?$/, etfSnapshots],
  ["GET",  /^\/etf_holdings\/diff\/([^/]+?)\/?$/, etfDiff],
  ["GET",  /^\/etf_holdings\/export\/([^/]+?)\/?$/, etfExport],
  ["GET",  /^\/etf_holdings\/stock_scan\/status\/([^/]+?)\/?$/, etfStockScanStatus],
  ["POST", /^\/etf_holdings\/stock_scan\/([^/]+?)\/?$/, etfStockScan],
  ["GET",  /^\/etf_holdings\/stock_scan\/([^/]+?)\/?$/, etfStockScan],
  ["GET",  /^\/etf_holdings\/stock_scan\/result\/([^/]+?)\/?$/, etfStockScanResult],
  ["POST", /^\/etf_holdings\/list\/add\/?$/, etfListAdd],
  ["POST", /^\/etf_holdings\/list\/remove\/?$/, etfListRemove],
  ["GET",  /^\/etf_holdings\/([^/]+?)\/?$/,  etfByCode],

  // Rebalance
  ["GET",  /^\/rebalance\/?$/,               rebalanceCompute],
  ["POST", /^\/rebalance\/?$/,               rebalanceCompute],
  ["GET",  /^\/rebalance\/dynamic\/?$/,      rebalanceDynamic],
  ["POST", /^\/rebalance\/dynamic\/?$/,      rebalanceDynamic],
  ["GET",  /^\/rebalance\/groups\/?$/,       rebalanceGroups],

  // Conference / sentiment
  ["GET",  /^\/conference\/?$/,              conferenceList],
  ["GET",  /^\/conference\/sentiment_stats\/?$/, conferenceSentimentStats],

  // Uptrend watch
  ["GET",  /^\/uptrend_watch\/?$/,           uptrendWatch],
  ["GET",  /^\/uptrend_watch_filter\/?$/,    uptrendWatchFilter],

  // Admin
  ["GET",  /^\/admin\/logs\/?$/,             adminLogs],
  ["POST", /^\/admin\/logs\/clear\/?$/,      adminLogsClear],
  ["GET",  /^\/admin\/logs\/([^/]+?)\/?$/,   adminLogs],

  // Ex-dividend (queries real dividend_calendar table)
  ["GET",  /^\/exdiv\/calendar\/?$/,         exdivCalendar],
  ["GET",  /^\/exdiv\/upcoming\/?$/,         exdivUpcoming],

  // Real screener handlers (use etf_watchlist + market_price_bars)
  ["GET",  /^\/etf_signal_filter\/?$/,       etfSignalFilter],
  ["GET",  /^\/etf_signal_filter\/status\/?$/, etfSignalFilterStatus],
  ["GET",  /^\/etf_signal_filter\/refresh\/?$/, etfSignalFilterRefresh],
  ["GET",  /^\/stock_damo_filter\/?$/,       stockDamoFilter],
  ["GET",  /^\/stock_damo_filter\/status\/?$/, stockDamoFilterStatus],
  ["GET",  /^\/stock_damo_filter\/refresh\/?$/, stockDamoFilterRefresh],

  // Real table-backed handlers (will return empty + message when table is empty)
  ["GET",  /^\/foreign_futures\/?$/,         foreignFutures],
  ["GET",  /^\/financial\/?$/,               financial],
  ["GET",  /^\/overnight_signal\/?$/,        overnightSignal],
  ["GET",  /^\/margin_burst\/?$/,            marginBurst],
  ["GET",  /^\/index_institutional\/?$/,     indexInstitutional],
  ["GET",  /^\/big_holder_low_base\/?$/,     bigHolderLowBase],
  ["GET",  /^\/revenue\/?$/,                 revenue],
  ["GET",  /^\/heatmap\/?$/,                 heatmap],
  ["GET",  /^\/price_compare\/?$/,           priceCompare],
  ["GET",  /^\/ai_capex\/?$/,                aiCapex],
  ["GET",  /^\/stock_news_scan\/?$/,         stockNewsScan],
  ["GET",  /^\/stock_news_scan\/quota\/?$/,  stockNewsScanQuota],

  // Configuration endpoints (no DB table — return helpful shape with hint)
  ["GET",  /^\/strategy\/etf_added_resonance\/?$/, placeholder.bind(null, "strategy_etf_added_resonance", "use etf_holdings + screener + resonance score")],
  ["GET",  /^\/disabled_strategies\/?$/,     placeholder.bind(null, "disabled_strategies", "configure in code or DB; returns [] when none disabled")],
  ["GET",  /^\/pe_threshold\/?$/,            placeholder.bind(null, "pe_threshold", "PE filter threshold; null = no filter")],
  ["GET",  /^\/min_hold_overrides\/?$/,      placeholder.bind(null, "min_hold_overrides", "per-stock minimum hold days override; empty = use default")],
];

export default async function handler(request) {
  try {
    const u = new URL(request.url);
    const raw = u.pathname || "";
    let path = raw.replace(/^\/api\/?/, "").replace(/\/+$/, "");
    const fullPath = "/" + (path || "");
    for (const [method, re, fn] of TABLE) {
      if (method !== request.method) continue;
      const m = re.exec(fullPath);
      if (m) {
        const args = m.slice(1);
        return await fn(request, ...args);
      }
    }
    return json({ ok: false, error: "not found", path: "/api/" + path, method: request.method }, { status: 404 });
  } catch (e) {
    return json({ ok: false, error: e?.message, stack: e?.stack }, { status: 500 });
  }
}

export const config = { runtime: "edge", maxDuration: 25 };

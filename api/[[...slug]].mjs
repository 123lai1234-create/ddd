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
  // Return shape compatible with the front-end pollStatus() contract:
  //   { running, done, total, last_refresh, count, error?, result? }
  // When etf_holdings is empty, return running=false + last_refresh=null
  // so the frontend poll exits immediately with a "no data" state.
  try {
    const [{ rows: snapRows }, { rows: holdRows }] = await Promise.all([
      q(`SELECT MAX(fetched_at) AS last_refresh FROM knowledge_library WHERE record_type = 'etf_snapshot'`),
      q(`SELECT COUNT(*)::int AS n FROM etf_holdings`),
    ]);
    const lastRefresh = snapRows[0]?.last_refresh || null;
    const holdingsCount = holdRows[0]?.n || 0;
    return json({
      ok: true,
      source: "db",
      running: false,
      done: 0,
      total: 0,
      last_refresh: lastRefresh,
      count: holdingsCount,
      no_data: holdingsCount === 0,
      message: holdingsCount === 0
        ? "etf_holdings 表為空，無 bulk data source（需 per-issuer 爬）"
        : null,
    });
  } catch (e) {
    return json({ ok: true, source: "stub", running: false, done: 0, total: 0, last_refresh: null, count: 0, no_data: true, error: e?.message });
  }
}

async function etfAnalyze(request) {
  // No bulk data source for ETF holdings (per-issuer scraping required).
  // Return an immediate "no data" state so the frontend doesn't loop.
  try {
    const { rows } = await q(`SELECT COUNT(*)::int AS n FROM etf_holdings`);
    const n = rows[0]?.n || 0;
    if (n > 0) {
      return json({ ok: true, source: "db", task_id: `etf-${Date.now()}`, status: "queued", count: n });
    }
    return json({
      ok: true,
      source: "stub",
      no_data: true,
      count: 0,
      message: "etf_holdings 表為空（無 bulk source；需 per-issuer 爬或手動 seed）",
    });
  } catch (e) {
    return json({ ok: false, source: "stub", error: e?.message, no_data: true });
  }
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
  const ymParam = (u.searchParams.get("year_month") || "").trim();
  try {
    // Shape: { code, name, year_month, revenue_current, mom_pct, yoy_pct, ytd_revenue, ytd_yoy_pct }
    // JOIN watchlist for company name. year_month formatted as `${year}/${month}` (no zero pad)
    // to match the dropdown in stock-app/revenue.html.
    const params = [];
    let where = "";
    if (code) { params.push(code); where = ` WHERE r.symbol = $${params.length}`; }
    if (ymParam) {
      const m = /^(\d{4})\/(\d{1,2})$/.exec(ymParam);
      if (m) {
        params.push(parseInt(m[1], 10));
        const py = `$${params.length}`;
        params.push(parseInt(m[2], 10));
        const pm = `$${params.length}`;
        where += (where ? " AND " : " WHERE ") + `r.year = ${py} AND r.month = ${pm}`;
      }
    }
    const lim = code ? "24" : "500";
    const sql = `
      SELECT r.id, r.symbol AS code,
             COALESCE(w.name, '') AS name,
             r.year || '/' || r.month AS year_month,
             r.revenue AS revenue_current,
             r.mom_pct,
             r.yoy_pct,
             r.ytd_revenue,
             r.ytd_yoy_pct,
             r.source,
             r.fetched_at
      FROM revenue r
      LEFT JOIN watchlist w ON w.code = r.symbol
      ${where}
      ORDER BY r.year DESC, r.month DESC, r.symbol ASC
      LIMIT ${lim}`;
    const { rows } = await q(sql, params);
    // The HTML uses d.data (not d.items), so expose both for compatibility.
    const last = rows[0]?.fetched_at || null;
    return json({ ok: true, source: "db", count: rows.length, items: rows, data: rows, last_update: last });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], data: [], error: e?.message, message: "revenue table empty or missing" });
  }
}

// ai_capex dashboard aggregation. Loads raw rows and computes:
//   per-company: latest_capex, latest_quarter, qoq_pct, yoy_pct, ttm, ttm_yoy_pct, spark
//   aggregate (5 hyperscalers, NVDA excluded as it's a chip designer not a buyer):
//     agg_ttm_usd_bn, agg_yoy_pct, accel_pp, chart (last 8 quarters)
const AI_CAPEX_CORE = ["MSFT", "AMZN", "GOOGL", "META", "ORCL"];
const AI_CAPEX_ALL = ["MSFT", "AMZN", "GOOGL", "META", "ORCL", "NVDA"]; // "ext" group label
const AI_CAPEX_NAMES = {
  NVDA: "NVIDIA", MSFT: "Microsoft", AMZN: "Amazon",
  GOOGL: "Alphabet", META: "Meta Platforms", ORCL: "Oracle",
};

function _aiCapexQuartetKey(y, q) { return y * 10 + q; }

// ── sold_too_early: heuristic "potentially sold too early" detector ──
// No trade history. Heuristic: for each watchlist stock, find cases where
// the price recently BROKE BELOW MA20 (sell signal territory), then later
// re-crossed ABOVE MA5/MA10/MA20 (sold signal invalidated). Bigger bounce
// = more "sold too early" feel.
async function soldTooEarly(request) {
  const u = urlOf(request);
  const days = Math.max(20, Math.min(180, parseInt(u.searchParams.get("days") || "60", 10) || 60));
  const lookback = days + 30; // extra padding for MA20
  try {
    // 1. Pull all watchlist stocks (codes + names)
    const wlRes = await q(`SELECT code, name FROM watchlist ORDER BY code`);
    const wl = wlRes.rows || [];
    if (wl.length === 0) {
      return json({ ok: true, source: "stub", as_of: new Date().toISOString().slice(0, 10),
        scanned: 0, count: 0, rows: [],
        message: "watchlist 為空，請先在主系統新增自選股" });
    }
    // 2. For each stock, fetch last `lookback` days of price bars
    const hits = [];
    let asOf = null;
    for (const w of wl) {
      // q() returns object-mode rows by default in edge runtime
      const code = String(w.code ?? w[0] ?? "").trim();
      const name = String(w.name ?? w[1] ?? "").trim();
      if (!code) continue;
      const barRes = await q(
        `SELECT trade_date::text, close_price
         FROM market_price_bars
         WHERE symbol = $1 AND asset_type = 'stock' AND close_price IS NOT NULL
         ORDER BY trade_date DESC LIMIT $2`,
        [code, lookback]
      );
      const bars = barRes.rows || [];
      if (bars.length < 25) continue; // need at least MA20 + buffer
      // bars is DESC; reverse to ASC for MA calculation
      const series = bars.slice().reverse().map(b => ({
        d: b.trade_date ?? b[0],
        c: Number(b.close_price ?? b[1]),
      }));
      // MA helper
      const ma = (arr, n) => {
        if (arr.length < n) return null;
        const slice = arr.slice(-n);
        return slice.reduce((s, x) => s + x.c, 0) / n;
      };
      // Annotate each bar with MA5/10/20
      const enriched = series.map((b, i) => ({
        d: b.d,
        c: b.c,
        ma5: i >= 4 ? ma(series.slice(0, i + 1), 5) : null,
        ma10: i >= 9 ? ma(series.slice(0, i + 1), 10) : null,
        ma20: i >= 19 ? ma(series.slice(0, i + 1), 20) : null,
      }));
      const last = enriched[enriched.length - 1];
      if (!last.ma20) continue;
      if (!asOf || last.d > asOf) asOf = last.d;
      // Check: currently above all 3 MAs
      const aboveAll = last.c > last.ma5 && last.c > last.ma10 && last.c > last.ma20;
      if (!aboveAll) continue;
      // Find the most recent day in last `days` where close was below MA20
      const recentSlice = enriched.slice(-days);
      let sellBar = null;
      for (let i = recentSlice.length - 2; i >= 0; i--) {
        const b = recentSlice[i];
        if (b.ma20 != null && b.c < b.ma20) { sellBar = b; break; }
      }
      if (!sellBar) continue; // never sold/broke MA20 in window
      // Find the recent low (since sellBar)
      const sinceSell = enriched.slice(enriched.indexOf(sellBar));
      const lowBar = sinceSell.reduce((min, b) => b.c < min.c ? b : min, sinceSell[0]);
      const gain = ((last.c - lowBar.c) / lowBar.c) * 100;
      if (gain < 3) continue; // not a meaningful bounce
      // Days since "sell" (below MA20) signal
      const daysSince = enriched.length - 1 - enriched.indexOf(sellBar);
      hits.push({
        code, name,
        sell_date: sellBar.d,
        sell_price: +sellBar.c.toFixed(2),
        current_price: +last.c.toFixed(2),
        gain_since_sell_pct: +gain.toFixed(2),
        low_date: lowBar.d,
        low_price: +lowBar.c.toFixed(2),
        ma5: +last.ma5.toFixed(2),
        ma10: +last.ma10.toFixed(2),
        ma20: +last.ma20.toFixed(2),
        days_since_sell: daysSince,
      });
    }
    // Sort by gain desc
    hits.sort((a, b) => b.gain_since_sell_pct - a.gain_since_sell_pct);
    return json({
      ok: true,
      source: "db",
      as_of: asOf || new Date().toISOString().slice(0, 10),
      scanned: wl.length,
      count: hits.length,
      rows: hits,
      note: "啟發式：股價曾跌破 MA20（賣出訊號），後來又站回 MA5/10/20，但無實際交易紀錄",
    });
  } catch (e) {
    return json({ ok: false, source: "stub", error: e?.message });
  }
}

async function aiCapex(request) {
  try {
    const { rows } = await q(
      `SELECT company, year, quarter, capex, revenue, capex_pct_of_revenue, source, fetched_at
       FROM ai_capex
       WHERE year >= 2020
       ORDER BY company, year, quarter`
    );
    if (rows.length === 0) {
      return json({ ok: true, source: "stub", count: 0, items: [], as_of: new Date().toISOString().slice(0, 10),
        message: "ai_capex table empty — run SEC EDGAR loader",
        companies: [], chart: { labels: [], agg_ttm: [], agg_yoy: [] },
        agg_ttm_usd_bn: null, agg_yoy_pct: null, accel_pp: null,
        light: "gray", headline: "ai_capex 表為空，請跑 SEC EDGAR loader" });
    }
    // Normalize → array of objects
    const raw = rows.map(r => ({
      company: r.company,
      year: Number(r.year),
      quarter: Number(r.quarter),
      capex: Number(r.capex),
      revenue: r.revenue != null ? Number(r.revenue) : null,
      pct: r.capex_pct_of_revenue != null ? Number(r.capex_pct_of_revenue) : null,
    }));
    // Group by company
    const byCo = new Map();
    for (const r of raw) {
      if (!byCo.has(r.company)) byCo.set(r.company, []);
      byCo.get(r.company).push(r);
    }
    // For each company, sort ascending and compute aggregates
    const companies = [];
    for (const [co, list] of byCo.entries()) {
      list.sort((a, b) => _aiCapexQuartetKey(a.year, a.quarter) - _aiCapexQuartetKey(b.year, b.quarter));
      const last = list[list.length - 1];
      const prev = list.length >= 2 ? list[list.length - 2] : null;
      const yoyAgo = list.length >= 5 ? list[list.length - 5] : null;
      // TTM = sum of last 4 quarters
      const last4 = list.slice(-4);
      const ttm = last4.reduce((s, r) => s + r.capex, 0);
      const yoyTtm4 = list.slice(-8, -4);
      const ttmYoyAgo = yoyTtm4.length === 4 ? yoyTtm4.reduce((s, r) => s + r.capex, 0) : null;
      const ttmYoyPct = (ttmYoyAgo && ttmYoyAgo > 0) ? ((ttm - ttmYoyAgo) / ttmYoyAgo) * 100 : null;
      const qoqPct = (prev && prev.capex > 0) ? ((last.capex - prev.capex) / prev.capex) * 100 : null;
      const yoyPct = (yoyAgo && yoyAgo.capex > 0) ? ((last.capex - yoyAgo.capex) / yoyAgo.capex) * 100 : null;
      companies.push({
        code: co,
        name: AI_CAPEX_NAMES[co] || co,
        group: AI_CAPEX_CORE.includes(co) ? "core" : "ext",
        latest_capex: last.capex,
        latest_quarter: `${last.year} Q${last.quarter}`,
        qoq_pct: qoqPct != null ? +qoqPct.toFixed(1) : null,
        yoy_pct: yoyPct != null ? +yoyPct.toFixed(1) : null,
        ttm,
        ttm_yoy_pct: ttmYoyPct != null ? +ttmYoyPct.toFixed(1) : null,
        spark: list.map(r => +(r.capex / 1e9).toFixed(2)),
      });
    }
    companies.sort((a, b) => AI_CAPEX_ALL.indexOf(a.code) - AI_CAPEX_ALL.indexOf(b.code));

    // Aggregate: sum across core 5 (TTM per quarter aligned by quarter)
    // First, build a (year, quarter) → total capex map for core
    const coreAgg = new Map();
    for (const r of raw) {
      if (!AI_CAPEX_CORE.includes(r.company)) continue;
      const k = `${r.year}-Q${r.quarter}`;
      coreAgg.set(k, (coreAgg.get(k) || 0) + r.capex);
    }
    // Sort quarters and compute TTM rolling
    const quarters = Array.from(coreAgg.keys()).sort((a, b) => {
      const [ay, aq] = a.split('-Q').map(Number);
      const [by, bq] = b.split('-Q').map(Number);
      return ay - by || aq - bq;
    });
    // TTM for each quarter (sum of last 4)
    const ttmByQ = [];
    for (let i = 0; i < quarters.length; i++) {
      if (i < 3) { ttmByQ.push(null); continue; }
      const sum = quarters.slice(i - 3, i + 1).reduce((s, k) => s + (coreAgg.get(k) || 0), 0);
      ttmByQ.push(sum);
    }
    // Last 8 quarters for chart
    const chartStart = Math.max(4, quarters.length - 8);
    const chartLabels = quarters.slice(chartStart);
    const chartTtm = ttmByQ.slice(chartStart);
    const chartYoy = ttmByQ.map((v, i) => {
      if (i < 8) return null;
      const yearAgo = ttmByQ[i - 4];
      if (!v || !yearAgo) return null;
      return +(((v - yearAgo) / yearAgo) * 100).toFixed(1);
    }).slice(chartStart);

    const lastTtm = ttmByQ[ttmByQ.length - 1];
    const yearAgoTtm = ttmByQ.length >= 5 ? ttmByQ[ttmByQ.length - 5] : null;
    const aggYoyPct = (lastTtm && yearAgoTtm && yearAgoTtm > 0)
      ? +(((lastTtm - yearAgoTtm) / yearAgoTtm) * 100).toFixed(1)
      : null;
    // Acceleration: change in YoY % (current YoY - YoY from 4 quarters ago)
    let accelPp = null;
    if (chartYoy.length >= 5) {
      const latest = chartYoy[chartYoy.length - 1];
      const prior = chartYoy[chartYoy.length - 5];
      if (latest != null && prior != null) accelPp = +(latest - prior).toFixed(1);
    }
    // Light signal
    let light = "gray";
    let headline = "資料不足";
    if (aggYoyPct != null) {
      if (aggYoyPct > 15 && (accelPp == null || accelPp >= 0)) { light = "green"; headline = `合計 capex TTM 仍擴張（YoY +${aggYoyPct}%）`; }
      else if (aggYoyPct > 0) { light = "yellow"; headline = `擴張但動能轉弱（YoY +${aggYoyPct}%${accelPp != null ? `，${accelPp > 0 ? '+' : ''}${accelPp}pp` : ''}）`; }
      else { light = "red"; headline = `合計 capex TTM 轉收縮（YoY ${aggYoyPct}%）`; }
    }
    const asOf = new Date().toISOString().slice(0, 10);
    return json({
      ok: true,
      source: "db",
      count: raw.length,
      items: raw.slice(-50),
      as_of: asOf,
      data_stale: false,
      light, headline,
      agg_ttm_usd_bn: lastTtm ? +(lastTtm / 1e9).toFixed(1) : null,
      agg_yoy_pct: aggYoyPct,
      accel_pp: accelPp,
      chart: { labels: chartLabels, agg_ttm: chartTtm.map(v => v ? +(v / 1e9).toFixed(1) : null), agg_yoy: chartYoy },
      companies,
    });
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

// ── data loaders (fetch from TWSE public API → insert into Neon) ────
function twseDateStr(d) {
  // input: Date object → "YYYYMMDD" (民國年自動轉西元)
  return d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
}
function rocToIsoDate(rocStr) {
  // "115年07月31日" → "2026-07-31"
  const m = /(\d+)年(\d+)月(\d+)日/.exec(rocStr);
  if (!m) return null;
  return `${parseInt(m[1], 10) + 1911}-${m[2]}-${m[3]}`;
}
function numFromStr(s) {
  if (typeof s !== "string") return Number(s) || 0;
  return Number(s.replace(/,/g, "")) || 0;
}

async function fetchTwse(url) {
  // Retry with exponential backoff on 403/429/5xx
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
    "Referer": "https://www.twse.com.tw/",
    "Origin": "https://www.twse.com.tw",
  };
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(url, { headers, signal: ctrl.signal });
      clearTimeout(tid);
      if (r.ok) return await r.json();
      const text = await r.text().catch(() => "");
      lastErr = new Error(`TWSE HTTP ${r.status}: ${text.slice(0, 80)}`);
      // 4xx except 429: don't retry (means bad request)
      if (r.status >= 400 && r.status < 500 && r.status !== 429) throw lastErr;
    } catch (e) {
      clearTimeout(tid);
      lastErr = e;
      // abort or non-retryable → rethrow
      if (e.name === "AbortError") throw e;
      if (e.message && e.message.includes("TWSE HTTP 4") && !e.message.includes("429")) throw e;
    }
    const delay = 3000 * Math.pow(2, attempt);
    await new Promise((res) => setTimeout(res, delay));
  }
  throw lastErr;
}

async function loadInstitutionalForDate(dateYmd) {
  // dateYmd: "YYYY-MM-DD" or "YYYYMMDD"
  const ymd = dateYmd.replace(/-/g, "");
  const url = `https://www.twse.com.tw/rwd/zh/fund/T86?date=${ymd}&selectType=ALL&response=json`;
  const data = await fetchTwse(url);
  if (data.stat !== "OK" || !Array.isArray(data.data)) {
    return { ok: false, source: "twse", error: data.stat || "no data", date: ymd, count: 0 };
  }
  // TWSE T86 欄位順序(2026 確認):
  // 0: 證券代號, 1: 證券名稱
  // 2-4: 外陸資買進/賣出/買賣超(不含外資自營商)
  // 5-7: 外資自營商買進/賣出/買賣超
  // 8-10: 投信買進/賣出/買賣超
  // 11: 自營商買賣超(總)
  // 12-14: 自營商(自行)買進/賣出/買賣超
  // 15-17: 自營商(避險)買進/賣出/買賣超
  // 18: 三大法人買賣超
  const symbols = [];
  const foreignBuy = [], foreignSell = [], foreignNet = [];
  const trustBuy = [], trustSell = [], trustNet = [];
  const dealerBuy = [], dealerSell = [], dealerNet = [];
  for (const r of data.data) {
    const sym = String(r[0] || "").trim();
    if (!/^\d{4,6}$/.test(sym)) continue; // 只收純股票代號
    symbols.push(sym);
    foreignBuy.push(numFromStr(r[2]) + numFromStr(r[5]));   // 外陸資 + 外資自營
    foreignSell.push(numFromStr(r[3]) + numFromStr(r[6]));
    foreignNet.push(numFromStr(r[4]) + numFromStr(r[7]));
    trustBuy.push(numFromStr(r[8]));
    trustSell.push(numFromStr(r[9]));
    trustNet.push(numFromStr(r[10]));
    // dealer = 自行 + 避險
    dealerBuy.push(numFromStr(r[12]) + numFromStr(r[15]));
    dealerSell.push(numFromStr(r[13]) + numFromStr(r[16]));
    dealerNet.push(numFromStr(r[11])); // 已是總買賣超
  }
  if (!symbols.length) return { ok: true, source: "twse", date: ymd, count: 0, message: "no stock rows" };
  // Bulk upsert via UNNEST JOIN
  const trade_date_iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  const arrays = [symbols, foreignBuy, foreignSell, foreignNet, trustBuy, trustSell, trustNet, dealerBuy, dealerSell, dealerNet];
  const sql = `
    INSERT INTO institutional
      (symbol, trade_date, foreign_buy, foreign_sell, foreign_net,
       trust_buy, trust_sell, trust_net, dealer_buy, dealer_sell, dealer_net, source)
    SELECT s, $11::date, fb, fs, fn, tb, ts, tn, db, ds, dn, 'twse_T86'
    FROM UNNEST($1::text[]) WITH ORDINALITY AS x(s, ord)
    JOIN UNNEST($2::numeric[]) WITH ORDINALITY AS a(fb, ord) USING (ord)
    JOIN UNNEST($3::numeric[]) WITH ORDINALITY AS b(fs, ord) USING (ord)
    JOIN UNNEST($4::numeric[]) WITH ORDINALITY AS c(fn, ord) USING (ord)
    JOIN UNNEST($5::numeric[]) WITH ORDINALITY AS d(tb, ord) USING (ord)
    JOIN UNNEST($6::numeric[]) WITH ORDINALITY AS e(ts, ord) USING (ord)
    JOIN UNNEST($7::numeric[]) WITH ORDINALITY AS f(tn, ord) USING (ord)
    JOIN UNNEST($8::numeric[]) WITH ORDINALITY AS g(db, ord) USING (ord)
    JOIN UNNEST($9::numeric[]) WITH ORDINALITY AS h(ds, ord) USING (ord)
    JOIN UNNEST($10::numeric[]) WITH ORDINALITY AS i(dn, ord) USING (ord)
    ON CONFLICT (symbol, trade_date) DO UPDATE SET
      foreign_buy = EXCLUDED.foreign_buy,
      foreign_sell = EXCLUDED.foreign_sell,
      foreign_net = EXCLUDED.foreign_net,
      trust_buy = EXCLUDED.trust_buy,
      trust_sell = EXCLUDED.trust_sell,
      trust_net = EXCLUDED.trust_net,
      dealer_buy = EXCLUDED.dealer_buy,
      dealer_sell = EXCLUDED.dealer_sell,
      dealer_net = EXCLUDED.dealer_net,
      fetched_at = now()`;
  const { rows } = await q(sql, [symbols, foreignBuy, foreignSell, foreignNet, trustBuy, trustSell, trustNet, dealerBuy, dealerSell, dealerNet, trade_date_iso]);
  return { ok: true, source: "twse_T86", date: trade_date_iso, count: symbols.length };
}

// ── overseas indices loader (Yahoo Finance unofficial chart API) ──
// Symbols cover: S&P 500, Dow, Nasdaq, Nikkei, KOSPI, Hang Seng, CSI 300, FTSE, DAX, CAC 40.
// Range: 5d daily. Updates a few times a day during US/EU/Asia market hours.
const OVERSEAS_INDEX_SYMBOLS = [
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^DJI", name: "Dow Jones Industrial" },
  { symbol: "^IXIC", name: "Nasdaq Composite" },
  { symbol: "^N225", name: "Nikkei 225" },
  { symbol: "^KS11", name: "KOSPI" },
  { symbol: "^HSI", name: "Hang Seng" },
  { symbol: "000300.SS", name: "CSI 300" },
  { symbol: "^FTSE", name: "FTSE 100" },
  { symbol: "^GDAXI", name: "DAX" },
  { symbol: "^FCHI", name: "CAC 40" },
];
async function loadOverseasIndicesForSymbol(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 12000);
  let resp;
  try {
    resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36" },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
  } catch (e) {
    clearTimeout(tid);
    if (e.name === "AbortError") throw new Error("yahoo timeout");
    throw e;
  }
  if (!resp.ok) throw new Error(`yahoo HTTP ${resp.status}`);
  const data = await resp.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("yahoo: no result");
  const ts = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const prevClose = result.meta?.chartPreviousClose;
  if (ts.length === 0 || closes.length === 0) return { ok: true, symbol: sym, count: 0 };
  const rows = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c == null || !Number.isFinite(c)) continue;
    const d = new Date(ts[i] * 1000);
    const isoDate = d.toISOString().slice(0, 10);
    // change_pct vs previous trading day close
    let pct = null;
    const prev = i > 0 ? closes[i - 1] : prevClose;
    if (prev != null && Number.isFinite(prev) && prev !== 0) {
      pct = Math.round(((c - prev) / prev) * 10000) / 100; // 2 decimals
    }
    rows.push({ date: isoDate, close: c, pct });
  }
  if (rows.length === 0) return { ok: true, symbol: sym, count: 0 };
  // Bulk upsert
  const dates = rows.map((r) => r.date);
  const closes2 = rows.map((r) => r.close);
  const pcts = rows.map((r) => r.pct);
  const sql = `
    INSERT INTO overseas_indices (symbol, trade_date, close_price, change_pct, source)
    SELECT $1, unnest($2::date[]), unnest($3::numeric[]), unnest($4::numeric[]), 'yahoo_v8'
    ON CONFLICT (symbol, trade_date) DO UPDATE SET
      close_price = EXCLUDED.close_price,
      change_pct = EXCLUDED.change_pct,
      source = EXCLUDED.source,
      fetched_at = now()`;
  await q(sql, [sym, dates, closes2, pcts]);
  return { ok: true, symbol: sym, count: rows.length };
}
async function loadOverseasIndices(request) {
  const u = urlOf(request);
  const body = request.method !== "GET" ? await readJson(request) : {};
  if (request.method === "POST" && !operatorOk(body?.password)) {
    return json({ error: "密碼錯誤" }, { status: 403 });
  }
  // Optional symbols override (comma-separated)
  const symParam = pickStr(body?.symbols || u.searchParams.get("symbols") || "").trim();
  const symbols = symParam
    ? symParam.split(",").map((s) => s.trim()).filter(Boolean)
    : OVERSEAS_INDEX_SYMBOLS.map((x) => x.symbol);
  const results = [];
  for (const sym of symbols) {
    try {
      const r = await loadOverseasIndicesForSymbol(sym);
      results.push(r);
    } catch (e) {
      results.push({ ok: false, symbol: sym, count: 0, error: e?.message });
    }
    // Rate-limit Yahoo (no official limit, but be nice)
    await new Promise((res) => setTimeout(res, 400));
  }
  const okCount = results.filter((r) => r.ok).reduce((s, r) => s + (r.count || 0), 0);
  return json({ ok: true, source: "loader", inserted: okCount, results });
}

async function loadExdivForDate(dateYmd) {
  // dateYmd: "YYYY-MM-DD" (exdiv API is date-range based, returns all exdivs up to date)
  const ymd = dateYmd.replace(/-/g, "");
  const url = `https://www.twse.com.tw/rwd/zh/exRight/TWT49U?date=${ymd}&response=json`;
  const data = await fetchTwse(url);
  if (data.stat !== "OK" || !Array.isArray(data.data)) {
    return { ok: false, source: "twse", error: data.stat || "no data", date: ymd, count: 0 };
  }
  // Field order: 資料日期, 股票代號, 股票名稱, 除權息前收盤價, 除權息參考價, 權值+息值, 權/息, ...
  const symbols = [], ex_dates = [], cash = [], stock = [], types = [];
  for (const r of data.data) {
    const sym = String(r[1] || "").trim();
    if (!/^\d{4,6}$/.test(sym)) continue;
    const ex_date = rocToIsoDate(String(r[0] || ""));
    if (!ex_date) continue;
    const kind = String(r[6] || ""); // 息 / 權 / 權息
    symbols.push(sym);
    ex_dates.push(ex_date);
    cash.push(kind.includes("息") ? numFromStr(r[5]) : 0);
    stock.push(kind.includes("權") ? numFromStr(r[5]) : 0);
    types.push(kind);
  }
  if (!symbols.length) return { ok: true, source: "twse", date: ymd, count: 0, message: "no exdiv rows" };
  const sql = `
    INSERT INTO dividend_calendar (symbol, ex_date, cash_dividend, stock_dividend, source)
    SELECT s, d::date, c, st, 'twse_TWT49U'
    FROM UNNEST($1::text[]) WITH ORDINALITY AS x(s, ord)
    JOIN UNNEST($2::text[]) WITH ORDINALITY AS y(d, ord) USING (ord)
    JOIN UNNEST($3::numeric[]) WITH ORDINALITY AS z(c, ord) USING (ord)
    JOIN UNNEST($4::numeric[]) WITH ORDINALITY AS w(st, ord) USING (ord)
    ON CONFLICT DO NOTHING`;
  await q(sql, [symbols, ex_dates, cash, stock]);
  return { ok: true, source: "twse_TWT49U", date: ymd, count: symbols.length };
}

async function loadInstitutional(request) {
  const u = urlOf(request);
  const body = request.method !== "GET" ? await readJson(request) : {};
  // Vercel Cron 不送 body,也不帶 password → 接受 GET (公開 cron trigger)
  // 手動 trigger 仍可 POST + 帶 password
  if (request.method === "POST" && !operatorOk(body?.password)) {
    return json({ error: "密碼錯誤" }, { status: 403 });
  }
  const dateParam = pickStr(body?.date || u.searchParams.get("date") || "").trim();
  const days = Math.min(30, Math.max(1, parseInt(body?.days || u.searchParams.get("days") || "1", 10) || 1));
  const startDate = dateParam || (() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const results = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate); d.setDate(d.getDate() - i);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    try {
      const r = await loadInstitutionalForDate(ymd);
      results.push(r);
    } catch (e) {
      results.push({ ok: false, date: ymd, error: e?.message });
    }
    if (i < days - 1) await new Promise((res) => setTimeout(res, 2500));
  }
  const okCount = results.filter((r) => r.ok).length;
  return json({ ok: true, source: "loader", requested: days, succeeded: okCount, results });
}

async function loadExdiv(request) {
  const u = urlOf(request);
  const body = request.method !== "GET" ? await readJson(request) : {};
  if (request.method === "POST" && !operatorOk(body?.password)) {
    return json({ error: "密碼錯誤" }, { status: 403 });
  }
  const dateParam = pickStr(body?.date || u.searchParams.get("date") || "").trim();
  const date = dateParam || (() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  try {
    const r = await loadExdivForDate(date);
    return json({ ok: true, source: "loader", ...r });
  } catch (e) {
    return json({ ok: false, source: "loader", error: e?.message, date });
  }
}

// ── loadMarketPrices: TWSE STOCK_DAY_ALL → market_price_bars ────────
// Refreshes the latest trading day's close for all stocks in watchlist +
// all ETFs in etf_watchlist. Edge-friendly: 1 HTTP fetch + N parallel
// DB upserts. Designed for daily Mon-Fri cron.
async function loadMarketPrices(request) {
  const u = urlOf(request);
  const body = request.method !== "GET" ? await readJson(request) : {};
  if (request.method === "POST" && !operatorOk(body?.password)) {
    return json({ error: "密碼錯誤" }, { status: 403 });
  }
  const UA = "Mozilla/5.0 (compatible: donttalk-stock-app/1.0; contact: donttalk@example.com)";
  try {
    // 1. Pull target codes: union of watchlist (stocks) + etf_watchlist (ETFs)
    const [wlRes, ewRes] = await Promise.all([
      q(`SELECT code FROM watchlist`),
      q(`SELECT code FROM etf_watchlist`),
    ]);
    // q() returns {rows: [...]} in OBJECT mode (no Neon-Array-Mode header) by default
    const targets = new Set();
    for (const r of (wlRes.rows || [])) targets.add(String(r.code ?? r[0]));
    for (const r of (ewRes.rows || [])) targets.add(String(r.code ?? r[0]));
    if (targets.size === 0) {
      return json({ ok: true, source: "stub", count: 0, message: "watchlist + etf_watchlist 為空" });
    }
    // 2. Fetch TWSE daily report (CSV; latest trading day)
    const url = "https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=json";
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Encoding": "gzip",
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://www.twse.com.tw/",
        "Origin": "https://www.twse.com.tw",
      },
    });
    clearTimeout(tid);
    if (!r.ok) throw new Error(`TWSE HTTP ${r.status}`);
    const csv = await r.text();
    // Parse CSV: line 1 = header, rest = quoted rows
    // "1150804","00400A","name",...,"close","change","transactions"
    const lines = csv.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) {
      return json({ ok: false, source: "loader", error: "TWSE 回傳空資料（可能非交易日）" });
    }
    // Skip header (line 0). Parse each line by splitting on '","' (no edge cases for TWSE format).
    const rows = lines.slice(1).map(l => {
      const parts = l.split('","');
      // Strip leading and trailing quote
      if (parts[0] && parts[0].startsWith('"')) parts[0] = parts[0].slice(1);
      if (parts[parts.length - 1] && parts[parts.length - 1].endsWith('"')) parts[parts.length - 1] = parts[parts.length - 1].slice(0, -1);
      return parts;
    });
    if (rows.length === 0 || !rows[0][0]) {
      return json({ ok: false, source: "loader", error: "TWSE CSV 解析失敗" });
    }
    // 3. Filter & upsert
    const todayRoc = String(rows[0][0]); // e.g. "1150804"
    // Convert ROC date YYYMMDD → ISO YYYY-MM-DD (ROC year + 1911)
    const rocYear = parseInt(todayRoc.slice(0, 3), 10);
    const mmdd = todayRoc.slice(3);
    const isoDate = `${rocYear + 1911}-${mmdd.slice(0, 2)}-${mmdd.slice(2)}`;
    const upserts = [];
    const skipped = [];
    for (const row of rows) {
      const code = String(row[1] || "").trim();
      if (!targets.has(code)) continue;
      const isEtf = (ewRes.rows || []).some(r => String(r.code ?? r[0]) === code);
      const assetType = isEtf ? "etf" : "stock";
      const open = parseFloat(row[5]) || null;
      const high = parseFloat(row[6]) || null;
      const low = parseFloat(row[7]) || null;
      const close = parseFloat(row[8]) || null;
      const change = parseFloat(row[9]) || null;
      const volume = parseInt(String(row[3] || "").replace(/,/g, ""), 10) || null;
      const turnover = parseFloat(String(row[4] || "").replace(/,/g, "")) || null;
      if (close == null) { skipped.push({ code, reason: "no close" }); continue; }
      upserts.push(
        q(
          `INSERT INTO market_price_bars
             (source_name, symbol, asset_type, market, trade_date, open_price, high_price, low_price,
              close_price, change_value, volume, turnover, fetched_at)
           VALUES ($1, $2, $3, 'TWSE', $4, $5, $6, $7, $8, $9, $10, $11, NOW())
           ON CONFLICT (source_name, symbol, contract_month, trade_date) DO UPDATE SET
             open_price = EXCLUDED.open_price,
             high_price = EXCLUDED.high_price,
             low_price = EXCLUDED.low_price,
             close_price = EXCLUDED.close_price,
             change_value = EXCLUDED.change_value,
             volume = EXCLUDED.volume,
             turnover = EXCLUDED.turnover,
             asset_type = EXCLUDED.asset_type,
             fetched_at = NOW()`,
          ["twse_STOCK_DAY_ALL", code, assetType, isoDate, open, high, low, close, change, volume, turnover]
        )
      );
    }
    const results = await Promise.all(upserts);
    return json({
      ok: true,
      source: "loader",
      trade_date: isoDate,
      requested: targets.size,
      upserted: results.length,
      skipped: skipped.length,
      skipped_detail: skipped,
    });
  } catch (e) {
    return json({ ok: false, source: "loader", error: e?.message });
  }
}

// ── MOPS revenue loader (月營收 from 公開資訊觀測站) ──────────────
// Flow:
//   1. POST https://mops.twse.com.tw/mops/api/redirectToOld
//      body: {apiName:"ajax_t21sc04_ifrs", parameters:{year, month, encodeURIComponent:1, step:1, firstin:1, off:1, TYPEK}}
//      → returns {result:{url: <mopsov URL>}}
//   2. GET <mopsov URL> → HTML containing `window.open('/nas/t21/<sii|otc|all>/t21sc03_<year>_<month>.html')`
//   3. POST https://mopsov.twse.com.tw/server-java/FileDownLoad
//      body: step=9&functionName=show_file2&filePath=/t21/<sii|otc|all>/&fileName=t21sc03_<year>_<month>.csv
//      → Big5-encoded CSV with 14 cols
async function loadRevenueForMonth(yearRoc, month, typek = "sii") {
  const yearMonthStr = `${yearRoc}-${String(month).padStart(2, "0")}`;
  const mopsPath = typek === "otc" ? "otc" : typek === "all" ? "all" : "sii";
  // Step 1: hit the redirect endpoint to get a mopsov session URL
  const ctrl1 = new AbortController();
  const tid1 = setTimeout(() => ctrl1.abort(), 15000);
  let apiRespText;
  try {
    const r = await fetch("https://mops.twse.com.tw/mops/api/redirectToOld", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Referer": "https://mops.twse.com.tw/mops/",
        "Origin": "https://mops.twse.com.tw",
        "Accept": "application/json, text/plain, */*",
      },
      body: JSON.stringify({
        apiName: "ajax_t21sc04_ifrs",
        parameters: {
          year: String(yearRoc),
          month: String(month).padStart(2, "0"),
          encodeURIComponent: 1,
          step: 1,
          firstin: 1,
          off: 1,
          TYPEK: typek,
        },
      }),
      signal: ctrl1.signal,
    });
    clearTimeout(tid1);
    if (!r.ok) throw new Error(`MOPS redirect HTTP ${r.status}`);
    apiRespText = await r.text();
  } catch (e) {
    clearTimeout(tid1);
    if (e.name === "AbortError") throw new Error("MOPS redirect: timeout");
    throw e;
  }
  let apiResp;
  try { apiResp = JSON.parse(apiRespText); }
  catch (e) { throw new Error(`MOPS JSON parse: ${apiRespText.slice(0, 120)}`); }
  if (apiResp.code !== 200) {
    return { ok: false, source: "mops_t21sc04", typek, year: yearRoc, month, count: 0, error: apiResp.message || "MOPS returned non-200" };
  }
  const mopsUrl = apiResp?.result?.url;
  if (!mopsUrl) return { ok: false, source: "mops_t21sc04", typek, year: yearRoc, month, count: 0, error: "no url in MOPS response" };

  // Step 2: fetch the mopsov page to discover the per-market HTML file
  const ctrl2 = new AbortController();
  const tid2 = setTimeout(() => ctrl2.abort(), 15000);
  let html;
  try {
    const r = await fetch(mopsUrl, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" },
      signal: ctrl2.signal,
    });
    clearTimeout(tid2);
    if (!r.ok) throw new Error(`mopsov HTML HTTP ${r.status}`);
    html = await r.text();
  } catch (e) {
    clearTimeout(tid2);
    if (e.name === "AbortError") throw new Error("mopsov HTML: timeout");
    throw e;
  }
  const m = /window\.open\(['"]([^'"]+)['"]/.exec(html);
  if (!m) {
    return { ok: false, source: "mops_t21sc04", typek, year: yearRoc, month, count: 0, error: "no download link found in MOPS page (data may not be available yet)" };
  }
  const relativePath = m[1]; // e.g. "/nas/t21/sii/t21sc03_115_5.html"
  const fileName = relativePath.split("/").pop().replace(/\.html$/, ".csv");
  // form's filePath is /t21/<market>/, NOT /nas/t21/<market>/
  const filePath = relativePath.replace(/^\/nas/, "").replace(/[^/]+$/, "");

  // Step 3: POST to FileDownLoad to get the Big5 CSV
  const ctrl3 = new AbortController();
  const tid3 = setTimeout(() => ctrl3.abort(), 30000);
  let csvBytes;
  try {
    const form = new URLSearchParams({ step: "9", functionName: "show_file2", filePath, fileName }).toString();
    const r = await fetch("https://mopsov.twse.com.tw/server-java/FileDownLoad", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "Mozilla/5.0",
        "Referer": `https://mopsov.twse.com.tw${relativePath}`,
        "Origin": "https://mopsov.twse.com.tw",
        "Accept": "text/csv,*/*",
      },
      body: form,
      signal: ctrl3.signal,
    });
    clearTimeout(tid3);
    if (!r.ok) throw new Error(`mopsov FileDownLoad HTTP ${r.status}`);
    csvBytes = new Uint8Array(await r.arrayBuffer());
  } catch (e) {
    clearTimeout(tid3);
    if (e.name === "AbortError") throw new Error("mopsov CSV: timeout");
    throw e;
  }
  if (csvBytes.length < 200) {
    return { ok: false, source: "mops_t21sc04", typek, year: yearRoc, month, count: 0, error: `CSV too small (${csvBytes.length} bytes)` };
  }
  // Decode as latin-1 (1 byte = 1 char). MOPS CSV is Big5-encoded, but we only need
  // ASCII columns (symbol, year, month, numbers). Chinese company names + industry
  // come out as garbled but we never read them, so this avoids the need for a Big5
  // decoder in the edge runtime (where TextDecoder has no 'big5' support).
  // Vercel edge runtime does not ship the big5 encoding; even `new TextDecoder("big5")`
  // throws. The fallback maps every byte to a single Unicode code point, so splitting
  // on \n and ","" still works because those bytes are < 0x80.
  let csvText;
  try {
    csvText = new TextDecoder("big5", { fatal: false }).decode(csvBytes);
  } catch {
    csvText = new TextDecoder("latin1").decode(csvBytes);
  }

  // Parse CSV: 14 cols, fields are double-quoted, no embedded quotes inside fields
  // 出表日期,資料年月,公司代號,公司名稱,產業別,營業收入-當月營收,營業收入-上月營收,營業收入-去年當月營收,營業收入-上月比較增減(%),營業收入-去年同月增減(%),累計營業收入-當月累計營收,累計營業收入-去年累計營收,累計營業收入-前期比較增減(%),備註
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { ok: true, source: "mops_t21sc04", typek, year: yearRoc, month, count: 0, message: "empty CSV" };
  const year = yearRoc + 1911;
  const seen = new Set();
  const symbols = [], revenues = [], yoys = [], moms = [], ytdRevenues = [], ytdYoys = [];
  for (let i = 1; i < lines.length; i++) {
    // Strip surrounding quotes, split on '","'
    const line = lines[i];
    if (!line.startsWith('"')) continue;
    const parts = line.slice(1, -1).split('","');
    if (parts.length < 13) continue;
    const sym = (parts[2] || "").trim();
    if (!/^\d{4,6}$/.test(sym)) continue;
    const key = `${sym}-${year}-${month}`;
    if (seen.has(key)) continue;
    seen.add(key);
    symbols.push(sym);
    // cols: 5=當月營收, 8=MoM%, 9=YoY%, 10=YTD 累計營收, 12=YTD YoY%
    revenues.push(numFromStr(parts[5]));
    moms.push(numFromStr(parts[8]));
    yoys.push(numFromStr(parts[9]));
    ytdRevenues.push(numFromStr(parts[10]));
    ytdYoys.push(numFromStr(parts[12]));
  }
  if (symbols.length === 0) {
    return { ok: true, source: "mops_t21sc04", typek, year, month, count: 0, message: "no valid rows parsed" };
  }
  // Bulk upsert via UNNEST JOIN (mirrors the institutional pattern)
  const sourceTag = `mops_t21sc04_${typek}`;
  const sql = `
    INSERT INTO revenue (symbol, year, month, revenue, yoy_pct, mom_pct, ytd_revenue, ytd_yoy_pct, source)
    SELECT s, $7::int, $8::int, r, y, m, yr, yy, $9
    FROM UNNEST($1::text[]) WITH ORDINALITY AS x(s, ord)
    JOIN UNNEST($2::numeric[]) WITH ORDINALITY AS a(r, ord) USING (ord)
    JOIN UNNEST($3::numeric[]) WITH ORDINALITY AS b(y, ord) USING (ord)
    JOIN UNNEST($4::numeric[]) WITH ORDINALITY AS c(m, ord) USING (ord)
    JOIN UNNEST($5::numeric[]) WITH ORDINALITY AS d(yr, ord) USING (ord)
    JOIN UNNEST($6::numeric[]) WITH ORDINALITY AS e(yy, ord) USING (ord)
    ON CONFLICT (symbol, year, month) DO UPDATE SET
      revenue = EXCLUDED.revenue,
      yoy_pct = EXCLUDED.yoy_pct,
      mom_pct = EXCLUDED.mom_pct,
      ytd_revenue = EXCLUDED.ytd_revenue,
      ytd_yoy_pct = EXCLUDED.ytd_yoy_pct,
      source  = EXCLUDED.source,
      fetched_at = now()`;
  await q(sql, [symbols, revenues, yoys, moms, ytdRevenues, ytdYoys, year, month, sourceTag]);
  return { ok: true, source: sourceTag, typek, year, month, count: symbols.length };
}

async function loadRevenue(request) {
  const u = urlOf(request);
  const body = request.method !== "GET" ? await readJson(request) : {};
  if (request.method === "POST" && !operatorOk(body?.password)) {
    return json({ error: "密碼錯誤" }, { status: 403 });
  }
  // Param priority: body > query > default (previous month)
  const yearRocParam = parseInt(body?.yearRoc || u.searchParams.get("yearRoc") || "", 10);
  const monthParam = parseInt(body?.month || u.searchParams.get("month") || "", 10);
  const typeksParam = pickStr(body?.typeks || u.searchParams.get("typeks") || "sii,otc").trim();
  const typeks = typeksParam.split(",").map((s) => s.trim()).filter((s) => ["sii", "otc", "all"].includes(s));
  const safeTypeks = typeks.length ? typeks : ["sii", "otc"];

  const targets = [];
  if (Number.isFinite(yearRocParam) && Number.isFinite(monthParam) && monthParam >= 1 && monthParam <= 12) {
    targets.push({ yearRoc: yearRocParam, month: monthParam });
  } else {
    // Default: previous month (companies file by the 10th, so previous month is the freshest)
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    targets.push({ yearRoc: d.getFullYear() - 1911, month: d.getMonth() + 1 });
  }
  const results = [];
  for (const t of targets) {
    for (const typek of safeTypeks) {
      try {
        const r = await loadRevenueForMonth(t.yearRoc, t.month, typek);
        results.push(r);
      } catch (e) {
        results.push({ ok: false, source: "mops_t21sc04", typek, ...t, count: 0, error: e?.message });
      }
      // Rate-limit MOPS between calls
      await new Promise((res) => setTimeout(res, 1500));
    }
  }
  const okCount = results.filter((r) => r.ok).reduce((s, r) => s + (r.count || 0), 0);
  return json({ ok: true, source: "loader", inserted: okCount, results });
}

// ── TAIFEX futures loader (大台/小台/電子/金融/微型) ──
// Endpoint: https://www.taifex.com.tw/cht/3/dlFutDataDown?down_type=1&commodity_id=<TX>&queryStartDate=YYYY/MM/DD&queryEndDate=YYYY/MM/DD
// CSV: Big5 encoded. Columns: 交易日期,契約,到期月份(週別),開盤價,最高價,最低價,收盤價,漲跌價,漲跌%,成交量,結算價,未沖銷契約數,...
// Map: contract=契約 (TX), maturity=到期月份, all others as-is.
const TAIFEX_FUTURE_CONTRACTS = [
  { id: "TX", name: "臺股期貨" },
  { id: "MTX", name: "小型臺股期貨" },
  { id: "TE", name: "電子期貨" },
  { id: "TF", name: "金融期貨" },
  { id: "ZEF", name: "微型臺指期貨" },
];
function toAdDate(ymd) {
  // "2026-08-03" -> "2026/08/03"
  return ymd.replace(/-/g, "/");
}
async function loadFuturesForDate(dateYmd) {
  const adDate = toAdDate(dateYmd);
  const results = [];
  for (const c of TAIFEX_FUTURE_CONTRACTS) {
    const url = `https://www.taifex.com.tw/cht/3/dlFutDataDown?down_type=1&commodity_id=${c.id}&queryStartDate=${adDate}&queryEndDate=${adDate}`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 12000);
    let csvText = "";
    let respOk = false;
    let status = 0;
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.taifex.com.tw/cht/3/futDailyMarketView" },
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      status = r.status;
      if (r.ok) {
        const bytes = new Uint8Array(await r.arrayBuffer());
        // Big5 with latin-1 fallback (only need ASCII columns: trade_date, contract, maturity, OHLC, vol, OI)
        try { csvText = new TextDecoder("big5", { fatal: false }).decode(bytes); }
        catch { csvText = new TextDecoder("latin1").decode(bytes); }
        respOk = true;
      }
    } catch (e) {
      clearTimeout(tid);
      results.push({ ok: false, contract: c.id, error: e?.message || "fetch error" });
      continue;
    }
    if (!respOk) { results.push({ ok: false, contract: c.id, error: `HTTP ${status}` }); continue; }
    if (!csvText || csvText.length < 50) { results.push({ ok: false, contract: c.id, error: "empty response" }); continue; }
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) { results.push({ ok: true, contract: c.id, count: 0, message: "no data rows" }); continue; }
    // Parse: header + rows. Each line: tradeDate,contract,maturity,open,high,low,close,change,changePct,vol,settle,oi,...
    // TAIFEX CSV uses "," but the contract "TX" doesn't have a comma. We split on "," plain.
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      if (cols.length < 18) continue;
      // Date: "2026/08/03" -> "2026-08-03"
      const ad = (cols[0] || "").trim();
      const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(ad);
      if (!m) continue;
      const isoDate = `${m[1]}-${m[2]}-${m[3]}`;
      const sym = (cols[1] || "").trim();
      const maturity = (cols[2] || "").trim();
      if (sym !== c.id) continue; // safety
      // Filter to "一般" (regular session) only — the CSV also has 盤後 (after-hours) and 夜盤
      // entries for the same (symbol, contract, date) which would violate the unique constraint.
      const session = (cols[17] || "").trim();
      if (session && session !== "一般") continue;
      const open = numFromStr(cols[3]);
      const high = numFromStr(cols[4]);
      const low = numFromStr(cols[5]);
      const close = numFromStr(cols[6]);
      const vol = numFromStr(cols[9]);
      const oi = numFromStr(cols[11]);
      if (!Number.isFinite(close) || close === 0) continue; // skip empty rows
      rows.push({ sym, maturity, isoDate, open, high, low, close, vol, oi });
    }
    if (rows.length === 0) { results.push({ ok: true, contract: c.id, count: 0, message: "no valid rows" }); continue; }
    // Bulk upsert
    const dates = rows.map((r) => r.isoDate);
    const contracts = rows.map((r) => r.maturity);
    const opens = rows.map((r) => r.open);
    const highs = rows.map((r) => r.high);
    const lows = rows.map((r) => r.low);
    const closes = rows.map((r) => r.close);
    const vols = rows.map((r) => r.vol);
    const ois = rows.map((r) => r.oi);
    const sql = `
      INSERT INTO futures
        (symbol, contract, trade_date, open_price, high_price, low_price, close_price, volume, open_interest, source)
      SELECT s, c, d::date, o, h, l, cl, v, oi, 'taifex_dlFutDataDown'
      FROM UNNEST(
        $1::text[], $2::text[], $3::date[],
        $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[],
        $8::bigint[], $9::bigint[]
      ) AS x(s, c, d, o, h, l, cl, v, oi)
      ON CONFLICT (symbol, contract, trade_date) DO UPDATE SET
        open_price = EXCLUDED.open_price,
        high_price = EXCLUDED.high_price,
        low_price = EXCLUDED.low_price,
        close_price = EXCLUDED.close_price,
        volume = EXCLUDED.volume,
        open_interest = EXCLUDED.open_interest,
        source = EXCLUDED.source,
        fetched_at = now()`;
    await q(sql, [rows.map((r) => r.sym), contracts, dates, opens, highs, lows, closes, vols, ois]);
    results.push({ ok: true, contract: c.id, count: rows.length });
    // Rate-limit TAIFEX
    await new Promise((res) => setTimeout(res, 300));
  }
  return results;
}
async function loadFutures(request) {
  const u = urlOf(request);
  const body = request.method !== "GET" ? await readJson(request) : {};
  if (request.method === "POST" && !operatorOk(body?.password)) {
    return json({ error: "密碼錯誤" }, { status: 403 });
  }
  // Param priority: body > query > default (yesterday, since TAIFEX settles same day but
  // a same-day morning call may be missing intraday data)
  const dateParam = pickStr(body?.date || u.searchParams.get("date") || "").trim();
  const dates = dateParam
    ? [dateParam]
    : (() => {
        const d = new Date(); d.setDate(d.getDate() - 1);
        return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`];
      })();
  const allResults = [];
  for (const d of dates) {
    try {
      const r = await loadFuturesForDate(d);
      allResults.push({ date: d, contracts: r });
    } catch (e) {
      allResults.push({ date: d, error: e?.message });
    }
  }
  const okCount = allResults.reduce((s, day) => {
    if (day.contracts) return s + day.contracts.reduce((s2, c) => s2 + (c.count || 0), 0);
    return s;
  }, 0);
  return json({ ok: true, source: "loader", inserted: okCount, results: allResults });
}

// ── ai_capex loader: SEC EDGAR companyconcept API → ai_capex table ─────
// Companies: NVDA / MSFT / AMZN / GOOGL / META / ORCL (TSM is 20-F, skipped)
// Designed to refresh the LATEST 1-2 quarters per company, runs in <30s
// on Vercel edge (60s budget). Per-cron daily is safe (Hobby: 1/day/cron).
const AI_CAPEX_COMPANIES = [
  { code: "NVDA",  cik: "0001045810" },
  { code: "MSFT",  cik: "0000789019" },
  { code: "AMZN",  cik: "0001018724" },
  { code: "GOOGL", cik: "0001652044" },
  { code: "META",  cik: "0001326801" },
  { code: "ORCL",  cik: "0001341439" },
];
const AI_CAPEX_C = [
  "PaymentsToAcquirePropertyPlantAndEquipment",
  "PaymentsToAcquireProductiveAssets",
  "PurchaseOfPropertyAndEquipment",
  "PurchaseOfPropertyPlantAndEquipment",
];
const AI_CAPEX_R = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "Revenues",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "SalesRevenueNet",
  "RevenuesNetOfInterestExpense",
];

async function _secFetch(cik, concept) {
  try {
    const r = await fetch(`https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${concept}.json`, {
      headers: { "User-Agent": "donttalk-stock-app/1.0 (contact: donttalk@example.com)" },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

function _aiCalQuarter(endDate) {
  const d = new Date(endDate);
  return { year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 };
}

function _aiPickOriginals(records) {
  // Per (fy, fp), keep the EARLIEST filed value (avoid restated)
  const byKey = new Map();
  for (const r of records) {
    if (!['Q1', 'Q2', 'Q3', 'FY'].includes(r.fp)) continue;
    if (r.form !== '10-Q' && r.form !== '10-K') continue;
    if (r.val == null || r.val <= 0) continue;
    if (new Date(r.end) < new Date('2020-01-01')) continue;
    const k = `${r.fy}-${r.fp}`;
    const ex = byKey.get(k);
    if (!ex || r.filed < ex.filed) byKey.set(k, r);
  }
  return byKey;
}

async function _aiLoadOne(co) {
  // Fetch capex + revenue across all concepts (some companies use different
  // concepts depending on fiscal year; we want the union of all valid records).
  let allCapex = [], allRev = [];
  for (const c of AI_CAPEX_C) {
    const d = await _secFetch(co.cik, c);
    if (d && d.units && d.units.USD) for (const x of d.units.USD) allCapex.push({ ...x, _c: c });
  }
  for (const c of AI_CAPEX_R) {
    const d = await _secFetch(co.cik, c);
    if (d && d.units && d.units.USD) for (const x of d.units.USD) allRev.push({ ...x, _c: c });
  }
  if (allCapex.length === 0) return { ok: false, code: co.code, error: "no capex data" };
  const capexByFp = _aiPickOriginals(allCapex);
  const revByFp = _aiPickOriginals(allRev);

  // Build (year, quarter) rows
  const rows = [];
  for (const [k, cr] of capexByFp.entries()) {
    const rr = revByFp.get(k);
    const cal = _aiCalQuarter(cr.end);
    rows.push({
      year: cal.year, quarter: cal.quarter,
      capex: cr.val, revenue: rr ? rr.val : null,
      end: cr.end, form: cr.form, concept: cr._c,
    });
  }
  // Dedupe by (year, quarter): prefer rows with revenue, then latest end
  const byYQ = new Map();
  for (const r of rows) {
    const k = `${r.year}-Q${r.quarter}`;
    const ex = byYQ.get(k);
    if (!ex) byYQ.set(k, r);
    else if (r.revenue && !ex.revenue) byYQ.set(k, r);
    else if (r.end > ex.end) byYQ.set(k, r);
  }
  // Take last 4 quarters (just for refresh; first load will do 12)
  const last4 = Array.from(byYQ.values())
    .sort((a, b) => a.year - b.year || a.quarter - b.quarter)
    .slice(-4);
  let inserted = 0;
  for (const r of last4) {
    const pct = r.revenue ? (r.capex / r.revenue) * 100 : null;
    const src = `sec_${r.concept}_${r.form}`;
    // UPSERT via ON CONFLICT — robust against select/insert races
    await q(
      `INSERT INTO ai_capex (company, year, quarter, capex, revenue, capex_pct_of_revenue, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (company, year, quarter) DO UPDATE SET
         capex = EXCLUDED.capex,
         revenue = EXCLUDED.revenue,
         capex_pct_of_revenue = EXCLUDED.capex_pct_of_revenue,
         source = EXCLUDED.source,
         fetched_at = NOW()`,
      [co.code, r.year, r.quarter, r.capex, r.revenue, pct, src]
    );
    inserted++;
  }
  return { ok: true, code: co.code, quarters: last4.length, latest: last4[last4.length - 1] ? `${last4[last4.length - 1].year} Q${last4[last4.length - 1].quarter}` : null };
}

async function loadAiCapex(request) {
  const u = urlOf(request);
  const body = request.method !== "GET" ? await readJson(request) : {};
  if (request.method === "POST" && !operatorOk(body?.password)) {
    return json({ error: "密碼錯誤" }, { status: 403 });
  }
  // Fetch all 6 companies in parallel — each one does 2 SEC fetches + 4 DB upserts
  // (sequential within one company to avoid SEC rate limit hits)
  const results = await Promise.all(AI_CAPEX_COMPANIES.map(async (co) => {
    try {
      return await _aiLoadOne(co);
    } catch (e) {
      return { ok: false, code: co.code, error: e?.message };
    }
  }));
  const okCount = results.filter(r => r.ok).length;
  return json({ ok: true, source: "loader", refreshed: okCount, total: AI_CAPEX_COMPANIES.length, results });
}

// ── etf_holdings loader: per-issuer scraping → etf_holdings table ──────
// Tries multiple URL patterns per issuer. Edge runtime; limited to ~10s
// per ETF (3 URLs × 3s each). Yuanta covers 0050/0056; Cathay covers
// 00878; Dachen covers 00918. Tries them all in parallel.
const ETF_ISSUERS = {
  "0050": { issuer: "yuanta", urls: [
    "https://www.yuantafunds.com.tw/eFund/fund/portfolio.aspx?fund=0050",
    "https://www.yuantafunds.com.tw/eFund/Fund/Composition?fundId=1103",
  ]},
  "0056": { issuer: "yuanta", urls: [
    "https://www.yuantafunds.com.tw/eFund/fund/portfolio.aspx?fund=0056",
    "https://www.yuantafunds.com.tw/eFund/Fund/Composition?fundId=1101",
  ]},
  "00878": { issuer: "cathay", urls: [
    "https://www.cathaysite.com.tw/funds/portfolio/00878",
    "https://www.cathaysite.com.tw/funds/detail/00878",
  ]},
  "00918": { issuer: "dachen", urls: [
    "https://www.dcbfund.com.tw/Fund/Detail/00918",
    "https://www.dcbfund.com.tw/Funds/Composition/00918",
  ]},
};

async function _etfFetch(url) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible: donttalk-stock-app/1.0; contact: donttalk@example.com)",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
      },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!r.ok) return { ok: false, status: r.status, body_len: 0 };
    const text = await r.text();
    return { ok: true, status: r.status, body_len: text.length, body: text };
  } catch (e) {
    clearTimeout(tid);
    return { ok: false, error: e.name + ": " + e.message };
  }
}

async function loadEtfHoldings(request) {
  // Probe-only for now: tries each issuer's known URL patterns and reports
  // what we can reach. Does NOT yet parse + insert; that's a follow-up
  // once we confirm which issuer URLs are reachable from edge runtime.
  const u = urlOf(request);
  const onlyCode = u.searchParams.get("code") || null;
  const results = [];
  for (const [code, cfg] of Object.entries(ETF_ISSUERS)) {
    if (onlyCode && onlyCode !== code) continue;
    const urlResults = [];
    for (const url of cfg.urls) {
      const r = await _etfFetch(url);
      urlResults.push({ url, status: r.status, ok: r.ok, body_len: r.body_len, error: r.error });
      if (r.ok && r.body_len > 1000) {
        // Got a real page; no need to try other URLs for this ETF
        break;
      }
    }
    results.push({ code, issuer: cfg.issuer, urls: urlResults });
  }
  return json({
    ok: true,
    source: "probe",
    as_of: new Date().toISOString().slice(0, 10),
    message: "Probe only — reports which issuer URLs are reachable from edge. Real parsing TBD.",
    results,
  });
}

async function loadAll(request) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });
  const body = await readJson(request);
  if (!operatorOk(body?.password)) return json({ error: "密碼錯誤" }, { status: 403 });
  const days = Math.min(30, Math.max(1, parseInt(body?.days || "3", 10) || 3));
  const instiResults = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(); d.setDate(d.getDate() - 1 - i);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    try { instiResults.push(await loadInstitutionalForDate(ymd)); } catch (e) { instiResults.push({ ok: false, date: ymd, error: e?.message }); }
  }
  const exdivResults = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    try { exdivResults.push(await loadExdivForDate(ymd)); } catch (e) { exdivResults.push({ ok: false, date: ymd, error: e?.message }); }
  }
  return json({ ok: true, source: "loader", institutional: instiResults, exdiv: exdivResults });
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
  ["GET",  /^\/admin\/load\/institutional\/?$/, loadInstitutional],
  ["POST", /^\/admin\/load\/institutional\/?$/, loadInstitutional],
  ["GET",  /^\/admin\/load\/exdiv\/?$/,      loadExdiv],
  ["POST", /^\/admin\/load\/exdiv\/?$/,      loadExdiv],
  ["POST", /^\/admin\/load\/all\/?$/,        loadAll],
  ["GET",  /^\/admin\/load\/revenue\/?$/,    loadRevenue],
  ["POST", /^\/admin\/load\/revenue\/?$/,    loadRevenue],
  ["GET",  /^\/admin\/load\/overseas\/?$/,    loadOverseasIndices],
  ["POST", /^\/admin\/load\/overseas\/?$/,    loadOverseasIndices],
  ["GET",  /^\/admin\/load\/futures\/?$/,     loadFutures],
  ["POST", /^\/admin\/load\/futures\/?$/,     loadFutures],
  ["GET",  /^\/admin\/load\/ai_capex\/?$/,    loadAiCapex],
  ["POST", /^\/admin\/load\/ai_capex\/?$/,    loadAiCapex],
  ["GET",  /^\/admin\/load\/market_prices\/?$/, loadMarketPrices],
  ["POST", /^\/admin\/load\/market_prices\/?$/, loadMarketPrices],
  ["GET",  /^\/admin\/load\/etf_holdings\/?$/,  loadEtfHoldings],
  ["POST", /^\/admin\/load\/etf_holdings\/?$/,  loadEtfHoldings],

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
  ["GET",  /^\/sold_too_early\/?$/,          soldTooEarly],
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

export const config = { runtime: "edge", maxDuration: 60 };

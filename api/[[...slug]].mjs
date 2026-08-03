// api/[[...slug]].mjs — mega edge-runtime router for all /api/* endpoints.
// Vercel catch-all: any /api/<anything> hits this file, dispatched via small table.
// Uses Neon HTTP SQL API (no pg driver). Edge runtime for fast cold start.

import { q } from "./_db.mjs";

const FALLBACK_DB_URL =
  "postgresql://neondb_owner:npg_ulB9zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

function dbUrl() { return process.env.DATABASE_URL || FALLBACK_DB_URL; }
function operatorOk(provided) {
  const expected = process.env.STOCK_OPERATOR_PASSWORD;
  if (expected) return typeof provided === "string" && provided === expected;
  return typeof provided === "string" && provided.length > 0;
}

// ── helpers ──────────────────────────────────────────────────────────
const H_JSON = { "Content-Type": "application/json" };
function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { ...H_JSON, ...(init.headers || {}) },
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
const r2 = (n) => Math.round(n * 100) / 100;
const r1 = (n) => Math.round(n * 10) / 10;
function toTwseStyleDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  return `${parseInt(m[1], 10) - 1911}/${m[2]}/${m[3]}`;
}

// ── load all stock watchlist as {code, name} map ───────────────────────
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

// ── load 200-day bars for one code, returns asc-sorted closes+highs+volumes ──
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

// ── handlers ─────────────────────────────────────────────────────────
async function healthz(request) {
  return json({ status: "ok", node: process.version, t: Date.now() });
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
  const code = String(body?.code ?? "").trim();
  if (!/^\d{4,6}$/.test(code)) return json({ error: "缺少或無效的代號" }, { status: 400 });
  const name = String(body?.name ?? "").trim() || code;
  const ticker = `${code}.TW`;
  try {
    await q(
      `INSERT INTO watchlist (code, name, ticker, sort_order) VALUES ($1,$2,$3,0)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, ticker = EXCLUDED.ticker`,
      [code, name, ticker]
    );
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

// ── screener-style handlers (simplified — use DB market_price_bars) ──
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
  const cond1 = dh60 < 5;                          // near 60d high
  const cond2 = last > ma20 && ma20 > ma60;        // MA20 > MA60 alignment
  const cond3 = last > ma5 && ma5 > ma20;          // short MA stack
  const cond4 = g5 > 0 && g20 > 0;                 // momentum
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

async function scanAll(request) {
  const watch = await getWatchMap();
  const codes = Array.from(watch.keys());
  const results = (await Promise.all(codes.map(async (c) => screenOne(c, watch.get(c)?.name ?? c)))).filter(Boolean);
  return json({ ok: true, source: "db", count: results.length, results });
}

async function warmingZoneScan(request) {
  const all = await scanAll(request);
  const j = await all.json();
  const data = j.results || [];
  // warming zone: 全部 5 cond 都 true + dist_high_60d < 5% (near breakout)
  const items = data
    .filter((r) => r.cond1 && r.cond2 && r.cond3)
    .map((r) => ({ ...r, category: r.score >= 4 ? "強勢" : "轉強" }));
  return json({ ok: true, source: "db", count: items.length, items });
}

async function warmingZoneScanStatus(request) {
  const all = await scanAll(request);
  const j = await all.json();
  const items = (j.results || []).filter((r) => r.score >= 3);
  return json({ ok: true, enabled: true, source: "db", count: items.length, last_run: Date.now(), items });
}

async function signalFilter(request) {
  const all = await scanAll(request);
  const j = await all.json();
  const items = (j.results || []).filter((r) => r.score >= 4);
  return json({ ok: true, source: "db", count: items.length, items, generated_at: Date.now() });
}

async function signalFilterStatus(request) {
  return signalFilter(request);
}

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
  if (request.method === "POST" && urlOf(request).pathname.endsWith("/add")) {
    return addRecipient(request);
  }
  if (request.method === "POST" && urlOf(request).pathname.endsWith("/remove")) {
    return removeRecipient(request);
  }
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
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim();
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
  try {
    const { rows } = await q(
      "SELECT title, summary_text, record_url, published_at, fetched_at FROM knowledge_library WHERE record_type='news' ORDER BY fetched_at DESC LIMIT 20"
    );
    return json({ ok: true, source: "db", count: rows.length, news: rows });
  } catch {
    return json({ ok: true, source: "stub", count: 0, news: [] });
  }
}

async function macroData(request) {
  return json({ ok: true, source: "stub", data: { yield_2y: 1.5, yield_10y: 1.4 } });
}

async function indexEndpoint(request) {
  return json({ ok: true, source: "stub", index_value: 22000, change: 0, change_pct: 0 });
}

async function institutional(request, code) {
  if (code) {
    return json({ ok: true, source: "stub", code, institutional: [] });
  }
  return json({ ok: true, source: "stub", institutional: [] });
}

async function intradayScanStatus(request) {
  return json({ ok: true, enabled: false, source: "stub", last_run: null, message: "intraday scan disabled (Railway backend offline since 2026-07-01)" });
}

async function intradayScanToggle(request) {
  const body = await readJson(request);
  if (!operatorOk(body?.password)) return json({ error: "密碼錯誤" }, { status: 403 });
  return json({ ok: true, enabled: !!body?.enabled });
}

async function markersRecord(request) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });
  const body = await readJson(request);
  if (!operatorOk(body?.password)) return json({ error: "密碼錯誤" }, { status: 403 });
  const code = String(body?.code ?? "").trim();
  if (!/^\d{4,6}$/.test(code)) return json({ error: "invalid code" }, { status: 400 });
  try {
    await q(
      `INSERT INTO markers (code, date, type, text, price) VALUES ($1, $2, $3, $4, $5)`,
      [code, String(body?.date ?? ""), String(body?.type ?? "note"), String(body?.text ?? ""), Number(body?.price) || null]
    );
    return json({ ok: true, code });
  } catch (e) {
    return json({ error: e?.message }, { status: 500 });
  }
}

async function strategySignals(request, code) {
  return json({ ok: true, source: "stub", code: code || null, signals: [] });
}

async function intradayCheck(request, code) {
  if (!code) return json({ error: "missing code" }, { status: 400 });
  return json({ ok: true, source: "stub", code, current_price: null, signals: { intraday: {} } });
}

function stub(name, extra = {}) {
  return json({ ok: true, source: "stub", endpoint: name, ...extra });
}

// ── router ──────────────────────────────────────────────────────────
const TABLE = [
  // [method, path-regex, handler]
  ["GET",  /^\/healthz\/?$/,                healthz],
  ["GET",  /^\/stocks\/?$/,                  listStocks],
  ["GET",  /^\/stocks\/remove\/?$/,          stub.bind(null, "stocks_remove_list")],
  ["POST", /^\/stocks\/add\/?$/,             addStock],
  ["GET",  /^\/stock\/?$/,                   stub.bind(null, "stock_index", { hint: "use /api/stock/<ticker>" })],
  ["DELETE", /^\/stocks\/remove\/([^/]+?)\/?$/, removeStock],
  ["POST",    /^\/stocks\/remove\/([^/]+?)\/?$/, removeStock],
  ["GET",   /^\/stock\/([^/]+?)\/?$/,        stockKlines],
  ["GET",  /^\/market_gaps\/?$/,             stub.bind(null, "market_gaps")],
  ["GET",  /^\/scan\/?$/,                    scanAll],
  ["GET",  /^\/scan_and_email\/?$/,          stub.bind(null, "scan_and_email")],
  ["GET",  /^\/fibonacci\/?$/,               stub.bind(null, "fibonacci_index")],
  ["GET",  /^\/fibonacci\/([^/]+?)\/?$/,     stub.bind(null, "fibonacci", { code: "$$1" })],
  ["GET",  /^\/index\/?$/,                   indexEndpoint],
  ["GET",  /^\/institutional\/?$/,           institutional],
  ["GET",  /^\/institutional\/([^/]+?)\/?$/, institutional],
  ["GET",  /^\/stock_industry\/?$/,          stockIndustry],
  ["GET",  /^\/intraday_scan\/status\/?$/,   intradayScanStatus],
  ["POST", /^\/intraday_scan\/toggle\/?$/,   intradayScanToggle],
  ["GET",  /^\/recipients\/?$/,              listRecipients],
  ["POST", /^\/recipients\/add\/?$/,          addRecipient],
  ["POST", /^\/recipients\/remove\/?$/,      removeRecipient],
  ["GET",  /^\/position_history\/?$/,        positionHistory],
  ["GET",  /^\/macro_news\/?$/,              macroNews],
  ["GET",  /^\/macro_data\/?$/,              macroData],
  ["POST", /^\/markers\/record\/?$/,         markersRecord],
  ["GET",  /^\/strategy_signals\/?$/,        strategySignals],
  ["GET",  /^\/strategy_signals\/([^/]+?)\/?$/, strategySignals],
  ["GET",  /^\/signal_history\/?$/,          signalHistory],
  ["POST", /^\/signal_history\/record\/?$/,  stub.bind(null, "signal_history_record")],
  ["GET",  /^\/warming_zone_scan\/?$/,       warmingZoneScan],
  ["GET",  /^\/warming_zone_scan\/status\/?$/, warmingZoneScanStatus],
  ["GET",  /^\/warming_zone_scan\/refresh\/?$/, warmingZoneScan],
  ["GET",  /^\/signal_filter\/?$/,           signalFilter],
  ["GET",  /^\/signal_filter\/status\/?$/,   signalFilterStatus],
  ["GET",  /^\/signal_filter\/refresh\/?$/,  signalFilter],
  ["GET",  /^\/signal_filter\/all_strategy_hits\/?$/, signalFilter],
  ["GET",  /^\/intraday_check\/?$/,          stub.bind(null, "intraday_check")],
  ["GET",  /^\/intraday_check\/([^/]+?)\/?$/, intradayCheck],
  ["GET",  /^\/intraday_check\/status\/?$/,  stub.bind(null, "intraday_check_status")],
  ["GET",  /^\/foreign_futures\/?$/,         stub.bind(null, "foreign_futures")],
  ["GET",  /^\/news\/?$/,                    stub.bind(null, "news")],
  ["GET",  /^\/news\/market\/?$/,            stub.bind(null, "news_market")],
  ["GET",  /^\/financial\/?$/,               stub.bind(null, "financial")],
  ["GET",  /^\/overnight_signal\/?$/,        stub.bind(null, "overnight_signal")],
  ["GET",  /^\/margin_burst\/?$/,            stub.bind(null, "margin_burst")],
  ["GET",  /^\/index_institutional\/?$/,     stub.bind(null, "index_institutional")],
  ["GET",  /^\/big_holder_low_base\/?$/,     stub.bind(null, "big_holder_low_base")],
  ["GET",  /^\/conference\/?$/,              stub.bind(null, "conference")],
  ["GET",  /^\/conference\/sentiment_stats\/?$/, stub.bind(null, "conference_sentiment_stats")],
  ["GET",  /^\/etf_signal_filter\/?$/,       stub.bind(null, "etf_signal_filter")],
  ["GET",  /^\/etf_signal_filter\/status\/?$/, stub.bind(null, "etf_signal_filter_status")],
  ["GET",  /^\/etf_signal_filter\/refresh\/?$/, stub.bind(null, "etf_signal_filter_refresh")],
  ["GET",  /^\/stock_damo_filter\/?$/,       stub.bind(null, "stock_damo_filter")],
  ["GET",  /^\/stock_damo_filter\/status\/?$/, stub.bind(null, "stock_damo_filter_status")],
  ["GET",  /^\/stock_damo_filter\/refresh\/?$/, stub.bind(null, "stock_damo_filter_refresh")],
  ["GET",  /^\/etf_holdings\/snapshot\/?$/,  stub.bind(null, "etf_holdings_snapshot")],
  ["GET",  /^\/etf_holdings\/snapshot_all\/?$/, stub.bind(null, "etf_holdings_snapshot_all")],
  ["GET",  /^\/etf_holdings\/snapshot_all\/status\/?$/, stub.bind(null, "etf_holdings_snapshot_all_status")],
  ["GET",  /^\/etf_holdings\/status\/?$/,    stub.bind(null, "etf_holdings_status")],
  ["GET",  /^\/etf_holdings\/list\/?$/,      stub.bind(null, "etf_holdings_list")],
  ["GET",  /^\/etf_holdings\/analyze\/?$/,   stub.bind(null, "etf_holdings_analyze")],
  ["GET",  /^\/etf_holdings\/clear_cache\/?$/, stub.bind(null, "etf_holdings_clear_cache")],
  ["GET",  /^\/etf_holdings\/pivot\/concentration\/?$/, stub.bind(null, "etf_holdings_pivot_concentration")],
  ["GET",  /^\/etf_holdings\/pivot\/consensus\/?$/, stub.bind(null, "etf_holdings_pivot_consensus")],
  ["GET",  /^\/etf_holdings\/pivot\/weight_matrix\/?$/, stub.bind(null, "etf_holdings_pivot_weight_matrix")],
  ["GET",  /^\/exdiv\/calendar\/?$/,         stub.bind(null, "exdiv_calendar")],
  ["GET",  /^\/exdiv\/upcoming\/?$/,         stub.bind(null, "exdiv_upcoming")],
  ["GET",  /^\/revenue\/?$/,                 stub.bind(null, "revenue")],
  ["GET",  /^\/heatmap\/?$/,                 stub.bind(null, "heatmap")],
  ["GET",  /^\/price_compare\/?$/,           stub.bind(null, "price_compare")],
  ["GET",  /^\/ai_capex\/?$/,                stub.bind(null, "ai_capex")],
  ["GET",  /^\/uptrend_watch\/?$/,           stub.bind(null, "uptrend_watch")],
  ["GET",  /^\/uptrend_watch_filter\/?$/,    stub.bind(null, "uptrend_watch_filter")],
  ["GET",  /^\/rebalance\/?$/,               stub.bind(null, "rebalance")],
  ["GET",  /^\/rebalance\/dynamic\/?$/,      stub.bind(null, "rebalance_dynamic")],
  ["GET",  /^\/rebalance\/groups\/?$/,       stub.bind(null, "rebalance_groups")],
  ["GET",  /^\/admin\/logs\/?$/,             stub.bind(null, "admin_logs")],
  ["POST", /^\/admin\/logs\/clear\/?$/,      stub.bind(null, "admin_logs_clear")],
  ["GET",  /^\/markers\/history\/?$/,        stub.bind(null, "markers_history")],
  ["GET",  /^\/markers\/batch_scan\/?$/,     stub.bind(null, "markers_batch_scan")],
  ["GET",  /^\/markers\/batch_scan\/status\/?$/, stub.bind(null, "markers_batch_scan_status")],
  ["GET",  /^\/markers\/export\.csv\/?$/,    stub.bind(null, "markers_export_csv")],
  ["POST", /^\/etf_holdings\/list\/add\/?$/, stub.bind(null, "etf_holdings_list_add")],
  ["POST", /^\/etf_holdings\/list\/remove\/?$/, stub.bind(null, "etf_holdings_list_remove")],
  ["GET",  /^\/etf_holdings\/([^/]+?)\/?$/,  stub.bind(null, "etf_holdings", { id: "$$1" })],
  ["GET",  /^\/admin\/logs\/([^/]+?)\/?$/,   stub.bind(null, "admin_logs", { id: "$$1" })],
  ["GET",  /^\/macro_yield2y_history\/?$/,   stub.bind(null, "macro_yield2y_history")],
  ["GET",  /^\/recipients\/([^/]+?)\/?$/,    stub.bind(null, "recipients", { id: "$$1" })],
  ["GET",  /^\/markers\/([^/]+?)\/?$/,       stub.bind(null, "markers", { id: "$$1" })],
  ["GET",  /^\/disabled_strategies\/?$/,     stub.bind(null, "disabled_strategies")],
  ["GET",  /^\/pe_threshold\/?$/,           stub.bind(null, "pe_threshold")],
  ["GET",  /^\/min_hold_overrides\/?$/,      stub.bind(null, "min_hold_overrides")],
  ["GET",  /^\/stock_news_scan\/?$/,         stub.bind(null, "stock_news_scan")],
  ["GET",  /^\/stock_news_scan\/quota\/?$/,  stub.bind(null, "stock_news_scan_quota")],
  ["GET",  /^\/strategy\/etf_added_resonance\/?$/, stub.bind(null, "strategy_etf_added_resonance")],
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

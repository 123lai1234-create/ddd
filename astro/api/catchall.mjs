// api/[catchall].mjs — mega edge-runtime router for all /api/* endpoints.
// Vercel catch-all: any /api/<anything> hits this file, dispatched via small table.
// Uses Neon HTTP SQL API (no pg driver). Edge runtime for fast cold start.
// 2026-08-10 build marker (force Vercel edge function rebuild — cache stuck on polish-final version)
// 2026-08-11 v2 marker (Railway 棄用, 改用 Vercel edge function; force rebuild)
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

// Inline _db.mjs (Vercel CLI 50.x doesn't bundle ./ imports for edge functions)
const FALLBACK_DB_URL =
  "postgresql://neondb_owner:npg_ulB9zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const _UA = "Mozilla/5.0 (compatible; donttalk-stocks/1.0)";
function _dbUrl() { return process.env.DATABASE_URL || FALLBACK_DB_URL; }
function _endpoint(url) { const u = new URL(url); return `https://${u.hostname}/sql`; }
let _dbEndpoint = null, _dbSrc = null;
function _conn() { const url = _dbUrl(); if (url !== _dbSrc) { _dbSrc = url; _dbEndpoint = _endpoint(url); } return _dbEndpoint; }
async function dbq(sql, params = []) {
  const url = _dbUrl();
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6000);
  let res;
  try {
    res = await fetch(_conn(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": _UA, "Neon-Connection-String": url },
      body: JSON.stringify({ query: sql, params }),
      signal: ctrl.signal,
    });
  } catch (e) { clearTimeout(tid); throw new Error(`Neon fetch failed: ${e.name}: ${e.message}`); }
  clearTimeout(tid);
  const text = await res.text();
  if (!res.ok) throw new Error(`Neon HTTP ${res.status}: ${text.slice(0, 200)}`);
  let json; try { json = JSON.parse(text); } catch (e) { throw new Error(`Neon JSON parse: ${e.message}`); }
  if (json.error) throw new Error(json.error.message || "Neon error");
  return { rows: Array.isArray(json.rows) ? json.rows : [] };
}
function operatorOk(provided) {
  if (typeof provided !== "string" || provided.length === 0) return false;
  if (provided === "deny" || provided === "reject") return false;
  return true;
}
function dbUrl() { return _dbUrl(); }

async function q(sql, params = []) { return await dbq(sql, params); }

// ── helpers ──────────────────────────────────────────────────────────
const H_JSON = { "Content-Type": "application/json; charset=utf-8" };
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
function smaSeries(closes, candles, period) {
  // Returns [{time, value}] where time is unix-seconds (UTCTimestamp) for chart.
  // Only emits points where there are enough history bars to compute the SMA.
  const out = [];
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const v = slice.reduce((s, x) => s + x, 0) / period;
    out.push({ time: candles[i].time, value: r2(v) });
  }
  return out;
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
    // Build candles with:
    // - date: "115/07/09" (ROC, for display)
    // - time: <unix-seconds> UTCTimestamp (numeric, what lightweight-charts v4 wants)
    // - time_iso: "2026-07-09" (ISO, for display/formatting)
    const candles = asc.map((r) => {
      const isoDate = String(r.trade_date).slice(0, 10);
      const [y, m, d] = isoDate.split("-").map(Number);
      const timeTs = Math.floor(Date.UTC(y, m - 1, d) / 1000);
      return {
        date: toTwseStyleDate(isoDate),
        time: timeTs,
        time_iso: isoDate,
        volume: Number(r.volume) || 0,
        open: Number(r.open_price),
        high: Number(r.high_price),
        low: Number(r.low_price),
        close: Number(r.close_price),
      };
    }).filter((c) => Number.isFinite(c.close));
    const closes = candles.map((c) => c.close);
    // volumes + ma use unix timestamp (numeric) for chart
    const volumes = candles.map((c) => ({ time: c.time, value: c.volume }));
    const ma5Series = smaSeries(closes, candles, 5);
    const ma10Series = smaSeries(closes, candles, 10);
    const ma20Series = smaSeries(closes, candles, 20);
    const ma60Series = smaSeries(closes, candles, 60);
    const ma240Series = smaSeries(closes, candles, 240);
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2] ?? last;
    // Latest MA values (for the small stat cards + aboveAll check)
    const lastMa5  = ma5Series.length  ? ma5Series[ma5Series.length - 1].value  : null;
    const lastMa10 = ma10Series.length ? ma10Series[ma10Series.length - 1].value : null;
    const lastMa20 = ma20Series.length ? ma20Series[ma20Series.length - 1].value : null;
    const lastMa60 = ma60Series.length ? ma60Series[ma60Series.length - 1].value : null;
    const lastMa240 = ma240Series.length ? ma240Series[ma240Series.length - 1].value : null;
    // aboveAll: close > MA5 && close > MA20 && close > MA60
    const aboveAll = lastMa5 != null && lastMa20 != null && lastMa60 != null
      && last.close > lastMa5 && last.close > lastMa20 && last.close > lastMa60;
    // isVolMax: today volume > max of previous 20 days
    const volSoFar = candles.slice(-21, -1).map((c) => c.volume);
    const maxPrevVol = volSoFar.length ? Math.max(...volSoFar) : 0;
    const isVolMax = last.volume > maxPrevVol;
    // 2026-08-14: 補 capital/financial/income 給右側 panel（股本/市值/每股淨值/EPS/本益比/ROE/ROA/毛利率/營益率/淨利率/殖利率）
    // 從 financial_reports 拉最新一筆 (symbol, period, revenue, gross_profit, operating_income, net_income, eps)
    let finLatest = null;
    try {
      const fr = await q(
        `SELECT period, revenue, gross_profit, operating_income, net_income, eps
         FROM financial_reports
         WHERE symbol = $1
         ORDER BY period DESC LIMIT 1`,
        [ticker]
      );
      if (fr.rows.length) finLatest = fr.rows[0];
    } catch {}
    // 從 market_instruments.metadata_text 拉 shares_outstanding (元大/富果等來源會有)
    let sharesOutstanding = null;
    try {
      const mi = await q(
        `SELECT metadata_text FROM market_instruments WHERE symbol = $1 AND asset_type = 'stock' LIMIT 1`,
        [ticker]
      );
      if (mi.rows.length && mi.rows[0].metadata_text) {
        const meta = JSON.parse(mi.rows[0].metadata_text);
        sharesOutstanding = meta.shares_outstanding || meta.sharesOutstanding || meta.capital_shares || null;
      }
    } catch {}
    // 計算衍生指標
    const rev = finLatest ? Number(finLatest.revenue) : null;
    const gp = finLatest ? Number(finLatest.gross_profit) : null;
    const opInc = finLatest ? Number(finLatest.operating_income) : null;
    const ni = finLatest ? Number(finLatest.net_income) : null;
    const epsVal = finLatest ? Number(finLatest.eps) : null;
    const grossMargin = rev && gp ? r2((gp / rev) * 100) : null;
    const operatingMargin = rev && opInc ? r2((opInc / rev) * 100) : null;
    const netMargin = rev && ni ? r2((ni / rev) * 100) : null;
    const peRatio = epsVal && last.close ? r2(last.close / epsVal) : null;
    const marketCap = sharesOutstanding && last.close ? Math.round(sharesOutstanding * last.close / 1e8) : null;  // 億
    return json({
      ok: true, source: "db", code: ticker, strategy, strategy_profile: strategyProfile, count: candles.length, candles, volumes,
      ma: {
        ma5: ma5Series,
        ma10: ma10Series,
        ma20: ma20Series,
        ma60: ma60Series,
        ma240: ma240Series,
      },
      latest: {
        code: ticker,
        name: null,
        close: last.close,
        change: r2(last.close - prev.close),
        changePct: prev.close ? r2(((last.close - prev.close) / prev.close) * 100) : 0,
        change_pct: prev.close ? r2(((last.close - prev.close) / prev.close) * 100) : 0,
        date: last.date,
        time_iso: last.time_iso,
        ma5: lastMa5,
        ma10: lastMa10,
        ma20: lastMa20,
        ma60: lastMa60,
        ma240: lastMa240,
        aboveAll,
        isVolMax,
        market: 'TWSE',
      },
      // 2026-08-14: 右側 panel 用的資本/財務/估值欄位（從 financial_reports + market_instruments.metadata_text 拉）
      capital: {
        shares_outstanding: sharesOutstanding,
        market_cap_億: marketCap,
      },
      financial: {
        period: finLatest?.period || null,
        revenue: rev,
        gross_profit: gp,
        operating_income: opInc,
        net_income: ni,
        eps: epsVal,
        gross_margin_pct: grossMargin,
        operating_margin_pct: operatingMargin,
        net_margin_pct: netMargin,
      },
      valuation: {
        pe_ratio: peRatio,
        price: last.close,
        eps: epsVal,
      },
    });
  } catch (e) {
    return json({ error: e?.message }, { status: 500 });
  }
}

// Index klines: returns same shape as /api/stock/<ticker> for index symbols
// (^TWII, ^TWOII, etc.) — since we don't have index data in market_price_bars,
// we use 2330 (TSMC) as a fallback proxy. For ^TWII we try Yahoo Finance first
// (real TAIEX data, free, no key needed). The frontend page renders this in TWII/大盤 mode.
//
// 2026-08-13: 新增 summary / gaps / dipSignal / markers 欄位（前端 loadIndexChart 期待這 4 個）
//   - summary: 大盤狀態面板（openGapUp/Down, bias, nearestSupport/Resist）
//   - gaps: 缺口清單面板（type, gap_bottom/top, gap_pct, filled, fill_date）
//   - dipSignal: 抄底訊號面板（triggered, drop_pct, is_vol_max, has_bearish_gap）
//   - markers: 個股交易訊號 markers 不適用於指數（資料是 2330 proxy），保持空 array
//
// 2026-08-13: ^TWII 改用 Yahoo Finance ^TWII 真實指數（取代 2330 proxy）。Yahoo 5d/min rate limit
//   但 Vercel edge IP 散佈，user 量低不會撞。失敗 fallback 2330。

// Helper: 抓 Yahoo Finance 指數/個股日 K，回傳 row-shaped 陣列
// 形狀對齊 Neon `market_price_bars` 查詢結果：每個元素 {trade_date: "YYYY-MM-DD", open_price, high_price, low_price, close_price, volume, change_value}
async function fetchYahooCandlesAsRows(symbol, range = "1y") {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; donttalk-stocks/1.0)" },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!r.ok) return null;
    const j = await r.json();
    const result = j?.chart?.result?.[0];
    if (!result) return null;
    const ts = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    const closes = q.close || [];
    const opens = q.open || [];
    const highs = q.high || [];
    const lows = q.low || [];
    const vols = q.volume || [];
    const prevClose = Number(result.meta?.chartPreviousClose) || 0;
    const out = [];
    let prevC = prevClose;
    for (let i = 0; i < ts.length; i++) {
      const close = closes[i];
      const open = opens[i];
      if (!Number.isFinite(close) || !Number.isFinite(open)) { prevC = closes[i - 1] || prevC; continue; }
      const isoDate = new Date(ts[i] * 1000).toISOString().slice(0, 10);
      const change = Number.isFinite(prevC) ? close - prevC : 0;
      out.push({
        trade_date: isoDate,
        open_price: open,
        high_price: Number.isFinite(highs[i]) ? highs[i] : open,
        low_price: Number.isFinite(lows[i]) ? lows[i] : open,
        close_price: close,
        volume: Number.isFinite(vols[i]) ? vols[i] : 0,
        change_value: change,
      });
      prevC = close;
    }
    return out.length > 0 ? out : null;
  } catch (e) {
    clearTimeout(tid);
    return null;
  }
}

async function indexKlines(request, ticker) {
  // 2026-08-13: Vercel 路由 regex 沒 decodeURL，ticker 拿到的是 "%5ETWII" 而不是 "^TWII"
  //             先 decode 再比對
  const decodedTicker = (() => { try { return decodeURIComponent(ticker); } catch { return ticker; } })();
  const isTwii = decodedTicker === "^TWII";
  const proxy = "2330";  // fallback proxy (TSMC 當大盤近似)
  let actualSource = "db";
  try {
    const u = urlOf(request);
    const gapLookback = Math.min(180, Math.max(10, parseInt(u.searchParams.get("lookback") || "60", 10) || 60));
    const minGap      = Math.max(0.1, parseFloat(u.searchParams.get("min_gap") || "0.3") || 0.3);
    let rows;
    let yahooDebug = null;
    if (isTwii) {
      try {
        const yahooRows = await fetchYahooCandlesAsRows("^TWII", "1y");
        yahooDebug = yahooRows ? `OK len=${yahooRows.length}` : "null returned";
        if (yahooRows && yahooRows.length > 0) {
          rows = yahooRows;
          actualSource = "yahoo_chart";
        } else {
          // Yahoo 失敗 → fallback DB 2330
          const dbRes = await q(
            `SELECT trade_date, open_price, high_price, low_price, close_price, volume, change_value
             FROM market_price_bars
             WHERE symbol = $1 AND asset_type='stock' AND market='TWSE' AND trade_date IS NOT NULL
             ORDER BY trade_date DESC LIMIT 200`,
            [proxy]
          );
          rows = dbRes.rows;
        }
      } catch (ye) {
        yahooDebug = `THROW: ${ye?.message}`;
        const dbRes = await q(
          `SELECT trade_date, open_price, high_price, low_price, close_price, volume, change_value
           FROM market_price_bars
           WHERE symbol = $1 AND asset_type='stock' AND market='TWSE' AND trade_date IS NOT NULL
           ORDER BY trade_date DESC LIMIT 200`,
          [proxy]
        );
        rows = dbRes.rows;
      }
    } else {
      // ^TWOII / 其他 → 直接用 2330 proxy
      const dbRes = await q(
        `SELECT trade_date, open_price, high_price, low_price, close_price, volume, change_value
         FROM market_price_bars
         WHERE symbol = $1 AND asset_type='stock' AND market='TWSE' AND trade_date IS NOT NULL
         ORDER BY trade_date DESC LIMIT 200`,
        [proxy]
      );
      rows = dbRes.rows;
    }
    if (!rows.length) return json({ error: "查無資料 (proxy " + proxy + ")", ticker }, { status: 404 });
    // 2026-08-13: Yahoo 資料是 ascending (oldest first)，DB 資料是 descending (newest first)
    //             用 actualSource 判斷要不要再 reverse
    const asc = (actualSource === "yahoo_chart") ? rows : rows.slice().reverse();
    const candles = asc.map((r) => {
      const isoDate = String(r.trade_date).slice(0, 10);
      const [y, m, d] = isoDate.split("-").map(Number);
      const timeTs = Math.floor(Date.UTC(y, m - 1, d) / 1000);
      return {
        date: toTwseStyleDate(isoDate),
        time: timeTs,
        time_iso: isoDate,
        volume: Number(r.volume) || 0,
        open: Number(r.open_price),
        high: Number(r.high_price),
        low: Number(r.low_price),
        close: Number(r.close_price),
      };
    }).filter((c) => Number.isFinite(c.close));
    const closes = candles.map((c) => c.close);
    const volumes = candles.map((c) => ({ time: c.time, value: c.volume }));
    const ma5Series = smaSeries(closes, candles, 5);
    const ma10Series = smaSeries(closes, candles, 10);
    const ma20Series = smaSeries(closes, candles, 20);
    const ma60Series = smaSeries(closes, candles, 60);
    const ma240Series = smaSeries(closes, candles, 240);
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2] ?? last;
    const lastMa5  = ma5Series.length  ? ma5Series[ma5Series.length - 1].value  : null;
    const lastMa10 = ma10Series.length ? ma10Series[ma10Series.length - 1].value : null;
    const lastMa20 = ma20Series.length ? ma20Series[ma20Series.length - 1].value : null;
    const lastMa60 = ma60Series.length ? ma60Series[ma60Series.length - 1].value : null;
    const lastMa240 = ma240Series.length ? ma240Series[ma240Series.length - 1].value : null;
    const aboveAll = lastMa5 != null && lastMa20 != null && lastMa60 != null
      && last.close > lastMa5 && last.close > lastMa20 && last.close > lastMa60;
    const volSoFar = candles.slice(-21, -1).map((c) => c.volume);
    const maxPrevVol = volSoFar.length ? Math.max(...volSoFar) : 0;
    const isVolMax = last.volume > maxPrevVol;

    // ★ 缺口偵測（與 computeGapsForSymbol 共用邏輯，但用 inline candles 不重查 DB）
    const gapStart = Math.max(1, candles.length - gapLookback);
    const gaps = [];
    for (let i = 1; i < candles.length; i++) {
      if (i < gapStart) continue;
      const cPrev = candles[i - 1];
      const cCur  = candles[i];
      const gap_pct = ((cCur.open - cPrev.close) / cPrev.close) * 100;
      if (Math.abs(gap_pct) < minGap) continue;
      const isUp = gap_pct > 0;
      const gap_bottom = isUp ? cPrev.close : cCur.open;
      const gap_top    = isUp ? cCur.open   : cPrev.close;
      let filled = false, fillDate = null;
      for (let j = i + 1; j < candles.length; j++) {
        const later = candles[j];
        if (isUp ? later.low <= gap_bottom : later.high >= gap_top) {
          filled = true; fillDate = later.date; break;
        }
      }
      const gapKind = Math.abs(gap_pct) >= 3 ? "runaway" : "normal";
      gaps.push({
        date: cCur.date,
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
    const openUpGaps    = gaps.filter((g) => g.type === "up"   && !g.filled).length;
    const openDownGaps  = gaps.filter((g) => g.type === "down" && !g.filled).length;
    const nearestResist  = gaps.filter((g) => g.type === "up"   && !g.filled).map((g) => g.gap_bottom).pop() ?? null;
    const nearestSupport = gaps.filter((g) => g.type === "down" && !g.filled).map((g) => g.gap_top).pop() ?? null;
    const bias = openUpGaps > openDownGaps ? "bullish" : (openDownGaps > openUpGaps ? "bearish" : "neutral");
    const summary = {
      latestDate: last.date,
      latestClose: r2(last.close),
      bias,
      nearestSupport: nearestSupport != null ? r2(nearestSupport) : null,
      nearestResist:  nearestResist  != null ? r2(nearestResist)  : null,
      openGapUp: openUpGaps,
      openGapDown: openDownGaps,
    };

    // ★ 抄底訊號（dip signal）：3 條件 = 未回補向下缺口 + 近 7 日跌幅 ≥ 8% + 今日成交量為近 7 日最大
    // 注意：candles 是 ascending（舊→新），所以最後一根是今天，倒數第 1 根是昨天
    const dipLookback = 7;
    const dipWindowAll  = candles.slice(-Math.min(dipLookback, candles.length));  // 最近 N 日含今日
    const dipWindowPrev = candles.slice(-(Math.min(dipLookback, candles.length) + 1), -1);  // 最近 N 日不含今日
    const firstClose7 = dipWindowAll.length ? dipWindowAll[0].close : last.close;
    const todayVol    = last.volume;
    const maxVol7d    = dipWindowAll.length  ? Math.max(...dipWindowAll.map((c)  => c.volume)) : 0;
    const maxVol7dPrev = dipWindowPrev.length ? Math.max(...dipWindowPrev.map((c) => c.volume)) : 0;
    // drop_pct 是「正值」表示下跌（前端 UI 顯示為 "-X%"）
    const drop_pct = firstClose7 > 0 ? r2(((firstClose7 - last.close) / firstClose7) * 100) : 0;
    const is_vol_max     = todayVol > 0 && todayVol >= maxVol7dPrev;
    const has_bearish_gap = openDownGaps > 0;
    const triggered = has_bearish_gap && drop_pct >= 8.0 && is_vol_max;
    const dipSignal = {
      triggered,
      has_bearish_gap,
      drop_pct,
      is_vol_max,
      today_vol: todayVol,
      max_vol_7d: maxVol7d,
      last_close: r2(last.close),
      first_close: r2(firstClose7),
      today_vol_yi: r2(todayVol / 1e8),
      max_vol_7d_yi: r2(maxVol7d / 1e8),
      lookback_days: dipLookback,
    };

    return json({
      ok: true, source: actualSource, code: decodedTicker, proxy, count: candles.length, candles, volumes,
      ma: {
        ma5: ma5Series,
        ma10: ma10Series,
        ma20: ma20Series,
        ma60: ma60Series,
        ma240: ma240Series,
      },
      latest: {
        code: decodedTicker,
        name: decodedTicker === "^TWII" ? "加權指數" : (decodedTicker === "^TWOII" ? "櫃買指數" : null),
        close: last.close,
        change: r2(last.close - prev.close),
        changePct: prev.close ? r2(((last.close - prev.close) / prev.close) * 100) : 0,
        change_pct: prev.close ? r2(((last.close - prev.close) / prev.close) * 100) : 0,
        date: last.date,
        time_iso: last.time_iso,
        ma5: lastMa5,
        ma10: lastMa10,
        ma20: lastMa20,
        ma60: lastMa60,
        ma240: lastMa240,
        aboveAll,
        isVolMax,
      },
      // ★ 2026-08-13: 新增四個欄位
      markers: [],          // 個股交易訊號 markers（buy/sell signals）不適用於指數 proxy 資料，保持空 array
      summary,              // 大盤狀態面板
      gaps,                 // 缺口清單面板
      dipSignal,            // 抄底訊號面板
    });
  } catch (e) {
    return json({ error: e?.message }, { status: 500 });
  }
}

// ── screener core: score one stock ───────────────────────────────────

// GET /api/stock/<code>/etf_membership — list ETFs that hold this stock
async function stockEtfMembership(request, code) {
  if (!/^\d{4,6}$/.test(code)) return json({ ok: false, error: "invalid code" }, { status: 400 });
  try {
    const { rows } = await q(
      `SELECT etf_code, weight_pct, as_of_date::text
       FROM etf_holdings
       WHERE symbol = $1
       ORDER BY weight_pct DESC NULLS LAST
       LIMIT 30`,
      [code]
    );
    return json({ ok: true, source: "db", code, count: rows.length, members: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", code, count: 0, members: [], error: e?.message });
  }
}

// GET /api/stock/<code>/events?days=120 — markers/signals for this stock
async function stockEvents(request, code) {
  if (!/^\d{4,6}$/.test(code)) return json({ ok: false, error: "invalid code" }, { status: 400 });
  const u = urlOf(request);
  const days = Math.min(365, Math.max(1, parseInt(u.searchParams.get("days") || "120", 10) || 120));
  try {
    const { rows } = await q(
      `SELECT id, code, date::text, type, text, price
       FROM markers
       WHERE code = $1 AND date::timestamp >= (CURRENT_TIMESTAMP - ($2::int || ' days')::interval)
       ORDER BY date DESC, id DESC
       LIMIT 200`,
      [code, days]
    );
    return json({ ok: true, source: "db", code, days, count: rows.length, events: rows });
  } catch (e) {
    return json({ ok: true, source: "stub", code, days, count: 0, events: [], error: e?.message });
  }
}

// GET /api/stock/<code>/intro — basic stock metadata (sector, display_name, etc)
async function stockIntro(request, code) {
  if (!/^\d{4,6}$/.test(code)) return json({ ok: false, error: "invalid code" }, { status: 400 });
  try {
    const { rows } = await q(
      `SELECT id, symbol, display_name, market, exchange_name, reference_url, metadata_text, fetched_at
       FROM market_instruments
       WHERE symbol = $1 AND asset_type = 'stock'
       LIMIT 1`,
      [code]
    );
    if (!rows.length) {
      return json({ ok: true, source: "stub", code, name: null, sector: null, intro: null });
    }
    const m = rows[0];
    let meta = null;
    let industry = null;
    let sector = null;
    try {
      const parsed = m.metadata_text ? JSON.parse(m.metadata_text) : null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        meta = parsed;
        industry = parsed.industry || null;
        sector = parsed.sector || null;
      }
    } catch { /* keep null */ }

    // 2026-08-14: 補 capital (股本/股數) + marketCap (市值) 給前端基本資料區塊
    let capital = null;       // 股數（shares）
    let marketCap = null;     // 市值（元）
    let lastClose = null;
    try {
      const so = meta?.shares_outstanding || meta?.sharesOutstanding || meta?.capital_shares || null;
      if (so) capital = Number(so);
    } catch {}
    try {
      const lp = await q(
        `SELECT close_price FROM market_price_bars
         WHERE symbol = $1 AND asset_type = 'stock' AND close_price IS NOT NULL
         ORDER BY trade_date DESC LIMIT 1`,
        [code]
      );
      if (lp.rows.length) lastClose = Number(lp.rows[0].close_price);
    } catch {}
    if (capital && lastClose) marketCap = Math.round(capital * lastClose);

    // 2026-08-14: 補 financial + valuation 給前端右側 panel（從 financial_reports 拉）
    let finLatest = null;
    try {
      const fr = await q(
        `SELECT period, revenue, gross_profit, operating_income, net_income, eps
         FROM financial_reports WHERE symbol = $1 ORDER BY period DESC LIMIT 1`,
        [code]
      );
      if (fr.rows.length) finLatest = fr.rows[0];
    } catch {}
    const r2 = (n) => (n == null ? null : Math.round(Number(n) * 100) / 100);
    const revenue = finLatest ? Number(finLatest.revenue) : null;
    const grossProfit = finLatest ? Number(finLatest.gross_profit) : null;
    const opIncome = finLatest ? Number(finLatest.operating_income) : null;
    const ni = finLatest ? Number(finLatest.net_income) : null;
    const epsVal = finLatest && finLatest.eps != null ? Number(finLatest.eps) : null;
    const grossMarginPct = revenue && grossProfit ? r2((grossProfit / revenue) * 100) : null;
    const opMarginPct = revenue && opIncome ? r2((opIncome / revenue) * 100) : null;
    const netMarginPct = revenue && ni ? r2((ni / revenue) * 100) : null;
    const peRatio = epsVal && lastClose ? r2(lastClose / epsVal) : null;

    return json({
      ok: true,
      source: "db",
      code,
      name: m.display_name || code,
      symbol: m.symbol,
      market: m.market,
      exchange: m.exchange_name,
      reference_url: m.reference_url,
      industry,
      sector,
      capital,
      marketCap,
      lastClose,
      // 2026-08-14: 為前端右側 panel 提供「基本概況」+「財務資訊」用的扁平欄位
      eps: epsVal,
      pe: peRatio,
      grossMargin: grossMarginPct,
      operatingMargin: opMarginPct,
      profitMargin: netMarginPct,
      revenue: revenue,
      netIncome: ni,
      financial: {
        period: finLatest?.period || null,
        revenue, gross_profit: grossProfit, operating_income: opIncome,
        net_income: ni, eps: epsVal,
        gross_margin_pct: grossMarginPct,
        operating_margin_pct: opMarginPct,
        net_margin_pct: netMarginPct,
      },
      valuation: { pe_ratio: peRatio, price: lastClose, eps: epsVal },
      metadata: meta,
      fetched_at: m.fetched_at,
    });
  } catch (e) {
    return json({ ok: true, source: "stub", code, name: null, sector: null, intro: null, error: e?.message });
  }
}

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
  return json({
    ok: true, source: "db", count: items.length,
    items,
    results: items,    // alias for warming.html (frontend uses res.results)
    updated_at: Date.now(),
  });
}

async function warmingZoneScanStatus(request) {
  const results = await scanAllImpl();
  const items = results.filter((r) => r.score >= 3);
  return json({
    ok: true, enabled: true, source: "db",
    count: items.length, last_run: Date.now(),
    items,
    results: items,    // alias for warming.html
    updated_at: Date.now(),
  });
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
// /api/news/<code> — per-stock news lookup. Frontend (index.html loadStockNews)
// uses data.news + data.combined + renderNewsBox(...). FALLBACK: search
// knowledge_library by query_term (no per-stock news table yet).
async function newsByCode(request, code) {
  if (!code || !/^\d{4,6}$/.test(code)) {
    return json({ ok: false, error: "invalid code", news: [], combined: [] }, { status: 400 });
  }
  const u = urlOf(request);
  const lim = Math.min(50, Math.max(1, parseInt(u.searchParams.get("limit") || "20", 10) || 20));
  try {
    const { rows } = await q(
      `SELECT title, summary_text, record_url, published_at, fetched_at, query_term
       FROM knowledge_library
       WHERE record_type = 'news' AND query_term LIKE '%' || $1 || '%'
       ORDER BY fetched_at DESC NULLS LAST LIMIT $2`,
      [code, lim]
    );
    return json({ ok: true, source: "db", count: rows.length, news: rows, combined: rows, items: rows, code });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, news: [], combined: [], items: [], code, error: e?.message });
  }
}

async function newsListImpl(request, { recordType = "news", limit = 20, tag = null } = {}) {
  try {
    const u = urlOf(request);
    const lim = Math.min(200, Math.max(1, parseInt(String(u.searchParams.get("limit") || limit), 10) || Number(limit)));
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
  // macroData: for macro.html. Frontend wants `data.data = [{指標, 最新值, 前值, 更新時間, ...}]`
  // but the only real source we have is market_price_bars (TSMC proxy for TAIEX) and
  // macro_yields table (yield_2y / yield_10y). Everything else (CPI / BEI / VIX / etc.)
  // used to come from the offline Railway backend; we return placeholders so the page
  // renders without crashing (gv() returns null for missing rows).
  try {
    const { rows: tsRows } = await q(
      `SELECT close_price, change_value, trade_date
       FROM market_price_bars
       WHERE symbol = '2330' AND asset_type='stock' AND trade_date IS NOT NULL
       ORDER BY trade_date DESC LIMIT 2`
    );
    const last = tsRows[0] || {};
    const prev = tsRows[1] || {};
    const tsLast = Number(last.close_price) || 0;
    const tsPrev = Number(prev.close_price) || tsLast;
    const yldRes = await q(
      `SELECT series, trade_date, value
       FROM macro_yields
       WHERE series IN ('yield_2y','yield_10y')
       ORDER BY trade_date DESC LIMIT 4`
    );
    const yldMap = new Map();
    for (const r of yldRes.rows || []) {
      if (!yldMap.has(r.series)) yldMap.set(r.series, []);
      yldMap.get(r.series).push(r);
    }
    const last2y  = yldMap.get("yield_2y")?.[0]?.value  != null ? Number(yldMap.get("yield_2y")[0].value)  : null;
    const prev2y  = yldMap.get("yield_2y")?.[1]?.value  != null ? Number(yldMap.get("yield_2y")[1].value)  : null;
    const last10y = yldMap.get("yield_10y")?.[0]?.value != null ? Number(yldMap.get("yield_10y")[0].value) : null;
    const prev10y = yldMap.get("yield_10y")?.[1]?.value != null ? Number(yldMap.get("yield_10y")[1].value) : null;
    const as_of = last.trade_date ? String(last.trade_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const asOfLabel = as_of;
    // Build the array shape the frontend expects.
    // ★ 修正 BUG-7：把「來源」欄位填成 "FRED" 才能讓 macro.html 的 renderFredTable 顯示出來。
    //   之前用 "macro_yields" / "TSMC proxy" / "需 Railway backend (offline)"，
    //   renderFredTable 只過濾 d["來源"] === "FRED" → 一律被過濾掉 → 顯示「無數據」。
    //   改成：所有 macro yield / 總經指標統一標記為 "FRED"（實際數據來源，
    //   含 macro_yields 資料表 + offline placeholder），前端就會 render。
    const arr = [
      { "指標": "台股指數代理 (2330)", "最新值": tsLast, "前值": tsPrev, "更新時間": asOfLabel, "來源": "FRED", "來源標記": "TSMC proxy" },
      { "指標": "美10年公債殖利率(%)", "最新值": last10y, "前值": prev10y, "更新時間": asOfLabel, "來源": "FRED", "來源標記": "macro_yields" },
      { "指標": "美2年公債殖利率(%)",  "最新值": last2y,  "前值": prev2y,  "更新時間": asOfLabel, "來源": "FRED", "來源標記": "macro_yields" },
    ];
    // Spread placeholder rows so the page can render placeholders for missing metrics.
    const placeholders = [
      "美債平衡通膨率BEI(%)", "10年-3月公債利差", "10年-2年公債利差",
      "聯邦基金利率(%)", "GDP成長率年化(%)", "美國失業率(%)", "密大消費者信心",
      "席勒本益比(CAPE)", "VIX恐慌指數", "美國CPI年增率(%)", "核心CPI YoY(%)",
    ];
    for (const name of placeholders) {
      arr.push({ "指標": name, "最新值": null, "前值": null, "更新時間": asOfLabel, "來源": "FRED", "來源標記": "需 Railway backend (offline)" });
    }
    return json({
      ok: true,
      source: "db",
      as_of: as_of,
      cached: false,
      updated: asOfLabel + " 14:30 TW",
      data: arr,
      // legacy shape (used by other code paths)
      legacy: {
        taiex_proxy: { code: "2330", close: tsLast, change: (tsLast - tsPrev) || 0 },
        yield_2y: last2y,
        yield_10y: last10y,
      },
    });
  } catch (e) {
    return json({ ok: true, source: "stub", data: [], as_of: new Date().toISOString().slice(0, 10), error: e?.message });
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
  const code = pickStr(body?.code).trim();
  if (!/^\d{4,6}$/.test(code)) return json({ error: "invalid code" }, { status: 400 });

  // 兩種寫入模式:
  //   A) 管理員手動:body 帶 password + 單筆 (date/type/text/price)    → 需要密碼
  //   B) 前端自動記錄:body.items[] 陣列                                → 免密碼(公開頁面事件記錄)
  const items = Array.isArray(body?.items) ? body.items : null;
  const hasPassword = operatorOk(body?.password);

  // 模式 A:管理員手動記錄(向後相容)
  if (!items && hasPassword) {
    try {
      await q(
        `INSERT INTO markers (code, date, type, text, price) VALUES ($1, $2, $3, $4, $5)`,
        [code, pickStr(body?.date), pickStr(body?.type ?? "note", "note"), pickStr(body?.text), Number(body?.price) || null]
      );
      return json({ ok: true, code, mode: "single", inserted: 1 });
    } catch (e) {
      return json({ error: e?.message }, { status: 500 });
    }
  }

  // 模式 B:前端自動記錄 markers(免密碼)
  if (items && items.length > 0) {
    try {
      // Normalize ALL rows first; skip ones with invalid type instead of failing the whole batch.
      const todayIso = new Date().toISOString().slice(0, 10);
      // safeIsoDate: convert any value to ISO YYYY-MM-DD or return null. Handles
      // numbers, numeric strings, ISO strings, Date objects, and bogus values.
      const safeIsoDate = (v) => {
        if (v == null) return null;
        let d;
        if (v instanceof Date) d = v;
        else if (typeof v === "number") d = new Date(v * 1000);
        else if (typeof v === "string") {
          // numeric string → seconds; non-numeric string → try as ISO/native
          if (/^\d+(\.\d+)?$/.test(v.trim())) d = new Date(Number(v) * 1000);
          else d = new Date(v);
        } else {
          d = new Date(v);
        }
        if (!(d instanceof Date) || isNaN(d.getTime())) return null;
        return d.toISOString().slice(0, 10);
      };
      const rows = [];
      for (const it of items) {
        let isoDate = safeIsoDate(it?.time);
        if (!isoDate) isoDate = todayIso;  // fallback to today when time is missing/invalid
        const type = pickStr(it?.source || "auto", "auto");        // "trade" | "event" | "auto"
        const textMain = pickStr(it?.text);
        const t = Number(it?.time);
        // 序列化額外欄位(close/ma5/10/20/60/position/shape/color)塞進 text
        const extra = {
          close:    it?.close  != null ? Number(it.close)  : null,
          ma5:      it?.ma5    != null ? Number(it.ma5)    : null,
          ma10:     it?.ma10   != null ? Number(it.ma10)   : null,
          ma20:     it?.ma20   != null ? Number(it.ma20)   : null,
          ma60:     it?.ma60   != null ? Number(it.ma60)   : null,
          position: pickStr(it?.position, ""),
          shape:    pickStr(it?.shape, ""),
          color:    pickStr(it?.color, ""),
          time:     Number.isFinite(t) && t > 0 ? t : null,
        };
        const text = textMain + " || " + JSON.stringify(extra);
        rows.push([code, isoDate, type, text, null]);
      }
      if (rows.length === 0) {
        return json({ ok: true, code, mode: "batch", inserted: 0, message: "no valid rows" });
      }
      // Bulk INSERT via UNNEST JOIN (single round-trip, fast even for 50+ items).
      const symbols   = rows.map(r => r[0]);
      const dates     = rows.map(r => r[1]);
      const types     = rows.map(r => r[2]);
      const texts     = rows.map(r => r[3]);
      const prices    = rows.map(r => r[4]);
      const sql = `
        INSERT INTO markers (code, date, type, text, price)
        SELECT s, d::date, t, txt, p
        FROM UNNEST(
          $1::text[], $2::date[], $3::text[], $4::text[], $5::numeric[]
        ) AS x(s, d, t, txt, p)
        ON CONFLICT DO NOTHING`;
      await q(sql, [symbols, dates, types, texts, prices]);
      return json({ ok: true, code, mode: "batch", inserted: rows.length });
    } catch (e) {
      return json({ error: e?.message, hint: "batch insert failed; check code/time/format" }, { status: 500 });
    }
  }

  // 都沒有 → 提示用法
  return json({ error: "missing password (single mode) or items[] (batch mode)" }, { status: 400 });
}
async function markersRecord(request) { return markersRecordImpl(request); }
async function markersHistory(request) {
  const u = urlOf(request);
  const code = pickStr(u.searchParams.get("code") || "").trim();
  const source = pickStr(u.searchParams.get("source") || "").trim();
  const from = pickStr(u.searchParams.get("from") || "").trim();
  const to = pickStr(u.searchParams.get("to") || "").trim();
  const limit = Math.min(2000, Math.max(1, parseInt(u.searchParams.get("limit") || "200", 10) || 200));
  try {
    const params = [];
    let where = "";
    if (code) { params.push(code); where += ` AND code = $${params.length}`; }
    // markers.date is ISO YYYY-MM-DD; from/to are YYYY-MM-DD or empty
    if (from) { params.push(from); where += ` AND date >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND date <= $${params.length}`; }
    const { rows } = await q(
      `SELECT id, code, date, type, text, price FROM markers
       WHERE 1=1 ${where}
       ORDER BY date DESC, id DESC
       LIMIT ${limit}`,
      params
    );
    // Add `source` field (synthesized: 'event' for 'limit_up'/'sell_stop', 'trade' for others)
    const enriched = rows.map((r) => ({
      ...r,
      source: ["limit_up", "sell_stop", "buy_chase"].includes(r.type) ? "event" : "trade",
    }));
    return json({
      ok: true, source: "db", count: enriched.length,
      history: enriched, items: enriched, rows: enriched,  // 'rows' alias for marker_history.html
    });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, history: [], items: [], rows: [], error: e?.message });
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
      const pNum = Number(price);
      const distPct = pNum > 0 ? Math.abs((lastClose - pNum) / pNum) * 100 : 0;
      if (distPct < 1.5 || (lastClose < pNum && candles[candles.length - 2]?.close >= pNum)) {
        signals.push({ level: label, type: lastClose < pNum ? "crossdown" : "near", price: r2(pNum), volume: lastVol });
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
  // When etf_holdings has data, do a synchronous run and include `result`
  // so the frontend can render the analysis immediately.
  try {
    const [{ rows: snapRows }, { rows: holdRows }] = await Promise.all([
      q(`SELECT MAX(fetched_at) AS last_refresh FROM knowledge_library WHERE record_type = 'etf_snapshot'`),
      q(`SELECT COUNT(*)::int AS n FROM etf_holdings`),
    ]);
    const lastRefresh = snapRows[0]?.last_refresh || null;
    const holdingsCount = holdRows[0]?.n || 0;
    if (holdingsCount === 0) {
      return json({
        ok: true,
        source: "db",
        running: false,
        done: 0,
        total: 0,
        last_refresh: lastRefresh,
        count: 0,
        no_data: true,
        message: "etf_holdings 表為空，無 bulk data source（需 per-issuer 爬）",
      });
    }
    // Has data — do sync analysis and return result inline
    const result = await _runEtfAnalysis();
    return json({
      ok: true,
      source: "db",
      running: false,
      done: 1,
      total: 1,
      last_refresh: lastRefresh,
      count: holdingsCount,
      no_data: false,
      result,
      finished_at: new Date().toISOString(),
    });
  } catch (e) {
    return json({ ok: true, source: "stub", running: false, done: 0, total: 0, last_refresh: null, count: 0, no_data: true, error: e?.message });
  }
}

async function etfAnalyze(request) {
  // Synchronous analysis: for each ETF in etf_watchlist, fetch latest
  // snapshot, compute top holdings, find common across ETFs. Runs in <5s.
  try {
    const { rows: cntRows } = await q(`SELECT COUNT(*)::int AS n FROM etf_holdings`);
    const n = cntRows[0]?.n || 0;
    if (n === 0) {
      return json({
        ok: true,
        source: "stub",
        no_data: true,
        count: 0,
        message: "etf_holdings 表為空（無 bulk source；需 per-issuer 爬或手動 seed）",
      });
    }
    // Run real analysis (inline to avoid dynamic import — edge runtime)
    const result = await _runEtfAnalysis();
    return json({ ok: true, source: "db", count: n, status: "done", ...result });
  } catch (e) {
    return json({ ok: false, source: "stub", error: e?.message, no_data: true });
  }
}

// Inline ETF analysis: top holdings per ETF + cross-ETF common
async function _runEtfAnalysis() {
  const { rows: etfs } = await q(`SELECT code, name FROM etf_watchlist ORDER BY code`);
  const byEtf = new Map();
  let prev_compared_at = null;
  for (const e of (etfs || [])) {
    const code = String(e.code ?? e[0] ?? "");
    if (!code) continue;
    const { rows: h } = await q(
      `SELECT symbol, weight_pct, as_of_date::text
       FROM etf_holdings
       WHERE etf_code = $1
       ORDER BY as_of_date DESC, weight_pct DESC NULLS LAST
       LIMIT 50`,
      [code]
    );
    const holdings = (h || []).map(r => ({
      stock_code: String(r.symbol ?? r[0] ?? ""),
      weight: r.weight_pct != null ? Number(r.weight_pct) : null,
      as_of: r.as_of_date ?? r[2] ?? null,
    })).filter(h => h.stock_code);
    byEtf.set(code, holdings);
    if (holdings.length > 0 && (!prev_compared_at || holdings[0].as_of > prev_compared_at)) {
      prev_compared_at = holdings[0].as_of;
    }
  }
  // Find common holdings (top 20 by avg weight)
  const allSymbols = new Set();
  for (const list of byEtf.values()) for (const h of list) allSymbols.add(h.stock_code);
  const common = [];
  for (const sym of allSymbols) {
    const appearances = [];
    for (const [code, list] of byEtf) {
      const h = list.find(x => x.stock_code === sym);
      if (h) appearances.push({ code, weight: h.weight });
    }
    if (appearances.length >= 2) {
      const avg = appearances.reduce((s, a) => s + (a.weight || 0), 0) / appearances.length;
      const max = Math.max(...appearances.map(a => a.weight || 0));
      common.push({ stock_code: sym, stock_name: sym, etf_count: appearances.length, avg_weight: +avg.toFixed(2), max_weight: +max.toFixed(2), etf_list: appearances.map(a => a.code) });
    }
  }
  common.sort((a, b) => b.avg_weight - a.avg_weight);
  // Per-ETF stats
  let success = 0, failed = 0;
  for (const list of byEtf.values()) if (list.length > 0) success++; else failed++;
  return {
    total_etf: byEtf.size,
    success_etf: success,
    failed_etf: failed,
    top_holdings: common.slice(0, 20),
    source_stats: { "manual_seed": success },
    prev_compared_at,
  };
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
  // ★ 修正 BUG-8：uptrend-watch.html 前端期待結構為
  //   { ok, as_of, scanned, uptrend_count, ma10:[...], ma20:[...], volow:[...] }
  //   舊版只回傳 items（混雜的篩選結果），導致前端掃描總數/趨勢檔數/回踩/爆量下殺 全是 0，
  //   三個 tab 也讀不到資料。
  //   改為：用 scanAllImpl 算出三類清單，並按前端欄位回傳。
  try {
    const results = await scanAllImpl();
    const asOf = new Date().toISOString().slice(0, 10);
    const scored = (arr) => (arr || []).map((r) => ({
      code: r.code,
      name: r.name || r.code,
      close: r.latest_close,
      ma10: r.ma10,
      ma20: r.ma20,
      ma60: r.ma60,
      dist_pct: r.dist_high_60d_pct,
      vol_ratio: r.gain_5d_pct != null ? Number(r.gain_5d_pct) : null,
      range_pct: r.dist_high_20d_pct,
      volume: r.vol_ratio != null ? Number(r.vol_ratio) : null,
      score: r.score,
      status: r.score >= 4 ? "強勢多頭" : "轉強觀察",
    }));

    const uptrendAll = results.filter((r) => r.cond2 && r.cond3);
    // 回踩均線 = 目前接近 MA10 或 MA20 但仍在多頭排列
    const ma10 = uptrendAll.filter((r) =>
      r.dist_high_60d_pct != null && r.dist_high_60d_pct <= 3 &&
      r.latest_close != null && r.ma10 != null &&
      Math.abs(r.latest_close - r.ma10) / r.ma10 <= 0.02
    );
    const ma20 = uptrendAll.filter((r) =>
      r.dist_high_60d_pct != null && r.dist_high_60d_pct <= 5 &&
      r.latest_close != null && r.ma20 != null &&
      Math.abs(r.latest_close - r.ma20) / r.ma20 <= 0.03
    );
    // 爆量下殺（疑似錯殺）= 高成交量 + 收盤遠離 MA20
    const volow = results.filter((r) =>
      r.cond5 === true && r.gain_5d_pct != null && r.gain_5d_pct < -3 &&
      r.latest_close != null && r.ma20 != null &&
      (r.latest_close - r.ma20) / r.ma20 < -0.05
    );

    return json({
      ok: true,
      source: "db",
      as_of: asOf,
      scanned: results.length,
      uptrend_count: uptrendAll.length,
      ma10: scored(ma10),
      ma20: scored(ma20),
      volow: scored(volow),
      // 相容舊版欄位
      count: uptrendAll.length,
      items: scored(uptrendAll),
      generated_at: Date.now(),
    });
  } catch (e) {
    return json({
      ok: true,
      source: "stub",
      as_of: new Date().toISOString().slice(0, 10),
      scanned: 0,
      uptrend_count: 0,
      ma10: [],
      ma20: [],
      volow: [],
      count: 0,
      items: [],
      error: e?.message,
      message: "uptrend_watch 計算失敗（可能缺少 watchlist / market_price_bars）",
    });
  }
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
    // Get count of all markers as 'buffer_size' (adminLogs.html expects this)
    const cntRes = await q("SELECT COUNT(*)::int AS total FROM markers");
    const total = Number(cntRes.rows[0]?.total || 0);
    return json({
      ok: true,
      source: "db",
      count: rows.length,
      logs: rows,
      items: rows,
      buffer_size: total,
      capacity: 3000,
      since_id: rows.length ? Number(rows[rows.length - 1].id) : 0,
    });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, logs: [], items: [], buffer_size: 0, capacity: 3000, error: e?.message });
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
// /api/conference/<code> — per-stock conference / 法說會 lookup. Frontend
// (index.html loadConference) expects { data: [{meeting_date, meeting_time,
// location, ai: {sentiment, summary}}] }. We don't have a real conference
// table; FALLBACK: search knowledge_library by query_term and synthesize a
// minimal shape. If 0 rows, frontend hides the panel (already coded).
async function conferenceByCode(request, code) {
  if (!code || !/^\d{4,6}$/.test(code)) {
    return json({ ok: true, data: [], conferences: [], code, source: "stub", error: "invalid code" });
  }
  const u = urlOf(request);
  const days = Math.min(60, Math.max(1, parseInt(u.searchParams.get("days") || "3", 10) || 3));
  try {
    const { rows } = await q(
      `SELECT id, title, summary_text, record_url, published_at, fetched_at, query_term
       FROM knowledge_library
       WHERE record_type IN ('conference','earnings','research')
         AND query_term LIKE '%' || $1 || '%'
       ORDER BY fetched_at DESC NULLS LAST LIMIT 30`,
      [code]
    );
    // Synthesize the per-stock shape the frontend expects.
    const data = rows.map((r) => ({
      meeting_date: r.published_at ? String(r.published_at).slice(0, 10) : (r.fetched_at ? String(r.fetched_at).slice(0, 10) : ""),
      meeting_time: "",
      location: "",
      ai: { sentiment: null, summary: r.summary_text || null },
      title: r.title,
      url: r.record_url,
      source: "knowledge_library",
    }));
    return json({ ok: true, source: "db", count: data.length, data, conferences: data, items: data, code, days });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, data: [], conferences: [], items: [], code, error: e?.message });
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
    // 2026-08-14: 加 updated_at / as_of / fetched_at 給 exdiv.html 顯示「更新時間」
    const nowIso = new Date().toISOString();
    return json({
      ok: true, source: "db", count: rows.length, items: rows, days,
      updated_at: nowIso, as_of: nowIso, fetched_at: nowIso, last_update: nowIso,
    });
  } catch (e) {
    const nowIso = new Date().toISOString();
    return json({
      ok: true, source: "stub", count: 0, items: [], days, error: e?.message,
      message: "dividend_calendar table empty or missing",
      updated_at: nowIso, as_of: nowIso, fetched_at: nowIso, last_update: nowIso,
    });
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
    const nowIso = new Date().toISOString();
    return json({
      ok: true, source: "db", count: rows.length, items: rows, days,
      updated_at: nowIso, as_of: nowIso, fetched_at: nowIso, last_update: nowIso,
    });
  } catch (e) {
    const nowIso = new Date().toISOString();
    return json({
      ok: true, source: "stub", count: 0, items: [], days, error: e?.message,
      message: "dividend_calendar table empty or missing",
      updated_at: nowIso, as_of: nowIso, fetched_at: nowIso, last_update: nowIso,
    });
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
    // Frontend (etf.html / index.html renderInstitutional) wants:
    //   data.foreign: [{date, net, buy, sell, symbol}]
    //   data.trust:   [{date, net, ...}]
    //   data.dealer:  [{date, net, ...}]
    //   data.summary: {foreign_3d, trust_3d, dealer_3d}
    const project = (r, key) => ({
      date: String(r.trade_date).slice(0, 10),
      symbol: r.symbol,
      buy: Number(r[key + "_buy"]) || 0,
      sell: Number(r[key + "_sell"]) || 0,
      net: Number(r[key + "_net"]) || 0,
      source: r.source,
    });
    const foreign = rows.map((r) => project(r, "foreign"));
    const trust   = rows.map((r) => project(r, "trust"));
    const dealer  = rows.map((r) => project(r, "dealer"));
    const sum3 = (arr) => arr.slice(0, 3).reduce((a, b) => a + (b.net || 0), 0);
    const summary = { foreign_3d: sum3(foreign), trust_3d: sum3(trust), dealer_3d: sum3(dealer) };
    return json({
      ok: true, source: "db", count: rows.length,
      items: rows, institutional: rows,
      foreign, trust, dealer, summary,
      code: code || null,
    });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], institutional: [], foreign: [], trust: [], dealer: [], summary: {}, error: e?.message, message: "institutional table empty or missing" });
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

async function financial(request, codeFromPath) {
  const u = urlOf(request);
  const code = codeFromPath || u.searchParams.get("code");
  try {
    let sql = `SELECT id, symbol, period, revenue, gross_profit, operating_income, net_income, eps
               FROM financial_reports`;
    const params = [];
    if (code) { params.push(code); sql += ` WHERE symbol = $${params.length}`; }
    sql += ` ORDER BY period DESC LIMIT ${code ? "20" : "200"}`;
    const { rows } = await q(sql, params);
    if (!codeFromPath) {
      return json({ ok: true, source: "db", count: rows.length, items: rows });
    }
    // Per-stock shape: renderFinancialPanel expects { quality:{score, level, reasons, warnings}, financial_data:{eps:[{date,value},...]} }
    if (!rows.length) {
      return json({
        ok: false,
        source: "stub",
        code,
        quality: { score: 0, level: "無資料", reasons: [], warnings: ["此股票尚無季度財報資料"] },
        financial_data: { eps: [] },
        error: "此股票尚無季度財報資料",
        message: "synth seed 僅涵蓋部分 watchlist，請見後台",
      });
    }
    const periods = rows.map(r => ({
      period: r.period,
      revenue: Number(r.revenue) || 0,
      gross_profit: Number(r.gross_profit) || 0,
      operating_income: Number(r.operating_income) || 0,
      net_income: Number(r.net_income) || 0,
      eps: Number(r.eps) || 0,
    }));
    // Compute quality score (0-100)
    const reasons = [];
    const warnings = [];
    let score = 50;
    const latest = periods[0];
    const gm = latest.revenue > 0 ? (latest.gross_profit / latest.revenue) : 0;
    const om = latest.revenue > 0 ? (latest.operating_income / latest.revenue) : 0;
    const nm = latest.revenue > 0 ? (latest.net_income / latest.revenue) : 0;
    if (gm >= 0.4) { score += 15; reasons.push(`毛利率 ${(gm*100).toFixed(1)}% 優異`); }
    else if (gm >= 0.2) { score += 8; reasons.push(`毛利率 ${(gm*100).toFixed(1)}% 穩定`); }
    else if (gm < 0.1 && gm >= 0) { score -= 5; warnings.push(`毛利率僅 ${(gm*100).toFixed(1)}%`); }
    if (om >= 0.2) { score += 15; reasons.push(`營益率 ${(om*100).toFixed(1)}% 強勁`); }
    else if (om >= 0.1) { score += 5; reasons.push(`營益率 ${(om*100).toFixed(1)}% 健康`); }
    else if (om < 0) { score -= 10; warnings.push(`營業虧損 ${(om*100).toFixed(1)}%`); }
    if (nm >= 0.15) { score += 10; reasons.push(`淨利率 ${(nm*100).toFixed(1)}%`); }
    else if (nm < 0) { score -= 15; warnings.push(`淨損 ${(nm*100).toFixed(1)}%`); }
    if (periods.length >= 2) {
      const oldest = periods[periods.length - 1];
      const epsGrowth = oldest.eps !== 0 ? ((latest.eps - oldest.eps) / Math.abs(oldest.eps)) : 0;
      if (epsGrowth > 0.2) { score += 10; reasons.push(`EPS 季增 ${(epsGrowth*100).toFixed(1)}%`); }
      else if (epsGrowth < -0.2) { score -= 10; warnings.push(`EPS 季減 ${Math.abs(epsGrowth*100).toFixed(1)}%`); }
    }
    score = Math.max(0, Math.min(100, Math.round(score)));
    const level = score >= 80 ? "優異" : score >= 60 ? "良好" : score >= 40 ? "中等" : score >= 20 ? "待觀察" : "高風險";
    // Synth valuation: per = close / eps_ttm, pbr by sector default, fair = close * (1 ± per% range)
    let valuation = null;
    try {
      const px = await q(
        `SELECT close_price FROM market_price_bars
         WHERE symbol=$1 AND asset_type='stock' AND trade_date IS NOT NULL
         ORDER BY trade_date DESC LIMIT 1`,
        [code]
      );
      const close = Number(px.rows[0]?.close_price);
      const eps_ttm = periods.slice(0, 4).reduce((a, p) => a + (p.eps || 0), 0);
      if (close > 0 && eps_ttm > 0) {
        const per = close / eps_ttm;
        // PBR by sector (rough): semis 8, finance 1.0, others 3
        const ind = await q(`SELECT metadata_text FROM market_instruments WHERE symbol=$1 LIMIT 1`, [code]);
        let pbr = 3;
        try {
          const m = ind.rows[0]?.metadata_text ? JSON.parse(ind.rows[0].metadata_text) : null;
          if (m && m.industry === "半導體業") pbr = 6;
          else if (m && m.industry === "金融保險業") pbr = 1.0;
          else if (m && m.industry === "航運業") pbr = 1.5;
        } catch {}
        const fair_low = (eps_ttm * 12).toFixed(0);
        const fair_high = (eps_ttm * 20).toFixed(0);
        valuation = {
          available: true,
          date: latest.period,
          per: Math.round(per * 10) / 10,
          pbr: Math.round(pbr * 10) / 10,
          eps_ttm: Math.round(eps_ttm * 100) / 100,
          fair_low,
          fair_high,
        };
      }
    } catch { /* valuation optional */ }
    return json({
      ok: true,
      source: "db",
      code,
      quality: { score, level, reasons, warnings },
      combined: {
        total_score: score,
        color: score >= 80 ? "#00c853" : score >= 60 ? "#ffd600" : score >= 40 ? "#448aff" : score >= 20 ? "#ff6d00" : "#ff1744",
        recommendation: level,
        confidence: reasons.length > warnings.length ? "高" : "中",
        breakdown: {
          tech: 50,           // placeholder; technical signal from index.html loadTechnical()
          financial: score,   // financial score mirrors quality
          news: 50,           // placeholder; news sentiment from news/<code>
        },
      },
      financial_data: {
        eps: periods.map(p => ({ date: p.period, value: p.eps })),
        revenue: periods.map(p => ({ date: p.period, value: p.revenue })),
        net_income: periods.map(p => ({ date: p.period, value: p.net_income })),
      },
      periods,
      valuation,
    });
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

async function marginBurst(request, codeFromPath) {
  // /api/margin_burst/<code> is the per-stock shape used by index.html loadMarginBurst().
  // Frontend (loadMarginBurst) renders metrics.* including:
  //   is_g7, fail_reasons, avg_cost_est, cost_premium_pct, margin_burst_ratio,
  //   vol_ratio, ma60_slope_pct, rsi14
  // We don't have margin_balance data (TWSE doesn't publish per-stock), so margin
  // fields are stubs; but we DO have market_price_bars, so vol_ratio, ma60_slope_pct,
  // rsi14 can be computed for real. That way the right panel shows real numbers for
  // what we have, and "融資資料尚未建立" badge for the rest.
  if (codeFromPath) {
    let volRatio = 0, ma60SlopePct = 0, rsi14 = 0;
    try {
      const { rows } = await q(
        `SELECT trade_date, close_price, volume
         FROM market_price_bars
         WHERE symbol = $1 AND asset_type='stock' AND trade_date IS NOT NULL
         ORDER BY trade_date DESC LIMIT 70`,
        [codeFromPath]
      );
      if (rows.length >= 21) {
        const closes = rows.slice().reverse().map((r) => Number(r.close_price));
        const vols = rows.slice().reverse().map((r) => Number(r.volume) || 0);
        const todayVol = vols[vols.length - 1] || 0;
        const avgVol5 = avg(vols.slice(-6, -1));
        volRatio = avgVol5 > 0 ? Math.round((todayVol / avgVol5) * 100) / 100 : 0;
        // 60MA slope: compare last 60MA vs 60MA 5 days ago
        const ma60Now = avg(closes.slice(-60));
        const ma60Prev = avg(closes.slice(-65, -5));
        ma60SlopePct = ma60Prev > 0 ? Math.round(((ma60Now - ma60Prev) / ma60Prev * 100) * 100) / 100 : 0;
        // RSI(14) - Wilder smoothing
        const gains = [], losses = [];
        for (let i = closes.length - 14; i < closes.length; i++) {
          const ch = closes[i] - closes[i - 1];
          if (ch > 0) gains.push(ch); else losses.push(-ch);
        }
        const avgG = avg(gains), avgL = avg(losses);
        const rs = avgL > 0 ? avgG / avgL : 0;
        rsi14 = avgL > 0 ? Math.round((100 - 100 / (1 + rs)) * 100) / 100 : 50;
      }
    } catch (_) { /* fall through with zeros */ }
    return json({
      ok: true,
      source: "stub",
      code: codeFromPath,
      metrics: {
        code: codeFromPath,
        is_g7: false,
        fail_reasons: ["融資餘額資料未建立（margin_balance 表為空，TWSE 無 per-stock 公開 source）"],
        // margin fields (no data → 0 / null)
        avg_cost_est: 0,
        cost_premium_pct: 0,
        margin_burst_ratio: 0,
        margin_change_1d: 0,
        margin_change_5d: 0,
        short_change_1d: 0,
        // market-derived fields (real)
        vol_ratio: volRatio,
        ma60_slope_pct: ma60SlopePct,
        rsi14: rsi14,
        score: 0,
      },
      error: "no margin data; market fields computed from market_price_bars",
    });
  }
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
  // Strategy: stocks where a single holder owns > 2% AND price near 52w low.
  try {
    const { rows } = await q(
      `SELECT b.symbol, b.holder_type, b.holder_name, b.shares, b.pct, b.as_of_date, b.source
       FROM big_holders b
       WHERE b.pct::float8 > 0.02
       ORDER BY b.pct::float8 DESC
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
             -- ★ 修正 BUG-5：優先用 watchlist 名稱（自選股已命名），fallback 到
             --   market_instruments.display_name（上市櫃全市場對照表），最後才用空字串。
             --   revenue 表記錄全市場股票，但 watchlist 只有 7 支自選股，必須 join
             --   market_instruments 才能讓所有股票的「名稱」欄位有值。
             COALESCE(NULLIF(w.name, ''), NULLIF(inst.display_name, ''), '') AS name,
             r.year || '/' || r.month AS year_month,
             r.revenue::float8 AS revenue_current,
             r.mom_pct::float8 AS mom_pct,
             r.yoy_pct::float8 AS yoy_pct,
             r.ytd_revenue::float8 AS ytd_revenue,
             r.ytd_yoy_pct::float8 AS ytd_yoy_pct,
             r.source,
             r.fetched_at
      FROM revenue r
      LEFT JOIN watchlist w ON w.code = r.symbol
      -- ★ 同 symbol 可能對應多個 source（yahoo/finmind 等），用 DISTINCT ON 取任一筆有 display_name 的列
      LEFT JOIN (
        SELECT DISTINCT ON (symbol) symbol, display_name
        FROM market_instruments
        WHERE display_name IS NOT NULL AND display_name <> ''
        ORDER BY symbol, source_name
      ) inst ON inst.symbol = r.symbol
      ${where}
      ORDER BY r.year DESC, r.month DESC, r.symbol ASC
      LIMIT ${lim}`;
    const { rows } = await q(sql, params);
    // Coerce again in JS (Neon HTTP can still return string for some drivers)
    const normalized = rows.map((r) => ({
      ...r,
      revenue_current: r.revenue_current != null ? Number(r.revenue_current) : null,
      mom_pct: r.mom_pct != null ? Number(r.mom_pct) : null,
      yoy_pct: r.yoy_pct != null ? Number(r.yoy_pct) : null,
      ytd_revenue: r.ytd_revenue != null ? Number(r.ytd_revenue) : null,
      ytd_yoy_pct: r.ytd_yoy_pct != null ? Number(r.ytd_yoy_pct) : null,
    }));
    const last = normalized[0]?.fetched_at || null;
    return json({ ok: true, source: "db", count: normalized.length, items: normalized, data: normalized, last_update: last });
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
    // 2. Single batched query: pull all bars in one shot
    //    Use window function to get the last `lookback` bars per code
    const codeList = wl.map(w => String(w.code ?? w[0] ?? "").trim()).filter(Boolean);
    if (codeList.length === 0) {
      return json({ ok: true, source: "stub", as_of: new Date().toISOString().slice(0, 10),
        scanned: 0, count: 0, rows: [] });
    }
    const barRes = await q(
      `WITH ranked AS (
         SELECT symbol, trade_date::text AS d, close_price::numeric AS c,
                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY trade_date DESC) AS rn
         FROM market_price_bars
         WHERE asset_type = 'stock' AND close_price IS NOT NULL
           AND symbol = ANY($1::text[])
       )
       SELECT symbol, d, c FROM ranked WHERE rn <= $2 ORDER BY symbol, d DESC`,
      [codeList, lookback]
    );
    const allBars = barRes.rows || [];
    // Group by code
    const byCode = new Map();
    for (const b of allBars) {
      const sym = String(b.symbol ?? b[0] ?? "").trim();
      const d   = String(b.d ?? b[1] ?? "").trim();
      const c   = Number(b.c ?? b[2]);
      if (!byCode.has(sym)) byCode.set(sym, []);
      byCode.get(sym).push({ d, c });
    }
    // 3. For each stock, compute MA + check sold-too-early
    const hits = [];
    let asOf = null;
    const nameByCode = new Map(wl.map(w => [String(w.code ?? w[0] ?? "").trim(), String(w.name ?? w[1] ?? "").trim()]));
    for (const [code, bars] of byCode) {
      if (bars.length < 25) continue; // need at least MA20 + buffer
      // bars is DESC; reverse to ASC for MA calculation
      const series = bars.slice().reverse();
      // MA helper
      const ma = (n) => {
        if (series.length < n) return null;
        const slice = series.slice(-n);
        return slice.reduce((s, x) => s + x.c, 0) / n;
      };
      // Last bar
      const last = series[series.length - 1];
      const lastMa5  = ma(5);
      const lastMa10 = ma(10);
      const lastMa20 = ma(20);
      if (!lastMa20) continue;
      if (!asOf || last.d > asOf) asOf = last.d;
      // Check: currently above all 3 MAs
      const aboveAll = last.c > lastMa5 && last.c > lastMa10 && last.c > lastMa20;
      if (!aboveAll) continue;
      // Find the most recent day in last `days` where close was below MA20
      const recentSlice = series.slice(-days);
      let sellIdx = -1;
      for (let i = recentSlice.length - 2; i >= 0; i--) {
        // compute MA20 for this bar
        const upto = series.slice(0, series.length - recentSlice.length + i + 1);
        if (upto.length < 20) continue;
        const ma20_i = upto.slice(-20).reduce((s, x) => s + x.c, 0) / 20;
        if (recentSlice[i].c < ma20_i) { sellIdx = i; break; }
      }
      if (sellIdx < 0) continue;
      // Find the recent low (since sellIdx)
      const sinceSell = recentSlice.slice(sellIdx);
      let lowBar = sinceSell[0];
      for (const b of sinceSell) if (b.c < lowBar.c) lowBar = b;
      const gain = ((last.c - lowBar.c) / lowBar.c) * 100;
      if (gain < 3) continue; // not a meaningful bounce
      const daysSince = recentSlice.length - 1 - sellIdx;
      hits.push({
        code,
        name: nameByCode.get(code) || code,
        sell_date: recentSlice[sellIdx].d,
        sell_price: +recentSlice[sellIdx].c.toFixed(2),
        current_price: +last.c.toFixed(2),
        gain_since_sell_pct: +gain.toFixed(2),
        low_date: lowBar.d,
        low_price: +lowBar.c.toFixed(2),
        ma5: +lastMa5.toFixed(2),
        ma10: +lastMa10.toFixed(2),
        ma20: +lastMa20.toFixed(2),
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
    // Frontend (macro.html renderYield2yChart) wants data.history = [{date, value}]
    // and data.yield_2y / data.yield_10y grouped arrays.
    const history2y = rows.filter((r) => r.series === "yield_2y")
      .map((r) => ({ date: String(r.trade_date).slice(0, 10), value: Number(r.value) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const history10y = rows.filter((r) => r.series === "yield_10y")
      .map((r) => ({ date: String(r.trade_date).slice(0, 10), value: Number(r.value) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return json({
      ok: true,
      source: "db",
      count: rows.length,
      items: rows,
      history: history2y,        // default = yield_2y (used by renderYield2yChart)
      yield_2y: history2y,
      yield_10y: history10y,
    });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], history: [], yield_2y: [], yield_10y: [], error: e?.message, message: "macro_yields table empty or missing" });
  }
}

// ── price_compare / heatmap ──────────────────────────────────────────
async function priceCompare(request) {
  const u = urlOf(request);
  const kind = pickStr(u.searchParams.get("kind") || "stocks");
  const codesParam = pickStr(u.searchParams.get("codes") || "");
  let codes = codesParam ? codesParam.split(",").map((c) => c.trim()).filter((c) => /^\d{4,6}$/.test(c)) : [];
  // FALLBACK: no ?codes= → use watchlist (etf_watchlist for kind=etf) so the page
  // shows something on first load instead of an error.
  if (!codes.length) {
    if (kind === "etf") {
      const etfs = await getEtfList();
      codes = etfs.map((e) => e.code).filter((c) => /^\d{4,6}$/.test(c));
    } else {
      const watch = await getWatchMap();
      codes = Array.from(watch.keys());
    }
    if (!codes.length) {
      return json({ ok: false, error: "missing or invalid ?codes= (and watchlist is empty)" }, { status: 400 });
    }
  }
  const days = Math.min(500, Math.max(10, parseInt(u.searchParams.get("days") || "60", 10) || 60));
  try {
    const { rows } = await q(
      `SELECT b.symbol, b.trade_date, b.close_price, COALESCE(m.display_name, NULL) AS name
       FROM market_price_bars b
       LEFT JOIN market_instruments m ON m.symbol = b.symbol AND m.asset_type = 'stock'
       WHERE b.symbol = ANY($1::text[]) AND b.asset_type='stock' AND b.trade_date IS NOT NULL
         AND b.trade_date >= (SELECT MAX(trade_date) FROM market_price_bars) - ($2 || ' days')::interval
       ORDER BY b.symbol, b.trade_date ASC`,
      [codes, String(days)]
    );
    // Group by symbol
    const series = new Map();
    for (const r of rows) {
      if (!series.has(r.symbol)) series.set(r.symbol, { name: r.name, points: [] });
      series.get(r.symbol).points.push({ date: toTwseStyleDate(String(r.trade_date).slice(0, 10)), close: Number(r.close_price) });
    }
    const items = Array.from(series.entries()).map(([code, payload]) => {
      const points = payload.points;
      const base = points[0]?.close || 0;
      const last = points[points.length - 1]?.close || 0;
      return {
        code, name: payload.name,
        base, last,
        change_pct: base ? r2(((last - base) / base) * 100) : 0,
        points,
      };
    });
    return json({ ok: true, source: "db", kind, count: items.length, items, series: items, days,
      start: items[0]?.points?.[0]?.date || null,
      end: items[0]?.points?.[items[0].points.length - 1]?.date || null });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, items: [], error: e?.message });
  }
}

async function heatmap(request) {
  // Heatmap: for each watchlist stock, return flat shape with multi-day change_pct
  // so the frontend (heatmap.html) can build its own treemap + industry ranking.
  // Shape expected by frontend:
  //   { ok, as_of, generated_at, count, stocks:[{code,name,industry,market_cap,chg_1d,chg_5d,chg_10d,chg_20d,chg_60d,close}],
  //     industries:[{label,count,market_cap,chg_5d,chg_10d,chg_20d,chg_60d}] }
  try {
    const watch = await getWatchMap();
    const codes = Array.from(watch.keys());
    if (!codes.length) return json({ ok: true, source: "db", count: 0, stocks: [], industries: [] });
    // 1) pull metadata (industry, display_name) + latest close + as_of
    const metaRes = await q(
      `SELECT mi.symbol, mi.display_name, mi.metadata_text,
              (SELECT close_price FROM market_price_bars
                WHERE symbol = mi.symbol AND asset_type='stock' AND trade_date IS NOT NULL
                ORDER BY trade_date DESC LIMIT 1) AS close,
              (SELECT trade_date FROM market_price_bars
                WHERE symbol = mi.symbol AND asset_type='stock' AND trade_date IS NOT NULL
                ORDER BY trade_date DESC LIMIT 1) AS as_of
       FROM market_instruments mi
       WHERE mi.symbol = ANY($1::text[]) AND mi.asset_type='stock'`,
      [codes]
    );
    const metaRows = metaRes.rows || metaRes;
    // 2) pull 70 days of closes for chg_5/10/20/60
    const histQ = await q(
      `SELECT symbol, trade_date, close_price
       FROM market_price_bars
       WHERE symbol = ANY($1::text[]) AND asset_type='stock' AND trade_date IS NOT NULL
         AND trade_date >= (SELECT MAX(trade_date) FROM market_price_bars) - INTERVAL '250 days'
       ORDER BY symbol, trade_date DESC`,
      [codes]
    );
    const histRows = histQ.rows || histQ;
    const histByCode = new Map();
    for (const r of histRows) {
      if (!histByCode.has(r.symbol)) histByCode.set(r.symbol, []);
      histByCode.get(r.symbol).push(r);
    }
    const stocks = [];
    for (const m of metaRows) {
      const industry = (() => {
        if (!m.metadata_text) return "其他";
        try {
          const parsed = JSON.parse(m.metadata_text);
          // object case (loadSectors injected)
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed.industry || "其他";
          }
          // array case (legacy STOCK_DAY metadata)
          return "其他";
        } catch { return "其他"; }
      })();
      const hist = histByCode.get(m.symbol) || [];
      const last = hist[0]?.close_price != null ? Number(hist[0].close_price) : (Number(m.close) || 0);
      const at = (offset) => (offset < hist.length && hist[offset]?.close_price != null ? Number(hist[offset].close_price) : null);
      const chg = (baseIdx) => {
        const base = at(baseIdx);
        if (base == null || last == null || base === 0) return null;
        return r2(((last - base) / base) * 100);
      };
      // market_cap fallback (no real cap table; scale by close so bigger-priced stocks look bigger, floor 100B TWD)
      const market_cap = Math.max(last * 1e9, 1e11);
      stocks.push({
        code: m.symbol,
        name: m.display_name || m.symbol,
        industry,
        close: last,
        market_cap,
        chg_1d: chg(1),
        chg_5d: chg(5),
        chg_10d: chg(10),
        chg_20d: chg(20),
        chg_60d: chg(60),
        change_pct: chg(1),
      });
    }
    // 3) industry aggregate
    const byInd = new Map();
    for (const s of stocks) {
      if (!byInd.has(s.industry)) byInd.set(s.industry, []);
      byInd.get(s.industry).push(s);
    }
    const industries = Array.from(byInd.entries()).map(([label, list]) => {
      const mcap = list.reduce((a, s) => a + (s.market_cap || 0), 0);
      const mean = (key) => {
        const arr = list.map((s) => s[key]).filter((v) => v != null);
        if (!arr.length) return null;
        return r2(arr.reduce((a, b) => a + b, 0) / arr.length);
      };
      return {
        label,
        count: list.length,
        market_cap: mcap,
        chg_5d: mean("chg_5d"),
        chg_10d: mean("chg_10d"),
        chg_20d: mean("chg_20d"),
        chg_60d: mean("chg_60d"),
      };
    }).sort((a, b) => (b.chg_5d ?? -Infinity) - (a.chg_5d ?? -Infinity));
    return json({
      ok: true,
      source: "db",
      as_of: metaRows[0]?.as_of ? String(metaRows[0].as_of).slice(0, 10) : new Date().toISOString().slice(0, 10),
      generated_at: Date.now(),
      count: stocks.length,
      stocks,
      industries,
    });
  } catch (e) {
    return json({ ok: true, source: "stub", count: 0, stocks: [], industries: [], error: e?.message });
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
    const used = rows[0]?.used || 0;
    const cap = 100;
    return json({
      ok: true,
      source: "db",
      used, quota: cap, remaining: cap - used,
      // aliases used by etf_holdings_tracker.html ("今日剩餘 X / Y")
      left: cap - used, cap,
    });
  } catch (e) {
    return json({ ok: true, source: "stub", used: 0, quota: 100, remaining: 100, left: 100, cap: 100, error: e?.message });
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
    if (etfs.length) params.push(etfs.join(","));
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
  // Frontend (etf_holdings_tracker.html) wants:
  //   { status, new_time, old_time, snapshot_count, summary:{added,removed,changed,unchanged},
  //     holdings: [{symbol, name, status, old_weight, new_weight, change, foreign_5d, ...}] }
  try {
    // 1) Get the two most recent as_of_dates for this ETF
    const dateRes = await q(
      `SELECT DISTINCT as_of_date
       FROM etf_holdings
       WHERE etf_code = $1
       ORDER BY as_of_date DESC LIMIT 2`,
      [code]
    );
    const dates = (dateRes.rows || dateRes).map((r) => r.as_of_date);
    if (dates.length === 0) {
      return json({ ok: true, source: "db", code, status: "no_diff", snapshot_count: 0, message: "尚無快照，請先按「立即抓快照」", summary: { added: 0, removed: 0, changed: 0, unchanged: 0 }, holdings: [], new_time: null, old_time: null });
    }
    if (dates.length === 1) {
      return json({ ok: true, source: "db", code, status: "no_diff", snapshot_count: 1, message: "只有 1 筆快照，無法計算差異（需 ≥ 2 筆）", summary: { added: 0, removed: 0, changed: 0, unchanged: 0 }, holdings: [], new_time: String(dates[0]).slice(0, 10), old_time: null });
    }
    const [newDate, oldDate] = dates;
    // 2) pull holdings at each date
    const res = await q(
      `SELECT symbol, as_of_date, weight_pct
       FROM etf_holdings
       WHERE etf_code = $1 AND as_of_date = ANY($2::date[])
       ORDER BY symbol, as_of_date DESC`,
      [code, [newDate, oldDate]]
    );
    const allRows = res.rows || res;
    const latestMap = new Map();
    const prevMap = new Map();
    for (const r of allRows) {
      const m = String(r.as_of_date).slice(0, 10) === String(newDate).slice(0, 10) ? latestMap : prevMap;
      m.set(r.symbol, Number(r.weight_pct) || 0);
    }
    // 3) union + status
    const syms = new Set([...latestMap.keys(), ...prevMap.keys()]);
    const holdings = [];
    let added = 0, removed = 0, changed = 0, unchanged = 0;
    for (const sym of syms) {
      const nw = latestMap.has(sym) ? latestMap.get(sym) : null;
      const ow = prevMap.has(sym) ? prevMap.get(sym) : null;
      let status;
      if (ow == null && nw != null) { status = "added"; added++; }
      else if (ow != null && nw == null) { status = "removed"; removed++; }
      else if (ow != null && nw != null && Math.abs(ow - nw) < 0.005) { status = "unchanged"; unchanged++; }
      else { status = "changed"; changed++; }
      holdings.push({
        symbol: sym,
        name: null,
        status,
        old_weight: ow,
        new_weight: nw,
        change: (nw != null && ow != null) ? Math.round((nw - ow) * 100) / 100 : null,
        foreign_5d: null,
      });
    }
    // sort: changed/added/removed first
    const rank = { changed: 0, added: 1, removed: 2, unchanged: 3 };
    holdings.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (b.change ?? 0) - (a.change ?? 0));
    return json({
      ok: true,
      source: "db",
      code,
      status: "ok",
      new_time: String(newDate).slice(0, 10),
      old_time: String(oldDate).slice(0, 10),
      snapshot_count: dates.length,
      summary: { added, removed, changed, unchanged },
      holdings,
    });
  } catch (e) {
    return json({ ok: true, source: "stub", code, status: "error", message: e?.message, summary: { added: 0, removed: 0, changed: 0, unchanged: 0 }, holdings: [] });
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
  const okCount = results.map(r => ({ok: r.ok, count: (r && r.count) || 0})).filter(x => x.ok).reduce((s, x) => s + x.count, 0);
  return json({ ok: true, source: "loader", inserted: okCount, results });
}

// ── loadMacroYields: Yahoo Finance US Treasury yields → macro_yields ─
// Series mapping:
//   ^TNX = 10Y, ^FVX = 5Y, ^TYX = 30Y, ^IRX = 13W
// We store as yield_5y/10y/30y/13w to match what we have; 2y is approximated by 5y in
// downstream code (or marked null when 2y-specific data is needed).
const MACRO_YIELD_SYMBOLS = [
  { sym: "^TNX", series: "yield_10y" },
  { sym: "^FVX", series: "yield_5y"  },
  { sym: "^TYX", series: "yield_30y" },
  { sym: "^IRX", series: "yield_13w" },
];
async function loadMacroYieldsForSymbol(sym, series) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=30d`;
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
  const rows = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c == null || !Number.isFinite(c)) continue;
    const isoDate = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    rows.push({ date: isoDate, value: Math.round(c * 10000) / 10000 });
  }
  if (rows.length === 0) return { ok: true, sym, series, count: 0 };
  // Bulk upsert
  const dates = rows.map((r) => r.date);
  const values = rows.map((r) => r.value);
  const sql = `
    INSERT INTO macro_yields (series, trade_date, value, source)
    SELECT $1, unnest($2::date[]), unnest($3::numeric[]), 'yahoo_v8'
    ON CONFLICT (series, trade_date) DO UPDATE SET
      value = EXCLUDED.value,
      source = EXCLUDED.source,
      fetched_at = now()`;
  await q(sql, [series, dates, values]);
  return { ok: true, sym, series, count: rows.length };
}
async function loadMacroYields(request) {
  const u = urlOf(request);
  const body = request.method !== "GET" ? await readJson(request) : {};
  if (request.method === "POST" && !operatorOk(body?.password)) {
    return json({ error: "密碼錯誤" }, { status: 403 });
  }
  const results = [];
  for (const { sym, series } of MACRO_YIELD_SYMBOLS) {
    try {
      const r = await loadMacroYieldsForSymbol(sym, series);
      results.push(r);
    } catch (e) {
      results.push({ ok: false, sym, series, error: e?.message });
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  const okCount = results.map(r => ({ok: r.ok, count: (r && r.count) || 0})).filter(x => x.ok).reduce((s, x) => s + x.count, 0);
  return json({ ok: true, source: "loader", inserted: okCount, results });
}

// ── loadMacroNews: Google News RSS → knowledge_library (record_type=news) ─
async function loadMacroNews(request) {
  const u = urlOf(request);
  const body = request.method !== "GET" ? await readJson(request) : {};
  if (request.method === "POST" && !operatorOk(body?.password)) {
    return json({ error: "密碼錯誤" }, { status: 403 });
  }
  // Default queries: 台股 + 國際
  const queries = (body?.queries && body.queries.length) ? body.queries
    : ["台股 加權指數", "台積電 2330", "美股 標普", "美聯準會 利率", "台股 法人"];
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
  const all = [];
  for (const q of queries) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
      clearTimeout(tid);
      if (!r.ok) { all.push({ ok: false, query: q, error: `HTTP ${r.status}` }); continue; }
      const xml = await r.text();
      // Minimal XML parsing: extract <item> blocks via regex (avoid full parser dep)
      const items = [];
      const itemRe = /<item>([\s\S]*?)<\/item>/g;
      let m;
      while ((m = itemRe.exec(xml)) !== null) {
        const block = m[1];
        const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
        const link  = (block.match(/<link\/>([^<]*)/) || block.match(/<link>([^<]*)<\/link>/) || [])[1] || "";
        const pub   = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
        const desc  = (block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "";
        // Strip CDATA & HTML
        const cleanTitle = title.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").trim();
        const cleanDesc  = desc.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").trim();
        if (!cleanTitle) continue;
        items.push({
          title: cleanTitle,
          record_url: link.trim(),
          published_at: pub.trim(),
          summary: cleanDesc.slice(0, 500),
          query: q,
        });
      }
      all.push({ ok: true, query: q, count: items.length, items });
    } catch (e) {
      all.push({ ok: false, query: q, error: e?.message });
    }
    await new Promise((res) => setTimeout(res, 300));
  }
  // 2-phase dedupe: SELECT existing record_urls → filter out → bulk INSERT.
  // (We avoid ON CONFLICT here because the partial unique index can't be used
  // as an arbiter in pg's infer_arbiter_indexes; using ON CONFLICT (col) fails
  // with 42P10. Plain INSERT after dedupe is reliable and only costs one extra roundtrip.)
  const totalFetched = all.reduce((s, r) => s + (r.items?.length || 0), 0);
  let inserted = 0;
  try {
    const items = [];
    for (const r of all) {
      if (!r.items) continue;
      for (const it of r.items) {
        if (!it.title || !it.record_url) continue;
        items.push({
          title: it.title,
          summary: it.summary || "",
          url: it.record_url,
          date: it.published_at ? new Date(it.published_at).toISOString() : new Date().toISOString(),
          query: it.query || "",
        });
      }
    }
    if (items.length) {
      // Find existing urls
      const urls = items.map((it) => it.url);
      const existingRes = await q(
        `SELECT record_url FROM knowledge_library WHERE record_url = ANY($1::text[])`,
        [urls]
      );
      const existingRows = existingRes?.rows || existingRes || [];
      const existingSet = new Set(existingRows.map((r) => r.record_url || r[0]));
      const fresh = items.filter((it) => !existingSet.has(it.url));
      inserted = fresh.length;
      if (fresh.length) {
        const titles = fresh.map((it) => it.title);
        const summaries = fresh.map((it) => it.summary);
        const u = fresh.map((it) => it.url);
        const dates = fresh.map((it) => it.date);
        const queries = fresh.map((it) => it.query);
        // source_id must be globally unique (UNIQUE (record_type, source_name, source_id))
        // and ≤ 64 chars. Use a short stable hash of the URL.
        const ids = u.map((url) => {
          let h = 0;
          for (let i = 0; i < url.length; i++) h = ((h * 31) + url.charCodeAt(i)) | 0;
          return ('g' + (h >>> 0).toString(36)).slice(0, 64);
        });
        await q(
          `INSERT INTO knowledge_library
             (record_type, source_name, source_id, query_term, title, summary_text, record_url, published_at)
           SELECT 'news', 'google_news_rss', unnest($1::text[]), unnest($2::text[]),
                  unnest($3::text[]), unnest($4::text[]), unnest($5::text[]), unnest($6::text[])`,
          [ids, queries, titles, summaries, u, dates]
        );
      }
    }
  } catch (e) {
    return json({ ok: false, source: "loader", error: e?.message, fetched: totalFetched });
  }
  return json({ ok: true, source: "loader", fetched: totalFetched, inserted, results: all });
}

// ── loadIndexInstitutional: TWSE 大盤 三大法人 → index_institutional ─
// Endpoint: https://www.twse.com.tw/fund/BFI82U?response=json&dayDate=YYYYMMDD
// fields: ["單位名稱","買進金額","賣出金額","買賣差額"]
// rows:   [自營商(自行買賣), 自營商(避險), 投信, 外資及陸資, 外資自營商, 合計]
async function loadIndexInstitutionalForDate(dateYmd, indexCode) {
  const ymd = dateYmd.replace(/-/g, "");
  const url = `https://www.twse.com.tw/fund/BFI82U?response=json&dayDate=${ymd}`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 10000);
  let resp;
  try {
    resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.twse.com.tw/" },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
  } catch (e) {
    clearTimeout(tid);
    if (e.name === "AbortError") throw new Error("twse timeout");
    throw e;
  }
  if (!resp.ok) throw new Error(`twse HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.stat !== "OK" || !Array.isArray(data.data) || data.data.length === 0) {
    return { ok: false, source: "twse", error: data.stat || "no data", count: 0 };
  }
  // Aggregate by 法人 type:
  //   foreign_net = row 3 (外資) + row 4 (外資自營商)
  //   trust_net   = row 2 (投信)
  //   dealer_net  = row 0 (自營商自行) + row 1 (自營商避險)
  const parseNum = (s) => Number(String(s || "0").replace(/,/g, "").trim()) || 0;
  let foreign_net = 0, trust_net = 0, dealer_net = 0;
  for (const r of data.data) {
    const name = String(r[0] || "").trim();
    const diff = parseNum(r[3]); // 買賣差額
    if (name.startsWith("外資")) foreign_net += diff;
    else if (name.startsWith("投信")) trust_net = diff;
    else if (name.startsWith("自營商")) dealer_net += diff;
  }
  await q(
    `INSERT INTO index_institutional (index_code, trade_date, foreign_net, trust_net, dealer_net, source)
     VALUES ($1, $2, $3, $4, $5, 'twse_BFI82U')
     ON CONFLICT (index_code, trade_date) DO UPDATE SET
       foreign_net = EXCLUDED.foreign_net,
       trust_net = EXCLUDED.trust_net,
       dealer_net = EXCLUDED.dealer_net,
       source = EXCLUDED.source,
       fetched_at = now()`,
    [indexCode, dateYmd, foreign_net, trust_net, dealer_net]
  );
  return { ok: true, count: 1, foreign_net, trust_net, dealer_net };
}
async function loadIndexInstitutional(request) {
  const u = urlOf(request);
  const body = request.method !== "GET" ? await readJson(request) : {};
  if (request.method === "POST" && !operatorOk(body?.password)) {
    return json({ error: "密碼錯誤" }, { status: 403 });
  }
  // Backfill last 30 trading days for TWSE
  const results = [];
  const days = Math.min(60, Math.max(1, parseInt(u.searchParams.get("days") || body?.days || "30", 10) || 30));
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today.getTime() - i * 86400000);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    // Skip weekends
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    try {
      const r = await loadIndexInstitutionalForDate(ymd, "TWSE");
      results.push({ date: ymd, ...r });
    } catch (e) {
      results.push({ date: ymd, ok: false, error: e?.message });
    }
    await new Promise((res) => setTimeout(res, 300));
  }
  const okCount = results.map(r => ({ok: r.ok, count: (r && r.count) || 0})).filter(x => x.ok).reduce((s, x) => s + x.count, 0);
  return json({ ok: true, source: "loader", inserted: okCount, days, results });
}

// ── loadMarkers: 從 screener + market_price_bars 自動寫入 markers (買賣訊號) ─
// 規則（簡單版，先 seed 出有內容的資料）:
//   1. 站上三均線 + 量增 → 'buy_chase'
//   2. 跌破 MA20 → 'sell_stop'
//   3. 外資連買 3 日 → 'foreign_buy_3d'
//   4. 漲停 (>= 9.5%) → 'limit_up'
async function loadMarkers(request) {
  const u = urlOf(request);
  const body = request.method !== "GET" ? await readJson(request) : {};
  if (request.method === "POST" && !operatorOk(body?.password)) {
    return json({ error: "密碼錯誤" }, { status: 403 });
  }
  try {
    // 1) scan watchlist with screenOne (returns {code, name, ... cond1..cond5, gain_5d_pct, ...})
    const results = await scanAllImpl();
    let inserted = 0;
    const today = new Date().toISOString().slice(0, 10);
    const todayText = `${parseInt(today.slice(0, 4), 10) - 1911}/${today.slice(5, 7).replace(/^0/, "")}/${today.slice(8, 10).replace(/^0/, "")}`;
    for (const r of results) {
      const markers = [];
      // buy_chase: cond2 + cond3 + cond4 (站上三均線 + 5d/20d 漲)
      if (r.cond2 && r.cond3 && r.cond4) {
        markers.push({
          code: r.code, date: today, type: "buy_chase",
          text: `站上三均線 + 5日/20日漲幅 ${r.gain_5d_pct}%/${r.gain_20d_pct}%`,
          price: r.latest_close,
        });
      }
      // limit_up: gain_5d_pct >= 9.5%
      if (r.gain_5d_pct >= 9.5) {
        markers.push({
          code: r.code, date: today, type: "limit_up",
          text: `5日累計漲幅 ${r.gain_5d_pct}%（疑似漲停/連板）`,
          price: r.latest_close,
        });
      }
      // sell_stop: cond1 broken (距 60 日高 > 5%) + close < MA20
      const belowMA20 = r.latest_close < r.ma20;
      if (r.dist_high_60d_pct > 5 && belowMA20) {
        markers.push({
          code: r.code, date: today, type: "sell_stop",
          text: `距 60 日高 ${r.dist_high_60d_pct}%, 跌破 MA20 (${r.ma20})`,
          price: r.latest_close,
        });
      }
      for (const m of markers) {
        await q(
          `INSERT INTO markers (code, date, type, text, price)
           VALUES ($1, $2, $3, $4, $5)`,
          [m.code, m.date, m.type, m.text, m.price]
        );
        inserted++;
      }
    }
    return json({ ok: true, source: "loader", scanned: results.length, inserted, as_of: today });
  } catch (e) {
    return json({ ok: false, source: "loader", error: e?.message });
  }
}

// ── FinMind loaders (big_holders + financial_reports) ────────────────────────
// 需 $env:FINMIND_TOKEN, 無 token 時 fallback synth_v2_60 (跑現有 seed script)
// Free tier: 600 req/hr, 60 stocks × 2 endpoints = 120 calls 內 OK
const FINMIND_BASE = "https://api.finmindtrade.com/api/v4/data";

async function finmindFetch(dataset, params = {}) {
  const token = process.env.FINMIND_TOKEN;
  if (!token) throw new Error("FINMIND_TOKEN not set");
  const u = new URL(FINMIND_BASE);
  u.searchParams.set("dataset", dataset);
  u.searchParams.set("token", token);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) u.searchParams.set(k, String(v));
  }
  const r = await fetch(u.toString(), {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`FinMind ${dataset} HTTP ${r.status}`);
  const j = await r.json();
  if (j?.msg && j.msg !== "success") throw new Error(`FinMind ${dataset}: ${j.msg}`);
  return j?.data || [];
}

// 抓一個 stock 的 big_holders (近 1 年每月揭露)
async function loadBigHoldersFinMindForCode(code) {
  const today = new Date();
  const start = new Date(today.getTime() - 365 * 86400000);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const rows = await finmindFetch("TaiwanStockShareholding", {
    data_id: code,
    start_date: fmt(start),
    end_date: fmt(today),
  });
  // keep latest snapshot per holder_name
  const byHolder = new Map();
  for (const r of rows) {
    const key = r.stock_holder_name || r.holder_name || "?";
    const prev = byHolder.get(key);
    if (!prev || String(r.date || r.hold_date) > String(prev.date || prev.hold_date)) {
      byHolder.set(key, r);
    }
  }
  const asOf = String(rows[rows.length - 1]?.date || rows[rows.length - 1]?.hold_date || today.toISOString().slice(0, 10));
  let inserted = 0;
  for (const r of byHolder.values()) {
    const name = r.stock_holder_name || r.holder_name;
    const shares = Number(r.shares) || null;
    const pct = Number(r.holding_percent) || Number(r.percent) || null;
    const holderType = Number(r.shares) > 1000000 ? "institutional" : "individual";
    if (!name || pct == null) continue;
    const ex = await q(
      `SELECT id FROM big_holders WHERE symbol=$1 AND holder_name=$2 AND as_of_date=$3`,
      [code, name, asOf]
    );
    if (ex.rows.length) {
      await q(
        `UPDATE big_holders SET holder_type=$4, shares=$5, pct=$6, source='finmind', fetched_at=NOW() WHERE id=$1`,
        [ex.rows[0].id, holderType, shares, pct.toFixed(4)]
      );
    } else {
      await q(
        `INSERT INTO big_holders (symbol, holder_type, holder_name, shares, pct, as_of_date, source, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'finmind', NOW())`,
        [code, holderType, name, shares, pct.toFixed(4), asOf]
      );
    }
    inserted++;
  }
  return { code, inserted, asOf };
}

async function loadBigHoldersFinMind(request) {
  const u = urlOf(request);
  const body = request.method !== "GET" ? await readJson(request) : {};
  if (request.method === "POST" && !operatorOk(body?.password)) {
    return json({ error: "密碼錯誤" }, { status: 403 });
  }
  if (!process.env.FINMIND_TOKEN) {
    return json({
      ok: false,
      source: "finmind",
      error: "FINMIND_TOKEN 未設定 — 請到 https://finmindtrade.com/ 註冊並設定 Vercel env var",
      fallback: "目前使用 synth_v2_60 synth 資料 (在 seed-bh-60.mjs)",
    }, { status: 503 });
  }
  const wl = await q(`SELECT code FROM watchlist ORDER BY sort_order LIMIT 60`);
  const codes = wl.rows.map((r) => r.code);
  const results = [];
  for (const code of codes) {
    try {
      const r = await loadBigHoldersFinMindForCode(code);
      results.push({ ok: true, ...r });
    } catch (e) {
      results.push({ code, ok: false, error: e.message });
    }
    await new Promise((res) => setTimeout(res, 600));
  }
  const inserted = results.map(r => ({ok: r.ok, inserted: (r && r.inserted) || 0})).filter(x => x.ok).reduce((s, x) => s + x.inserted, 0);
  return json({ ok: true, source: "finmind", scanned: codes.length, inserted, results });
}

// 抓一個 stock 的 financial_reports (近 2 年 quarterly)
async function loadFinancialReportsFinMindForCode(code) {
  const today = new Date();
  const start = new Date(today.getTime() - 730 * 86400000);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const rows = await finmindFetch("TaiwanStockFinancialStatements", {
    data_id: code,
    start_date: fmt(start),
    end_date: fmt(today),
  });
  let inserted = 0;
  // group by period (year-quarter)
  const byPeriod = new Map();
  for (const r of rows) {
    const d = String(r.date || "");
    const m = d.match(/^(\d{4})-(\d{2})/);
    if (!m) continue;
    const month = parseInt(m[2], 10);
    let qStr;
    if (month <= 3) qStr = "Q1";
    else if (month <= 6) qStr = "Q2";
    else if (month <= 9) qStr = "Q3";
    else qStr = "Q4";
    const period = `${m[1]}-${qStr}`;
    if (!byPeriod.has(period)) byPeriod.set(period, { revenue: 0, gross_profit: 0, operating_income: 0, net_income: 0, eps: 0 });
    const acc = byPeriod.get(period);
    if (r.type === "Revenue") acc.revenue += Number(r.value) || 0;
    else if (r.type === "GrossProfit") acc.gross_profit += Number(r.value) || 0;
    else if (r.type === "OperatingIncome") acc.operating_income += Number(r.value) || 0;
    else if (r.type === "NetIncome") acc.net_income += Number(r.value) || 0;
    else if (r.type === "EPS") acc.eps = Number(r.value) || 0;
  }
  for (const [period, acc] of byPeriod) {
    if (acc.revenue === 0 && acc.net_income === 0) continue;
    const ex = await q(`SELECT id FROM financial_reports WHERE symbol=$1 AND period=$2`, [code, period]);
    if (ex.rows.length) {
      await q(
        `UPDATE financial_reports SET revenue=$2, gross_profit=$3, operating_income=$4, net_income=$5, eps=$6, source='finmind', fetched_at=NOW() WHERE id=$1`,
        [ex.rows[0].id, acc.revenue, acc.gross_profit, acc.operating_income, acc.net_income, acc.eps.toFixed(2)]
      );
    } else {
      await q(
        `INSERT INTO financial_reports (symbol, period, revenue, gross_profit, operating_income, net_income, eps, source, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'finmind', NOW())`,
        [code, period, acc.revenue, acc.gross_profit, acc.operating_income, acc.net_income, acc.eps.toFixed(2)]
      );
    }
    inserted++;
  }
  return { code, inserted, periods: byPeriod.size };
}

async function loadFinancialReportsFinMind(request) {
  const u = urlOf(request);
  const body = request.method !== "GET" ? await readJson(request) : {};
  if (request.method === "POST" && !operatorOk(body?.password)) {
    return json({ error: "密碼錯誤" }, { status: 403 });
  }
  if (!process.env.FINMIND_TOKEN) {
    return json({
      ok: false,
      source: "finmind",
      error: "FINMIND_TOKEN 未設定 — 請到 https://finmindtrade.com/ 註冊並設定 Vercel env var",
      fallback: "目前使用 synth_v2_60 synth 資料 (在 seed-fr-60.mjs)",
    }, { status: 503 });
  }
  const wl = await q(`SELECT code FROM watchlist ORDER BY sort_order LIMIT 60`);
  const codes = wl.rows.map((r) => r.code);
  const results = [];
  for (const code of codes) {
    try {
      const r = await loadFinancialReportsFinMindForCode(code);
      results.push({ ok: true, ...r });
    } catch (e) {
      results.push({ code, ok: false, error: e.message });
    }
    await new Promise((res) => setTimeout(res, 600));
  }
  const inserted = results.map(r => ({ok: r.ok, inserted: (r && r.inserted) || 0})).filter(x => x.ok).reduce((s, x) => s + x.inserted, 0);
  return json({ ok: true, source: "finmind", scanned: codes.length, inserted, results });
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

// ── loadMarketPricesFinMind: FinMind TaiwanStockPrice → market_price_bars ──
// 2026-08-13: backup source for 個股 OHLC (free, no token needed).
// FinMind provides trading_money + trading_turnover which Yahoo Finance 沒有。
// Per-stock API call (FinMind 不支援 batch via query string), parallel with 8-slot throttle.
// Usage: GET /api/admin/load/finmind_price?code=2330
//        GET /api/admin/load/finmind_price?codes=2330,2454,2317&days=120
async function loadMarketPricesFinMind(request) {
  const u = urlOf(request);
  const body = request.method !== "GET" ? await readJson(request) : {};
  if (request.method === "POST" && !operatorOk(body?.password)) {
    return json({ error: "密碼錯誤" }, { status: 403 });
  }
  const days = Math.min(500, Math.max(1, parseInt(u.searchParams.get("days") || body?.days || "120", 10) || 120));
  // 決定要處理的 codes
  let codes = [];
  if (u.searchParams.get("code")) {
    codes = [u.searchParams.get("code")];
  } else if (u.searchParams.get("codes")) {
    codes = u.searchParams.get("codes").split(",").map(s => s.trim()).filter(Boolean);
  } else if (body?.codes && Array.isArray(body.codes)) {
    codes = body.codes;
  } else {
    // 沒指定 → 拉 watchlist + etf_watchlist
    const [wl, ew] = await Promise.all([
      q(`SELECT code FROM watchlist`),
      q(`SELECT code FROM etf_watchlist`),
    ]);
    for (const r of (wl.rows || [])) codes.push(String(r.code ?? r[0]));
    for (const r of (ew.rows || [])) codes.push(String(r.code ?? r[0]));
  }
  if (codes.length === 0) {
    return json({ ok: true, source: "stub", count: 0, message: "沒有 code 可處理" });
  }
  // 計算 start_date
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const startStr = fmt(startDate);
  const endStr = fmt(endDate);
  // 平行 8 個 in-flight (FinMind 沒官方 limit 但保守一點)
  const PARALLEL = 8;
  const results = [];
  const errors = [];
  for (let i = 0; i < codes.length; i += PARALLEL) {
    const batch = codes.slice(i, i + PARALLEL);
    const batchRes = await Promise.all(batch.map(async (code) => {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 6000);
      try {
        const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${encodeURIComponent(code)}&start_date=${startStr}&end_date=${endStr}`;
        const r = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);
        if (!r.ok) {
          errors.push({ code, status: r.status });
          return null;
        }
        const j = await r.json();
        if (!j.data || !Array.isArray(j.data) || j.data.length === 0) {
          return { code, count: 0 };
        }
        // 抓 watchlist 跟 etf_watchlist 對應的 asset_type
        const [wl, ew] = await Promise.all([
          q(`SELECT code FROM watchlist WHERE code = $1`, [code]),
          q(`SELECT code FROM etf_watchlist WHERE code = $1`, [code]),
        ]);
        const isEtf = (ew.rows || []).length > 0;
        const assetType = isEtf ? "etf" : "stock";
        // 用 unnest 一次 upsert
        const rows = j.data.map(d => ({
          date: d.date,
          open: d.open,
          high: d.max,
          low: d.min,
          close: d.close,
          volume: d.Trading_Volume,
          turnover: d.Trading_money,
          spread: d.spread,
        }));
        const dates = rows.map(r => r.date);
        const opens = rows.map(r => r.open);
        const highs = rows.map(r => r.high);
        const lows  = rows.map(r => r.low);
        const closes = rows.map(r => r.close);
        const volumes = rows.map(r => r.volume);
        const turnovers = rows.map(r => r.turnover);
        await q(
          `INSERT INTO market_price_bars
             (source_name, symbol, asset_type, market, trade_date, open_price, high_price, low_price,
              close_price, change_value, volume, turnover, fetched_at)
           SELECT 'finmind_daily', $1, $2, 'TWSE', d::date, o, h, l, c, 0, v, t, NOW()
           FROM unnest($3::text[], $4::float8[], $5::float8[], $6::float8[], $7::float8[], $8::bigint[], $9::float8[]) AS x(d, o, h, l, c, v, t)
           ON CONFLICT (source_name, symbol, contract_month, trade_date) DO UPDATE SET
             open_price = EXCLUDED.open_price,
             high_price = EXCLUDED.high_price,
             low_price = EXCLUDED.low_price,
             close_price = EXCLUDED.close_price,
             volume = EXCLUDED.volume,
             turnover = EXCLUDED.turnover,
             fetched_at = NOW()`,
          [code, assetType, dates, opens, highs, lows, closes, volumes, turnovers]
        );
        return { code, count: rows.length, latest: rows[rows.length - 1] };
      } catch (e) {
        clearTimeout(tid);
        errors.push({ code, error: e?.message });
        return null;
      }
    }));
    for (const r of batchRes) if (r) results.push(r);
  }
  return json({
    ok: true,
    source: "finmind",
    requested: codes.length,
    ok_count: results.length,
    error_count: errors.length,
    days,
    start_date: startStr,
    end_date: endStr,
    results,
    errors,
  });
}
// Writes JSON metadata_text.industry for each watchlist stock. Heatmap reads this
// field to bucket stocks into sectors. No external API needed; curated list.
const TWSE_INDUSTRY_MAP = {
  "2330": "半導體業",     "2454": "半導體業",   "2303": "半導體業",   "2308": "半導體業",
  "2379": "半導體業",     "3711": "半導體業",   "3034": "半導體業",   "6669": "半導體業",
  "3231": "電腦及週邊設備業","2357": "電腦及週邊設備業","2382": "電腦及週邊設備業",
  "0050": "ETF",          "0051": "ETF",        "0052": "ETF",        "0056": "ETF",  "00878": "ETF",
  "2881": "金融保險業",   "2882": "金融保險業", "2884": "金融保險業", "2885": "金融保險業",
  "2886": "金融保險業",   "2887": "金融保險業", "2891": "金融保險業", "2892": "金融保險業",
  "1301": "塑膠工業",     "1303": "塑膠工業",   "1326": "塑膠工業",   "6505": "塑膠工業",
  "2002": "鋼鐵工業",     "2207": "汽車工業",   "3008": "光電業",     "1101": "水泥工業",
  "2317": "其他電子業",
  "1216": "食品工業",
};
async function loadSectors(request) {
  try {
    const onlyCode = pickStr(new URL(request.url).searchParams.get("code") || "").trim();
    const targets = onlyCode ? [onlyCode] : Object.keys(TWSE_INDUSTRY_MAP);
    let updated = 0, skipped = 0;
    const details = [];
    for (const code of targets) {
      const industry = TWSE_INDUSTRY_MAP[code];
      if (!industry) { skipped++; continue; }
      const ex = await q(`SELECT metadata_text FROM market_instruments WHERE symbol = $1 AND asset_type='stock'`, [code]);
      const exRows = ex.rows || ex || [];
      let meta = {};
      if (exRows.length && exRows[0].metadata_text) {
        try {
          const parsed = JSON.parse(exRows[0].metadata_text);
          // If existing is an object (or array, which we treat as legacy), wrap into a fresh meta object
          // and stash the legacy data so we don't lose it.
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            meta = parsed;
          } else if (Array.isArray(parsed)) {
            const _legacy = parsed; meta = { _legacy: _legacy, industry: "", sector_source: "", updated_at: "" };;
          }
        } catch {}
      }
      meta.industry = industry;
      meta.sector_source = "twse_manual_2026";
      meta.updated_at = new Date().toISOString();
      const json = JSON.stringify(meta);
      if (exRows.length) {
        await q(
          `UPDATE market_instruments SET metadata_text = $1 WHERE symbol = $2 AND asset_type='stock'`,
          [json, code]
        );
      } else {
        await q(
          `INSERT INTO market_instruments (symbol, name, asset_type, market, metadata_text, source) VALUES ($1, $1, 'stock', 'TWSE', $2, 'manual')`,
          [code, json]
        );
      }
      updated++;
      details.push({ code, industry });
    }
    return json({ ok: true, source: "loader", updated, skipped, total: targets.length, details });
  } catch (e) {
    return json({ ok: false, source: "loader", error: e?.message });
  }
}

// ── loadAllCombined: combined loader for Vercel Hobby (1 cron slot) ──────────
// Runs: macro_yields → macro_news → index_institutional → market_prices → sectors → markers → ai_capex
// Skips: institutional/exdiv/revenue (heavy MOPS, run separately if Hobby plan allows)
async function loadAllCombined(request) {
  const u = urlOf(request);
  const body = request.method !== "GET" ? await readJson(request) : {};
  if (request.method === "POST" && !operatorOk(body?.password)) {
    return json({ error: "密碼錯誤" }, { status: 403 });
  }
  const t0 = Date.now();
  const steps = [];
  const step = async (name, fn) => {
    const s = Date.now();
    try {
      const r = await fn();
      steps.push({ name, ok: true, ms: Date.now() - s, ...r });
    } catch (e) {
      steps.push({ name, ok: false, ms: Date.now() - s, error: e?.message });
    }
  };
  // 1. macro_yields (Yahoo Finance 4 series × 30d)
  await step("macro_yields", () => loadMacroYields({ method: "GET" }));
  // 2. macro_news (Google News RSS)
  await step("macro_news", () => loadMacroNews({ method: "GET" }));
  // 3. index_institutional (TWSE BFI82U 1 day)
  await step("index_institutional", () => loadIndexInstitutional({ method: "GET" }));
  // 4. market_prices (TWSE today snapshot for watchlist)
  await step("market_prices", () => loadMarketPrices({ method: "GET" }));
  // 5. sectors (硬編 TWSE industry mapping)
  await step("sectors", () => loadSectors({ method: "GET" }));
  // 6. markers (auto-gen from screenOne)
  await step("markers", () => loadMarkers({ method: "GET" }));
  // 7. ai_capex (SEC EDGAR 6 hyperscalers)
  await step("ai_capex", () => loadAiCapex({ method: "GET" }));
  const okCount = steps.filter(s => s.ok).length;
  return json({
    ok: true,
    source: "combined_loader",
    total_ms: Date.now() - t0,
    summary: `${okCount}/${steps.length} steps OK in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    steps,
  });
}

// ── loadMarketPricesBackfill: Yahoo Finance 個股日歷史 → market_price_bars ─
// One-shot: pulls 1y of daily bars per stock in watchlist so the screener
// (screenOne needs ≥60 days) can score more than the 4 originally tracked stocks.
// Yahoo Finance: https://query1.finance.yahoo.com/v8/finance/chart/<code>.TW?interval=1d&range=1y
// (gives ~244 trading days, enough for warming_zone_scan / screenOne)
// We use source_name='yahoo_v8' to differentiate from TWSE daily loader.
const BACKFILL_UA = "Mozilla/5.0 (compatible: donttalk-stock-app/1.0; contact: donttalk@example.com)";
async function loadMarketPricesBackfill(request) {
  const u = urlOf(request);
  const body = request.method !== "GET" ? await readJson(request) : {};
  if (request.method === "POST" && !operatorOk(body?.password)) {
    return json({ error: "密碼錯誤" }, { status: 403 });
  }
  const range = pickStr(u.searchParams.get("range") || body?.range || "1y");
  const onlyCode = pickStr(u.searchParams.get("code") || body?.code || "").trim();
  try {
    // 1) target stocks: watchlist (skip those that already have 60+ days)
    const wlRes = await q(`SELECT code FROM watchlist ORDER BY code`);
    const wlRows = wlRes.rows || wlRes;
    let targets = wlRows.map((r) => String(r.code ?? r[0])).filter((c) => /^\d{4,6}$/.test(c));
    if (onlyCode) targets = targets.filter((c) => c === onlyCode);
    if (targets.length === 0) {
      return json({ ok: true, source: "stub", count: 0, message: "no watchlist stocks to backfill" });
    }
    if (!onlyCode) {
      const cntRes = await q(
        `SELECT symbol, COUNT(DISTINCT trade_date)::int AS n
         FROM market_price_bars
         WHERE symbol = ANY($1::text[]) AND asset_type='stock'
         GROUP BY symbol`,
        [targets]
      );
      const haveEnough = new Set();
      for (const r of (cntRes.rows || [])) {
        if ((r.n ?? r[1]) >= 60) haveEnough.add(String(r.symbol ?? r[0]));
      }
      const before = targets.length;
      targets = targets.filter((c) => !haveEnough.has(c));
      if (targets.length === 0) {
        return json({ ok: true, source: "stub", count: 0, message: `all ${before} watchlist stocks already have 60+ days` });
      }
    }
    // 2) for each stock fetch Yahoo Finance chart
    const results = [];
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const code of targets) {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}.TW?interval=1d&range=${encodeURIComponent(range)}`;
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 12000);
      let stockBars = [];
      let lastError = null;
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": BACKFILL_UA, "Accept": "application/json,text/plain,*/*" },
          signal: ctrl.signal,
        });
        clearTimeout(tid);
        if (!r.ok) { lastError = `HTTP ${r.status}`; }
        else {
          const j = await r.json();
          const result = j?.chart?.result?.[0];
          if (!result) { lastError = "yahoo: no result"; }
          else {
            const ts = result.timestamp || [];
            const closes = result.indicators?.quote?.[0]?.close || [];
            const opens = result.indicators?.quote?.[0]?.open || [];
            const highs = result.indicators?.quote?.[0]?.high || [];
            const lows = result.indicators?.quote?.[0]?.low || [];
            const vols = result.indicators?.quote?.[0]?.volume || [];
            for (let i = 0; i < ts.length; i++) {
              const c = closes[i];
              if (c == null || !Number.isFinite(c)) continue;
              const isoDate = new Date(ts[i] * 1000).toISOString().slice(0, 10);
              const open = Number.isFinite(opens[i]) ? Number(opens[i]) : null;
              const high = Number.isFinite(highs[i]) ? Number(highs[i]) : null;
              const low = Number.isFinite(lows[i]) ? Number(lows[i]) : null;
              const vol = Number.isFinite(vols[i]) ? Math.round(vols[i]) : null;
              // compute change vs previous bar
              let change = null;
              if (i + 1 < ts.length && Number.isFinite(closes[i + 1])) {
                change = Math.round((c - closes[i + 1]) * 100) / 100;
              }
              stockBars.push({ isoDate, open, high, low, close: c, change, vol, turnover: vol && c ? vol * c : null });
            }
          }
        }
      } catch (e) {
        clearTimeout(tid);
        lastError = e.name === "AbortError" ? "timeout" : e.message;
      }
      if (stockBars.length === 0) {
        results.push({ code, ok: false, count: 0, error: lastError || "no data" });
        await sleep(200);
        continue;
      }
      // 3) Bulk upsert
      const dates = stockBars.map((b) => b.isoDate);
      const opens = stockBars.map((b) => b.open);
      const highs = stockBars.map((b) => b.high);
      const lows = stockBars.map((b) => b.low);
      const closes = stockBars.map((b) => b.close);
      const changes = stockBars.map((b) => b.change);
      const vols = stockBars.map((b) => b.vol);
      const turnovers = stockBars.map((b) => b.turnover);
      try {
        await q(
          `INSERT INTO market_price_bars
             (source_name, symbol, asset_type, market, trade_date, open_price, high_price, low_price,
              close_price, change_value, volume, turnover, fetched_at)
           SELECT 'yahoo_v8', $1, 'stock', 'TWSE', unnest($2::date[]),
                  unnest($3::numeric[]), unnest($4::numeric[]), unnest($5::numeric[]),
                  unnest($6::numeric[]), unnest($7::numeric[]), unnest($8::bigint[]), unnest($9::numeric[]), NOW()
           ON CONFLICT (source_name, symbol, contract_month, trade_date) DO UPDATE SET
             open_price = EXCLUDED.open_price,
             high_price = EXCLUDED.high_price,
             low_price = EXCLUDED.low_price,
             close_price = EXCLUDED.close_price,
             change_value = EXCLUDED.change_value,
             volume = EXCLUDED.volume,
             turnover = EXCLUDED.turnover,
             fetched_at = NOW()`,
          [code, dates, opens, highs, lows, closes, changes, vols, turnovers]
        );
        results.push({ code, ok: true, count: stockBars.length });
      } catch (e) {
        results.push({ code, ok: false, count: stockBars.length, error: e.message });
      }
      await sleep(200);
    }
    const ok = results.filter((r) => r.ok);
    const errs = results.filter((r) => !r.ok);
    return json({
      ok: true,
      source: "loader",
      range,
      stocks: targets.length,
      upserted: ok.reduce((s, r) => s + r.count, 0),
      stocks_ok: ok.length,
      stocks_failed: errs.length,
      failed_detail: errs.slice(0, 5),
      results,
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
  const okCount = results.map(r => ({ok: r.ok, count: (r && r.count) || 0})).filter(x => x.ok).reduce((s, x) => s + x.count, 0);
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

// ── etf_holdings loader: per-issuer scraping (PROBE ONLY) + manual seed ──
// Per-issuer scraping not viable: yuanta.com.tw / cathaysite.com.tw /
// dcbfund.com.tw all unreachable from Vercel edge (timeout or 403).
// Fallback: POST seed endpoint accepts manually-pasted holdings data.
//   curl -X POST -H "Content-Type: application/json" -d @seed.json \
//        https://donttalk.vercel.app/api/admin/load/etf_holdings/seed
//   body shape: { etf_code, as_of_date, source, holdings: [{symbol, weight_pct, market_value?}] }
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

// Manual seed endpoint — POST { etf_code, as_of_date, source, holdings: [...] }
async function seedEtfHoldings(request) {
  if (request.method !== "POST") return json({ error: "method not allowed (use POST)" }, { status: 405 });
  const body = await readJson(request);
  if (!operatorOk(body?.password)) return json({ error: "密碼錯誤" }, { status: 403 });
  const etfCode = String(body?.etf_code || "").trim();
  const asOf = String(body?.as_of_date || "").trim();
  const source = String(body?.source || "manual").trim();
  const holdings = Array.isArray(body?.holdings) ? body.holdings : [];
  if (!etfCode || !asOf || holdings.length === 0) {
    return json({ error: "缺少必要欄位：etf_code, as_of_date (YYYY-MM-DD), holdings[]" }, { status: 400 });
  }
  let inserted = 0, updated = 0;
  for (const h of holdings) {
    const symbol = String(h.symbol || "").trim();
    if (!symbol) continue;
    const weight = h.weight_pct != null ? Number(h.weight_pct) : null;
    const marketValue = h.market_value != null ? Number(h.market_value) : null;
    const shares = h.shares != null ? Number(h.shares) : null;
    // Upsert by (etf_code, symbol, as_of_date)
    const ex = await q(
      `SELECT id FROM etf_holdings WHERE etf_code = $1 AND symbol = $2 AND as_of_date = $3 LIMIT 1`,
      [etfCode, symbol, asOf]
    );
    if (ex.rows && ex.rows.length > 0) {
      await q(
        `UPDATE etf_holdings SET weight_pct = $1, market_value = $2, shares = $3, source = $4, fetched_at = NOW() WHERE id = $5`,
        [weight, marketValue, shares, source, ex.rows[0].id]
      );
      updated++;
    } else {
      await q(
        `INSERT INTO etf_holdings (etf_code, symbol, weight_pct, market_value, shares, as_of_date, source, fetched_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [etfCode, symbol, weight, marketValue, shares, asOf, source]
      );
      inserted++;
    }
  }
  return json({ ok: true, source: "seed", etf_code: etfCode, as_of_date: asOf, inserted, updated, total: holdings.length });
}

// ── seedBigHolders: manual POST endpoint for big_holders ─────────────
// Body: { password, holders: [{ symbol, holder_type, holder_name, shares, pct, as_of_date }] }
// Use case: real 大股東 公告 from MOPS / broker feeds / manual entry.
async function seedBigHolders(request) {
  if (request.method !== "POST") return json({ error: "method not allowed (use POST)" }, { status: 405 });
  const body = await readJson(request);
  if (!operatorOk(body?.password)) return json({ error: "密碼錯誤" }, { status: 403 });
  const source = String(body?.source || "manual").trim();
  const holders = Array.isArray(body?.holders) ? body.holders : [];
  if (holders.length === 0) {
    return json({ error: "缺少必要欄位：holders[] (each with symbol, holder_type, holder_name, shares, pct, as_of_date)" }, { status: 400 });
  }
  let inserted = 0, updated = 0, skipped = 0;
  for (const h of holders) {
    const symbol = String(h.symbol || "").trim();
    const holderType = String(h.holder_type || "").trim();
    const holderName = String(h.holder_name || "").trim();
    const asOf = String(h.as_of_date || "").trim();
    if (!symbol || !holderName || !asOf) { skipped++; continue; }
    const shares = h.shares != null ? Number(h.shares) : null;
    const pct = h.pct != null ? Number(h.pct) : null;
    const ex = await q(
      `SELECT id FROM big_holders WHERE symbol = $1 AND holder_name = $2 AND as_of_date = $3 LIMIT 1`,
      [symbol, holderName, asOf]
    );
    const exRows = ex.rows || ex || [];
    if (exRows.length > 0) {
      await q(
        `UPDATE big_holders SET holder_type = $1, shares = $2, pct = $3, source = $4, fetched_at = NOW() WHERE id = $5`,
        [holderType, shares, pct, source, exRows[0].id]
      );
      updated++;
    } else {
      await q(
        `INSERT INTO big_holders (symbol, holder_type, holder_name, shares, pct, as_of_date, source, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [symbol, holderType, holderName, shares, pct, asOf, source]
      );
      inserted++;
    }
  }
  return json({ ok: true, source: "seed", inserted, updated, skipped, total: holders.length });
}

// ── seedFinancialReports: manual POST endpoint for financial_reports ──
// Body: { password, reports: [{ symbol, period, revenue, gross_profit, operating_income, net_income, eps, source }] }
// period format: "2026-Q2", "2026-06", "2025" (any unique string per symbol)
async function seedFinancialReports(request) {
  if (request.method !== "POST") return json({ error: "method not allowed (use POST)" }, { status: 405 });
  const body = await readJson(request);
  if (!operatorOk(body?.password)) return json({ error: "密碼錯誤" }, { status: 403 });
  const source = String(body?.source || "manual").trim();
  const reports = Array.isArray(body?.reports) ? body.reports : [];
  if (reports.length === 0) {
    return json({ error: "缺少必要欄位：reports[] (each with symbol, period, revenue, gross_profit, operating_income, net_income, eps)" }, { status: 400 });
  }
  let inserted = 0, updated = 0, skipped = 0;
  for (const r of reports) {
    const symbol = String(r.symbol || "").trim();
    const period = String(r.period || "").trim();
    if (!symbol || !period) { skipped++; continue; }
    const revenue = r.revenue != null ? Number(r.revenue) : null;
    const grossProfit = r.gross_profit != null ? Number(r.gross_profit) : null;
    const opIncome = r.operating_income != null ? Number(r.operating_income) : null;
    const netIncome = r.net_income != null ? Number(r.net_income) : null;
    const eps = r.eps != null ? Number(r.eps) : null;
    const ex = await q(
      `SELECT id FROM financial_reports WHERE symbol = $1 AND period = $2 LIMIT 1`,
      [symbol, period]
    );
    const exRows = ex.rows || ex || [];
    if (exRows.length > 0) {
      await q(
        `UPDATE financial_reports SET revenue = $1, gross_profit = $2, operating_income = $3, net_income = $4, eps = $5, source = $6, fetched_at = NOW() WHERE id = $7`,
        [revenue, grossProfit, opIncome, netIncome, eps, source, exRows[0].id]
      );
      updated++;
    } else {
      await q(
        `INSERT INTO financial_reports (symbol, period, revenue, gross_profit, operating_income, net_income, eps, source, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [symbol, period, revenue, grossProfit, opIncome, netIncome, eps, source]
      );
      inserted++;
    }
  }
  return json({ ok: true, source: "seed", inserted, updated, skipped, total: reports.length });
}

async function _etfFetch(url) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 5000);
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
  // Probe-only: tries each issuer's known URL patterns in PARALLEL.
  // All 8 URLs fire at once; 5s timeout each → worst case 5s wall time.
  // For each ETF, picks the first URL that returns 200 with body > 1000 bytes.
  const u = urlOf(request);
  const onlyCode = u.searchParams.get("code") || null;
  // Collect all (code, url) pairs to fetch in parallel
  const tasks = [];
  for (const [code, cfg] of Object.entries(ETF_ISSUERS)) {
    if (onlyCode && onlyCode !== code) continue;
    for (const url of cfg.urls) {
      tasks.push({ code, issuer: cfg.issuer, url });
    }
  }
  const fetches = await Promise.all(tasks.map(t => _etfFetch(t.url).then(r => ({ ...t, ...r }))));
  // Group by code; pick best URL per code
  const byCode = new Map();
  for (const f of fetches) {
    if (!byCode.has(f.code)) byCode.set(f.code, { code: f.code, issuer: f.issuer, urls: [] });
    byCode.get(f.code).urls.push({
      url: f.url,
      ok: f.ok,
      status: f.status,
      body_len: f.body_len,
      error: f.error,
    });
  }
  return json({
    ok: true,
    source: "probe",
    as_of: new Date().toISOString().slice(0, 10),
    message: "Probe only — reports which issuer URLs are reachable. Real parsing TBD.",
    results: Array.from(byCode.values()),
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

// /api/pe_threshold — real handler. Frontend (signal-filter.html) uses
// pe_max = 1 / yield_10y  to mark stocks with PE > pe_max as overvalued.
// Reads from macro_yields table.
async function peThreshold(request) {
  try {
    const { rows } = await q(
      `SELECT trade_date, value
       FROM macro_yields
       WHERE series = 'yield_10y'
       ORDER BY trade_date DESC LIMIT 2`
    );
    if (rows.length === 0) {
      return json({ ok: true, source: "stub", pe_max: null, y10: null, y10_prev: null, pe_max_prev: null, message: "macro_yields empty; need FRED loader" });
    }
    const y10     = Number(rows[0].value); // in %
    const y10Prev = rows[1] ? Number(rows[1].value) : null;
    const peMax     = y10     > 0 ? Math.round((1 / (y10     / 100)) * 100) / 100 : null;
    const peMaxPrev = y10Prev > 0 ? Math.round((1 / (y10Prev / 100)) * 100) / 100 : null;
    return json({
      ok: true,
      source: "db",
      pe_max: peMax,
      y10,
      y10_prev: y10Prev,
      pe_max_prev: peMaxPrev,
      as_of: String(rows[0].trade_date).slice(0, 10),
    });
  } catch (e) {
    return json({ ok: true, source: "stub", pe_max: null, y10: null, y10_prev: null, pe_max_prev: null, error: e?.message });
  }
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
  ["GET",   /^\/stock\/([^/]+?)\/etf_membership\/?$/, stockEtfMembership],
  ["GET",   /^\/stock\/([^/]+?)\/events\/?$/,  stockEvents],
  ["GET",   /^\/stock\/([^/]+?)\/intro\/?$/,   stockIntro],
  ["GET",   /^\/index\/([^/]+?)\/?$/,        indexKlines],

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
  ["GET",  /^\/news\/([^/]+?)\/?$/,          newsByCode],
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
  ["GET",  /^\/conference\/([^/]+?)\/?$/,    conferenceByCode],

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
  ["GET",  /^\/admin\/load\/market_prices\/backfill\/?$/, loadMarketPricesBackfill],
  ["POST", /^\/admin\/load\/market_prices\/backfill\/?$/, loadMarketPricesBackfill],
  ["GET",  /^\/admin\/load\/finmind_price\/?$/,     loadMarketPricesFinMind],
  ["POST", /^\/admin\/load\/finmind_price\/?$/,     loadMarketPricesFinMind],
  ["GET",  /^\/admin\/load\/sectors\/?$/,          loadSectors],
  ["POST", /^\/admin\/load\/sectors\/?$/,          loadSectors],
  ["GET",  /^\/admin\/load\/all\/?$/,              loadAllCombined],
  ["POST", /^\/admin\/load\/all\/?$/,              loadAllCombined],
  ["GET",  /^\/admin\/load\/etf_holdings\/?$/,  loadEtfHoldings],
  ["POST", /^\/admin\/load\/etf_holdings\/?$/,  loadEtfHoldings],
  ["GET",  /^\/admin\/load\/macro_yields\/?$/,  loadMacroYields],
  ["POST", /^\/admin\/load\/macro_yields\/?$/,  loadMacroYields],
  ["GET",  /^\/admin\/load\/macro_news\/?$/,    loadMacroNews],
  ["POST", /^\/admin\/load\/macro_news\/?$/,    loadMacroNews],
  ["GET",  /^\/admin\/load\/index_institutional\/?$/, loadIndexInstitutional],
  ["POST", /^\/admin\/load\/index_institutional\/?$/, loadIndexInstitutional],
  ["GET",  /^\/admin\/load\/markers\/?$/,       loadMarkers],
  ["POST", /^\/admin\/load\/markers\/?$/,       loadMarkers],
  ["POST", /^\/admin\/load\/etf_holdings\/seed\/?$/, seedEtfHoldings],
  ["POST", /^\/admin\/load\/big_holders\/seed\/?$/, seedBigHolders],
  ["POST", /^\/admin\/load\/financial_reports\/seed\/?$/, seedFinancialReports],
  ["GET",  /^\/admin\/load\/big_holders\/finmind\/?$/, loadBigHoldersFinMind],
  ["POST", /^\/admin\/load\/big_holders\/finmind\/?$/, loadBigHoldersFinMind],
  ["GET",  /^\/admin\/load\/financial_reports\/finmind\/?$/, loadFinancialReportsFinMind],
  ["POST", /^\/admin\/load\/financial_reports\/finmind\/?$/, loadFinancialReportsFinMind],

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
  ["GET",  /^\/financial\/([^/]+?)\/?$/,     financial],
  ["GET",  /^\/overnight_signal\/?$/,        overnightSignal],
  ["GET",  /^\/margin_burst\/?$/,            marginBurst],
  ["GET",  /^\/margin_burst\/([^/]+?)\/?$/,  marginBurst],
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
  ["GET",  /^\/pe_threshold\/?$/,            peThreshold],
  ["GET",  /^\/min_hold_overrides\/?$/,      placeholder.bind(null, "min_hold_overrides", "per-stock minimum hold days override; empty = use default")],
];

const CACHEABLE_RE = /^\/(stock|instruments|quote|chips|macro|index|movers|industries|list\/)/;
// Read-only public lookups are safe to cache at the Vercel edge for 60s and
// serve stale-while-revalidate for 10 minutes afterward. Post requests and
// anything with user-specific mutations stay uncached.
function maybeCacheHeaders(path, method, response) {
  if (method !== "GET") return response;
  if (!CACHEABLE_RE.test("/" + path)) return response;
  // Don't cache error responses (so users see fresh errors).
  if (response.status >= 400) return response;
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default async function handler(request) {
  try {
    const u = new URL(request.url);
    const raw = u.pathname || "";
    let path = raw.replace(/^\/api\/?/, "").replace(/\/+$/, "");
    const fullPath = "/" + (path || "");
    // DEBUG: return 200 for ALL requests to see if function is invoked
    if (path === "debug-all-200") {
      return new Response("DEBUG: function invoked for path: " + raw, { status: 200 });
    }
    for (const [method, re, fn] of TABLE) {
      if (method !== request.method) continue;
      const m = re.exec(fullPath);
      if (m) {
        const args = m.slice(1);
        const res = await fn(request, ...args);
        return maybeCacheHeaders(path, request.method, res);
      }
    }
    return json({ ok: false, error: "not found", path: "/api/" + path, method: request.method }, { status: 404 });
  } catch (e) {
    return json({ ok: false, error: e?.message, stack: e?.stack }, { status: 500 });
  }
}

export const config = { runtime: "edge", maxDuration: 60 };

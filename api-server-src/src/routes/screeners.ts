import { Router, type IRouter } from "express";
import { fetchCandles, type Candle } from "../lib/yahoo";
import { runStrategy, computeFib } from "../lib/indicators";
import { getWatchlist } from "../lib/stocks";
import { fetchInstitutional } from "../lib/twse";
import { fetchStockNews } from "../lib/news";
import { cached, cacheGet, cacheSet } from "../lib/cache";
import { rateLimit } from "../lib/ratelimit";

const router: IRouter = Router();
const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

function operatorOk(password: unknown): boolean {
  const expected = process.env["STOCK_OPERATOR_PASSWORD"];
  // Closed by default: privileged operator actions stay disabled until an
  // operator secret is configured (project threat model — no open mode).
  if (!expected) return false;
  return typeof password === "string" && password === expected;
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function gainPct(candles: Candle[], n: number): number {
  if (candles.length < n + 1) return 0;
  const last = candles[candles.length - 1].close;
  const base = candles[candles.length - 1 - n].close;
  return base ? ((last - base) / base) * 100 : 0;
}

function distHighPct(candles: Candle[], window: number): number {
  const slice = candles.slice(-window);
  if (!slice.length) return 0;
  const high = Math.max(...slice.map((c) => c.high));
  const close = candles[candles.length - 1].close;
  return high ? ((high - close) / high) * 100 : 0;
}

/** Recursive 9-period stochastic KD (台股常用 KD). */
function computeKD(candles: Candle[]): { k: number; d: number } {
  let k = 50;
  let d = 50;
  for (let i = 0; i < candles.length; i++) {
    const slice = candles.slice(Math.max(0, i - 8), i + 1);
    const hi = Math.max(...slice.map((c) => c.high));
    const lo = Math.min(...slice.map((c) => c.low));
    const rsv = hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100;
    k = (2 / 3) * k + (1 / 3) * rsv;
    d = (2 / 3) * d + (1 / 3) * k;
  }
  return { k: r2(k), d: r2(d) };
}

function maAt(candles: Candle[], period: number): number | null {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  return avg(slice.map((c) => c.close));
}

// ──────────────────────────────────────────────────────────────────────────
// 升溫區掃描 (warming zone) — /warming_zone_scan
//
// Computable from daily OHLCV (Yahoo): 組1 漲幅+量縮、組2 漲幅+爆量、
// 組3 KD高+跳空、組4 假突破均線。
// 組5–9 require 借券 (SBL) / 融資融券 (margin & short) / ETF 成分剔除 feeds that
// have no public source wired in this clone → emitted honestly as not-met with
// margin_short.has_data=false (frontend renders "無資料" rows).
// ──────────────────────────────────────────────────────────────────────────

interface WarmResult {
  code: string;
  name: string;
  category: string;
  latest_close: number;
  latest_date: string;
  cond1: boolean;
  cond2: boolean;
  cond3: boolean;
  cond4: boolean;
  cond5: boolean;
  cond6: boolean;
  cond7: boolean;
  cond8: boolean;
  cond9: boolean;
  met_count: number;
  level: "distribution" | "squeeze" | null;
  combined_score: number | null;
  combined_color: string | undefined;
  recommendation: string;
  short_alive_score: number;
  margin_short: { has_data: boolean };
  details: Record<string, unknown>;
}

const WARM_TTL = 60 * 10;
const warmState = { updatedAt: "", lastScanAt: 0, scanned: 0 };

function analyzeWarming(code: string, name: string, candles: Candle[]): WarmResult | null {
  if (candles.length < 30) return null;
  const last = candles[candles.length - 1];
  const category = code.startsWith("00") ? "ETF" : "股票";

  const gain7 = gainPct(candles, 7);
  const distHigh90 = distHighPct(candles, 90);
  const kd = computeKD(candles);
  const details: Record<string, unknown> = {};

  // 組1：7日漲幅 ≥ 6% 且近3日均量 < 前3日均量 × 0.7 且距高點 ≤ 5%
  const recent3 = candles.slice(-3).map((c) => c.volume);
  const past3 = candles.slice(-6, -3).map((c) => c.volume);
  const recentAvg = avg(recent3);
  const pastAvg = avg(past3);
  const threshold = pastAvg * 0.7;
  const volDecrease = pastAvg > 0 && recentAvg < threshold;
  const cond1 = gain7 >= 6 && volDecrease && distHigh90 <= 5;
  details.cond1 = {
    gain_7d_pct: r1(gain7),
    recent_3d_avg: Math.round(recentAvg),
    past_3d_avg: Math.round(pastAvg),
    threshold_vol: Math.round(threshold),
    volume_decrease: volDecrease,
  };

  // 組2：7日漲幅 ≥ 10% 且今日爆量（≥ 20日均量 × 2）
  const volToday = last.volume;
  const volMa20 = avg(candles.slice(-20).map((c) => c.volume));
  const volRatio = volMa20 ? volToday / volMa20 : 0;
  const isSurge = volRatio >= 2;
  const cond2 = gain7 >= 10 && isSurge;
  details.cond2 = {
    gain_7d_pct: r1(gain7),
    vol_today: volToday,
    vol_ma20: Math.round(volMa20),
    vol_ratio: r2(volRatio),
    is_surge: isSurge,
  };

  // 組3：KD > 80 且近5日有向下跳空缺口未回補
  const bearishGaps: { date: string; gap_pct: number; gap_bottom: number; gap_top: number }[] = [];
  for (let i = candles.length - 5; i < candles.length; i++) {
    if (i < 1) continue;
    const prev = candles[i - 1];
    const cur = candles[i];
    if (cur.high < prev.low) {
      // unfilled if no later bar closed the gap back to prev.low
      const filled = candles.slice(i + 1).some((c) => c.high >= prev.low);
      if (!filled) {
        const gapPct = prev.low ? ((prev.low - cur.high) / prev.low) * 100 : 0;
        bearishGaps.push({ date: cur.time, gap_pct: r2(gapPct), gap_bottom: cur.high, gap_top: prev.low });
      }
    }
  }
  const kdAbove80 = kd.k > 80 || kd.d > 80;
  const cond3 = kdAbove80 && bearishGaps.length > 0;
  details.cond3 = { kd_k: kd.k, kd_d: kd.d, kd_above_80: kdAbove80, bearish_gaps: bearishGaps };

  // 組4：盤中站上均線後收盤跌破（以日線高/收近似）
  const brokenMas: { ma_name: string; ma_value: number; today_high: number; today_close: number }[] = [];
  for (const [nm, period] of [
    ["MA5", 5],
    ["MA10", 10],
    ["MA20", 20],
    ["MA60", 60],
  ] as [string, number][]) {
    const ma = maAt(candles, period);
    if (ma != null && last.high > ma && last.close < ma) {
      brokenMas.push({ ma_name: nm, ma_value: r2(ma), today_high: last.high, today_close: last.close });
    }
  }
  const cond4 = brokenMas.length > 0 && gain7 >= 8;
  details.cond4 = { broken_mas: brokenMas };

  // 組5–9：無 借券 / 融資融券 / ETF 成分 資料來源 → 一律 not-met
  const cond5 = false;
  const cond6 = false;
  const cond7 = false;
  const cond8 = false;
  const cond9 = false;

  const metCount = [cond1, cond2, cond3, cond4].filter(Boolean).length;
  if (metCount === 0) return null;

  const level: WarmResult["level"] = cond1 ? "squeeze" : null;

  return {
    code,
    name,
    category,
    latest_close: last.close,
    latest_date: last.time,
    cond1,
    cond2,
    cond3,
    cond4,
    cond5,
    cond6,
    cond7,
    cond8,
    cond9,
    met_count: metCount,
    level,
    combined_score: null,
    combined_color: undefined,
    recommendation: metCount >= 2 ? "升溫加速，留意追高風險" : "升溫中，留意過熱",
    short_alive_score: 0,
    margin_short: { has_data: false },
    details,
  };
}

async function computeWarming(): Promise<WarmResult[]> {
  const list = await getWatchlist();
  const results: WarmResult[] = [];
  let scanned = 0;
  for (const s of list.slice(0, 50)) {
    try {
      const candles = await fetchCandles(s.ticker, 200);
      scanned++;
      const r = analyzeWarming(s.code, s.name, candles);
      if (r) results.push(r);
    } catch {
      /* skip */
    }
  }
  results.sort((a, b) => {
    const pa = a.level === "distribution" ? 2 : a.level === "squeeze" ? 1 : 0;
    const pb = b.level === "distribution" ? 2 : b.level === "squeeze" ? 1 : 0;
    if (pb !== pa) return pb - pa;
    return b.met_count - a.met_count;
  });
  warmState.updatedAt = new Date().toISOString();
  warmState.lastScanAt = Date.now();
  warmState.scanned = scanned;
  return results;
}

router.get(
  "/warming_zone_scan",
  rateLimit({ windowMs: 60_000, max: 20, key: "warming_get" }),
  async (req, res) => {
  const refresh = req.query.refresh === "1";
  const hadCache = cacheGet<WarmResult[]>("warming_zone") !== undefined;
  // Honour ?refresh=1 but cool down to 30s to bound the watchlist fan-out cost.
  if (refresh && Date.now() - warmState.lastScanAt > 30_000) {
    cacheSet("warming_zone", await computeWarming(), WARM_TTL);
  }
  const results = await cached("warming_zone", WARM_TTL, computeWarming);
  res.json({
    results,
    cache_hit: hadCache && !refresh,
    updated_at: warmState.updatedAt,
    scanned: warmState.scanned,
  });
  },
);

router.post(
  "/warming_zone_scan/refresh",
  rateLimit({ windowMs: 5 * 60_000, max: 3, key: "warm_refresh" }),
  async (req, res) => {
    // Expensive watchlist fan-out → operator-gated (closed by default).
    if (!operatorOk(req.body?.password)) {
      res.status(403).json({ ok: false, need_password: true, error: "密碼錯誤" });
      return;
    }
    cacheSet("warming_zone", await computeWarming(), WARM_TTL);
    res.json({ ok: true, scanning: false, message: "掃描完成", updated_at: warmState.updatedAt });
  },
);

router.get("/warming_zone_scan/status", (_req, res) => {
  res.json({
    ready: warmState.updatedAt !== "",
    scanning: false,
    updated_at: warmState.updatedAt,
    scanned: warmState.scanned,
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 多頭回踩 (uptrend watch) — /uptrend_watch
// 多頭排列 = MA10 > MA20 > MA60 且 收盤 > MA60 且 MA60 上彎。
// ──────────────────────────────────────────────────────────────────────────

interface UptrendRow {
  code: string;
  name: string;
  close: number;
  open: number;
  high: number;
  low: number;
  ma10: number;
  ma20: number;
  ma60: number;
  dist_pct: number | null;
  kind: "touch" | "near" | null;
  vol_ratio: number;
  range_pct: number;
}

async function computeUptrend() {
  const list = await getWatchlist();
  const ma10Rows: UptrendRow[] = [];
  const ma20Rows: UptrendRow[] = [];
  const volowRows: UptrendRow[] = [];
  let scanned = 0;
  let uptrendCount = 0;
  let asOf = "";

  for (const s of list.slice(0, 60)) {
    try {
      const candles = await fetchCandles(s.ticker, 200);
      if (candles.length < 65) continue;
      scanned++;
      const last = candles[candles.length - 1];
      asOf = last.time;
      const ma10 = maAt(candles, 10);
      const ma20 = maAt(candles, 20);
      const ma60now = maAt(candles, 60);
      const ma60prev = maAt(candles.slice(0, -5), 60);
      if (ma10 == null || ma20 == null || ma60now == null || ma60prev == null) continue;

      const isUptrend =
        ma10 > ma20 && ma20 > ma60now && last.close > ma60now && ma60now > ma60prev;
      if (!isUptrend) continue;
      uptrendCount++;

      const base: Omit<UptrendRow, "dist_pct" | "kind"> = {
        code: s.code,
        name: s.name,
        close: last.close,
        open: last.open,
        high: last.high,
        low: last.low,
        ma10: r2(ma10),
        ma20: r2(ma20),
        ma60: r2(ma60now),
        vol_ratio: 0,
        range_pct: 0,
      };

      // 回踩 MA10
      const dist10 = ((last.close - ma10) / ma10) * 100;
      if (last.low <= ma10 && last.high >= ma10) {
        ma10Rows.push({ ...base, dist_pct: r2(dist10), kind: "touch" });
      } else if (last.close > ma10 && dist10 <= 1.5) {
        ma10Rows.push({ ...base, dist_pct: r2(dist10), kind: "near" });
      }

      // 回踩 MA20
      const dist20 = ((last.close - ma20) / ma20) * 100;
      if (last.low <= ma20 && last.high >= ma20) {
        ma20Rows.push({ ...base, dist_pct: r2(dist20), kind: "touch" });
      } else if (last.close > ma20 && dist20 <= 1.5) {
        ma20Rows.push({ ...base, dist_pct: r2(dist20), kind: "near" });
      }

      // 爆量下殺：量 ≥ 20日均量 × 1.5、黑K、振幅 ≥ 2%
      const volMa20 = avg(candles.slice(-20).map((c) => c.volume));
      const volRatio = volMa20 ? last.volume / volMa20 : 0;
      const rangePct = last.close ? ((last.high - last.low) / last.close) * 100 : 0;
      if (volRatio >= 1.5 && last.close < last.open && rangePct >= 2) {
        volowRows.push({ ...base, dist_pct: null, kind: null, vol_ratio: r2(volRatio), range_pct: r2(rangePct) });
      }
    } catch {
      /* skip */
    }
  }

  return {
    ok: true,
    as_of: asOf,
    scanned,
    uptrend_count: uptrendCount,
    ma10: ma10Rows,
    ma20: ma20Rows,
    volow: volowRows,
  };
}

router.get("/uptrend_watch", async (_req, res) => {
  try {
    res.json(await cached("uptrend_watch", 60 * 10, computeUptrend));
  } catch {
    res.json({ ok: true, as_of: "", scanned: 0, uptrend_count: 0, ma10: [], ma20: [], volow: [] });
  }
});

// ── 精選篩選 (multi-filter) — POST /uptrend_watch_filter ──
// f1 Fib 回檔、f3 法人買超、f5 新聞情緒 are computable.
// f2 大戶持股 (400/1000 張集中度) & f4 月營收 YoY/MoM have no public feed wired
// → honestly never hit (hits.f2 / hits.f4 stay null).

interface FilterHit {
  code: string;
  name: string;
  close: number;
  hit_count: number;
  hits: {
    f1: { level: string; fib_price: number; close: number } | null;
    f2: null;
    f3: { foreign_5d: number; trust_5d: number; total_5d: number } | null;
    f4: null;
    f5: { score: number; items: number } | null;
  };
}

router.post(
  "/uptrend_watch_filter",
  rateLimit({ windowMs: 60_000, max: 6, key: "uptrend_filter" }),
  async (req, res) => {
    const started = Date.now();
    const codes: string[] = Array.isArray(req.body?.codes)
      ? req.body.codes.map((c: unknown) => String(c)).slice(0, 60)
      : [];
    const filters: number[] = Array.isArray(req.body?.filters)
      ? req.body.filters.map((f: unknown) => Number(f)).filter((f: number) => f >= 1 && f <= 5)
      : [1, 2, 3, 4, 5];
    const minMatch = Number(req.body?.min_match ?? Math.max(1, filters.length)) || 1;

    const list = await getWatchlist();
    const byCode = new Map(list.map((s) => [s.code, s]));
    const results: FilterHit[] = [];

    for (const code of codes) {
      const meta = byCode.get(code);
      if (!meta) continue;
      try {
        const candles = await fetchCandles(meta.ticker, 200);
        if (candles.length < 30) continue;
        const close = candles[candles.length - 1].close;
        const hits: FilterHit["hits"] = { f1: null, f2: null, f3: null, f4: null, f5: null };

        if (filters.includes(1)) {
          const fib = computeFib(candles, 90);
          const levels: [string, number][] = [
            ["38.2%", fib.fib382],
            ["50%", fib.fib500],
            ["61.8%", fib.fib618],
          ];
          for (const [label, price] of levels) {
            if (price > 0 && Math.abs(close - price) / close <= 0.015) {
              hits.f1 = { level: label, fib_price: r2(price), close: r2(close) };
              break;
            }
          }
        }

        if (filters.includes(3)) {
          try {
            const inst = await fetchInstitutional(code, 5);
            const foreign5 = inst.foreign.reduce((a, b) => a + b.net, 0);
            const trust5 = inst.trust.reduce((a, b) => a + b.net, 0);
            const total5 = foreign5 + trust5;
            if (total5 > 0) hits.f3 = { foreign_5d: foreign5, trust_5d: trust5, total_5d: total5 };
          } catch {
            /* no inst data */
          }
        }

        if (filters.includes(5)) {
          try {
            const news = await fetchStockNews(code, meta.name);
            if (news.sentiment.score > 0) {
              hits.f5 = { score: news.sentiment.score, items: news.sentiment.totalNews };
            }
          } catch {
            /* no news */
          }
        }

        const hitCount = [hits.f1, hits.f2, hits.f3, hits.f4, hits.f5].filter(Boolean).length;
        if (hitCount >= minMatch) {
          results.push({ code, name: meta.name, close: r2(close), hit_count: hitCount, hits });
        }
      } catch {
        /* skip */
      }
    }

    results.sort((a, b) => b.hit_count - a.hit_count);
    res.json({
      ok: true,
      results,
      scanned: codes.length,
      matched: results.length,
      min_match: minMatch,
      took_ms: Date.now() - started,
    });
  },
);

// ── 精選歷史 (pick history) — GET /uptrend_pick_history ──
// No persisted pick journal in this clone (resets on restart) → honest empty.
router.get("/uptrend_pick_history", (req, res) => {
  const wantStats = req.query.stats === "1";
  res.json({
    ok: true,
    count: 0,
    stats: wantStats ? null : undefined,
    rows: [],
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 賣飛清單 (sold too early) — GET /sold_too_early
// Computed from the MA-cross strategy: recent 賣出 markers whose price has since
// recovered above MA5/MA10/MA20 AND current price > sell price.
// ──────────────────────────────────────────────────────────────────────────

interface SoldRow {
  code: string;
  name: string;
  strategy: string;
  strategy_label: string;
  sell_date: string;
  days_since_sell: number;
  sell_price: number;
  current_price: number;
  gain_since_sell_pct: number;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  sell_reason: string;
}

async function computeSoldTooEarly(days: number) {
  const list = await getWatchlist();
  const rows: SoldRow[] = [];
  let scanned = 0;
  let asOf = "";
  const cutoff = Date.now() - days * 86400000;

  for (const s of list.slice(0, 50)) {
    try {
      const candles = await fetchCandles(s.ticker, 300);
      if (candles.length < 30) continue;
      scanned++;
      const last = candles[candles.length - 1];
      asOf = last.time;
      const strat = runStrategy(candles);
      const sells = strat.markers.filter((m) => m.text === "賣出");
      if (!sells.length) continue;
      const lastSell = sells[sells.length - 1];
      if (new Date(lastSell.time).getTime() < cutoff) continue;

      const ma5 = maAt(candles, 5);
      const ma10 = maAt(candles, 10);
      const ma20 = maAt(candles, 20);
      const sellBar = candles.find((c) => c.time === lastSell.time);
      const sellPrice = sellBar ? sellBar.close : last.close;
      const current = last.close;

      const recovered =
        ma5 != null && ma10 != null && ma20 != null &&
        current > ma5 && current > ma10 && current > ma20;
      if (!(recovered && current > sellPrice)) continue;

      rows.push({
        code: s.code,
        name: s.name,
        strategy: "ma_cross",
        strategy_label: "均線賣出",
        sell_date: lastSell.time,
        days_since_sell: Math.round((Date.now() - new Date(lastSell.time).getTime()) / 86400000),
        sell_price: r2(sellPrice),
        current_price: r2(current),
        gain_since_sell_pct: sellPrice ? r2(((current - sellPrice) / sellPrice) * 100) : 0,
        ma5: ma5 != null ? r2(ma5) : null,
        ma10: ma10 != null ? r2(ma10) : null,
        ma20: ma20 != null ? r2(ma20) : null,
        sell_reason: "跌破 MA20 出場",
      });
    } catch {
      /* skip */
    }
  }

  rows.sort((a, b) => b.gain_since_sell_pct - a.gain_since_sell_pct);
  return { ok: true, as_of: asOf, count: rows.length, scanned, rows };
}

router.get("/sold_too_early", async (req, res) => {
  const days = Math.min(Number(req.query.days ?? 30) || 30, 120);
  try {
    res.json(await cached(`sold_too_early:${days}`, 60 * 10, () => computeSoldTooEarly(days)));
  } catch {
    res.json({ ok: true, as_of: "", count: 0, scanned: 0, rows: [] });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 策略時間鎖 (min-hold overrides) — /min_hold_overrides
// Operator-configurable minimum holding days per strategy. In-memory store
// (resets on restart). Keys mirror the frontend CARD_VISIBILITY_LIST.
// ──────────────────────────────────────────────────────────────────────────

const MIN_HOLD_DEFAULTS: Record<string, number> = {
  quad_buy: 10,
  loose: 10,
  peg_buy: 20,
  big_holder_low_base: 20,
  etf_added_resonance: 10,
  margin_burst_g7: 5,
  short: 3,
  aggr: 3,
  aggr_plus: 3,
  dip: 5,
  longterm: 60,
};
const minHoldOverrides = new Map<string, number>();

router.get("/min_hold_overrides", (_req, res) => {
  const items = Object.keys(MIN_HOLD_DEFAULTS).map((key) => {
    const override = minHoldOverrides.has(key) ? (minHoldOverrides.get(key) as number) : null;
    return {
      key,
      default: MIN_HOLD_DEFAULTS[key],
      override,
      effective: override ?? MIN_HOLD_DEFAULTS[key],
    };
  });
  res.json({ ok: true, items });
});

router.post(
  "/min_hold_overrides",
  rateLimit({ windowMs: 60_000, max: 10, key: "min_hold" }),
  (req, res) => {
    if (!operatorOk(req.body?.password)) {
      res.status(403).json({ ok: false, need_password: true, error: "密碼錯誤" });
      return;
    }
    const overrides = req.body?.overrides;
    if (overrides && typeof overrides === "object") {
      for (const [key, val] of Object.entries(overrides as Record<string, unknown>)) {
        if (!(key in MIN_HOLD_DEFAULTS)) continue;
        if (val === null || val === "" || val === undefined) {
          minHoldOverrides.delete(key);
        } else {
          const n = Number(val);
          if (Number.isFinite(n) && n >= 0 && n <= 240) minHoldOverrides.set(key, Math.round(n));
          else minHoldOverrides.delete(key);
        }
      }
    }
    const out: Record<string, number> = {};
    for (const [k, v] of minHoldOverrides) out[k] = v;
    res.json({ status: "ok", overrides: out });
  },
);

// ──────────────────────────────────────────────────────────────────────────
// 大戶買超低基期 (big holder low base) — GET /big_holder_low_base
//
// REAL data sources:
//  • 大戶持股集中度: TDCC 集保股權分散表 (getOD.ashx?id=1-5). Each row =
//    資料日期,證券代號,持股分級(1..17),人數,股數,占集保庫存數比例%.
//    Levels 12–15 ≈ 400張以上 → "大戶比例" (h400); level 15 = 1,000,001股以上
//    → "千張大戶" (h1000). TDCC only publishes the latest weekly snapshot, so
//    rise/change (h400_up/h1000_up) is computed across snapshots seen over the
//    process lifetime (null until a second distinct 資料日期 is observed).
//  • 低基期 + 漲幅: Yahoo daily candles (收盤距 1 年低點 ≤15%).
//  • 投信20日: TWSE T86 三大法人, summed over ~20 trading days (張).
// ──────────────────────────────────────────────────────────────────────────

const BH_UA = { "User-Agent": "Mozilla/5.0 (compatible; donttalk/1.0)" };
const BH_TTL = 43200; // 12h

interface BHHit {
  code: string;
  name: string;
  price: number;
  past20d_gain_pct: number;
  h400_up: boolean;
  h400_change: number | null;
  h1000_up: boolean;
  h1000_change: number | null;
  trust_net_lots_20d: number;
  paths: string[];
}

interface BHResponse {
  ok: boolean;
  hits: BHHit[];
  scanned: number;
  date: string;
  updated_at: string;
  is_limited: boolean;
  note: string;
}

// Module-level history of TDCC big-holder ratios per code, used to derive
// rise/change across distinct weekly snapshots (resets on restart).
const tdccHistory = new Map<string, { date: string; h400: number; h1000: number }[]>();

function fmtRocOrYmd(ymd: string): string {
  const s = ymd.trim();
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

function bhBusinessDays(n: number): Date[] {
  const out: Date[] = [];
  const d = new Date();
  while (out.length < n + 6) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) out.push(new Date(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

function bhYmd(d: Date): string {
  return (
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0")
  );
}

/** Fetch + parse the TDCC 集保股權分散表 (latest weekly snapshot). */
async function fetchTdccBigHolder(): Promise<{
  date: string;
  byCode: Map<string, { h400: number; h1000: number }>;
}> {
  const res = await fetch("https://opendata.tdcc.com.tw/getOD.ashx?id=1-5", {
    headers: BH_UA,
  });
  if (!res.ok) throw new Error(`tdcc http ${res.status}`);
  const text = await res.text();
  const lines = text.split("\n");
  const byCode = new Map<string, { h400: number; h1000: number }>();
  let date = "";
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const p = line.split(",");
    if (p.length < 6) continue;
    if (!date) date = (p[0] ?? "").trim();
    const code = (p[1] ?? "").trim();
    const level = Number((p[2] ?? "").trim());
    const ratio = Number((p[5] ?? "").trim().replace(/,/g, ""));
    if (!code || !Number.isFinite(level) || !Number.isFinite(ratio)) continue;
    let e = byCode.get(code);
    if (!e) {
      e = { h400: 0, h1000: 0 };
      byCode.set(code, e);
    }
    if (level >= 12 && level <= 15) e.h400 += ratio;
    if (level === 15) e.h1000 += ratio;
  }
  if (byCode.size === 0) throw new Error("tdcc empty");
  return { date, byCode };
}

/** Sum 投信 net (張) over ~20 trading days for the given watchlist codes. */
async function fetchTrust20d(codes: Set<string>): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const dates = bhBusinessDays(20);
  let collected = 0;
  for (const d of dates) {
    if (collected >= 20) break;
    const date = bhYmd(d);
    try {
      const url = `https://www.twse.com.tw/rwd/zh/fund/T86?date=${date}&selectType=ALLBUT0999&response=json`;
      const res = await fetch(url, { headers: BH_UA });
      const j = (await res.json()) as { stat?: string; data?: string[][] };
      if (j.stat !== "OK" || !Array.isArray(j.data)) continue;
      collected++;
      for (const row of j.data) {
        const code = (row[0] ?? "").trim();
        if (!code || !codes.has(code)) continue;
        const net = Number(String(row[10] ?? "").replace(/,/g, ""));
        if (!Number.isFinite(net)) continue;
        map.set(code, (map.get(code) ?? 0) + Math.round(net / 1000));
      }
    } catch {
      /* skip day */
    }
  }
  return map;
}

function bhHonestLimited(note: string): BHResponse {
  return {
    ok: true,
    hits: [],
    scanned: 0,
    date: new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString(),
    is_limited: true,
    note,
  };
}

async function computeBigHolderLowBase(): Promise<BHResponse> {
  const updatedAt = new Date().toISOString();
  let tdcc: { date: string; byCode: Map<string, { h400: number; h1000: number }> };
  try {
    tdcc = await cached("tdcc_1_5", BH_TTL, fetchTdccBigHolder);
  } catch {
    return bhHonestLimited("集保股權分散（TDCC）資料來源讀取失敗，暫無法計算");
  }

  // Record this snapshot into history (only when a new 資料日期 appears).
  for (const [code, v] of tdcc.byCode) {
    const arr = tdccHistory.get(code) ?? [];
    if (!arr.length || arr[arr.length - 1].date !== tdcc.date) {
      arr.push({ date: tdcc.date, h400: v.h400, h1000: v.h1000 });
      if (arr.length > 6) arr.shift();
      tdccHistory.set(code, arr);
    }
  }

  const list = await getWatchlist();
  const scope = list.slice(0, 50);
  const codeSet = new Set(scope.map((s) => s.code));

  let trustMap = new Map<string, number>();
  try {
    trustMap = await fetchTrust20d(codeSet);
  } catch {
    /* trust optional */
  }

  const hits: BHHit[] = [];
  let scanned = 0;

  for (const s of scope) {
    const bh = tdcc.byCode.get(s.code);
    if (!bh) continue;
    try {
      const candles = await fetchCandles(s.ticker, 300);
      if (candles.length < 30) continue;
      scanned++;
      const last = candles[candles.length - 1];
      const close = last.close;
      const year = candles.slice(-250);
      const low1y = Math.min(...year.map((c) => c.low));
      // 低基期：收盤距 52 週低點 ≤25%（一般選股對「低基期」的合理區間）。
      const lowBase = low1y > 0 && close <= low1y * 1.25;
      const gain20 = gainPct(candles, 20);

      const hist = tdccHistory.get(s.code) ?? [];
      let h400Change: number | null = null;
      let h1000Change: number | null = null;
      if (hist.length >= 2) {
        const prev = hist[hist.length - 2];
        const cur = hist[hist.length - 1];
        if (prev.h400 > 0) h400Change = r2(cur.h400 - prev.h400);
        if (prev.h1000 > 0) h1000Change = r2(cur.h1000 - prev.h1000);
      }
      const h400Up = h400Change != null && h400Change > 0;
      const h1000Up = h1000Change != null && h1000Change > 0;
      const trust = trustMap.get(s.code) ?? 0;

      const paths: string[] = [];
      if (lowBase) paths.push("低基期");
      if (bh.h400 >= 40) paths.push("大戶集中");
      if (bh.h1000 >= 25) paths.push("千張大戶");
      if (h400Up || h1000Up) paths.push("大戶上升");
      if (trust > 0) paths.push("投信買超");

      // Hit = 低基期 AND at least one big-holder / institutional signal.
      if (!lowBase || paths.length < 2) continue;

      hits.push({
        code: s.code,
        name: s.name,
        price: close,
        past20d_gain_pct: r2(gain20),
        h400_up: h400Up,
        h400_change: h400Change,
        h1000_up: h1000Up,
        h1000_change: h1000Change,
        trust_net_lots_20d: trust,
        paths,
      });
    } catch {
      /* skip */
    }
  }

  hits.sort((a, b) => a.past20d_gain_pct - b.past20d_gain_pct);

  return {
    ok: true,
    hits,
    scanned,
    date: fmtRocOrYmd(tdcc.date),
    updated_at: updatedAt,
    is_limited: false,
    note: "",
  };
}

router.get(
  "/big_holder_low_base",
  rateLimit({ windowMs: 60_000, max: 20, key: "big_holder_get" }),
  async (req, res) => {
    const refresh = req.query.refresh === "1";
    try {
      if (refresh) {
        const data = await computeBigHolderLowBase();
        cacheSet("big_holder_low_base", data, BH_TTL);
        res.json(data);
        return;
      }
      res.json(await cached("big_holder_low_base", BH_TTL, computeBigHolderLowBase));
    } catch {
      res.json(bhHonestLimited("大戶低基期掃描失敗，暫無法計算"));
    }
  },
);

export default router;

import { Router, type IRouter } from "express";
import { fetchCandles, resolveTicker, type Candle } from "../lib/yahoo";
import {
  INDUSTRY_GROUPS,
  NAME_BY_CODE,
  TICKER_BY_CODE,
} from "../lib/seed-data";
import { rateLimit } from "../lib/ratelimit";

const router: IRouter = Router();
const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

function operatorOk(password: unknown): boolean {
  const expected = process.env["STOCK_OPERATOR_PASSWORD"];
  // Closed by default: privileged actions disabled until an operator secret
  // is configured (per project threat model — no open mode).
  if (!expected) return false;
  return typeof password === "string" && password === expected;
}

// ---- name / code helpers -----------------------------------------------
const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(NAME_BY_CODE).map(([code, name]) => [name, code]),
);

function industryOf(code: string): string {
  for (const g of INDUSTRY_GROUPS) {
    if (g.codes.includes(code)) return g.label;
  }
  return "ETF / 其他";
}

// resolved-ticker memo (resets on restart) to avoid repeat yahoo probing
const tickerCache = new Map<string, string>();
async function tickerFor(code: string): Promise<string | null> {
  if (TICKER_BY_CODE[code]) return TICKER_BY_CODE[code];
  const cached = tickerCache.get(code);
  if (cached) return cached;
  const t = await resolveTicker(code);
  if (t) tickerCache.set(code, t);
  return t;
}

// ---- series alignment --------------------------------------------------
interface Series {
  code: string;
  name: string;
  industry: string;
  isCash: boolean;
  closeByDate: Map<string, number>;
}

function candlesToMap(candles: Candle[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of candles) m.set(c.time, c.close);
  return m;
}

function daysFor(startDate: string | null, base: number): number {
  if (!startDate) return base;
  const ms = Date.now() - new Date(startDate).getTime();
  if (isNaN(ms)) return base;
  const d = Math.ceil(ms / 86400000) + 320;
  return Math.min(3200, Math.max(base, d));
}

/** Intersection of dates across all non-cash series, sorted ascending. */
function commonDates(series: Series[]): string[] {
  const nonCash = series.filter((s) => !s.isCash);
  if (nonCash.length === 0) return [];
  let common: string[] = [...nonCash[0].closeByDate.keys()];
  for (let i = 1; i < nonCash.length; i++) {
    const set = nonCash[i].closeByDate;
    common = common.filter((d) => set.has(d));
  }
  common.sort();
  return common;
}

function priceAt(s: Series, date: string): number {
  if (s.isCash) return 1;
  return s.closeByDate.get(date) ?? 0;
}

// ---- math helpers ------------------------------------------------------
function dailyReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    out.push(prev ? values[i] / prev - 1 : 0);
  }
  return out;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const ma = a.slice(0, n).reduce((x, y) => x + y, 0) / n;
  const mb = b.slice(0, n).reduce((x, y) => x + y, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

// ---- request parsing ---------------------------------------------------
interface ReqItem {
  code: string;
  weight: number | null;
}

function parseItems(raw: unknown): ReqItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ReqItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    let code = typeof o["code"] === "string" ? (o["code"] as string).trim() : "";
    if (!code) continue;
    // allow entering a stock name instead of a code
    if (NAME_TO_CODE[code]) code = NAME_TO_CODE[code];
    const w = o["weight"];
    const weight =
      typeof w === "number" && isFinite(w) ? w : w == null ? null : Number(w);
    out.push({ code, weight: weight != null && isFinite(weight) ? weight : null });
  }
  return out;
}

/** Normalize raw weights (null => equal share) into fractions summing to 1. */
function normalizeWeights(items: ReqItem[]): number[] {
  const raw = items.map((i) => (i.weight != null && i.weight > 0 ? i.weight : 1));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) return items.map(() => 1 / items.length);
  return raw.map((w) => w / sum);
}

// ---- simulations -------------------------------------------------------
function buyHoldCurve(
  prices: number[][],
  weights: number[],
  amount: number,
): number[] {
  const n = prices[0]?.length ?? 0;
  const shares = weights.map((w, i) => {
    const p0 = prices[i][0];
    return p0 ? (amount * w) / p0 : 0;
  });
  const out: number[] = [];
  for (let t = 0; t < n; t++) {
    let v = 0;
    for (let i = 0; i < prices.length; i++) v += shares[i] * prices[i][t];
    out.push(v);
  }
  return out;
}

function rebalanceCurve(
  prices: number[][],
  weights: number[],
  amount: number,
  thresholdPct: number,
): { curve: number[]; count: number } {
  const n = prices[0]?.length ?? 0;
  let shares = weights.map((w, i) => {
    const p0 = prices[i][0];
    return p0 ? (amount * w) / p0 : 0;
  });
  const curve: number[] = [];
  let count = 0;
  for (let t = 0; t < n; t++) {
    let total = 0;
    for (let i = 0; i < prices.length; i++) total += shares[i] * prices[i][t];
    if (t > 0 && total > 0) {
      let breached = false;
      for (let i = 0; i < prices.length; i++) {
        const w = (shares[i] * prices[i][t]) / total;
        if (Math.abs(w - weights[i]) * 100 > thresholdPct) {
          breached = true;
          break;
        }
      }
      if (breached) {
        shares = weights.map((w, i) =>
          prices[i][t] ? (total * w) / prices[i][t] : 0,
        );
        count++;
      }
    }
    curve.push(total);
  }
  return { curve, count };
}

// =======================================================================
// POST /rebalance  — custom basket / macro multi-threshold simulation
// =======================================================================
router.post(
  "/rebalance",
  rateLimit({ windowMs: 60_000, max: 10, key: "rebalance" }),
  async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const items = parseItems(body["items"]);
    if (items.length < 2) {
      res.json({ ok: false, error: "請至少輸入 2 檔標的" });
      return;
    }
    const amount =
      typeof body["amount"] === "number" && body["amount"] > 0
        ? (body["amount"] as number)
        : 1000000;
    const startDate =
      typeof body["start_date"] === "string" && body["start_date"]
        ? (body["start_date"] as string)
        : null;
    let thresholds = Array.isArray(body["thresholds"])
      ? (body["thresholds"] as unknown[])
          .map((t) => Number(t))
          .filter((t) => isFinite(t) && t > 0)
      : [];
    thresholds = [...new Set(thresholds)].sort((a, b) => a - b);
    if (thresholds.length === 0) thresholds = [10, 20, 30];

    const days = daysFor(startDate, 1400);
    const weights = normalizeWeights(items);

    // build series
    const series: Series[] = [];
    for (const it of items) {
      if (it.code.toUpperCase() === "CASH") {
        series.push({
          code: "CASH",
          name: "現金",
          industry: "現金",
          isCash: true,
          closeByDate: new Map(),
        });
        continue;
      }
      const ticker = await tickerFor(it.code);
      if (!ticker) {
        res.json({ ok: false, error: `無法解析代號：${it.code}` });
        return;
      }
      const candles = await fetchCandles(ticker, days);
      if (candles.length < 5) {
        res.json({ ok: false, error: `資料不足：${it.code}` });
        return;
      }
      series.push({
        code: it.code,
        name: NAME_BY_CODE[it.code] || it.code,
        industry: industryOf(it.code),
        isCash: false,
        closeByDate: candlesToMap(candles),
      });
    }

    let dates = commonDates(series);
    if (startDate) dates = dates.filter((d) => d >= startDate);
    if (dates.length < 10) {
      res.json({ ok: false, error: "可取得的共同交易日不足，請調整起始日或標的" });
      return;
    }

    // price matrix [asset][date]
    const prices = series.map((s) => dates.map((d) => priceAt(s, d)));

    const buyhold = buyHoldCurve(prices, weights, amount);
    const buyholdReturn = ((buyhold[buyhold.length - 1] - amount) / amount) * 100;

    // per-holding stats from buy-hold final snapshot
    const finalTotal = buyhold[buyhold.length - 1];
    const holdings = series.map((s, i) => {
      const p0 = prices[i][0];
      const pl = prices[i][prices[i].length - 1];
      const shares = p0 ? (amount * weights[i]) / p0 : 0;
      const curValue = shares * pl;
      const curWeight = finalTotal ? (curValue / finalTotal) * 100 : 0;
      const tgtWeight = weights[i] * 100;
      const drift = curWeight - tgtWeight;
      const periodReturn = p0 ? (pl / p0 - 1) * 100 : 0;
      const vol = s.isCash
        ? null
        : r1(stdev(dailyReturns(prices[i])) * Math.sqrt(252) * 100);
      const tgtValue = (finalTotal * tgtWeight) / 100;
      const delta = tgtValue - curValue;
      let action = "持平";
      if (pl > 0 && Math.abs(delta) >= pl) action = delta > 0 ? "買入" : "賣出";
      const actionUnits = pl > 0 ? Math.round(Math.abs(delta) / pl) : 0;
      return {
        code: s.code,
        name: s.name,
        industry: s.industry,
        target_weight: r2(tgtWeight),
        current_weight: r2(curWeight),
        drift: r2(drift),
        period_return: r2(periodReturn),
        volatility: vol,
        last_close: r2(pl),
        action,
        action_amount: Math.round(Math.abs(delta)),
        action_units: actionUnits,
      };
    });

    const maxDrift = holdings.reduce(
      (m, h) => Math.max(m, Math.abs(h.drift)),
      0,
    );

    // average pairwise correlation (non-cash only)
    const retSeries = series
      .map((s, i) => ({ s, r: dailyReturns(prices[i]) }))
      .filter((x) => !x.s.isCash);
    let avgCorr: number | null = null;
    if (retSeries.length >= 2) {
      const corrs: number[] = [];
      for (let i = 0; i < retSeries.length; i++) {
        for (let j = i + 1; j < retSeries.length; j++) {
          const c = pearson(retSeries[i].r, retSeries[j].r);
          if (c != null) corrs.push(c);
        }
      }
      if (corrs.length) avgCorr = r2(corrs.reduce((a, b) => a + b, 0) / corrs.length);
    }

    // per-threshold blocks
    const blocks = thresholds.map((th) => {
      const { curve, count } = rebalanceCurve(prices, weights, amount, th);
      const rebalancedReturn = ((curve[curve.length - 1] - amount) / amount) * 100;
      return {
        threshold_pct: th,
        rebalanced_return: r2(rebalancedReturn),
        diff_pp: r2(rebalancedReturn - buyholdReturn),
        rebalance_count: count,
        need_rebalance: maxDrift >= th,
        curve: {
          dates,
          buyhold: buyhold.map((v) => Math.round(v)),
          rebalanced: curve.map((v) => Math.round(v)),
        },
      };
    });

    // guardrails (honest, computed)
    const guardrails: { level: string; title: string; text: string }[] = [];
    const dominant = holdings.reduce((a, b) =>
      b.target_weight > a.target_weight ? b : a,
    );
    if (dominant.target_weight >= 50) {
      guardrails.push({
        level: "warn",
        title: "單一標的權重偏高",
        text: `${dominant.name}（${dominant.code}）目標權重達 ${dominant.target_weight.toFixed(
          1,
        )}%，再平衡時可能持續賣出強勢股、削弱長期報酬。`,
      });
    }
    if (avgCorr != null && avgCorr >= 0.8) {
      guardrails.push({
        level: "info",
        title: "成分高度相關",
        text: `平均相關係數 ${avgCorr.toFixed(
          2,
        )}，籃子內標的走勢相近，分散與再平衡效果有限。`,
      });
    }
    const bestBlock = blocks.reduce((a, b) => (b.diff_pp > a.diff_pp ? b : a));
    if (bestBlock.diff_pp < 0) {
      guardrails.push({
        level: "danger",
        title: "再平衡反而吃虧",
        text: "各門檻的「再平衡 − 買持」皆為負，此籃子用再平衡會降低總報酬，多半因有單一大贏家被持續賣出。",
      });
    } else if (maxDrift >= (thresholds[0] ?? 10)) {
      guardrails.push({
        level: "good",
        title: "目前偏離已達門檻",
        text: `目前最大偏離 ${maxDrift.toFixed(
          1,
        )} pp，已觸及最低門檻，可考慮依建議調節回目標權重。`,
      });
    } else {
      guardrails.push({
        level: "good",
        title: "偏離仍在容忍範圍",
        text: `目前最大偏離 ${maxDrift.toFixed(1)} pp，未達門檻，暫不需動作。`,
      });
    }

    res.json({
      ok: true,
      start_date: dates[0],
      end_date: dates[dates.length - 1],
      trading_days: dates.length,
      amount,
      buyhold_return: r2(buyholdReturn),
      max_drift: r2(maxDrift),
      avg_correlation: avgCorr,
      thresholds: blocks,
      holdings,
      guardrails,
    });
  } catch (e) {
    res.json({ ok: false, error: `計算失敗：${(e as Error).message}` });
  }
  },
);

// =======================================================================
// POST /rebalance/dynamic — 台股 ETF 動態再平衡（MA200 牛熊切換）
// =======================================================================
const GROWTH_SET = new Set(["00881", "00891", "00757"]);
const DEFENSIVE_SET = new Set(["00713", "00635U", "00719B"]);
const BENCH_CODE = "0050";
const BENCH_TICKER = "0050.TW";
const MA_WINDOW = 200;
const BULL_TARGET = 55;
const BEAR_TARGET = 60;

interface DynTargets {
  cashPct: number;
  etf: Map<string, number>; // code -> percent of total (sum = 100 - cashPct)
}

function dynTargets(
  regime: "bull" | "bear",
  codes: string[],
  base: Map<string, number>, // normalized base weight (%) summing to 100
): DynTargets {
  const etf = new Map<string, number>();
  for (const c of codes) etf.set(c, 0);
  if (regime === "bull") {
    const cashPct = 10;
    const growth = codes.filter((c) => GROWTH_SET.has(c));
    const nonGrowth = codes.filter(
      (c) => !GROWTH_SET.has(c) && c !== "00719B",
    );
    const baseGrowth = growth.reduce((a, c) => a + (base.get(c) ?? 0), 0);
    for (const c of growth) {
      etf.set(
        c,
        baseGrowth > 0
          ? (BULL_TARGET * (base.get(c) ?? 0)) / baseGrowth
          : BULL_TARGET / growth.length,
      );
    }
    const nonBudget = 90 - BULL_TARGET; // 35
    const baseNon = nonGrowth.reduce((a, c) => a + (base.get(c) ?? 0), 0);
    for (const c of nonGrowth) {
      etf.set(
        c,
        baseNon > 0
          ? (nonBudget * (base.get(c) ?? 0)) / baseNon
          : nonBudget / nonGrowth.length,
      );
    }
    return { cashPct, etf };
  }
  // bear
  const cashPct = 40;
  const defensive = codes.filter((c) => DEFENSIVE_SET.has(c));
  const each = defensive.length ? BEAR_TARGET / defensive.length : 0;
  for (const c of defensive) etf.set(c, each);
  return { cashPct, etf };
}

function ma200ByDate(candles: Candle[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < candles.length; i++) {
    if (i + 1 < MA_WINDOW) continue;
    let sum = 0;
    for (let k = i - MA_WINDOW + 1; k <= i; k++) sum += candles[k].close;
    out.set(candles[i].time, sum / MA_WINDOW);
  }
  return out;
}

router.post(
  "/rebalance/dynamic",
  rateLimit({ windowMs: 60_000, max: 10, key: "rebalance_dyn" }),
  async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const items = parseItems(body["items"]);
    if (items.length < 2) {
      res.json({ ok: false, error: "請至少輸入 2 檔標的" });
      return;
    }
    const amount =
      typeof body["amount"] === "number" && body["amount"] > 0
        ? (body["amount"] as number)
        : 1000000;
    const startDate =
      typeof body["start_date"] === "string" && body["start_date"]
        ? (body["start_date"] as string)
        : null;

    // base normalized weights (%) for the supplied ETFs (00719B base = 0)
    const fracs = normalizeWeights(items);
    const base = new Map<string, number>();
    items.forEach((it, i) => base.set(it.code, fracs[i] * 100));

    // asset universe: supplied codes + 00719B (bear defensive)
    const codes = items.map((i) => i.code);
    if (!codes.includes("00719B")) {
      codes.push("00719B");
      base.set("00719B", 0);
    }

    const days = daysFor(startDate, 2600);

    const series: Series[] = [];
    for (const code of codes) {
      const ticker = await tickerFor(code);
      if (!ticker) {
        res.json({ ok: false, error: `無法解析代號：${code}` });
        return;
      }
      const candles = await fetchCandles(ticker, days);
      if (candles.length < 5) {
        res.json({ ok: false, error: `資料不足：${code}` });
        return;
      }
      series.push({
        code,
        name: NAME_BY_CODE[code] || code,
        industry: industryOf(code),
        isCash: false,
        closeByDate: candlesToMap(candles),
      });
    }

    // benchmark 0050 full history for MA200 + benchmark curve
    const benchCandles = await fetchCandles(BENCH_TICKER, days);
    if (benchCandles.length < MA_WINDOW + 5) {
      res.json({ ok: false, error: "0050 歷史資料不足，無法計算 MA200" });
      return;
    }
    const benchClose = candlesToMap(benchCandles);
    const benchMa = ma200ByDate(benchCandles);

    let dates = commonDates(series).filter((d) => benchClose.has(d));
    if (startDate) dates = dates.filter((d) => d >= startDate);
    if (dates.length < 30) {
      res.json({ ok: false, error: "可取得的共同交易日不足" });
      return;
    }

    const prices = series.map((s) => dates.map((d) => priceAt(s, d)));
    const benchSeries = dates.map((d) => benchClose.get(d) ?? 0);

    const regimeFn = (date: string): "bull" | "bear" => {
      const close = benchClose.get(date);
      const ma = benchMa.get(date);
      if (close == null || ma == null) return "bull";
      return close >= ma ? "bull" : "bear";
    };

    // month-end indices within range
    const monthEnd: boolean[] = dates.map((d, i) => {
      if (i === dates.length - 1) return true;
      return d.slice(0, 7) !== dates[i + 1].slice(0, 7);
    });

    // ---- dynamic simulation -------------------------------------------
    let regime = regimeFn(dates[0]);
    let targets = dynTargets(regime, codes, base);
    const allocate = (total: number, t: number, tg: DynTargets) => {
      const sh = series.map((s, i) => {
        const pr = prices[i][t];
        const w = tg.etf.get(s.code) ?? 0;
        return pr ? (total * w) / 100 / pr : 0;
      });
      const cash = (total * tg.cashPct) / 100;
      return { sh, cash };
    };
    let { sh: shares, cash } = allocate(amount, 0, targets);

    const dynCurve: number[] = [];
    const segments: { regime: "bull" | "bear"; start: string; end: string }[] = [];
    let segStart = dates[0];
    let nSwitch = 0;

    for (let t = 0; t < dates.length; t++) {
      if (t > 0 && monthEnd[t]) {
        const r = regimeFn(dates[t]);
        if (r !== regime) {
          // current total before switching
          let total = cash;
          for (let i = 0; i < series.length; i++) total += shares[i] * prices[i][t];
          segments.push({ regime, start: segStart, end: dates[t] });
          segStart = dates[t];
          regime = r;
          targets = dynTargets(regime, codes, base);
          const re = allocate(total, t, targets);
          shares = re.sh;
          cash = re.cash;
          nSwitch++;
        }
      }
      let v = cash;
      for (let i = 0; i < series.length; i++) v += shares[i] * prices[i][t];
      dynCurve.push(v);
    }
    segments.push({ regime, start: segStart, end: dates[dates.length - 1] });

    const dynEnd = dynCurve[dynCurve.length - 1];
    const dynReturn = ((dynEnd - amount) / amount) * 100;

    // ---- static buy-hold (base weights, 0% cash) ----------------------
    const baseFrac = series.map((s) => (base.get(s.code) ?? 0) / 100);
    const staticCurve = buyHoldCurve(prices, baseFrac, amount);
    const staticReturn = ((staticCurve[staticCurve.length - 1] - amount) / amount) * 100;

    // ---- 0050 benchmark buy-hold --------------------------------------
    const b0 = benchSeries[0];
    const benchCurve = benchSeries.map((p) => (b0 ? (amount * p) / b0 : 0));
    const benchReturn = ((benchCurve[benchCurve.length - 1] - amount) / amount) * 100;

    // ---- current snapshot ---------------------------------------------
    const lastIdx = dates.length - 1;
    const currentTotal = dynEnd;
    const cashCurPct = currentTotal ? (cash / currentTotal) * 100 : 0;
    const cashTgtPct = targets.cashPct;
    const cashTgtValue = (currentTotal * cashTgtPct) / 100;
    const cashDelta = cashTgtValue - cash;
    let cashAction = "持平";
    if (Math.abs(cashDelta) >= 1) cashAction = cashDelta > 0 ? "增加現金" : "減少現金";

    const holdings = series.map((s, i) => {
      const p0 = prices[i][0];
      const pl = prices[i][lastIdx];
      const curValue = shares[i] * pl;
      const curWeight = currentTotal ? (curValue / currentTotal) * 100 : 0;
      const tgtWeight = targets.etf.get(s.code) ?? 0;
      const drift = curWeight - tgtWeight;
      const periodReturn = p0 ? (pl / p0 - 1) * 100 : 0;
      const tgtValue = (currentTotal * tgtWeight) / 100;
      const delta = tgtValue - curValue;
      let action = "持平";
      if (pl > 0 && Math.abs(delta) >= pl) action = delta > 0 ? "買入" : "賣出";
      const actionUnits = pl > 0 ? Math.round(Math.abs(delta) / pl) : 0;
      return {
        code: s.code,
        name: s.name,
        last_close: r2(pl),
        base_weight: r2(base.get(s.code) ?? 0),
        target_weight: r2(tgtWeight),
        current_weight: r2(curWeight),
        drift: r2(drift),
        period_return: r2(periodReturn),
        action,
        action_amount: Math.round(Math.abs(delta)),
        action_units: actionUnits,
      };
    });

    const sigClose = benchClose.get(dates[lastIdx]) ?? null;
    const sigMa = benchMa.get(dates[lastIdx]) ?? null;

    res.json({
      ok: true,
      start_date: dates[0],
      end_date: dates[lastIdx],
      trading_days: dates.length,
      amount,
      ma_window: MA_WINDOW,
      current_regime: regime,
      current_regime_label: regime === "bull" ? "牛市" : "熊市",
      signal_close: sigClose != null ? r2(sigClose) : null,
      signal_ma: sigMa != null ? r2(sigMa) : null,
      dynamic_return: r2(dynReturn),
      static_return: r2(staticReturn),
      benchmark_return: r2(benchReturn),
      dynamic_vs_static_pp: r2(dynReturn - staticReturn),
      dynamic_vs_benchmark_pp: r2(dynReturn - benchReturn),
      n_switch: nSwitch,
      bull_target: BULL_TARGET,
      bear_target: BEAR_TARGET,
      cash_target_pct: cashTgtPct,
      cash_current_pct: r2(cashCurPct),
      cash_action: cashAction,
      cash_action_amount: Math.round(Math.abs(cashDelta)),
      current_total: Math.round(currentTotal),
      bench_code: BENCH_CODE,
      holdings,
      curve: {
        dates,
        dynamic: dynCurve.map((v) => Math.round(v)),
        static: staticCurve.map((v) => Math.round(v)),
        benchmark: benchCurve.map((v) => Math.round(v)),
      },
      regime_segments: segments,
    });
  } catch (e) {
    res.json({ ok: false, error: `計算失敗：${(e as Error).message}` });
  }
  },
);

// =======================================================================
// /rebalance/groups — industry grouping config (in-memory, seeded)
// NOTE: in-memory store; resets on server restart.
// =======================================================================
interface GroupEntry {
  label: string;
  codes: { code: string; name: string }[];
}

const groupStore: GroupEntry[] = INDUSTRY_GROUPS.map((g) => ({
  label: g.label,
  codes: g.codes.map((c) => ({ code: c, name: NAME_BY_CODE[c] || c })),
}));

function groupsPayload() {
  return {
    ok: true,
    groups: groupStore.map((g) => ({
      label: g.label,
      count: g.codes.length,
      codes: g.codes,
    })),
  };
}

router.get("/rebalance/groups", (_req, res) => {
  res.json(groupsPayload());
});

// Operator-gated CRUD for custom groups (in-memory). Rate-limited.
router.post(
  "/rebalance/groups",
  rateLimit({ windowMs: 60_000, max: 10, key: "rebalance_groups" }),
  (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!operatorOk(body["password"])) {
      res.status(403).json({ ok: false, error: "需要操作者權限" });
      return;
    }
    const remove = typeof body["remove"] === "string" ? (body["remove"] as string) : null;
    if (remove) {
      const idx = groupStore.findIndex((g) => g.label === remove);
      if (idx >= 0) groupStore.splice(idx, 1);
      res.json(groupsPayload());
      return;
    }
    const label = typeof body["label"] === "string" ? (body["label"] as string).trim() : "";
    const rawCodes = Array.isArray(body["codes"]) ? (body["codes"] as unknown[]) : [];
    const codes = rawCodes
      .map((c) => (typeof c === "string" ? c.trim() : ""))
      .filter(Boolean)
      .map((c) => ({ code: c, name: NAME_BY_CODE[c] || c }));
    if (!label || codes.length === 0) {
      res.json({ ok: false, error: "需要 label 與至少一個代號" });
      return;
    }
    const existing = groupStore.find((g) => g.label === label);
    if (existing) existing.codes = codes;
    else groupStore.push({ label, codes });
    res.json(groupsPayload());
  },
);

export default router;

import { Router, type IRouter, type Request } from "express";
import { fetchCandles, type Candle } from "../lib/yahoo";
import {
  sma,
  computeMacd,
  computeFib,
  computeSupport,
  computeTradePlan,
  type TradePlan,
} from "../lib/indicators";
import { getWatchlist } from "../lib/stocks";
import { cached } from "../lib/cache";
import { rateLimit } from "../lib/ratelimit";

const router: IRouter = Router();
const r2 = (n: number) => Math.round(n * 100) / 100;

// Closed-by-default operator gate: privileged writes are disabled until the
// STOCK_OPERATOR_PASSWORD secret is configured (mirrors routes/stock.ts).
function operatorOk(password: unknown): boolean {
  const expected = process.env["STOCK_OPERATOR_PASSWORD"];
  if (!expected) return false;
  return typeof password === "string" && password === expected;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function nowStr(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

function lastN<T>(arr: T[], n: number): T[] {
  return arr.slice(Math.max(0, arr.length - n));
}

function emaSeries(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values.length ? values[0] : 0;
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

// ════════════════════════════════════════════════════════════════
// signal_filter (個股訊號篩選)
// ════════════════════════════════════════════════════════════════
interface SignalResult {
  code: string;
  name: string;
  date: string;
  close: number;
  has_chase: boolean;
  has_chase_high_vol: boolean;
  has_dip20: boolean;
  has_dip60: boolean;
  has_dip240: boolean;
  has_support: boolean;
  has_consol: boolean;
  has_allin: boolean;
  has_fib: boolean;
  fib_signals: string[];
  has_macd_div_buy: boolean;
  has_both_buy_today: boolean;
  has_both_buy_2d: boolean;
  has_aggr_plus: boolean;
  has_sell: boolean;
  has_consol_sell: boolean;
  has_surge_sell: boolean;
  has_vol_div_sell: boolean;
  has_fib_sell: boolean;
  has_fib_sell_half: boolean;
  has_fib_sell_all: boolean;
  has_equal_range_sell: boolean;
  has_peg_bias_sell: boolean;
  has_inst_sell_margin_rise: boolean;
  has_break_confirm_sell: boolean;
  has_etf_kicked_sell: boolean;
  break_confirm_levels: number[];
  sell_min_hold: Record<string, unknown>;
  financial_score: number | null;
  analyst_upside: number | null;
  analyst_num: number | null;
  combined_score: number | null;
  pe_ratio: number | null;
  peg_ratio: number | null;
  peg_label: string | null;
  peg_color: string | null;
  eps_growth: number | null;
  inst_foreign_today: number | null;
  inst_trust_today: number | null;
  inst_foreign_5d: number | null;
  inst_trust_5d: number | null;
  holder: Record<string, unknown> | null;
  margin_burst: Record<string, unknown> | null;
  margin_decrease_2d: boolean;
  price_dip: boolean;
  price_change_1m: number | null;
  monthly_revenue_rating: Record<string, unknown> | null;
  quad_pass: boolean;
  buy_signals: string[];
  trade_plan: TradePlan | null;
  position_meta: {
    gap_60d_high_pct: number | null;
    gain_20d_pct: number | null;
    dev_240ma_pct: number | null;
  };
}

function buildSignalItem(code: string, name: string, candles: Candle[]): SignalResult {
  const closes = candles.map((c) => c.close);
  const n = candles.length;
  const last = candles[n - 1];
  const prev = candles[n - 2];
  const close = last.close;

  const a5 = sma(closes, 5);
  const a10 = sma(closes, 10);
  const a20 = sma(closes, 20);
  const a60 = sma(closes, 60);
  const a240 = sma(closes, 240);
  const ma5 = a5[n - 1];
  const ma10 = a10[n - 1];
  const ma20 = a20[n - 1];
  const ma60 = a60[n - 1];
  const ma240 = a240[n - 1];

  const aboveTri =
    ma5 != null && ma10 != null && ma20 != null && close > ma5 && close > ma10 && close > ma20;
  const prevAboveTri =
    a5[n - 2] != null &&
    a10[n - 2] != null &&
    a20[n - 2] != null &&
    prev.close > (a5[n - 2] as number) &&
    prev.close > (a10[n - 2] as number) &&
    prev.close > (a20[n - 2] as number);
  const uptrend = ma20 != null && ma60 != null && ma20 > ma60;

  const last20 = lastN(candles, 20);
  const avgVol20 = last20.reduce((s, c) => s + c.volume, 0) / (last20.length || 1);
  const volSurge = last.volume > avgVol20 * 1.5;

  const has_chase = aboveTri && !prevAboveTri;
  const has_chase_high_vol = has_chase && volSurge;
  const has_dip20 = uptrend && ma20 != null && last.low <= ma20 && close > ma20;
  const has_dip60 = uptrend && ma60 != null && last.low <= ma60 && close > ma60;
  const has_dip240 = ma240 != null && last.low <= ma240 && close > ma240;

  const support = computeSupport(candles);
  const has_support = close > support && (close - support) / support <= 0.03;

  const hi20 = Math.max(...last20.map((c) => c.high));
  const lo20 = Math.min(...last20.map((c) => c.low));
  const range20 = lo20 > 0 ? (hi20 - lo20) / lo20 : 1;
  const has_consol = range20 <= 0.12 && close >= hi20 * 0.99;

  const has_allin = aboveTri && ma5 != null && ma10 != null && ma20 != null && ma5 > ma10 && ma10 > ma20;

  const fib = computeFib(candles);
  const fibLevels: [string, number][] = [
    ["0.382", fib.fib382],
    ["0.5", fib.fib500],
    ["0.618", fib.fib618],
  ];
  const fib_signals = volSurge
    ? fibLevels.filter(([, p]) => Math.abs(close - p) / close <= 0.02).map(([l]) => l)
    : [];
  const has_fib = fib_signals.length > 0;

  const macd = computeMacd(candles);
  const recentTimes = lastN(candles, 6).map((c) => c.time);
  const has_macd_div_buy = macd.divergences.some(
    (d) => d.type === "bullish" && recentTimes.includes(d.time),
  );
  const has_macd_div_sell = macd.divergences.some(
    (d) => d.type === "bearish" && recentTimes.includes(d.time),
  );

  const has_sell = ma20 != null && a20[n - 2] != null && close < ma20 && prev.close >= (a20[n - 2] as number);

  const buy_signals: string[] = [];
  if (has_chase) buy_signals.push("chase");
  if (has_dip20) buy_signals.push("dip20");
  if (has_dip60) buy_signals.push("dip60");
  if (has_dip240) buy_signals.push("dip240");
  if (has_support) buy_signals.push("support");
  if (has_consol) buy_signals.push("consol");
  if (has_allin) buy_signals.push("allin");
  if (has_fib) buy_signals.push("fib");

  let trade_plan: TradePlan | null = null;
  if (buy_signals.length > 0) {
    trade_plan = computeTradePlan(
      candles,
      {
        ma5: ma5 ?? NaN,
        ma10: ma10 ?? NaN,
        ma20: ma20 ?? NaN,
        ma60: ma60 ?? NaN,
        ma240: ma240 ?? NaN,
      },
      support,
      fib,
    );
  }

  const high60 = Math.max(...lastN(candles, 60).map((c) => c.high));
  const close20ago = n > 21 ? closes[n - 21] : null;
  const position_meta = {
    gap_60d_high_pct: close > 0 ? r2(((high60 - close) / close) * 100) : null,
    gain_20d_pct: close20ago && close20ago > 0 ? r2(((close - close20ago) / close20ago) * 100) : null,
    dev_240ma_pct: ma240 != null && ma240 > 0 ? r2(((close - ma240) / ma240) * 100) : null,
  };

  return {
    code,
    name,
    date: last.time,
    close,
    has_chase,
    has_chase_high_vol,
    has_dip20,
    has_dip60,
    has_dip240,
    has_support,
    has_consol,
    has_allin,
    has_fib,
    fib_signals,
    has_macd_div_buy,
    has_both_buy_today: false,
    has_both_buy_2d: false,
    has_aggr_plus: false,
    has_sell,
    has_consol_sell: false,
    has_surge_sell: false,
    has_vol_div_sell: false,
    has_fib_sell: false,
    has_fib_sell_half: false,
    has_fib_sell_all: false,
    has_equal_range_sell: false,
    has_peg_bias_sell: false,
    has_inst_sell_margin_rise: false,
    has_break_confirm_sell: false,
    has_etf_kicked_sell: false,
    break_confirm_levels: [],
    sell_min_hold: {},
    financial_score: null,
    analyst_upside: null,
    analyst_num: null,
    combined_score: null,
    pe_ratio: null,
    peg_ratio: null,
    peg_label: null,
    peg_color: null,
    eps_growth: null,
    inst_foreign_today: null,
    inst_trust_today: null,
    inst_foreign_5d: null,
    inst_trust_5d: null,
    holder: null,
    margin_burst: null,
    margin_decrease_2d: false,
    price_dip: position_meta.gain_20d_pct != null && position_meta.gain_20d_pct < 0,
    price_change_1m: position_meta.gain_20d_pct,
    monthly_revenue_rating: null,
    quad_pass: false,
    buy_signals,
    trade_plan,
    position_meta,
  };
}

// ════════════════════════════════════════════════════════════════
// etf_signal_filter / stock_damo_filter (共用結構)
// ════════════════════════════════════════════════════════════════
interface EtfResult {
  code: string;
  name: string;
  date: string;
  close: number;
  has_short_buy: boolean;
  has_chan_to_bull: boolean;
  has_year_break_buy: boolean;
  has_consol_buy: boolean;
  has_dip_ma60_buy: boolean;
  has_dip_ma240_buy: boolean;
  has_ma60_touch_buy: boolean;
  has_consol_sell: boolean;
  has_macd_div_sell: boolean;
  has_bear_gate_sell: boolean;
  has_fib: boolean;
  fib_signals: string[];
  has_vcp: boolean;
  vcp_breakout: boolean;
  vcp_quality: number | null;
  has_foreign_buy_2d: boolean;
  inst_foreign_today: number | null;
  inst_foreign_prev: number | null;
  inst_foreign_5d: number | null;
  inst_trust_5d: number | null;
  ema10: number | null;
  ema20: number | null;
  buy_signals: string[];
  trade_plan: TradePlan | null;
  monthly_revenue_rating: Record<string, unknown> | null;
  holder: Record<string, unknown> | null;
  peg: Record<string, unknown> | null;
}

function buildEtfItem(code: string, name: string, candles: Candle[]): EtfResult {
  const closes = candles.map((c) => c.close);
  const n = candles.length;
  const last = candles[n - 1];
  const close = last.close;

  const a5 = sma(closes, 5);
  const a10 = sma(closes, 10);
  const a20 = sma(closes, 20);
  const a60 = sma(closes, 60);
  const a240 = sma(closes, 240);
  const ma5 = a5[n - 1];
  const ma10 = a10[n - 1];
  const ma20 = a20[n - 1];
  const ma60 = a60[n - 1];
  const ma240 = a240[n - 1];

  const e10 = emaSeries(closes, 10);
  const e20 = emaSeries(closes, 20);
  const ema10 = e10.length ? r2(e10[e10.length - 1]) : null;
  const ema20 = e20.length ? r2(e20[e20.length - 1]) : null;

  const uptrend = ma20 != null && ma60 != null && ma20 > ma60;

  const has_short_buy = ma5 != null && ma10 != null && close > ma5 && ma5 > ma10;
  const has_chan_to_bull =
    ma20 != null &&
    ma60 != null &&
    a20[n - 2] != null &&
    a60[n - 2] != null &&
    ma20 > ma60 &&
    (a20[n - 2] as number) <= (a60[n - 2] as number);
  const has_year_break_buy = ma240 != null && close <= ma240 * 0.75;

  const last20 = lastN(candles, 20);
  const hi20 = Math.max(...last20.map((c) => c.high));
  const lo20 = Math.min(...last20.map((c) => c.low));
  const range20pct = lo20 > 0 ? (hi20 - lo20) / lo20 : 1;
  const has_consol_buy = range20pct <= 0.12 && close >= hi20 * 0.99;

  const has_dip_ma60_buy = uptrend && ma60 != null && last.low <= ma60 && close > ma60;
  const has_dip_ma240_buy = ma240 != null && last.low <= ma240 && close > ma240;
  const has_ma60_touch_buy = ma60 != null && Math.abs(close - ma60) / ma60 <= 0.02;

  const has_bear_gate_sell = ma20 != null && ma60 != null && ma20 < ma60 && close < ma60;

  const macd = computeMacd(candles);
  const recentTimes = lastN(candles, 6).map((c) => c.time);
  const has_macd_div_sell = macd.divergences.some(
    (d) => d.type === "bearish" && recentTimes.includes(d.time),
  );

  const avgVol20 = last20.reduce((s, c) => s + c.volume, 0) / (last20.length || 1);
  const volSurge = last.volume > avgVol20 * 1.5;
  const fib = computeFib(candles);
  const fibLevels: [string, number][] = [
    ["0.382", fib.fib382],
    ["0.5", fib.fib500],
    ["0.618", fib.fib618],
  ];
  const fib_signals = volSurge
    ? fibLevels.filter(([, p]) => Math.abs(close - p) / close <= 0.02).map(([l]) => l)
    : [];
  const has_fib = fib_signals.length > 0;

  const last10 = lastN(candles, 10);
  const hi10 = Math.max(...last10.map((c) => c.high));
  const lo10 = Math.min(...last10.map((c) => c.low));
  const range10 = lo10 > 0 ? (hi10 - lo10) / lo10 : 1;
  const pivot = Math.max(...lastN(candles, 50).map((c) => c.high));
  const contracting = range20pct > 0 && range10 < range20pct * 0.7;
  const nearPivot = close <= pivot && (pivot - close) / close <= 0.05;
  const has_vcp = contracting && nearPivot;
  const vcp_breakout = has_vcp && close >= pivot * 0.995;
  const vcp_quality = has_vcp ? Math.max(0, Math.round((1 - range10 / range20pct) * 100)) : null;

  const buy_signals: string[] = [];
  if (has_short_buy) buy_signals.push("short_buy");
  if (has_chan_to_bull) buy_signals.push("chan_to_bull");
  if (has_year_break_buy) buy_signals.push("year_break_buy");
  if (has_consol_buy) buy_signals.push("consol_buy");
  if (has_dip_ma60_buy) buy_signals.push("dip_ma60");
  if (has_dip_ma240_buy) buy_signals.push("dip_ma240");
  if (has_ma60_touch_buy) buy_signals.push("ma60_touch");

  let trade_plan: TradePlan | null = null;
  if (buy_signals.length > 0) {
    const support = computeSupport(candles);
    trade_plan = computeTradePlan(
      candles,
      {
        ma5: ma5 ?? NaN,
        ma10: ma10 ?? NaN,
        ma20: ma20 ?? NaN,
        ma60: ma60 ?? NaN,
        ma240: ma240 ?? NaN,
      },
      support,
      fib,
    );
  }

  return {
    code,
    name,
    date: last.time,
    close,
    has_short_buy,
    has_chan_to_bull,
    has_year_break_buy,
    has_consol_buy,
    has_dip_ma60_buy,
    has_dip_ma240_buy,
    has_ma60_touch_buy,
    has_consol_sell: false,
    has_macd_div_sell,
    has_bear_gate_sell,
    has_fib,
    fib_signals,
    has_vcp,
    vcp_breakout,
    vcp_quality,
    has_foreign_buy_2d: false,
    inst_foreign_today: null,
    inst_foreign_prev: null,
    inst_foreign_5d: null,
    inst_trust_5d: null,
    ema10,
    ema20,
    buy_signals,
    trade_plan,
    monthly_revenue_rating: null,
    holder: null,
    peg: null,
  };
}

// ETF universe (popular Taiwan ETFs — fetched live from Yahoo).
const ETF_UNIVERSE: { code: string; name: string; ticker: string }[] = [
  { code: "0050", name: "元大台灣50", ticker: "0050.TW" },
  { code: "0056", name: "元大高股息", ticker: "0056.TW" },
  { code: "006208", name: "富邦台50", ticker: "006208.TW" },
  { code: "00878", name: "國泰永續高股息", ticker: "00878.TW" },
  { code: "00919", name: "群益台灣精選高息", ticker: "00919.TW" },
  { code: "00929", name: "復華台灣科技優息", ticker: "00929.TW" },
  { code: "00713", name: "元大台灣高息低波", ticker: "00713.TW" },
  { code: "00692", name: "富邦公司治理", ticker: "00692.TW" },
  { code: "00701", name: "國泰股利精選30", ticker: "00701.TW" },
  { code: "00850", name: "元大臺灣ESG永續", ticker: "00850.TW" },
  { code: "00757", name: "統一FANG+", ticker: "00757.TW" },
  { code: "00935", name: "野村臺灣新科技50", ticker: "00935.TW" },
  { code: "00940", name: "元大台灣價值高息", ticker: "00940.TW" },
  { code: "00939", name: "統一台灣高息動能", ticker: "00939.TW" },
  { code: "00679B", name: "元大美債20年", ticker: "00679B.TW" },
];

// ════════════════════════════════════════════════════════════════
// Scan state (in-memory; resets on restart)
// ════════════════════════════════════════════════════════════════
type Family = "signal" | "etf" | "damo";
const SCAN_TTL = 600;
const scanVersion: Record<Family, number> = { signal: 0, etf: 0, damo: 0 };
const scanMeta: Record<Family, { count: number; updated_at: string; ready: boolean }> = {
  signal: { count: 0, updated_at: "", ready: false },
  etf: { count: 0, updated_at: "", ready: false },
  damo: { count: 0, updated_at: "", ready: false },
};
const scanning: Record<Family, boolean> = { signal: false, etf: false, damo: false };

async function computeSignalScan(): Promise<{ results: SignalResult[]; scan_date: string; updated_at: string }> {
  const list = await getWatchlist();
  const results: SignalResult[] = [];
  for (const s of list.slice(0, 40)) {
    try {
      const candles = await fetchCandles(s.ticker, 400);
      if (candles.length < 60) continue;
      results.push(buildSignalItem(s.code, s.name, candles));
    } catch {
      /* skip unreachable / illiquid symbols */
    }
  }
  const updated_at = nowStr();
  scanMeta.signal = { count: results.length, updated_at, ready: true };
  const scan_date = results.length ? results[0].date : todayStr();
  return { results, scan_date, updated_at };
}

async function computeEtfScan(family: "etf" | "damo"): Promise<{
  results: EtfResult[];
  updated_at: string;
}> {
  let universe: { code: string; name: string; ticker: string }[];
  if (family === "etf") {
    universe = ETF_UNIVERSE;
  } else {
    const list = await getWatchlist();
    universe = list.slice(0, 40).map((s) => ({ code: s.code, name: s.name, ticker: s.ticker }));
  }
  const results: EtfResult[] = [];
  for (const s of universe) {
    try {
      const candles = await fetchCandles(s.ticker, 400);
      if (candles.length < 60) continue;
      results.push(buildEtfItem(s.code, s.name, candles));
    } catch {
      /* skip */
    }
  }
  const updated_at = nowStr();
  scanMeta[family] = { count: results.length, updated_at, ready: true };
  return { results, updated_at };
}

function signalScan() {
  return cached(`signal_scan_v${scanVersion.signal}`, SCAN_TTL, computeSignalScan);
}
function etfScan(family: "etf" | "damo") {
  return cached(`${family}_scan_v${scanVersion[family]}`, SCAN_TTL, () => computeEtfScan(family));
}

function isOn(req: Request, key: string): boolean {
  return req.query[key] === "1";
}

function signalMatches(req: Request, r: SignalResult): boolean {
  if (isOn(req, "all")) return true;
  const buyKeys: [string, keyof SignalResult][] = [
    ["chase", "has_chase"],
    ["dip20", "has_dip20"],
    ["dip60", "has_dip60"],
    ["dip240", "has_dip240"],
    ["support", "has_support"],
    ["consol", "has_consol"],
    ["allin", "has_allin"],
    ["fib", "has_fib"],
    ["macd_div_buy", "has_macd_div_buy"],
  ];
  const sellKeys: [string, keyof SignalResult][] = [
    ["sell", "has_sell"],
    ["consol_sell", "has_consol_sell"],
    ["surge_sell", "has_surge_sell"],
    ["vol_div_sell", "has_vol_div_sell"],
    ["fib_sell", "has_fib_sell"],
    ["inst_sell_margin_rise", "has_inst_sell_margin_rise"],
    ["peg_bias_sell", "has_peg_bias_sell"],
    ["equal_range_sell", "has_equal_range_sell"],
  ];
  const selBuy = buyKeys.filter(([k]) => isOn(req, k));
  const selSell = sellKeys.filter(([k]) => isOn(req, k));
  if (selBuy.length === 0 && selSell.length === 0) return true;
  const buyMatch = selBuy.some(([, f]) => Boolean(r[f]));
  const sellMatch = selSell.some(([, f]) => Boolean(r[f]));
  return buyMatch || sellMatch;
}

function etfMatches(req: Request, r: EtfResult): boolean {
  const buyKeys: [string, keyof EtfResult][] = [
    ["short_buy", "has_short_buy"],
    ["chan_to_bull", "has_chan_to_bull"],
    ["year_break_buy", "has_year_break_buy"],
    ["consol_buy", "has_consol_buy"],
    ["dip_ma60", "has_dip_ma60_buy"],
    ["dip_ma240", "has_dip_ma240_buy"],
    ["ma60_touch", "has_ma60_touch_buy"],
  ];
  const sellKeys: [string, keyof EtfResult][] = [
    ["consol_sell", "has_consol_sell"],
    ["macd_div_sell", "has_macd_div_sell"],
    ["bear_gate_sell", "has_bear_gate_sell"],
  ];
  const selBuy = buyKeys.filter(([k]) => isOn(req, k));
  const selSell = sellKeys.filter(([k]) => isOn(req, k));
  const anyCategory = selBuy.length > 0 || selSell.length > 0;
  if (anyCategory) {
    const buyMatch = selBuy.some(([, f]) => Boolean(r[f]));
    const sellMatch = selSell.some(([, f]) => Boolean(r[f]));
    if (!buyMatch && !sellMatch) return false;
  }
  // Additional confirmations are AND filters.
  if (isOn(req, "fib") && !r.has_fib) return false;
  if (isOn(req, "vcp") && !r.has_vcp) return false;
  // No real institutional feed yet → these confirmations exclude honestly.
  if (isOn(req, "foreign_buy_today") && !((r.inst_foreign_today ?? 0) > 0)) return false;
  if (isOn(req, "foreign_buy_2d") && !r.has_foreign_buy_2d) return false;
  return true;
}

// ───── signal_filter routes ─────
router.get("/signal_filter", async (req, res) => {
  try {
    const scan = await signalScan();
    const results = scan.results.filter((r) => signalMatches(req, r));
    res.json({
      results,
      filtered: results.length,
      total: scan.results.length,
      updated_at: scan.updated_at,
      cache_hit: true,
      futures_warning: null,
      taiex_break_warning: null,
      scan_date: scan.scan_date,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "scan failed" });
  }
});

router.post(
  "/signal_filter/refresh",
  rateLimit({ windowMs: 5 * 60_000, max: 3, key: "sig_refresh" }),
  (req, res) => {
  // Expensive watchlist fan-out → operator-gated (closed by default) + rate-limited per threat model.
  if (!operatorOk(req.body?.password)) {
    res.status(403).json({ ok: false, need_password: true, error: "密碼錯誤" });
    return;
  }
  scanVersion.signal += 1;
  scanMeta.signal.ready = false;
  scanning.signal = true;
  void (async () => {
    try {
      await signalScan();
    } finally {
      scanning.signal = false;
    }
  })();
  res.json({ message: "個股訊號重新掃描已啟動" });
  },
);

router.get("/signal_filter/status", (_req, res) => {
  res.json({
    ready: !scanning.signal && scanMeta.signal.ready,
    count: scanMeta.signal.count,
    updated_at: scanMeta.signal.updated_at,
  });
});

router.get("/signal_filter/all_strategy_hits", async (_req, res) => {
  try {
    const scan = await signalScan();
    const cards: [string, keyof SignalResult][] = [
      ["追買", "has_chase"],
      ["抄底月", "has_dip20"],
      ["抄底季", "has_dip60"],
      ["抄底年", "has_dip240"],
      ["支撐買", "has_support"],
      ["盤整買", "has_consol"],
      ["All In", "has_allin"],
      ["Fib爆量", "has_fib"],
    ];
    const groups: Record<string, string[]> = {};
    const allSet = new Set<string>();
    for (const [label, field] of cards) {
      const codes = scan.results.filter((r) => Boolean(r[field])).map((r) => r.code);
      groups[label] = codes;
      for (const c of codes) allSet.add(c);
    }
    res.json({ ok: true, not_ready: false, all_codes: Array.from(allSet), groups });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "scan failed" });
  }
});

// ───── etf_signal_filter / stock_damo_filter routes ─────
function makeEtfRoutes(family: "etf" | "damo", base: string) {
  router.get(base, async (req, res) => {
    if (scanning[family]) {
      res.json({
        results: [],
        filtered: 0,
        total: 0,
        updated_at: scanMeta[family].updated_at,
        cache_hit: false,
        scanning: true,
      });
      return;
    }
    try {
      const scan = await etfScan(family);
      const results = scan.results.filter((r) => etfMatches(req, r));
      res.json({
        results,
        filtered: results.length,
        total: scan.results.length,
        updated_at: scan.updated_at,
        cache_hit: true,
        scanning: false,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "scan failed" });
    }
  });

  router.post(
    `${base}/refresh`,
    rateLimit({ windowMs: 5 * 60_000, max: 3, key: `${family}_refresh` }),
    (req, res) => {
    // Expensive watchlist fan-out → operator-gated (closed by default) + rate-limited per threat model.
    if (!operatorOk(req.body?.password)) {
      res.status(403).json({ ok: false, need_password: true, error: "密碼錯誤" });
      return;
    }
    scanVersion[family] += 1;
    scanMeta[family].ready = false;
    scanning[family] = true;
    void (async () => {
      try {
        await etfScan(family);
      } finally {
        scanning[family] = false;
      }
    })();
    res.json({ message: (family === "etf" ? "ETF" : "DAMO") + " 重新掃描已啟動" });
    },
  );

  router.get(`${base}/status`, (_req, res) => {
    res.json({
      ready: !scanning[family] && scanMeta[family].ready,
      count: scanMeta[family].count,
      updated_at: scanMeta[family].updated_at,
    });
  });
}
makeEtfRoutes("etf", "/etf_signal_filter");
makeEtfRoutes("damo", "/stock_damo_filter");

// ════════════════════════════════════════════════════════════════
// disabled_strategies (operator-gated card visibility)
// ════════════════════════════════════════════════════════════════
let disabledStrategies: string[] = [];

router.get("/disabled_strategies", (_req, res) => {
  res.json({ disabled: disabledStrategies });
});

router.post("/disabled_strategies", (req, res) => {
  if (!operatorOk(req.body?.password)) {
    res.status(403).json({ status: "error", message: "密碼錯誤" });
    return;
  }
  const incoming = req.body?.disabled;
  if (!Array.isArray(incoming)) {
    res.status(400).json({ status: "error", message: "disabled 欄位格式錯誤" });
    return;
  }
  disabledStrategies = incoming.map((x: unknown) => String(x));
  res.json({ status: "ok", disabled: disabledStrategies });
});

// ════════════════════════════════════════════════════════════════
// signal_history (in-memory; resets on restart)
// ════════════════════════════════════════════════════════════════
interface ShRecord {
  strategy: string;
  scan_date: string;
  code: string;
  name: string;
  close: number | null;
}
const signalHistory: ShRecord[] = [];

const STRATEGY_LABELS: Record<string, string> = {
  loose: "寬鬆買點",
  peg_buy: "PEG 低估買點",
  quad_buy: "四維共振買",
  margin_burst_g7: "融資爆量 G7",
  short: "短線買",
  aggr: "積極買",
  aggr_plus: "積極買+",
  dip: "逢低買",
  longterm: "長線買",
  etf_short_buy: "ETF 短線買",
  etf_chan_to_bull: "ETF 通道轉多",
  etf_year_break_buy: "ETF 年線-25%全買",
  etf_consol_buy: "ETF 盤整買",
  etf_dip_ma60: "ETF 季線抄底",
  etf_dip_ma240: "ETF 年線抄底",
  etf_ma60_touch: "ETF 季線觸碰買",
  etf_vcp_watch: "ETF 預備發動觀察(VCP爆量)",
  damo_short_buy: "DAMO 短線買",
  damo_chan_to_bull: "DAMO 通道轉多",
  damo_year_break_buy: "DAMO 年線-25%全買",
  damo_consol_buy: "DAMO 盤整買",
  damo_dip_ma60: "DAMO 季線抄底",
  damo_dip_ma240: "DAMO 年線抄底",
  damo_ma60_touch: "DAMO 季線觸碰買",
  damo_vcp_watch: "DAMO 預備發動觀察(VCP爆量)",
};

function familyOf(strategy: string): Family | "stock" {
  if (strategy.startsWith("etf_")) return "etf";
  if (strategy.startsWith("damo_")) return "damo";
  return "stock";
}

router.get("/signal_history", (req, res) => {
  const family = typeof req.query["family"] === "string" ? req.query["family"] : "";
  const excludeFamily =
    typeof req.query["exclude_family"] === "string" ? req.query["exclude_family"] : "";
  const strategy = typeof req.query["strategy"] === "string" ? req.query["strategy"] : "";
  const from = typeof req.query["from"] === "string" ? req.query["from"] : "";
  const to = typeof req.query["to"] === "string" ? req.query["to"] : "";
  const days = (() => {
    const d = parseInt(String(req.query["days"] ?? ""), 10);
    return Number.isFinite(d) && d > 0 ? d : 0;
  })();

  let rows = signalHistory.slice();
  if (family) rows = rows.filter((r) => familyOf(r.strategy) === family);
  if (excludeFamily) rows = rows.filter((r) => familyOf(r.strategy) !== excludeFamily);
  if (strategy) rows = rows.filter((r) => r.strategy === strategy);
  if (from) rows = rows.filter((r) => r.scan_date >= from);
  if (to) rows = rows.filter((r) => r.scan_date <= to);
  if (days > 0) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    rows = rows.filter((r) => r.scan_date >= cutoff);
  }

  const outRows = rows.map((r) => ({
    strategy: r.strategy,
    label: STRATEGY_LABELS[r.strategy] || r.strategy,
    scan_date: r.scan_date,
    code: r.code,
    name: r.name,
    signal_close: r.close,
    sell_date: null,
    sell_price: null,
    sell_return: null,
    sell_hold_days: null,
    current_price: null,
    return_pct: null,
    hold_days: null,
    reason: null,
    status: "pending",
  }));

  const byStrat = new Map<string, number>();
  for (const r of rows) byStrat.set(r.strategy, (byStrat.get(r.strategy) || 0) + 1);
  const stats = Array.from(byStrat.entries()).map(([strat, count]) => ({
    strategy: strat,
    label: STRATEGY_LABELS[strat] || strat,
    n: count,
    n_evaluated: 0,
    n_pending: count,
    n_realized: 0,
    n_unrealized: 0,
    win_rate: null,
    avg_return: null,
    best: null,
    worst: null,
  }));

  const strategy_labels: Record<string, string> = {};
  for (const r of rows) strategy_labels[r.strategy] = STRATEGY_LABELS[r.strategy] || r.strategy;

  res.json({ ok: true, stats, rows: outRows, strategy_labels });
});

router.post(
  "/signal_history/record",
  rateLimit({ windowMs: 60_000, max: 30, key: "sig_hist_record" }),
  (req, res) => {
    const strategy = typeof req.body?.strategy === "string" ? req.body.strategy : "";
    const scan_date =
      typeof req.body?.scan_date === "string" && req.body.scan_date
        ? req.body.scan_date
        : todayStr();
    const hits = Array.isArray(req.body?.hits) ? req.body.hits : [];
    if (!strategy) {
      res.status(400).json({ ok: false, error: "strategy 必填" });
      return;
    }
    let inserted = 0;
    for (const h of hits) {
      const code = h && h.code != null ? String(h.code) : "";
      if (!code) continue;
      const exists = signalHistory.some(
        (r) => r.strategy === strategy && r.scan_date === scan_date && r.code === code,
      );
      if (exists) continue;
      const closeVal =
        h.close != null && Number.isFinite(Number(h.close)) ? Number(h.close) : null;
      signalHistory.push({
        strategy,
        scan_date,
        code,
        name: h.name != null ? String(h.name) : "",
        close: closeVal,
      });
      inserted += 1;
    }
    res.json({ ok: true, inserted });
  },
);

export default router;

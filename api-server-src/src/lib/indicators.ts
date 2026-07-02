import type { Candle } from "./yahoo";

export interface Point {
  time: string;
  value: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function maSeries(candles: Candle[], period: number): Point[] {
  const closes = candles.map((c) => c.close);
  const m = sma(closes, period);
  const out: Point[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (m[i] != null) out.push({ time: candles[i].time, value: r2(m[i] as number) });
  }
  return out;
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export interface Macd {
  macd_line: Point[];
  signal_line: Point[];
  histogram: Point[];
  divergences: {
    time: string;
    type: "bullish" | "bearish";
    label: string;
    price: number;
    macd_val: number;
  }[];
}

export function computeMacd(candles: Candle[]): Macd {
  const closes = candles.map((c) => c.close);
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const macdLine = closes.map((_, i) => e12[i] - e26[i]);
  const signal = ema(macdLine, 9);
  const hist = macdLine.map((v, i) => v - signal[i]);

  const macd_line: Point[] = [];
  const signal_line: Point[] = [];
  const histogram: Point[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < 26) continue;
    macd_line.push({ time: candles[i].time, value: r2(macdLine[i]) });
    signal_line.push({ time: candles[i].time, value: r2(signal[i]) });
    histogram.push({ time: candles[i].time, value: r2(hist[i]) });
  }

  // Divergence detection on swing pivots (window 5).
  const divergences: Macd["divergences"] = [];
  const piv = (arr: number[], i: number, hi: boolean, w = 5) => {
    for (let j = Math.max(0, i - w); j <= Math.min(arr.length - 1, i + w); j++) {
      if (j === i) continue;
      if (hi && arr[j] > arr[i]) return false;
      if (!hi && arr[j] < arr[i]) return false;
    }
    return true;
  };
  const highIdx: number[] = [];
  const lowIdx: number[] = [];
  for (let i = 26; i < candles.length; i++) {
    if (piv(candles.map((c) => c.high), i, true)) highIdx.push(i);
    if (piv(candles.map((c) => c.low), i, false)) lowIdx.push(i);
  }
  for (let k = 1; k < highIdx.length; k++) {
    const a = highIdx[k - 1];
    const b = highIdx[k];
    if (candles[b].high > candles[a].high && macdLine[b] < macdLine[a]) {
      divergences.push({
        time: candles[b].time,
        type: "bearish",
        label: "頂背離",
        price: r2(candles[b].high),
        macd_val: r2(macdLine[b]),
      });
    }
  }
  for (let k = 1; k < lowIdx.length; k++) {
    const a = lowIdx[k - 1];
    const b = lowIdx[k];
    if (candles[b].low < candles[a].low && macdLine[b] > macdLine[a]) {
      divergences.push({
        time: candles[b].time,
        type: "bullish",
        label: "底背離",
        price: r2(candles[b].low),
        macd_val: r2(macdLine[b]),
      });
    }
  }
  return { macd_line, signal_line, histogram, divergences };
}

export function computeRsi(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 50;
  let gain = 0;
  let loss = 0;
  const n = candles.length;
  for (let i = n - period; i < n; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  const avgGain = gain / period;
  const avgLoss = loss / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return r2(100 - 100 / (1 + rs));
}

export interface Fib {
  high: number;
  low: number;
  delta: number;
  fib382: number;
  fib500: number;
  fib618: number;
  window: number;
}

export function computeFib(candles: Candle[], window = 90): Fib {
  const slice = candles.slice(-window);
  const high = Math.max(...slice.map((c) => c.high));
  const low = Math.min(...slice.map((c) => c.low));
  const delta = high - low;
  return {
    high: r2(high),
    low: r2(low),
    delta: r2(delta),
    fib382: r2(high - delta * 0.382),
    fib500: r2(high - delta * 0.5),
    fib618: r2(high - delta * 0.618),
    window,
  };
}

/** Recent swing low below current price → flat horizontal support. */
export function computeSupport(candles: Candle[]): number {
  const n = candles.length;
  const close = candles[n - 1].close;
  const lookback = candles.slice(-120);
  const lows: number[] = [];
  for (let i = 2; i < lookback.length - 2; i++) {
    const l = lookback[i].low;
    if (
      l < lookback[i - 1].low &&
      l < lookback[i - 2].low &&
      l < lookback[i + 1].low &&
      l < lookback[i + 2].low &&
      l < close
    ) {
      lows.push(l);
    }
  }
  if (lows.length) return r2(Math.max(...lows));
  return r2(Math.min(...lookback.map((c) => c.low)));
}

export interface Trade {
  buyDate: string;
  buyPrice: number;
  buyType: string;
  sellDate: string | null;
  sellPrice: number | null;
  returnPct: number | null;
  holdDays: number;
}

export interface MarkerOut {
  time: string;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown";
  text: string;
}

const TYPE_KEY: Record<string, string> = {
  追買: "chase",
  逢低買20MA: "dip20",
  逢低買60MA: "dip60",
  支撐買: "support",
  盤整突破: "consol",
};

export interface StrategyResult {
  markers: MarkerOut[];
  trades: Trade[];
  performance: {
    summary: {
      totalTrades: number;
      closedTrades: number;
      openTrades: number;
      winRate: number;
      avgReturn: number;
      avgWin: number;
      avgLoss: number;
      profitLossRatio: number;
      cumulativeReturn: number;
      bestTrade: number;
      worstTrade: number;
      avgHoldDays: number;
      byType: Record<string, { count: number; winRate: number; avgReturn: number }>;
    };
    trades: Trade[];
  };
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

/** MA-based "均線買賣訊號" strategy + backtest. */
export function runStrategy(candles: Candle[]): StrategyResult {
  const closes = candles.map((c) => c.close);
  const ma5 = sma(closes, 5);
  const ma10 = sma(closes, 10);
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);

  const markers: MarkerOut[] = [];
  const trades: Trade[] = [];
  let open: Trade | null = null;

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const m5 = ma5[i];
    const m10 = ma10[i];
    const m20 = ma20[i];
    const m60 = ma60[i];
    const pm20 = ma20[i - 1];
    if (m5 == null || m10 == null || m20 == null) continue;

    const aboveTri = c.close > m5 && c.close > m10 && c.close > m20;
    const prevAboveTri =
      candles[i - 1].close > (ma5[i - 1] ?? Infinity) &&
      candles[i - 1].close > (ma10[i - 1] ?? Infinity) &&
      candles[i - 1].close > (pm20 ?? Infinity);
    const uptrend = m60 != null && m20 > m60;

    if (!open) {
      let buyType: string | null = null;
      if (aboveTri && !prevAboveTri) {
        buyType = "追買";
      } else if (uptrend && c.low <= m20 && c.close > m20) {
        buyType = "逢低買20MA";
      } else if (uptrend && m60 != null && c.low <= m60 && c.close > m60) {
        buyType = "逢低買60MA";
      }
      if (buyType) {
        open = {
          buyDate: c.time,
          buyPrice: c.close,
          buyType,
          sellDate: null,
          sellPrice: null,
          returnPct: null,
          holdDays: 0,
        };
        markers.push({
          time: c.time,
          position: "belowBar",
          color: "#00e676",
          shape: "arrowUp",
          text: buyType.startsWith("逢低") ? "逢低買" : buyType,
        });
      }
    } else {
      const brokeDown = c.close < m20 && candles[i - 1].close >= (pm20 ?? 0);
      if (brokeDown) {
        const ret = ((c.close - open.buyPrice) / open.buyPrice) * 100;
        open.sellDate = c.time;
        open.sellPrice = c.close;
        open.returnPct = r2(ret);
        open.holdDays = daysBetween(open.buyDate, c.time);
        trades.push(open);
        markers.push({
          time: c.time,
          position: "aboveBar",
          color: "#ff1744",
          shape: "arrowDown",
          text: "賣出",
        });
        open = null;
      }
    }
  }

  const closed = trades.filter((t) => t.returnPct != null);
  const wins = closed.filter((t) => (t.returnPct as number) > 0);
  const losses = closed.filter((t) => (t.returnPct as number) <= 0);
  const avg = (arr: number[]) =>
    arr.length ? r2(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  const avgWin = avg(wins.map((t) => t.returnPct as number));
  const avgLoss = avg(losses.map((t) => t.returnPct as number));
  let cumulative = 1;
  for (const t of closed) cumulative *= 1 + (t.returnPct as number) / 100;

  const byType: Record<string, { count: number; winRate: number; avgReturn: number }> = {
    chase: { count: 0, winRate: 0, avgReturn: 0 },
    consol: { count: 0, winRate: 0, avgReturn: 0 },
    dip20: { count: 0, winRate: 0, avgReturn: 0 },
    dip60: { count: 0, winRate: 0, avgReturn: 0 },
    support: { count: 0, winRate: 0, avgReturn: 0 },
  };
  for (const key of Object.keys(byType)) {
    const group = closed.filter((t) => TYPE_KEY[t.buyType] === key);
    if (group.length) {
      byType[key] = {
        count: group.length,
        winRate: Math.round(
          (group.filter((t) => (t.returnPct as number) > 0).length / group.length) * 100,
        ),
        avgReturn: avg(group.map((t) => t.returnPct as number)),
      };
    }
  }

  const allTrades = open ? [...trades, open] : trades;
  return {
    markers,
    trades: allTrades,
    performance: {
      summary: {
        totalTrades: allTrades.length,
        closedTrades: closed.length,
        openTrades: open ? 1 : 0,
        winRate: closed.length ? Math.round((wins.length / closed.length) * 100 * 10) / 10 : 0,
        avgReturn: avg(closed.map((t) => t.returnPct as number)),
        avgWin,
        avgLoss,
        profitLossRatio: avgLoss !== 0 ? r2(Math.abs(avgWin / avgLoss)) : 0,
        cumulativeReturn: r2((cumulative - 1) * 100),
        bestTrade: closed.length ? r2(Math.max(...closed.map((t) => t.returnPct as number))) : 0,
        worstTrade: closed.length ? r2(Math.min(...closed.map((t) => t.returnPct as number))) : 0,
        avgHoldDays: closed.length ? avg(closed.map((t) => t.holdDays)) : 0,
        byType,
      },
      trades: allTrades,
    },
  };
}

export interface TradePlan {
  buy_price: number;
  sl: number;
  sl_source: string;
  sl_candidates: { name: string; price: number }[];
  tp: number;
  tp_source: string;
  tp_candidates: { name: string; price: number }[];
  rr: number;
}

export function computeTradePlan(
  candles: Candle[],
  mas: { ma5: number; ma10: number; ma20: number; ma60: number; ma240: number },
  support: number,
  fib: Fib,
): TradePlan {
  const buy = candles[candles.length - 1].close;
  const slCandidates = [
    { name: "支撐線", price: support },
    { name: "MA5", price: r2(mas.ma5) },
    { name: "MA10", price: r2(mas.ma10) },
    { name: "MA20", price: r2(mas.ma20) },
    { name: "MA60", price: r2(mas.ma60) },
    { name: "MA240", price: r2(mas.ma240) },
  ].filter((x) => Number.isFinite(x.price));
  const tpCandidates = [
    { name: "前高壓力", price: fib.high },
    { name: "Fib 161.8%", price: r2(fib.low + fib.delta * 1.618) },
    { name: "Fib 200%", price: r2(fib.low + fib.delta * 2) },
  ];

  const below = slCandidates.filter((x) => x.price < buy).sort((a, b) => b.price - a.price);
  const above = tpCandidates.filter((x) => x.price > buy).sort((a, b) => a.price - b.price);
  const slPick = below[0] ?? slCandidates.sort((a, b) => a.price - b.price)[0];
  const tpPick = above[0] ?? tpCandidates.sort((a, b) => b.price - a.price)[0];
  const rr = buy - slPick.price !== 0 ? r2((tpPick.price - buy) / (buy - slPick.price)) : 0;

  return {
    buy_price: buy,
    sl: slPick.price,
    sl_source: slPick.name,
    sl_candidates: slCandidates,
    tp: tpPick.price,
    tp_source: tpPick.name,
    tp_candidates: tpCandidates,
    rr,
  };
}

export function volumeBars(candles: Candle[]): Point[] & { color?: string }[] {
  return candles.map((c) => ({
    time: c.time,
    value: c.volume,
    color: c.close >= c.open ? "rgba(255,23,68,0.3)" : "rgba(0,200,83,0.3)",
  })) as Point[] & { color?: string }[];
}

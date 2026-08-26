import YahooFinance from "yahoo-finance2";
import { cached } from "./cache";

const yahooFinance = new YahooFinance();

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartQuote {
  date: Date;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
}
interface ChartResult {
  quotes: ChartQuote[];
  meta: Record<string, unknown>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function toDay(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

async function chart(
  ticker: string,
  opts: { period1: Date; period2?: Date; interval: "1d" },
): Promise<ChartResult> {
  return (await yahooFinance.chart(ticker, opts)) as unknown as ChartResult;
}

export async function fetchCandles(ticker: string, days = 400): Promise<Candle[]> {
  return cached(`candles:${ticker}:${days}`, 60 * 10, async () => {
    const period2 = new Date();
    const period1 = new Date(Date.now() - days * 86400000);
    const res = await chart(ticker, { period1, period2, interval: "1d" });
    const out: Candle[] = [];
    for (const q of res.quotes) {
      if (q.open == null || q.high == null || q.low == null || q.close == null) continue;
      out.push({
        time: toDay(q.date),
        open: r2(q.open),
        high: r2(q.high),
        low: r2(q.low),
        close: r2(q.close),
        volume: q.volume ?? 0,
      });
    }
    return out;
  });
}

export async function fetchMeta(ticker: string): Promise<{
  name: string;
  price: number | null;
  prevClose: number | null;
} | null> {
  try {
    const res = await chart(ticker, {
      period1: new Date(Date.now() - 7 * 86400000),
      interval: "1d",
    });
    const m = res.meta;
    return {
      name: (m.longName as string) || (m.shortName as string) || ticker,
      price: (m.regularMarketPrice as number) ?? null,
      prevClose: (m.chartPreviousClose as number) ?? null,
    };
  } catch {
    return null;
  }
}

export async function fetchSummary(
  ticker: string,
  modules: string[],
): Promise<Record<string, unknown> | null> {
  return cached(`summary:${ticker}:${modules.join(",")}`, 60 * 30, async () => {
    try {
      const res = await yahooFinance.quoteSummary(ticker, {
        modules: modules as never,
      });
      return res as unknown as Record<string, unknown>;
    } catch {
      return null;
    }
  });
}

/**
 * Resolve a Taiwan stock code (e.g. "2330") to a working Yahoo ticker by
 * probing the listed (.TW) then OTC (.TWO) suffix.
 */
export async function resolveTicker(code: string): Promise<string | null> {
  for (const suffix of [".TW", ".TWO"]) {
    const ticker = `${code}${suffix}`;
    try {
      const res = await chart(ticker, {
        period1: new Date(Date.now() - 7 * 86400000),
        interval: "1d",
      });
      if (res.quotes && res.quotes.length > 0) return ticker;
    } catch {
      /* try next suffix */
    }
  }
  return null;
}

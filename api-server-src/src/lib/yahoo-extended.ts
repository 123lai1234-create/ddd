// Extended Yahoo / TWSE / external fetchers, ported from api/line/lib/yahoo-lite.js
// (dead-code reference). Uses the existing chart() helper in `lib/yahoo.ts` so the
// same cached fetch pipeline applies.
//
// Returns null / empty on failure rather than throwing — call sites degrade
// gracefully (Flex shows "資料不足") instead of crashing the LINE webhook.

import type { Candle } from "./yahoo";
import { cached } from "./cache";

const UA = "Mozilla/5.0 (compatible; donttalk-line/1.0; +https://donttalk.vercel.app)";
const fetchOpts = { headers: { "User-Agent": UA, Accept: "application/json" } };

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const FRANKFURTER = "https://api.frankfurter.app/latest";
const TWSE_FUND = "https://www.twse.com.tw/rwd/zh/fund/BFI82U";
const TWSE_MARGIN = "https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN";
const CWA_BASE = "https://opendata.cwa.gov.tw/api/v1/rest/datastore";

// ── Curated reference data (no public free APIs for these) ──────────────

export const INDUSTRIES: Record<string, string[]> = {
  "半導體": ["2330", "2454", "2317", "2379", "3034", "6669", "3443", "3711", "5347"],
  "AI": ["2330", "2382", "3231", "6669", "6756", "6121"],
  "電子": ["2330", "2454", "2317", "2382", "2303", "2379", "3231"],
  "金融": ["2881", "2882", "2884", "2885", "2886", "2887", "2891", "2892"],
  "塑化": ["1301", "1303", "1326", "6505"],
  "鋼鐵": ["2002", "2007", "2014", "2027"],
  "電信": ["2412", "3045", "4904"],
  "航運": ["2603", "2609", "2615", "2618"],
  "觀光": ["2707", "2727", "5706"],
};

export const WATCHLIST = [
  "2330", "2317", "2454", "2382", "3231", "6669",
  "2881", "2882", "1303", "2603", "2303", "2379",
  "3034", "0050", "0056", "2891",
];

export const CITY_CODES: Record<string, string> = {
  "臺北": "F-D0047-061",
  "新北": "F-D0047-007",
  "桃園": "F-D0047-005",
  "臺中": "F-D0047-073",
  "臺南": "F-D0047-079",
  "高雄": "F-D0047-067",
  "基隆": "F-D0047-051",
  "新竹": "F-D0047-055",
  "苗栗": "F-D0047-013",
  "彰化": "F-D0047-019",
  "南投": "F-D0047-023",
  "雲林": "F-D0047-027",
  "嘉義": "F-D0047-031",
  "屏東": "F-D0047-035",
  "宜蘭": "F-D0047-003",
  "花蓮": "F-D0047-015",
  "臺東": "F-D0047-037",
  "澎湖": "F-D0047-041",
  "金門": "F-D0047-043",
  "連江": "F-D0047-045",
};

// ── Yahoo chart endpoint (raw, no yahoo-finance2) ────────────────────────

interface YahooChartCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Raw daily candles via Yahoo chart endpoint. `days` controls the range hint. */
export async function fetchRawCandles(ticker: string, days = 240): Promise<YahooChartCandle[]> {
  const range = days > 200 ? "1y" : days > 60 ? "6mo" : "3mo";
  const url = `${YAHOO_CHART}/${encodeURIComponent(ticker)}?range=${range}&interval=1d`;
  const res = await fetch(url, fetchOpts);
  if (!res.ok) throw new Error(`yahoo chart ${ticker} ${res.status}`);
  const json = (await res.json()) as {
    chart?: { result?: { timestamp?: number[]; indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> } }[] };
  };
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`yahoo chart empty: ${ticker}`);
  const ts = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const out: YahooChartCandle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i];
    if (close == null) continue;
    out.push({
      time: new Date(ts[i] * 1000).toISOString().slice(0, 10),
      open: q.open?.[i] ?? close,
      high: q.high?.[i] ?? close,
      low: q.low?.[i] ?? close,
      close,
      volume: q.volume?.[i] ?? 0,
    });
  }
  return out;
}

/** Try .TW then .TWO suffix; returns working ticker or null. */
export async function resolveTickerSuffix(code: string): Promise<string | null> {
  for (const suffix of [".TW", ".TWO"]) {
    const ticker = `${code}${suffix}`;
    try {
      const candles = await fetchRawCandles(ticker, 30);
      if (candles.length > 0) return ticker;
    } catch {
      /* try next suffix */
    }
  }
  return null;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let s = 0;
  for (let i = values.length - period; i < values.length; i++) s += values[i];
  return Math.round((s / period) * 100) / 100;
}

export interface StockQuoteFull {
  code: string;
  ticker: string;
  name: string;
  close: number | null;
  changePct: number | null;
  ma20: number | null;
  ma60: number | null;
  candles: YahooChartCandle[];
}

/** One-shot: code → {name, price, MA20/MA60, last 30 days candles for sparkline}. */
export async function queryStock(code: string): Promise<StockQuoteFull | null> {
  return cached(`ext:query:${code}`, 60 * 5, async () => {
    const ticker = await resolveTickerSuffix(code);
    if (!ticker) return null;
    const [quote, candles] = await Promise.all([
      fetchRawCandles(ticker, 240).then((all) => {
        if (all.length < 2) return { close: null as number | null, changePct: null as number | null };
        const last = all[all.length - 1].close;
        const prev = all[all.length - 2].close;
        return {
          close: last,
          changePct: prev ? Math.round(((last - prev) / prev) * 10000) / 100 : null,
        };
      }).catch(() => ({ close: null, changePct: null })),
      fetchRawCandles(ticker, 240).catch(() => [] as YahooChartCandle[]),
    ]);
    const closes = candles.map((c) => c.close);
    return {
      code,
      ticker,
      name: ticker,
      close: quote.close,
      changePct: quote.changePct,
      ma20: sma(closes, 20),
      ma60: sma(closes, 60),
      candles: candles.slice(-30),
    };
  });
}

/** Multi-quote: batch lookup for several Taiwan codes. */
export async function fetchMultipleQuotes(codes: string[]): Promise<Array<{ code: string; name: string; close: number | null; changePct: number | null }>> {
  return cached(`ext:multi:${codes.join(",")}`, 60 * 5, async () => {
    const results = await Promise.all(codes.map((c) => queryStock(c).catch(() => null)));
    return codes.map((c, i) => {
      const r = results[i];
      return {
        code: c,
        name: r?.name ?? c,
        close: r?.close ?? null,
        changePct: r?.changePct ?? null,
      };
    });
  });
}

/** Major world indices via Yahoo chart endpoint. Indices may return empty data on some days. */
export async function fetchIndices(): Promise<Array<{ key: string; symbol: string; close: number | null; changePct: number | null }>> {
  return cached("ext:indices", 60 * 3, async () => {
    const tickers = ["^TWSE", "^TWO", "^DJI", "^GSPC", "^IXIC", "^HSI", "^N225"];
    const results = await Promise.all(tickers.map(async (t) => {
      try {
        const candles = await fetchRawCandles(t, 5);
        if (candles.length < 2) return { symbol: t, close: null, changePct: null };
        const last = candles[candles.length - 1].close;
        const prev = candles[candles.length - 2].close;
        return {
          symbol: t,
          close: last,
          changePct: prev ? Math.round(((last - prev) / prev) * 10000) / 100 : null,
        };
      } catch {
        return { symbol: t, close: null, changePct: null };
      }
    }));
    const get = (s: string) => results.find((o) => o.symbol === s);
    return [
      { key: "加權",  ...(get("^TWSE") ?? { symbol: "^TWSE", close: null, changePct: null }) },
      { key: "櫃買",  ...(get("^TWO")  ?? { symbol: "^TWO",  close: null, changePct: null }) },
      { key: "道瓊",  ...(get("^DJI")  ?? { symbol: "^DJI",  close: null, changePct: null }) },
      { key: "S&P",   ...(get("^GSPC") ?? { symbol: "^GSPC", close: null, changePct: null }) },
      { key: "Nasdaq",...(get("^IXIC") ?? { symbol: "^IXIC", close: null, changePct: null }) },
      { key: "恆生",  ...(get("^HSI")  ?? { symbol: "^HSI",  close: null, changePct: null }) },
      { key: "日經",  ...(get("^N225") ?? { symbol: "^N225", close: null, changePct: null }) },
    ];
  });
}

/** Major forex pairs via Yahoo chart endpoint. */
export async function fetchForex(): Promise<Array<{ pair: string; rate: number | null; changePct: number | null }>> {
  return cached("ext:forex", 60 * 5, async () => {
    const pairs: Array<[string, string]> = [
      ["USD", "TWD"], ["USD", "JPY"], ["USD", "EUR"],
      ["USD", "CNY"], ["EUR", "USD"], ["GBP", "USD"],
    ];
    const results = await Promise.all(pairs.map(async ([f, t]) => {
      const ticker = `${f}${t}=X`;
      try {
        const candles = await fetchRawCandles(ticker, 5);
        if (candles.length < 2) return { pair: `${f}/${t}`, rate: null, changePct: null };
        const last = candles[candles.length - 1].close;
        const prev = candles[candles.length - 2].close;
        return {
          pair: `${f}/${t}`,
          rate: last,
          changePct: prev ? Math.round(((last - prev) / prev) * 10000) / 100 : null,
        };
      } catch {
        return { pair: `${f}/${t}`, rate: null, changePct: null };
      }
    }));
    return results;
  });
}

/** Crypto via Yahoo chart endpoint. */
export async function fetchCrypto(): Promise<Array<{ symbol: string; close: number | null; changePct: number | null }>> {
  return cached("ext:crypto", 60 * 5, async () => {
    const tickers = ["BTC-USD", "ETH-USD", "SOL-USD"];
    const results = await Promise.all(tickers.map(async (t) => {
      try {
        const candles = await fetchRawCandles(t, 5);
        if (candles.length < 2) return { symbol: t, close: null, changePct: null };
        const last = candles[candles.length - 1].close;
        const prev = candles[candles.length - 2].close;
        return {
          symbol: t,
          close: last,
          changePct: prev ? Math.round(((last - prev) / prev) * 10000) / 100 : null,
        };
      } catch {
        return { symbol: t, close: null, changePct: null };
      }
    }));
    return results;
  });
}

/**
 * Currency conversion. Uses Frankfurter for major world currencies; falls back
 * to Yahoo chart USDTWD=X for TWD legs.
 */
export async function convertCurrency(
  amount: number,
  from: string,
  to: string,
): Promise<{ from: string; to: string; amount: number; rate: number; converted: number } | null> {
  return cached(`ext:convert:${from}:${to}:${amount}`, 60 * 30, async () => {
    if (from === "TWD" || to === "TWD") {
      const ticker = from === "USD" || to === "USD"
        ? "USDTWD=X"
        : `${from}TWD=X`;
      const candles = await fetchRawCandles(ticker, 5).catch(() => []);
      if (!candles.length) return null;
      const rate = candles[candles.length - 1].close;
      return { from, to, amount, rate, converted: amount * rate };
    }
    const url = `${FRANKFURTER}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${amount}`;
    const res = await fetch(url, fetchOpts);
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, number> };
    const rate = json?.rates?.[to];
    if (rate == null) return null;
    return { from, to, amount, rate, converted: amount * rate };
  });
}

/** Safe expression evaluator — no eval. Only digits + 4 ops + parens. */
export function safeEval(expr: string): number {
  if (!/^[\d+\-*/().\s]+$/.test(expr)) throw new Error("invalid expression");
  if (expr.length > 100) throw new Error("expression too long");
  // eslint-disable-next-line no-new-func
  const fn = new Function(`"use strict"; return (${expr});`);
  return fn();
}

/** Day K-line summary from recent candles. */
export async function fetchKLine(code: string, days = 5): Promise<{
  code: string;
  ticker: string;
  candles: YahooChartCandle[];
  summary: { open: number; close: number; high: number; low: number; changePct: number | null; avgVolume: number };
} | null> {
  return cached(`ext:kline:${code}:${days}`, 60 * 30, async () => {
    const ticker = await resolveTickerSuffix(code);
    if (!ticker) return null;
    const candles = await fetchRawCandles(ticker, Math.max(days + 30, 60)).catch(() => []);
    if (!candles.length) return null;
    const recent = candles.slice(-days);
    const summary = {
      open: recent[0]?.open,
      close: recent[recent.length - 1]?.close,
      high: Math.max(...recent.map((c) => c.high)),
      low: Math.min(...recent.map((c) => c.low)),
      changePct: recent[recent.length - 1]?.close != null && recent[0]?.open
        ? Math.round(((recent[recent.length - 1].close - recent[0].open) / recent[0].open) * 10000) / 100
        : null,
      avgVolume: Math.round(recent.reduce((s, c) => s + (c.volume || 0), 0) / recent.length),
    };
    return { code, ticker, candles: recent, summary };
  });
}

// ── TWSE open data ───────────────────────────────────────────────────────

function ymd(d: Date): string {
  return d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
}

/** TWSE BFI82U: single-day institutional net buy/sell for one stock.
 *  Returns null if the previous trading day has no data. */
export async function fetchInstitutional(code: string): Promise<{
  date: string;
  foreign: number;
  trust: number;
  dealer: number;
  total: number;
} | null> {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  const d = ymd(date);
  return cached(`ext:inst:${code}:${d}`, 60 * 60 * 4, async () => {
    const url = `${TWSE_FUND}?response=json&date=${d}&stockNo=${code}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { data?: string[][]; fields?: string[] };
      const data = j?.data?.[0] ?? [];
      const fields = j?.fields ?? [];
      if (!fields.length || !data.length) return null;
      const idx = (k: string) => fields.indexOf(k);
      const num = (s: unknown) => {
        const n = Number(String(s ?? "").replace(/,/g, ""));
        return Number.isFinite(n) ? n : 0;
      };
      return {
        date: d,
        foreign: num(data[idx("外陸資買賣超股數")]),
        trust: num(data[idx("投信買賣超股數")]),
        dealer: num(data[idx("自營商買賣超股數")]),
        total: num(data[idx("三大法人買賣超股數")]),
      };
    } catch {
      return null;
    }
  });
}

/** TWSE MI_MARGN: margin balance / short balance / change for one stock. */
export async function fetchMargin(code: string): Promise<{
  date: string;
  marginBalance: number;
  marginChange: number;
  shortBalance: number;
} | null> {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  const d = ymd(date);
  return cached(`ext:mgn:${code}:${d}`, 60 * 60 * 4, async () => {
    const url = `${TWSE_MARGIN}?response=json&date=${d}&stockNo=${code}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { data?: string[][]; fields?: string[] };
      const data = j?.data?.[0] ?? [];
      const fields = j?.fields ?? [];
      if (!fields.length || !data.length) return null;
      const idx = (k: string) => fields.indexOf(k);
      const num = (s: unknown) => {
        const n = Number(String(s ?? "").replace(/,/g, ""));
        return Number.isFinite(n) ? n : 0;
      };
      return {
        date: d,
        marginBalance: num(data[idx("融資餘額")]),
        marginChange: num(data[idx("融資增減")]),
        shortBalance: num(data[idx("融券餘額")]),
      };
    } catch {
      return null;
    }
  });
}

export interface WeatherData {
  city: string;
  location: string;
  forecast: Array<{ from: string; to: string; desc: string }>;
  maxT: string | null;
  minT: string | null;
}

/** CWA F-D0047-077 36-hour forecast. Requires CWA_API_KEY env. */
export async function fetchWeather(cityName: string): Promise<WeatherData | null> {
  const loc = CITY_CODES[cityName];
  if (!loc) return null;
  const key = process.env["CWA_API_KEY"];
  if (!key) return null;
  return cached(`ext:cwa:${loc}`, 60 * 30, async () => {
    const url = `${CWA_BASE}/${loc}?Authorization=${encodeURIComponent(key)}&ElementName=WeatherDescription,MaxTemperature,MinTemperature`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return null;
      const j = (await res.json()) as {
        records?: { locations?: Array<{ location?: Array<{
          locationName?: string;
          weatherElement?: Array<{
            elementName?: string;
            time?: Array<{
              startTime?: string;
              endTime?: string;
              elementValue?: Array<{ value?: string }>;
            }>;
          }>;
        }> }> };
      };
      const firstLoc = j?.records?.locations?.[0]?.location?.[0];
      if (!firstLoc) return null;
      const weather = firstLoc.weatherElement?.find((e) => e.elementName === "WeatherDescription");
      const maxT = firstLoc.weatherElement?.find((e) => e.elementName === "MaxTemperature");
      const minT = firstLoc.weatherElement?.find((e) => e.elementName === "MinTemperature");
      return {
        city: cityName,
        location: firstLoc.locationName ?? cityName,
        forecast: (weather?.time ?? []).slice(0, 3).map((t) => ({
          from: t.startTime ?? "",
          to: t.endTime ?? "",
          desc: t.elementValue?.[0]?.value ?? "",
        })),
        maxT: maxT?.time?.[0]?.elementValue?.[0]?.value ?? null,
        minT: minT?.time?.[0]?.elementValue?.[0]?.value ?? null,
      };
    } catch {
      return null;
    }
  });
}

/** Convert YahooChartCandle → Candle (so handlers can reuse existing types). */
export function toCandles(raw: YahooChartCandle[]): Candle[] {
  return raw.map((c) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

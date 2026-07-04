// Lightweight Yahoo Finance client — uses raw chart endpoint via fetch.
// Avoids pulling in yahoo-finance2 (~2MB). Returns daily candles + meta.
//
// Endpoints used:
//   GET https://query1.finance.yahoo.com/v8/finance/chart/<ticker>?range=...&interval=1d
//   GET https://query1.finance.yahoo.com/v7/finance/quote?symbols=<ticker1,ticker2>
//
// TA resolver: tries .TW (listed) then .TWO (OTC).

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_QUOTE = "https://query1.finance.yahoo.com/v7/finance/quote";

const UA =
  "Mozilla/5.0 (compatible; donttalk-line/1.0; +https://donttalk.vercel.app)";

const fetchOpts = { headers: { "User-Agent": UA, Accept: "application/json" } };

/** Daily candle data for ticker. `days` controls range hint. */
export async function fetchCandles(ticker, days = 240) {
  const range = days > 200 ? "1y" : days > 60 ? "6mo" : "3mo";
  const url = `${YAHOO_CHART}/${encodeURIComponent(ticker)}?range=${range}&interval=1d`;
  const res = await fetch(url, fetchOpts);
  if (!res.ok) throw new Error(`yahoo chart ${ticker} ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`yahoo chart empty: ${ticker}`);
  const ts = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const out = [];
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

/** Simple moving average. Returns null if not enough data. */
export function sma(values, period) {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return Math.round((sum / period) * 100) / 100;
}

/** Try .TW then .TWO suffix; returns working ticker or null. */
export async function resolveTicker(code) {
  for (const suffix of [".TW", ".TWO"]) {
    const ticker = `${code}${suffix}`;
    try {
      const candles = await fetchCandles(ticker, 30);
      if (candles.length > 0) return ticker;
    } catch {
      /* try next suffix */
    }
  }
  return null;
}

/** Quote summary — for current price + changePct (and stock name). */
export async function fetchQuote(ticker) {
  const url = `${YAHOO_QUOTE}?symbols=${encodeURIComponent(ticker)}`;
  const res = await fetch(url, fetchOpts);
  if (!res.ok) throw new Error(`yahoo quote ${ticker} ${res.status}`);
  const json = await res.json();
  const r = json?.quoteResponse?.result?.[0];
  if (!r) throw new Error(`yahoo quote empty: ${ticker}`);
  return {
    name: r.longName || r.shortName || ticker,
    close: r.regularMarketPrice ?? r.postMarketPrice ?? null,
    prevClose: r.regularMarketPreviousClose ?? null,
    changePct: r.regularMarketChangePercent ?? null,
  };
}

/**
 * One-shot helper: resolve a Taiwan stock code → name + last price + MA20/MA60.
 * Returns null if ticker can't be resolved.
 */
export async function queryStock(code) {
  const ticker = await resolveTicker(code);
  if (!ticker) return null;
  const [quote, candles] = await Promise.all([
    fetchQuote(ticker).catch(() => null),
    fetchCandles(ticker, 240).catch(() => []),
  ]);
  const closes = candles.map((c) => c.close);
  return {
    code,
    ticker,
    name: quote?.name ?? code,
    close: quote?.close ?? (closes.length ? closes[closes.length - 1] : null),
    changePct: quote?.changePct ?? null,
    ma20: sma(closes, 20),
    ma60: sma(closes, 60),
  };
}
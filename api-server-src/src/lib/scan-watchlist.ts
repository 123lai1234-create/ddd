/**
 * Shared scan-watchlist implementation, called from both /api/scan (stock route)
 * and /api/line/scan_and_push_line (line route). Returns one entry per stock
 * that has fresh MA buy/sell markers today or on the latest bar.
 */

import { fetchCandles } from "./yahoo";
import { runStrategy } from "./indicators";
import { getWatchlist } from "./stocks";

export interface ScanResult {
  code: string;
  name: string;
  signals_today: string[];
}

export async function scanWatchlist(): Promise<ScanResult[]> {
  const list = await getWatchlist();
  const results: ScanResult[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const s of list.slice(0, 40)) {
    try {
      const candles = await fetchCandles(s.ticker, 400);
      if (candles.length < 30) continue;
      const strat = runStrategy(candles);
      const lastBar = candles[candles.length - 1].time;
      const todays = strat.markers.filter(
        (m) => m.time === today || m.time === lastBar,
      );
      const signals_today = todays.map(
        (m) => `${s.code} ${s.name} ${m.text === "賣出" ? "SELL" : "BUY"} ${m.text}`,
      );
      if (signals_today.length) results.push({ code: s.code, name: s.name, signals_today });
    } catch {
      /* skip individual stock failures */
    }
  }
  return results;
}
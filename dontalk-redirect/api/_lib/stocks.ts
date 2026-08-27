// Vercel-friendly replacement for the original drizzle-backed stocks.ts.
// No DB — uses the seed watchlist as the in-memory list. resolveStock()
// checks the seed ticker map first; for unknown codes it probes Yahoo for
// .TW / .TWO suffixes and returns what it finds.
import { SEED_WATCHLIST, NAME_BY_CODE, TICKER_BY_CODE } from "./seed-data";
import { resolveTicker, fetchMeta } from "./yahoo";

export async function getWatchlist() {
  return SEED_WATCHLIST.map((s, i) => ({
    code: s.code,
    name: s.name,
    ticker: s.ticker,
    sortOrder: i,
  }));
}

export async function resolveStock(
  code: string,
): Promise<{ name: string; ticker: string }> {
  if (TICKER_BY_CODE[code]) {
    return { name: NAME_BY_CODE[code] || code, ticker: TICKER_BY_CODE[code] };
  }
  const ticker = await resolveTicker(code);
  if (!ticker) throw new Error(`Unknown stock code: ${code}`);
  const meta = await fetchMeta(ticker);
  return {
    name: meta?.name && meta.name !== ticker ? meta.name : code,
    ticker,
  };
}

import { db, watchlistTable } from "../_shims/db";
import { asc, eq } from "drizzle-orm";
import { SEED_WATCHLIST, NAME_BY_CODE, TICKER_BY_CODE } from "./seed-data";
import { resolveTicker, fetchMeta } from "./yahoo";

// Strict Taiwan code: 4-6 digits, optionally followed by .TW / .TWO suffix.
// Anything else (e.g. "TSMC", "tsm", "abc") is REJECTED at the entry of
// resolveStock so we never round-trip through Yahoo's chart API with a
// non-Taiwan ticker — that path silently returned the wrong stock's data
// (e.g. "TSMC" → 台積電 quotes) and the frontend had to add a separate
// symbol-mismatch guard. See stock-app bot rules: 2026-07-06.
const TAIWAN_CODE_RE = /^\d{4,6}$/;

function normalizeCode(code: string): string {
  const trimmed = String(code ?? "").trim();
  // Tolerate trailing .TW / .TWO so callers like LINE bot / scan-watchlist
  // don't need to know the suffix conventions.
  const stripped = trimmed.replace(/\.(TW|TWO)$/i, "");
  return stripped;
}

export { normalizeCode };

let seeded = false;

export async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  const existing = await db.select().from(watchlistTable).limit(1);
  if (existing.length === 0) {
    await db
      .insert(watchlistTable)
      .values(
        SEED_WATCHLIST.map((s, i) => ({
          code: s.code,
          name: s.name,
          ticker: s.ticker,
          sortOrder: i,
        })),
      )
      .onConflictDoNothing();
  }
  seeded = true;
}

export async function getWatchlist() {
  await ensureSeeded();
  return db.select().from(watchlistTable).orderBy(asc(watchlistTable.sortOrder));
}

export async function resolveStock(
  code: string,
): Promise<{ name: string; ticker: string }> {
  const normalized = normalizeCode(code);
  if (!TAIWAN_CODE_RE.test(normalized)) {
    throw new Error(
      `Invalid stock code: ${JSON.stringify(code)} (expected 4-6 digit Taiwan code)`,
    );
  }
  if (TICKER_BY_CODE[normalized]) {
    return { name: NAME_BY_CODE[normalized] || normalized, ticker: TICKER_BY_CODE[normalized] };
  }
  const row = await db
    .select()
    .from(watchlistTable)
    .where(eq(watchlistTable.code, normalized));
  if (row.length) return { name: row[0].name, ticker: row[0].ticker };

  const ticker = await resolveTicker(normalized);
  if (!ticker) throw new Error(`Unknown stock code: ${normalized}`);
  const meta = await fetchMeta(ticker);
  return { name: meta?.name && meta.name !== ticker ? meta.name : normalized, ticker };
}

export async function addStock(code: string): Promise<{ code: string; name: string; ticker: string }> {
  const normalized = normalizeCode(code);
  const { name, ticker } = await resolveStock(normalized);
  const max = await db.select().from(watchlistTable);
  const order = max.length;
  await db
    .insert(watchlistTable)
    .values({ code: normalized, name, ticker, sortOrder: order })
    .onConflictDoNothing();
  return { code: normalized, name, ticker };
}

export async function removeStock(code: string): Promise<void> {
  await db.delete(watchlistTable).where(eq(watchlistTable.code, code));
}

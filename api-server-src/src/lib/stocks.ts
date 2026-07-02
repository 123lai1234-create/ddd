import { db, watchlistTable } from "../_shims/db";
import { asc, eq } from "drizzle-orm";
import { SEED_WATCHLIST, NAME_BY_CODE, TICKER_BY_CODE } from "./seed-data";
import { resolveTicker, fetchMeta } from "./yahoo";

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
  if (TICKER_BY_CODE[code]) {
    return { name: NAME_BY_CODE[code] || code, ticker: TICKER_BY_CODE[code] };
  }
  const row = await db
    .select()
    .from(watchlistTable)
    .where(eq(watchlistTable.code, code));
  if (row.length) return { name: row[0].name, ticker: row[0].ticker };

  const ticker = await resolveTicker(code);
  if (!ticker) throw new Error(`Unknown stock code: ${code}`);
  const meta = await fetchMeta(ticker);
  return { name: meta?.name && meta.name !== ticker ? meta.name : code, ticker };
}

export async function addStock(code: string): Promise<{ code: string; name: string; ticker: string }> {
  const { name, ticker } = await resolveStock(code);
  const max = await db.select().from(watchlistTable);
  const order = max.length;
  await db
    .insert(watchlistTable)
    .values({ code, name, ticker, sortOrder: order })
    .onConflictDoNothing();
  return { code, name, ticker };
}

export async function removeStock(code: string): Promise<void> {
  await db.delete(watchlistTable).where(eq(watchlistTable.code, code));
}

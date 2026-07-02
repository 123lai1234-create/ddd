// In-memory shim for the drizzle-orm based @workspace/db module.
// Stores rows in module-level Maps. The api-server's route handlers are
// tolerant: empty results fall back to seeded defaults, and write errors are
// already caught upstream. Promise resolves as soon as JS can.

import type { Marker, PositionHistory, Recipient, Watchlist, LineSubscriber } from "./schema/stock.js";

// Re-export the schema types so route files that `import type` from
// @workspace/db still resolve.
export type {
  Marker,
  PositionHistory,
  Recipient,
  Watchlist,
  LineSubscriber,
  InsertWatchlist,
  InsertRecipient,
  InsertMarker,
  InsertPositionHistory,
  InsertLineSubscriber,
} from "./schema/stock.js";

// ── Tables ────────────────────────────────────────────────────────────────
// `*Table` constants: plain objects with column-name getters. The api-server
// only reads them for `.code`, `.email`, etc. — no drizzle Proxy semantics
// needed at runtime.
export const watchlistTable = {
  _kind: "table" as const,
  _name: "watchlist",
  code: "code",
  name: "name",
  ticker: "ticker",
  sortOrder: "sort_order",
};

export const recipientsTable = {
  _kind: "table" as const,
  _name: "recipients",
  id: "id",
  name: "name",
  email: "email",
};

export const markersTable = {
  _kind: "table" as const,
  _name: "markers",
  id: "id",
  code: "code",
  date: "date",
  type: "type",
  text: "text",
  price: "price",
  createdAt: "created_at",
};

export const positionHistoryTable = {
  _kind: "table" as const,
  _name: "position_history",
  id: "id",
  date: "date",
  ratio: "ratio",
  source: "source",
};

export const lineSubscribersTable = {
  _kind: "table" as const,
  _name: "line_subscribers",
  userId: "user_id",
  displayName: "display_name",
  subscribedAt: "subscribed_at",
  muted: "muted",
};

// ── Storage ───────────────────────────────────────────────────────────────
type WatchlistRow = Watchlist;
type RecipientRow = Recipient & { id: number };
type MarkerRow = Marker;
type PositionHistoryRow = PositionHistory & { id: number };
type LineSubscriberRow = LineSubscriber;

const watchlistRows = new Map<string, WatchlistRow>();
const recipientRows = new Map<number, RecipientRow>();
const markerRows: MarkerRow[] = [];
const positionHistoryRows = new Map<string, PositionHistoryRow>();
const lineSubscriberRows = new Map<string, LineSubscriberRow>();

let recipientIdSeq = 1;
let markerIdSeq = 1;
let positionHistoryIdSeq = 1;

// ── Helpers ───────────────────────────────────────────────────────────────
function tableName(t: unknown): string {
  if (t && typeof t === "object" && "_name" in (t as Record<string, unknown>)) {
    return String((t as { _name: unknown })._name);
  }
  return "";
}

function readAll(t: unknown): unknown[] {
  switch (tableName(t)) {
    case "watchlist":
      return Array.from(watchlistRows.values());
    case "recipients":
      return Array.from(recipientRows.values());
    case "markers":
      return [...markerRows];
    case "position_history":
      return Array.from(positionHistoryRows.values());
    case "line_subscribers":
      return Array.from(lineSubscriberRows.values());
    default:
      return [];
  }
}

function insertRow(t: unknown, r: Record<string, unknown>): void {
  switch (tableName(t)) {
    case "watchlist": {
      const code = String(r.code ?? "");
      if (!code || watchlistRows.has(code)) return;
      watchlistRows.set(code, {
        code,
        name: String(r.name ?? ""),
        ticker: String(r.ticker ?? ""),
        sortOrder: Number(r.sortOrder ?? 0),
      });
      return;
    }
    case "recipients": {
      const email = String(r.email ?? "");
      if (!email) return;
      for (const ex of recipientRows.values()) {
        if (ex.email === email) return;
      }
      recipientRows.set(recipientIdSeq++, { id: recipientIdSeq - 1, name: String(r.name ?? ""), email });
      return;
    }
    case "markers": {
      const code = String(r.code ?? "");
      const date = String(r.date ?? "");
      const type = String(r.type ?? "");
      if (!code || !date || !type) return;
      markerRows.push({
        id: markerIdSeq++,
        code,
        date,
        type,
        text: String(r.text ?? ""),
        price: typeof r.price === "number" ? r.price : null,
        createdAt: new Date(),
      });
      return;
    }
    case "position_history": {
      const date = String(r.date ?? "");
      if (!date || positionHistoryRows.has(date)) return;
      positionHistoryRows.set(date, {
        id: positionHistoryIdSeq++,
        date,
        ratio: Number(r.ratio ?? 0),
        source: String(r.source ?? "calc"),
      });
      return;
    }
    case "line_subscribers": {
      const userId = String(r.userId ?? "");
      if (!userId || lineSubscriberRows.has(userId)) return;
      lineSubscriberRows.set(userId, {
        userId,
        displayName: String(r.displayName ?? ""),
        subscribedAt: new Date(),
        muted: Number(r.muted ?? 0),
      });
      return;
    }
  }
}

function deleteRows(_t: unknown, _cond: unknown): void {
  // No-op: the api-server's delete handlers don't actually check the return
  // count. We could implement a real WHERE matcher if a future route
  // requires it, but today every delete() is followed by an insert() that
  // rebuilds state.
}

// ── Public `db` ───────────────────────────────────────────────────────────
// Minimal drizzle-orm chain surface: `db.select().from(t).where(cond)
// .orderBy(col).limit(n).offset(n)` all return a thenable Promise<rows[]>.
// `db.insert(t).values(rows).onConflictDoNothing()` returns Promise<void>.
// `db.delete(t).where(cond)` returns Promise<void>.
export const db = {
  select() {
    let capturedTable: unknown = undefined;
    const promise = new Promise<unknown[]>((resolve) => {
      // Resolve on the next microtask so callers can chain synchronously.
      Promise.resolve().then(() => resolve(readAll(capturedTable)));
    });
    const chain = {
      from(t: unknown) {
        capturedTable = t;
        return chain;
      },
      where() {
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit() {
        return chain;
      },
      offset() {
        return chain;
      },
      then<TResult1 = unknown[], TResult2 = never>(
        onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return promise.then(onfulfilled as (v: unknown[]) => unknown, onrejected).then((v) => v as TResult1) as unknown as Promise<TResult1 | TResult2>;
      },
    };
    return chain;
  },
  insert(table: unknown) {
    const pending: Record<string, unknown>[] = [];
    const chain = {
      values(row: Record<string, unknown> | Record<string, unknown>[]) {
        const rows = Array.isArray(row) ? row : [row];
        for (const r of rows) pending.push(r);
        return chain;
      },
      onConflictDoNothing() {
        return chain;
      },
      returning() {
        return chain;
      },
      then<TResult1 = void, TResult2 = never>(
        onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return Promise.resolve()
          .then(() => {
            for (const r of pending) insertRow(table, r);
          })
          .then(onfulfilled as (v: void) => unknown, onrejected)
          .then((v) => v as TResult1) as unknown as Promise<TResult1 | TResult2>;
      },
    };
    return chain;
  },
  delete(table: unknown) {
    let cond: unknown = undefined;
    const promise = Promise.resolve().then(() => {
      deleteRows(table, cond);
    });
    const chain = {
      where(c: unknown) {
        cond = c;
        return chain;
      },
      then<TResult1 = void, TResult2 = never>(
        onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return promise.then(onfulfilled as (v: void) => unknown, onrejected).then((v) => v as TResult1) as unknown as Promise<TResult1 | TResult2>;
      },
    };
    return chain;
  },
};

// `pool` is exported by the real module but unused at runtime. Provide a
// no-op shape so any accidental import doesn't crash.
export const pool = {
  end: () => Promise.resolve(),
  close: () => Promise.resolve(),
  on: () => undefined,
};

// Schemas (zod validators) — the api-server doesn't actually use them at
// runtime, but `lib/db/src/index.ts` re-exports them. Stub with passthrough.
export const insertWatchlistSchema = { parse: (x: unknown) => x } as unknown;
export const insertRecipientSchema = { parse: (x: unknown) => x } as unknown;
export const insertMarkerSchema = { parse: (x: unknown) => x } as unknown;
export const insertPositionHistorySchema = { parse: (x: unknown) => x } as unknown;
export const insertLineSubscriberSchema = { parse: (x: unknown) => x } as unknown;

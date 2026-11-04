// 「封鎖設施求生」房間的 Neon 持久化層。
//
// 原本 Express 版用 in-memory Map；serverless function 沒有長駐記憶體，
// 房間改存進 Neon 資料表：state 欄位就是原本房間物件的 JSON 全量。
// 並行安全用 version 樂觀鎖：UPDATE 時限定 version，沒搶到就由呼叫端重讀重試。

import { neonQuery } from "./neon";
import type { GameRoom } from "./game-engine";

export interface StoredRoom {
  room: GameRoom;
  version: number;
}

const TABLE = "facility_rooms";
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ${TABLE} (
  code TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

/** 資料表不存在時建表後重試一次（首爾上線前不需要手動建表）。 */
async function withTable<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const msg = (e as Error).message || "";
    if (/does not exist/i.test(msg)) {
      await neonQuery(CREATE_TABLE_SQL);
      return await fn();
    }
    throw e;
  }
}

function parseRow(row: Record<string, unknown>): StoredRoom {
  const state = row.state;
  const room = (typeof state === "string" ? JSON.parse(state) : state) as GameRoom;
  return { room, version: Number(row.version) };
}

/** 讀房間。過期（建立超過 12 小時，與 Express 版 getRoom 相同規則）則刪除並回 null。 */
export async function fetchRoom(code: string): Promise<StoredRoom | null> {
  const upper = code.toUpperCase();
  const stored = await withTable(async () => {
    const { rows } = await neonQuery(
      `SELECT code, state, version FROM ${TABLE} WHERE code = $1`,
      [upper],
    );
    return rows.length > 0 ? parseRow(rows[0] as Record<string, unknown>) : null;
  });
  if (!stored) return null;
  if (Date.now() - stored.room.createdAt > ROOM_TTL_MS) {
    await withTable(() =>
      neonQuery(`DELETE FROM ${TABLE} WHERE code = $1`, [upper]),
    ).catch(() => undefined);
    return null;
  }
  return stored;
}

/** 新增房間。房間碼已存在回 false（呼叫端換碼重試）。 */
export async function insertRoom(room: GameRoom): Promise<boolean> {
  return withTable(async () => {
    const { rows } = await neonQuery(
      `INSERT INTO ${TABLE} (code, state, version, updated_at) VALUES ($1, $2::jsonb, 1, now())
       ON CONFLICT (code) DO NOTHING RETURNING code`,
      [room.code, JSON.stringify(room)],
    );
    return rows.length > 0;
  });
}

/** 樂觀鎖更新：version 不符回 false（呼叫端重讀重試）。成功後 version +1。 */
export async function updateRoom(room: GameRoom, version: number): Promise<boolean> {
  return withTable(async () => {
    const { rows } = await neonQuery(
      `UPDATE ${TABLE} SET state = $2::jsonb, version = version + 1, updated_at = now()
       WHERE code = $1 AND version = $3 RETURNING version`,
      [room.code, JSON.stringify(room), version],
    );
    return rows.length > 0;
  });
}

/** 世界頁用：列出未過期的大廳／進行中房間公開摘要（不含 token、帳號 id、完整房間狀態）。 */
export async function listPublicRooms(): Promise<
  {
    code: string;
    roomType: string;
    status: string;
    day: number;
    phase: string;
    playerCount: number;
    aliveCount: number;
    spectatorCount: number;
    hostName: string;
    createdAt: number;
  }[]
> {
  const { rows } = await withTable(() =>
    neonQuery(
      `SELECT code, state FROM ${TABLE} ORDER BY updated_at DESC LIMIT 50`,
    ),
  );
  const out = [];
  for (const row of rows) {
    const room = (typeof row.state === "string" ? JSON.parse(row.state) : row.state) as GameRoom;
    if (!room || room.status === "finished") continue;
    if (Date.now() - room.createdAt > ROOM_TTL_MS) continue;
    out.push({
      code: room.code,
      roomType: room.roomType ?? "casual",
      status: room.status,
      day: room.day,
      phase: room.phase,
      playerCount: room.players.length,
      aliveCount: room.players.filter((p) => p.alive).length,
      spectatorCount: (room.spectators ?? []).length,
      hostName: room.players[0]?.name ?? "",
      createdAt: room.createdAt,
    });
  }
  return out;
}

/** 建房時順手清掉 12 小時未更新的舊房間（原本 in-memory 版在建房時掃全表）。 */
export async function sweepExpired(): Promise<void> {
  await withTable(() =>
    neonQuery(
      `DELETE FROM ${TABLE} WHERE updated_at < now() - interval '12 hours'`,
    ),
  ).catch(() => undefined);
}

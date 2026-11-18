// kitchen-server/neon.mjs — 不說廚房的 Neon store。
// 帳號／session 直接沿用 facility2-server 的同一套 store（同一顆 Neon DB、
// 同一張 facility_accounts / facility_sessions 表，token 兩邊通用）；
// 廚房房間用自己的 kitchen_rooms 表（code / state JSONB / version），
// 與 facility_rooms 分開，不會互相污染、listRooms 也不會混在一起。
// 只用 process.env.DATABASE_URL_NEON，不寫死任何連線字串。
import { createNeonStore as createFacilityStore, neonConfigured } from '../facility2-server/neon.mjs';

export { neonConfigured };

function dbUrl() {
  const u = process.env.DATABASE_URL_NEON;
  return u && u.length ? u : null;
}
async function q(sql, params = []) {
  const url = dbUrl();
  if (!url) throw new Error('DATABASE_URL_NEON is not set');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  let res;
  try {
    res = await fetch(`https://${new URL(url).hostname}/sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': url },
      body: JSON.stringify({ query: sql, params }), signal: ctrl.signal,
    });
  } finally { clearTimeout(t); }
  const text = await res.text();
  if (!res.ok) throw new Error(`Neon HTTP ${res.status}: ${text.slice(0, 200)}`);
  const j = JSON.parse(text);
  if (j.error) throw new Error(j.error.message || 'Neon error');
  return Array.isArray(j.rows) ? j.rows : [];
}
const CREATE_ROOMS = `CREATE TABLE IF NOT EXISTS kitchen_rooms (code TEXT PRIMARY KEY, state JSONB NOT NULL, version INT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
async function withTable(fn) {
  try { return await fn(); } catch (e) {
    if (/does not exist/i.test(e.message || '')) { await q(CREATE_ROOMS); return await fn(); }
    throw e;
  }
}
const parseState = r => (typeof r.state === 'string' ? JSON.parse(r.state) : r.state);

export function createKitchenStore() {
  const base = createFacilityStore();
  return {
    ...base,
    async getKitchenRoom(code) {
      const rows = await withTable(() => q(`SELECT code, state FROM kitchen_rooms WHERE code = $1`, [String(code).toUpperCase()]));
      return rows.length ? parseState(rows[0]) : null;
    },
    async saveKitchenRoom(room) {
      await withTable(() => q(`INSERT INTO kitchen_rooms (code, state, version, updated_at) VALUES ($1, $2::jsonb, 1, now()) ON CONFLICT (code) DO UPDATE SET state = EXCLUDED.state, version = kitchen_rooms.version + 1, updated_at = now()`, [room.code, JSON.stringify(room)]));
    },
    async listKitchenRooms() {
      const rows = await withTable(() => q(`SELECT code, state FROM kitchen_rooms ORDER BY updated_at DESC LIMIT 50`));
      return rows.map(parseState);
    },
  };
}

// facility2-server/neon.mjs — Neon HTTP store for facility2.
// Uses ONLY process.env.DATABASE_URL_NEON (never a hardcoded string).
// Tables reuse the existing facility_* names with the same JSON-state shape
// for rooms (code / state JSONB / version) so a redo can read rooms created
// by the new code; accounts/sessions/records/oauth use plain columns.
function dbUrl() {
  const u = process.env.DATABASE_URL_NEON;
  return u && u.length ? u : null;
}
export function neonConfigured() { return !!dbUrl(); }
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
const CREATES = {
  rooms: `CREATE TABLE IF NOT EXISTS facility_rooms (code TEXT PRIMARY KEY, state JSONB NOT NULL, version INT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  accounts: `CREATE TABLE IF NOT EXISTS facility_accounts (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, kind TEXT NOT NULL, password_hash TEXT, recovery_hash TEXT, email TEXT, reputation INT NOT NULL DEFAULT 100, cooldown_until BIGINT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL)`,
  sessions: `CREATE TABLE IF NOT EXISTS facility_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at BIGINT NOT NULL)`,
  records: `CREATE TABLE IF NOT EXISTS facility_records (account_id TEXT PRIMARY KEY, games INT NOT NULL DEFAULT 0, wins INT NOT NULL DEFAULT 0, losses INT NOT NULL DEFAULT 0, best_final_hp INT NOT NULL DEFAULT 0, achievements JSONB NOT NULL DEFAULT '[]'::jsonb)`,
  oauth: `CREATE TABLE IF NOT EXISTS facility_oauth_states (state TEXT PRIMARY KEY, created_at BIGINT NOT NULL)`,
};
async function withTable(key, fn) {
  try { return await fn(); } catch (e) {
    if (/does not exist/i.test(e.message || '')) { await q(CREATES[key]); return await fn(); }
    throw e;
  }
}
const parseState = r => (typeof r.state === 'string' ? JSON.parse(r.state) : r.state);
export function createNeonStore() {
  return {
    async getRoom(code) {
      const rows = await withTable('rooms', () => q(`SELECT code, state FROM facility_rooms WHERE code = $1`, [String(code).toUpperCase()]));
      return rows.length ? parseState(rows[0]) : null;
    },
    async saveRoom(room) {
      await withTable('rooms', () => q(`INSERT INTO facility_rooms (code, state, version, updated_at) VALUES ($1, $2::jsonb, 1, now()) ON CONFLICT (code) DO UPDATE SET state = EXCLUDED.state, version = facility_rooms.version + 1, updated_at = now()`, [room.code, JSON.stringify(room)]));
    },
    async listRooms() {
      const rows = await withTable('rooms', () => q(`SELECT code, state FROM facility_rooms ORDER BY updated_at DESC LIMIT 50`));
      return rows.map(parseState);
    },
    async getAccount(id) {
      const rows = await withTable('accounts', () => q(`SELECT * FROM facility_accounts WHERE id = $1`, [id]));
      return rows[0] || null;
    },
    async getAccountByName(name) {
      const rows = await withTable('accounts', () => q(`SELECT * FROM facility_accounts WHERE display_name = $1`, [name]));
      return rows[0] || null;
    },
    async getAccountByEmail(email) {
      if (!email) return null;
      const rows = await withTable('accounts', () => q(`SELECT * FROM facility_accounts WHERE email = $1`, [email]));
      return rows[0] || null;
    },
    async saveAccount(a) {
      await withTable('accounts', () => q(`INSERT INTO facility_accounts (id, display_name, kind, password_hash, recovery_hash, email, reputation, cooldown_until, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET display_name=EXCLUDED.display_name, reputation=EXCLUDED.reputation, cooldown_until=EXCLUDED.cooldown_until, email=EXCLUDED.email`, [a.id, a.display_name, a.kind, a.password_hash || null, a.recovery_hash || null, a.email || null, a.reputation ?? 100, a.cooldown_until || 0, a.created_at || Date.now()]));
    },
    async getSession(hash) {
      const rows = await withTable('sessions', () => q(`SELECT * FROM facility_sessions WHERE token_hash = $1`, [hash]));
      return rows[0] || null;
    },
    async saveSession(s) {
      await withTable('sessions', () => q(`INSERT INTO facility_sessions (token_hash, account_id, created_at) VALUES ($1,$2,$3) ON CONFLICT (token_hash) DO NOTHING`, [s.token_hash, s.account_id, s.created_at]));
    },
    async deleteSession(hash) { await withTable('sessions', () => q(`DELETE FROM facility_sessions WHERE token_hash = $1`, [hash])); },
    async getRecord(accountId) {
      const rows = await withTable('records', () => q(`SELECT * FROM facility_records WHERE account_id = $1`, [accountId]));
      if (!rows[0]) return null;
      const r = rows[0]; return { account_id: r.account_id, games: r.games, wins: r.wins, losses: r.losses, best_final_hp: r.best_final_hp, achievements: typeof r.achievements === 'string' ? JSON.parse(r.achievements) : (r.achievements || []) };
    },
    async saveRecord(r) {
      await withTable('records', () => q(`INSERT INTO facility_records (account_id, games, wins, losses, best_final_hp, achievements) VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (account_id) DO UPDATE SET games=EXCLUDED.games, wins=EXCLUDED.wins, losses=EXCLUDED.losses, best_final_hp=EXCLUDED.best_final_hp, achievements=EXCLUDED.achievements`, [r.account_id, r.games, r.wins, r.losses, r.best_final_hp, JSON.stringify(r.achievements || [])]));
    },
    async getOAuth(state) {
      const rows = await withTable('oauth', () => q(`SELECT * FROM facility_oauth_states WHERE state = $1`, [state]));
      return rows[0] || null;
    },
    async saveOAuth(o) { await withTable('oauth', () => q(`INSERT INTO facility_oauth_states (state, created_at) VALUES ($1,$2) ON CONFLICT (state) DO NOTHING`, [o.state, o.created_at])); },
    async deleteOAuth(state) { await withTable('oauth', () => q(`DELETE FROM facility_oauth_states WHERE state = $1`, [state])); },
  };
}

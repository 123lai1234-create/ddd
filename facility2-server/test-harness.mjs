// facility2-server/test-harness.mjs — in-memory fake-Neon harness for facility2.
// Run: node facility2-server/test-harness.mjs
import { createApp } from './engine.mjs';
function memoryStore() {
  const rooms = new Map(), accounts = new Map(), byName = new Map(), byEmail = new Map(), sessions = new Map(), records = new Map(), oauth = new Map();
  return {
    async getRoom(c) { return rooms.get(String(c).toUpperCase()) || null; },
    async saveRoom(r) { rooms.set(r.code, r); },
    async listRooms() { return [...rooms.values()]; },
    async getAccount(id) { return accounts.get(id) || null; },
    async getAccountByName(n) { return byName.get(n) || null; },
    async getAccountByEmail(e) { return byEmail.get(e) || null; },
    async saveAccount(a) { accounts.set(a.id, a); byName.set(a.display_name, a); if (a.email) byEmail.set(a.email, a); },
    async getSession(h) { return sessions.get(h) || null; },
    async saveSession(s) { sessions.set(s.token_hash, s); },
    async deleteSession(h) { sessions.delete(h); },
    async getRecord(id) { return records.get(id) || null; },
    async saveRecord(r) { records.set(r.account_id, r); },
    async getOAuth(s) { return oauth.get(s) || null; },
    async saveOAuth(o) { oauth.set(o.state, o); },
    async deleteOAuth(s) { oauth.delete(s); },
  };
}
let pass = 0, fail = 0;
function check(name, cond, extra = '') { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name} ${extra}`); } }
const app = createApp(memoryStore());
const H = tok => ({ authorization: 'Bearer ' + tok });
const call = (method, path, body, tok) => app.handle(method, '/api/games/' + path, {}, body || {}, tok ? H(tok) : {});
const get = (path, tok) => app.handle('GET', '/api/games/' + path, {}, {}, tok ? H(tok) : {});
// 1 create accounts
const a1 = await call('POST', 'accounts', { action: 'create', displayName: '測試一號', guest: true });
check('account create guest', a1.status === 200 && !!a1.json.token && !!a1.json.recoveryCode, JSON.stringify(a1.json).slice(0, 200));
const a2 = await call('POST', 'accounts', { action: 'create', displayName: '測試二號', guest: true });
check('account create second', a2.status === 200 && !!a2.json.token);
const t1 = a1.json.token, t2 = a2.json.token;
// 2 create room
const cr = await call('POST', 'rooms', { roomType: 'casual' }, t1);
check('room create 201', cr.status === 201 && !!cr.json.room?.code, JSON.stringify(cr.json).slice(0, 200));
const code = cr.json.room.code;
// 3 join
const jn = await call('POST', `rooms/${code}`, { action: 'join' }, t2);
check('room join', jn.status === 200 && jn.json.room.players.length === 2, JSON.stringify(jn.json.room?.players?.length));
// 4 allocate
const al1 = await call('POST', `rooms/${code}`, { action: 'allocate', genes: { might: 4, weight: 3, speed: 3 }, spawn: '103' }, t1);
check('allocate p1', al1.status === 200 && al1.json.room.me.genes.might === 4);
const al2 = await call('POST', `rooms/${code}`, { action: 'allocate', genes: { might: 4, weight: 3, speed: 3 }, spawn: 'B402' }, t2);
check('allocate p2 spawn B402', al2.status === 200);
// invalid allocate total
const badAlloc = await call('POST', `rooms/${code}`, { action: 'allocate', genes: { might: 9, weight: 9, speed: 9 }, spawn: '103' }, t1);
check('allocate invalid total rejected', badAlloc.status === 400);
// 5 start (AI fill to 8)
const st = await call('POST', `rooms/${code}`, { action: 'start' }, t1);
check('start AI fill to 8', st.status === 200 && st.json.room.players.length === 8 && st.json.room.phase === 'action' && st.json.room.actionDeadline > Date.now(), `players=${st.json.room.players.length} phase=${st.json.room.phase}`);
// invalid action: empty path
const badAct = await call('POST', `rooms/${code}`, { action: 'action', path: [], vote: 'B7' }, t1);
check('empty action path rejected', badAct.status === 400, JSON.stringify(badAct.json));
// 6 action p1 then p2 -> settlement to day 2
const act1 = await call('POST', `rooms/${code}`, { action: 'action', path: ['104'], vote: 'B7' }, t1);
check('action p1 accepted', act1.status === 200 && act1.json.room.phase === 'action');
const act2 = await call('POST', `rooms/${code}`, { action: 'action', path: ['B503'], vote: 'B7' }, t2);
check('action settlement to day 2', act2.status === 200 && act2.json.room.day === 2, `day=${act2.json.room.day} phase=${act2.json.room.phase}`);
// 7 keep: p2 drew in B503, should have pendingKeep
const roomAfter = act2.json.room;
const me2 = roomAfter.me; // me is p2 (last caller)
check('keep pending exists', Array.isArray(me2.pendingKeep) && me2.pendingKeep.length > 0, `pending=${JSON.stringify(me2.pendingKeep)} phase=${roomAfter.phase}`);
const keepItems = me2.pendingKeep.slice(0, 2);
const kp = await call('POST', `rooms/${code}`, { action: 'keep', keep: keepItems }, t2);
check('keep selection applied', kp.status === 200 && kp.json.room.me.pendingKeep.length === 0 && kp.json.room.me.items.length >= keepItems.length, `items=${JSON.stringify(kp.json.room.me.items)}`);
// 8 world list
const w = await get('world');
check('world list contains room', w.status === 200 && w.json.rooms.some(r => r.code === code) && !JSON.stringify(w.json).includes('token'), `rooms=${w.json.rooms.length}`);
// 9 spectate read-only
const sp = await app.handle('GET', '/api/games/rooms/' + code, { spectate: '1' }, {}, {});
check('spectate view', sp.status === 200 && !!sp.json.room && sp.json.room.code === code);
// 10 reputation gate: create ranked with fresh low-rep? fresh acc has 100, so use a second check: casual room by p1 works, ranked also works at 100 — just check ranked create succeeds at 100
const rk = await call('POST', 'rooms', { roomType: 'ranked' }, t1);
check('ranked create at rep 100', rk.status === 201);
console.log(`\nHARNESS ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

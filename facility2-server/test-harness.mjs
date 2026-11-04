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
// 5 start (AI fill to 12; casual needs >=1 human, creator counts)
const st = await call('POST', `rooms/${code}`, { action: 'start' }, t1);
check('start AI fill to 12', st.status === 200 && st.json.room.players.length === 12 && st.json.room.phase === 'action' && st.json.room.actionDeadline > Date.now(), `players=${st.json.room.players.length} phase=${st.json.room.phase}`);
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
// 11 ranked start blocked with <5 humans; allocate speed 0 rejected; backtrack rejected
const rkCode = rk.json.room.code;
const rkStart = await call('POST', `rooms/${rkCode}`, { action: 'start' }, t1);
check('ranked start blocked under 5 humans', rkStart.status === 409, JSON.stringify(rkStart.json));
const cr2 = await call('POST', 'rooms', { roomType: 'casual' }, t1);
const code2 = cr2.json.room.code;
await call('POST', `rooms/${code2}`, { action: 'join' }, t2);
const badSpeed = await call('POST', `rooms/${code2}`, { action: 'allocate', genes: { might: 4, weight: 5, speed: 0 }, spawn: '103' }, t1);
check('allocate speed 0 rejected', badSpeed.status === 400, JSON.stringify(badSpeed.json));
await call('POST', `rooms/${code2}`, { action: 'allocate', genes: { might: 4, weight: 3, speed: 3 }, spawn: '103' }, t1);
await call('POST', `rooms/${code2}`, { action: 'allocate', genes: { might: 4, weight: 3, speed: 3 }, spawn: 'B402' }, t2);
await call('POST', `rooms/${code2}`, { action: 'start' }, t1);
const back = await call('POST', `rooms/${code2}`, { action: 'action', path: ['104', '103'] }, t1);
check('backtrack path rejected', back.status === 400, JSON.stringify(back.json));
// 12 private chat: tea channel only visible to tea members
await call('POST', `rooms/${code2}`, { action: 'chatChannel', channel: 'tea' }, t1);
await call('POST', `rooms/${code2}`, { action: 'chat', text: '茶水間密話' }, t1);
const view1 = await get(`rooms/${code2}`, t1);
const view2 = await get(`rooms/${code2}`, t2);
check('private chat tea visible to member', JSON.stringify(view1.json.room.chat.messages).includes('茶水間密話'), JSON.stringify(view1.json.room.chat));
check('private chat tea hidden from public member', !JSON.stringify(view2.json.room.chat.messages).includes('茶水間密話'), JSON.stringify(view2.json.room.chat));
check('vote secrecy: no gasVotes in playerView', view2.json.room.gasVotes === undefined && Array.isArray(view2.json.room.gassedFloors), JSON.stringify(Object.keys(view2.json.room)));
// 12b settlement bug regression: single human + AI bots must settle on the FIRST action, not wait for a duplicate
const cr3 = await call('POST', 'rooms', { roomType: 'casual' }, t1);
const code3 = cr3.json.room.code;
await call('POST', `rooms/${code3}`, { action: 'allocate', genes: { might: 4, weight: 3, speed: 3 }, spawn: '103' }, t1);
await call('POST', `rooms/${code3}`, { action: 'start' }, t1);
const firstAct = await call('POST', `rooms/${code3}`, { action: 'action', path: ['104'], vote: 'B7' }, t1);
check('single-human first action settles immediately', firstAct.status === 200 && firstAct.json.room.day === 2, `day=${firstAct.json.room.day} phase=${firstAct.json.room.phase}`);
// 12c duplicate submission guard: in a multi-human room, resubmitting must not move the player or recount the vote
const cr4 = await call('POST', 'rooms', { roomType: 'casual' }, t1);
const code4 = cr4.json.room.code;
await call('POST', `rooms/${code4}`, { action: 'join' }, t2);
await call('POST', `rooms/${code4}`, { action: 'allocate', genes: { might: 4, weight: 3, speed: 3 }, spawn: '103' }, t1);
await call('POST', `rooms/${code4}`, { action: 'allocate', genes: { might: 4, weight: 3, speed: 3 }, spawn: 'B402' }, t2);
await call('POST', `rooms/${code4}`, { action: 'start' }, t1);
const dup1 = await call('POST', `rooms/${code4}`, { action: 'action', path: ['104'], vote: 'B7' }, t1);
const dup2 = await call('POST', `rooms/${code4}`, { action: 'action', path: ['202'], vote: 'B7' }, t1);
check('duplicate action ignored, player stays', dup1.status === 200 && dup2.status === 200 && dup2.json.room.me.room === '104' && dup2.json.room.phase === 'action', `room=${dup2.json.room.me.room} phase=${dup2.json.room.phase}`);
// 13 validatePath unit: teleport + flight
const { validatePathForTest, botActionForTest, settleForTest } = app;
const mkP = (o) => Object.assign({ hp: 10, alive: true, shadow: false, room: '103', genes: { might: 4, weight: 3, speed: 3 }, items: [], flyNext: false, adrenalineUntil: 0 }, o);
check('teleport B403 to empty room ok', validatePathForTest(mkP({ room: 'B403' }), ['104'], 1) === null);
check('teleport B403 to special room rejected', validatePathForTest(mkP({ room: 'B403' }), ['201'], 1) !== null);
check('teleport B403 to pool room rejected', validatePathForTest(mkP({ room: 'B403' }), ['B501'], 1) !== null);
check('flight 202 to H room ok', validatePathForTest(mkP({ room: '202', flyNext: true }), ['101'], 1) === null);
check('flight 202 to non-H room rejected', validatePathForTest(mkP({ room: '202', flyNext: true }), ['103'], 1) !== null);
check('flight without qualification rejected', validatePathForTest(mkP({ room: '202', flyNext: false }), ['101'], 1) !== null);
check('slide B105 to B503 ok, reverse rejected', validatePathForTest(mkP({ room: 'B105' }), ['B503'], 1) === null && validatePathForTest(mkP({ room: 'B503' }), ['B105'], 1) !== null);
// 14 bot difficulty behaviour
const botRoom = { players: [{ name: 'A', room: 'B102' }, { name: 'B', room: 'B102' }, { name: 'C', room: 'B201' }] };
const nov = botActionForTest(botRoom, mkP({ room: 'B102', botDifficulty: 'novice' }));
check('novice bot 1 step first neighbour no uses', nov.path.length === 1 && nov.uses.length === 0, JSON.stringify(nov));
const dem = botActionForTest(botRoom, mkP({ room: 'B102', botDifficulty: 'demon', hp: 5, items: ['pill'] }));
check('demon bot votes busiest floor and uses pill', dem.vote === 'B1' && dem.uses.includes('pill'), JSON.stringify(dem));
// 15 settle unit: gas tie -> all tied floors gassed
const mkS = (o) => Object.assign({ hp: 10, alive: true, shadow: false, shadowHp: 0, genes: { might: 4, weight: 3, speed: 3 }, items: [], submitted: {}, pendingKeep: [], readyFree: false, voteFloor: null }, o);
{
  const room = { day: 1, players: [mkS({ name: 'A', room: 'B102' }), mkS({ name: 'B', room: 'B201' }), mkS({ name: 'C', room: 'B301' })], gasVotes: { B1: 2, B2: 2, B3: 1 }, detoxed: [], gassedFloors: [], taken: {}, morguePool: [], log: [], phase: 'action' };
  settleForTest(room, room.log);
  check('gas tie gasses all tied floors', room.gassedFloors.includes('B1') && room.gassedFloors.includes('B2') && !room.gassedFloors.includes('B3'), JSON.stringify(room.gassedFloors));
  check('gas tie damage day1 = 1', room.players[0].hp === 9 && room.players[1].hp === 9 && room.players[2].hp === 10, JSON.stringify(room.players.map(p => p.hp)));
}
// 16 settle unit: water/food from day 2
{
  const room = { day: 2, players: [mkS({ name: 'Exempt', room: 'B204' }), mkS({ name: 'Both', room: 'B201', items: ['water', 'food'] }), mkS({ name: 'Neither', room: 'B203' }), mkS({ name: 'WaterOnly', room: 'B205', items: ['water'] }), mkS({ name: 'Kit', room: 'B202', items: ['survival_kit'] })], gasVotes: {}, detoxed: [], gassedFloors: [], taken: {}, morguePool: [], log: [], phase: 'action' };
  settleForTest(room, room.log);
  const h = Object.fromEntries(room.players.map(p => [p.name, p.hp]));
  check('water/food day2 outcomes', h.Exempt === 10 && h.Both === 10 && h.Neither === 8 && h.WaterOnly === 9 && h.Kit === 10, JSON.stringify(h));
  check('water/food consumption', room.players[1].items.length === 0 && room.players[4].items.length === 0, JSON.stringify(room.players.map(p => p.items)));
}
// 17 settle unit: shadow conversion + drain + revival
{
  const room = { day: 1, players: [mkS({ name: 'Dying', room: 'B102', hp: 1, items: ['knife'] })], gasVotes: { B1: 5 }, detoxed: [], gassedFloors: [], taken: {}, morguePool: [], log: [], phase: 'action' };
  settleForTest(room, room.log);
  const d = room.players[0];
  check('shadow conversion to B701 with morgue drop', d.shadow === true && d.room === 'B701' && d.shadowMight === 4 && room.morguePool.includes('knife'), JSON.stringify(d));
  const room2 = { day: 2, players: [mkS({ name: 'Sh', room: 'B701', alive: false, shadow: true, shadowHp: 2 }), mkS({ name: 'Alive', room: 'B701' })], gasVotes: {}, detoxed: [], gassedFloors: [], taken: {}, morguePool: [], log: [], phase: 'action' };
  settleForTest(room2, room2.log);
  const sh = room2.players[0], al = room2.players[1];
  check('shadow drain + revival', sh.shadow === false && sh.hp === 3 && al.hp === 7, `sh=${JSON.stringify(sh)} al=${JSON.stringify(al)}`);
}
// 18 settle unit: airdrop sequence + item use
{
  const room = { day: 1, players: [mkS({ name: 'Fly', room: '202' })], gasVotes: {}, detoxed: [], gassedFloors: [], taken: {}, morguePool: [], log: [], phase: 'action' };
  settleForTest(room, room.log);
  check('airdrop day1 is bayonet', JSON.stringify(room.players[0].pendingKeep) === JSON.stringify(['bayonet']), JSON.stringify(room.players[0].pendingKeep));
  const room2 = { day: 2, players: [mkS({ name: 'Fly2', room: '202' })], gasVotes: {}, detoxed: [], gassedFloors: [], taken: { '202': 1 }, morguePool: [], log: [], phase: 'action' };
  settleForTest(room2, room2.log);
  check('airdrop day2 is fine_wine', JSON.stringify(room2.players[0].pendingKeep) === JSON.stringify(['fine_wine']), JSON.stringify(room2.players[0].pendingKeep));
  const room3 = { day: 1, players: [mkS({ name: 'Med', room: 'B102', hp: 5, items: ['pill', 'adrenaline'], submitted: { uses: ['pill', 'adrenaline'] } })], gasVotes: {}, detoxed: [], gassedFloors: [], taken: {}, morguePool: [], log: [], phase: 'action' };
  settleForTest(room3, room3.log);
  check('item use pill + adrenaline', room3.players[0].hp === 7 && room3.players[0].adrenalineUntil === 2 && room3.players[0].items.length === 0, JSON.stringify(room3.players[0]));
}
// 19b settle unit: control detox removes a gassed floor before damage and blocks re-gassing
{
  const room = { day: 1, players: [mkS({ name: 'Ctrl', room: 'B101', submitted: { control: 'detox', detoxFloor: 'B1' } }), mkS({ name: 'Victim', room: 'B102' })], gasVotes: { B1: 5 }, detoxed: [], gassedFloors: ['B1'], taken: {}, morguePool: [], log: [], phase: 'action' };
  settleForTest(room, room.log);
  check('control detox clears floor and spares occupants', !room.gassedFloors.includes('B1') && room.detoxed.includes('B1') && room.players[0].hp === 10 && room.players[1].hp === 10, JSON.stringify({ gassed: room.gassedFloors, detoxed: room.detoxed, hp: room.players.map(p => p.hp) }));
}
// 19 settle unit: finish ranking (gold-converted HP, might tiebreak, shadows by pre-death might)
{
  const room = { day: 6, players: [
    mkS({ name: 'A', room: 'B102', hp: 5, items: ['water', 'food', 'gold_bar', 'gold_bar'], genes: { might: 4, weight: 3, speed: 3 } }),
    mkS({ name: 'B', room: 'B201', hp: 7, items: ['water', 'food'], genes: { might: 5, weight: 3, speed: 3 } }),
    mkS({ name: 'C', room: 'B701', alive: false, shadow: true, shadowHp: 1, shadowMight: 6, lastAliveHp: 8 }),
    mkS({ name: 'D', room: 'B701', alive: false, shadow: true, shadowHp: 0, shadowMight: 3, lastAliveHp: 9 }),
  ], gasVotes: {}, detoxed: [], gassedFloors: [], taken: {}, morguePool: [], log: [], phase: 'action' };
  settleForTest(room, room.log);
  check('finish ranking B,A,C,D with B winner', room.phase === 'finished' && JSON.stringify(room.ranking.map(r => r.name)) === JSON.stringify(['B', 'A', 'C', 'D']) && JSON.stringify(room.winners) === JSON.stringify(['B']), JSON.stringify(room.ranking));
}
console.log(`\nHARNESS ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

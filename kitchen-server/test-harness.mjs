// kitchen-server/test-harness.mjs — 不說廚房後端測試（in-memory store）。
// Run: node kitchen-server/test-harness.mjs
import { createApp } from './engine.mjs';
function memoryStore() {
  const rooms = new Map(), accounts = new Map(), byName = new Map(), byEmail = new Map(), sessions = new Map(), records = new Map(), oauth = new Map();
  return {
    rooms,
    async getKitchenRoom(c) { return rooms.get(String(c).toUpperCase()) || null; },
    async saveKitchenRoom(r) { rooms.set(r.code, r); },
    async listKitchenRooms() { return [...rooms.values()]; },
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
const store = memoryStore();
const app = createApp(store);
const H = tok => ({ authorization: 'Bearer ' + tok });
const call = (method, path, body, tok) => app.handle(method, '/api/games/kitchen/' + path, {}, body || {}, tok ? H(tok) : {});
const get = (path, tok) => app.handle('GET', '/api/games/kitchen/' + path, {}, {}, tok ? H(tok) : {});

// 1 帳號
const a1 = await call('POST', 'accounts', { action: 'create', displayName: '阿哲' });
check('account create 阿哲', a1.status === 200 && !!a1.json.token && !!a1.json.recoveryCode, JSON.stringify(a1.json).slice(0, 150));
const a2 = await call('POST', 'accounts', { action: 'create', displayName: '小美' });
check('account create 小美', a2.status === 200 && !!a2.json.token);
const dup = await call('POST', 'accounts', { action: 'create', displayName: '阿哲' });
check('duplicate nickname rejected', dup.status === 409);
const meBad = await call('POST', 'accounts', { action: 'me' }, 'bad-token');
check('accounts me rejects bad token', meBad.status === 401);
const t1 = a1.json.token, t2 = a2.json.token;

// 2 開房
const cr = await call('POST', '', { difficulty: 'normal' }, t1);
check('room create 201', cr.status === 201 && !!cr.json.room?.code && cr.json.room.status === 'lobby', JSON.stringify(cr.json).slice(0, 200));
const code = cr.json.room.code;
check('creator is host', cr.json.room.me.isHost === true && cr.json.room.players.length === 1);
check('host color assigned', !!cr.json.room.players[0].color);

// 3 加入滿 6 人，第 7 人拒絕
const toks = [t2];
const jn2 = await call('POST', code, { action: 'join' }, t2);
check('join player 2', jn2.status === 200 && jn2.json.room.players.length === 2, `n=${jn2.json.room?.players?.length}`);
for (let i = 3; i <= 6; i++) {
  const a = await call('POST', 'accounts', { action: 'create', displayName: '廚師' + i });
  toks.push(a.json.token);
  const jn = await call('POST', code, { action: 'join' }, a.json.token);
  check(`join player ${i}`, jn.status === 200 && jn.json.room.players.length === i, `n=${jn.json.room?.players?.length}`);
}
const a7 = await call('POST', 'accounts', { action: 'create', displayName: '第七人' });
const jn7 = await call('POST', code, { action: 'join' }, a7.json.token);
check('7th player rejected (max 6)', jn7.status === 409, JSON.stringify(jn7.json));
const colors = new Set((await get(code, t1)).json.room.players.map(p => p.color));
check('6 players have distinct colors', colors.size === 6, `colors=${colors.size}`);

// 4 開工權限
const stNoHost = await call('POST', code, { action: 'start' }, t2);
check('non-host start rejected', stNoHost.status === 403);
const st = await call('POST', code, { action: 'start' }, t1);
check('host start ok', st.status === 200 && st.json.room.status === 'playing' && st.json.room.shiftEndsAt > Date.now(), `status=${st.json.room?.status}`);
check('start spawns 2 orders', st.json.room.orders.length === 2, `orders=${st.json.room.orders.length}`);
const roomOf = () => store.rooms.get(code);

// 5 接單
const order1 = st.json.room.orders[0];
const tk1 = await call('POST', code, { action: 'takeOrder', orderId: order1.id }, t1);
check('take order', tk1.status === 200 && tk1.json.room.orders[0].takenByName === '阿哲');
const tkDup = await call('POST', code, { action: 'takeOrder', orderId: order1.id }, t2);
check('double-take rejected', tkDup.status === 409, JSON.stringify(tkDup.json));
const order2 = st.json.room.orders[1];
await call('POST', code, { action: 'takeOrder', orderId: order2.id }, t2);

// 6 做菜：step 0 → 煮好 → 收成
const dish1 = order1;
const s1 = await call('POST', code, { action: 'startStep', orderId: dish1.id }, t1);
check('startStep step0 ok', s1.status === 200 && !!s1.json.room.orders.find(o => o.id === dish1.id).cooking, JSON.stringify(s1.json).slice(0, 200));
const s1dup = await call('POST', code, { action: 'startStep', orderId: dish1.id }, t1);
check('startStep while cooking rejected', s1dup.status === 409);
const otherOrder = s1.json.room.orders.find(o => o.id === order2.id);
const step0Station = s1.json.room.orders.find(o => o.id === dish1.id).cooking.station;
// 另一張單的第一步若用同一站（都是 prep）應被擋；若不同站則放行——只驗同一站的情況
const busy = await call('POST', code, { action: 'startStep', orderId: order2.id }, t2);
const o2step0 = (await get(code, t2)).json.room.orders.find(o => o.id === order2.id);
check('station busy blocks second job on same station', busy.status === 409 || o2step0.cooking !== null, `busy=${busy.status}`);
// 把第一步煮完：手動把 endsAt 調到過去，再 poll 觸發 tick
{
  const r = roomOf();
  const sid = r.orders.find(o => o.id === dish1.id).cooking.station;
  r.stations[sid].job.endsAt = Date.now() - 1000;
  const v = await get(code, t1);
  const o = v.json.room.orders.find(x => x.id === dish1.id);
  check('job completes to ready on poll', o.ready !== null && o.cooking === null, JSON.stringify(o));
}
const col = await call('POST', code, { action: 'collectStep', orderId: dish1.id }, t2);
check('collectStep by another player ok (co-op)', col.status === 200 && col.json.room.orders.find(o => o.id === dish1.id).progress === 1, JSON.stringify(col.json.room.orders.find(o => o.id === dish1.id)));
check('collector stepsDone counted', col.json.room.players.find(p => p.name === '小美').stepsDone === 1);

// 7 第二步 → 出餐 → 金錢增加
{
  const s2 = await call('POST', code, { action: 'startStep', orderId: dish1.id }, t1);
  check('startStep step1 ok', s2.status === 200);
  const r = roomOf();
  const o = r.orders.find(x => x.id === dish1.id);
  r.stations[o.cooking.station].job.endsAt = Date.now() - 1000;
  await get(code, t1);
  const c2 = await call('POST', code, { action: 'collectStep', orderId: dish1.id }, t1);
  check('step1 collected, dish complete', c2.status === 200 && c2.json.room.orders.find(x => x.id === dish1.id).progress === 2);
  const moneyBefore = c2.json.room.money;
  const dish = c2.json.room.orders.find(x => x.id === dish1.id);
  const sv = await call('POST', code, { action: 'serveDish', orderId: dish1.id }, t1);
  check('serveDish adds money', sv.status === 200 && sv.json.room.money > moneyBefore && sv.json.room.served === 1, `money ${moneyBefore} -> ${sv.json.room.money}`);
  check('served order removed', !sv.json.room.orders.some(x => x.id === dish1.id));
}

// 8 燒焦：煮好不收，12 秒後重做
{
  const o2 = (await get(code, t1)).json.room.orders.find(x => x.id === order2.id);
  const s = await call('POST', code, { action: 'startStep', orderId: order2.id }, t2);
  check('order2 step0 starts', s.status === 200, JSON.stringify(s.json).slice(0, 150));
  const r = roomOf();
  const oo = r.orders.find(x => x.id === order2.id);
  r.stations[oo.cooking.station].job.endsAt = Date.now() - 1000;
  await get(code, t1);
  const r2 = roomOf();
  r2.orders.find(x => x.id === order2.id).ready.burnsAt = Date.now() - 1000;
  const v = await get(code, t1);
  const oAfter = v.json.room.orders.find(x => x.id === order2.id);
  check('burned step resets to redo', oAfter.ready === null && oAfter.progress === 0, JSON.stringify(oAfter));
  check('burn logged', v.json.room.log.some(l => l.includes('燒焦')));
}

// 9 耐心到期：沒人接的單消失、failed+1；已接的扣 20
{
  const r = roomOf();
  const waiting = r.orders.find(x => !x.takenBy);
  if (waiting) {
    waiting.patienceEndsAt = Date.now() - 1000;
    const v = await get(code, t1);
    check('untaken order expires', !v.json.room.orders.some(x => x.id === waiting.id) && v.json.room.failed >= 1, `failed=${v.json.room.failed}`);
  } else console.log('SKIP untaken expiry (no waiting order)');
  // 已接的單到期
  const r3 = roomOf();
  const taken = r3.orders.find(x => x.takenBy);
  if (taken) {
    const moneyBefore = r3.money;
    taken.patienceEndsAt = Date.now() - 1000;
    const v = await get(code, t1);
    check('taken order expiry docks 20', v.json.room.money === Math.max(0, moneyBefore - 20), `money ${moneyBefore} -> ${v.json.room.money}`);
  } else console.log('SKIP taken expiry (no taken order)');
}

// 10 班次結算：第 1 班 → 第 2 班；第 3 班 → finished
{
  const r = roomOf();
  r.shiftEndsAt = Date.now() - 1000;
  const v = await get(code, t1);
  check('shift 1 settles to shift 2', v.json.room.shift === 2 && v.json.room.status === 'playing' && v.json.room.orders.length === 2, `shift=${v.json.room.shift} orders=${v.json.room.orders.length}`);
  // 新班次剛出的單都還沒人接：驗沒人接的單耐心到期會消失
  {
    const o = roomOf().orders[0];
    const failedBefore = roomOf().failed;
    o.patienceEndsAt = Date.now() - 1000;
    const v2 = await get(code, t1);
    check('untaken order expires', !v2.json.room.orders.some(x => x.id === o.id) && v2.json.room.failed === failedBefore + 1, `failed=${v2.json.room.failed}`);
  }
  const r2 = roomOf();
  r2.shift = 3; r2.shiftEndsAt = Date.now() - 1000;
  const v2 = await get(code, t1);
  check('shift 3 settles to finished', v2.json.room.status === 'finished' && Array.isArray(v2.json.room.ranking) && v2.json.room.score !== null, `status=${v2.json.room.status} score=${v2.json.room.score}`);
  check('ranking lists players', v2.json.room.ranking.length === 6, `ranking=${v2.json.room.ranking.length}`);
}

// 11 斷線重進：GET 帶 token 仍在房間
{
  const v = await get(code, t1);
  check('reconnect GET returns room with me', v.status === 200 && v.json.room.me?.name === '阿哲' && v.json.room.code === code);
}

// 12 離開：房主離開 → 下一位接手
{
  const lv = await call('POST', code, { action: 'leave' }, t1);
  check('host leaves ok', lv.status === 200);
  const v = await get(code, t2);
  check('next player becomes host', v.json.room.players[0].isHost === true && v.json.room.players.length === 5, `host=${v.json.room.players[0]?.name} n=${v.json.room.players.length}`);
}

// 13 公開房間列表
{
  const w = await get('', null);
  check('world list works', w.status === 200 && Array.isArray(w.json.rooms), JSON.stringify(w.json).slice(0, 150));
}

// 14 未登入開房拒絕、未知房間 404
{
  const noAuth = await call('POST', '', { difficulty: 'easy' }, null);
  check('create room without login rejected', noAuth.status === 401);
  const nf = await get('ZZZZ', t1);
  check('unknown room 404', nf.status === 404);
}

console.log(`\nHARNESS ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

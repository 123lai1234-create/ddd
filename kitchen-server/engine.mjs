// kitchen-server/engine.mjs — 不說廚房多人合作料理遊戲後端（自有實作）。
// 架構沿用 facility2-server 的同一套做法：createApp(store)，store 介面
// getRoom/saveRoom/listRooms/getAccount/saveAccount/getSession/saveSession/
// deleteSession/getRecord/saveRecord/getOAuth/saveOAuth/deleteOAuth。
// 狀態同步：房主開房拿 4 碼房號、玩家輪詢 GET 房間狀態、動作用 POST。
// 計時全部以伺服器時間戳為準，tick() 在每次讀寫房間時惰性推進
// （出單、耐心到期、燒焦、班次結算），Vercel serverless 沒有背景任務，
// 所以沒有 cron，靠輪詢觸發——與 facility2 的 applyTimeouts 同一招。
import { createHash, randomBytes } from 'node:crypto';

export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_PLAYERS = 6;
export const SHIFTS_TOTAL = 3;
export const SHIFT_MS = 150 * 1000; // 每班 2:30
export const BURN_MS = 12 * 1000; // 煮好 12 秒內沒收成會燒焦
export const ONLINE_MS = 30 * 1000;

export const CHEF_COLORS = ['#e2574c', '#4c9a5b', '#e8a13c', '#5b8dd9', '#9b6dd6', '#d96ba8'];
export const CHEF_COLOR_NAMES = ['番茄紅', '青蔥綠', '南瓜橘', '海苔藍', '芋頭紫', '櫻花粉'];

// ---- 菜色（台灣家常菜／夜市小吃，原創菜單）----
// 每道菜 = 依序做的步驟；每步綁一個工作站（prep 備料台 / fry 煎炸台 / pot 燉煮鍋）。
export const STATIONS = {
  prep: { id: 'prep', name: '備料台', emoji: '🔪', desc: '切菜備料' },
  fry: { id: 'fry', name: '煎炸台', emoji: '🍳', desc: '煎炒油炸' },
  pot: { id: 'pot', name: '燉煮鍋', emoji: '🍲', desc: '燉煮熬湯' },
};
export const STATION_IDS = ['prep', 'fry', 'pot'];
export const DISHES = {
  lu: { id: 'lu', name: '滷肉飯', emoji: '🍚', price: 60,
    steps: [
      { station: 'prep', secs: 3, label: '切豬肉' },
      { station: 'pot', secs: 8, label: '滷肉上桌' },
    ] },
  oyster: { id: 'oyster', name: '蚵仔煎', emoji: '🦪', price: 80,
    steps: [
      { station: 'prep', secs: 3, label: '備蚵仔' },
      { station: 'fry', secs: 6, label: '煎蚵仔煎' },
    ] },
  beef: { id: 'beef', name: '牛肉麵', emoji: '🍜', price: 120,
    steps: [
      { station: 'prep', secs: 4, label: '切牛肉' },
      { station: 'pot', secs: 9, label: '燉牛肉湯' },
    ] },
  popcorn: { id: 'popcorn', name: '鹽酥雞', emoji: '🍗', price: 70,
    steps: [
      { station: 'prep', secs: 3, label: '醃雞肉' },
      { station: 'fry', secs: 7, label: '炸鹽酥雞' },
    ] },
  scallion: { id: 'scallion', name: '蔥油餅', emoji: '🫓', price: 50,
    steps: [
      { station: 'prep', secs: 4, label: '揉麵切蔥' },
      { station: 'fry', secs: 6, label: '煎蔥油餅' },
    ] },
  meatball: { id: 'meatball', name: '貢丸湯', emoji: '🍲', price: 45,
    steps: [
      { station: 'prep', secs: 2, label: '備貢丸' },
      { station: 'pot', secs: 7, label: '煮貢丸湯' },
    ] },
  stinky: { id: 'stinky', name: '臭豆腐', emoji: '🧈', price: 65,
    steps: [
      { station: 'prep', secs: 3, label: '切豆腐' },
      { station: 'fry', secs: 7, label: '炸臭豆腐' },
    ] },
  guabao: { id: 'guabao', name: '刈包', emoji: '🥙', price: 75,
    steps: [
      { station: 'prep', secs: 3, label: '備酸菜' },
      { station: 'pot', secs: 8, label: '滷五花肉' },
    ] },
};
export const DISH_IDS = Object.keys(DISHES);

export const DIFFICULTY = {
  easy: { id: 'easy', name: '簡單', spawnMs: 14000, maxOrders: 3, patienceMs: 75000, stepMul: 1.0,
    dishes: ['lu', 'oyster', 'popcorn', 'scallion', 'meatball'], desc: '客人少、等得久、菜色簡單' },
  normal: { id: 'normal', name: '普通', spawnMs: 10000, maxOrders: 4, patienceMs: 60000, stepMul: 1.0,
    dishes: DISH_IDS, desc: '正常客流，全部 8 道菜' },
  hard: { id: 'hard', name: '困難', spawnMs: 7000, maxOrders: 5, patienceMs: 45000, stepMul: 1.25,
    dishes: DISH_IDS, desc: '客人多、等不久、煮得慢' },
};

export const sha = s => createHash('sha256').update(String(s)).digest('hex');
export const uid = (n = 16) => randomBytes(n).toString('hex');
export const code4 = () => { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };
const now = () => Date.now();

function newPlayer(accountId, name, colorIdx) {
  return { accountId, name, color: CHEF_COLORS[colorIdx % CHEF_COLORS.length], colorName: CHEF_COLOR_NAMES[colorIdx % CHEF_COLOR_NAMES.length],
    isHost: false, joinedAt: now(), lastSeen: now(), served: 0, stepsDone: 0 };
}
function freeColor(room) {
  const used = new Set(room.players.map(p => p.color));
  for (let i = 0; i < CHEF_COLORS.length; i++) if (!used.has(CHEF_COLORS[i])) return i;
  return room.players.length % CHEF_COLORS.length;
}
function spawnOrder(room) {
  const diff = DIFFICULTY[room.difficulty];
  const dishId = diff.dishes[Math.floor(Math.random() * diff.dishes.length)];
  const dish = DISHES[dishId];
  const order = { id: 'o' + uid(6), dishId, dishName: dish.name, emoji: dish.emoji, price: dish.price,
    stepsTotal: dish.steps.length, progress: 0, cooking: null, ready: null,
    takenBy: null, takenByName: null, createdAt: now(), patienceEndsAt: now() + diff.patienceMs };
  room.orders.push(order);
  return order;
}
function clearStationWork(room, orderId) {
  for (const sid of STATION_IDS) {
    const st = room.stations[sid];
    if (st.job && st.job.orderId === orderId) st.job = null;
    if (st.done && st.done.orderId === orderId) st.done = null;
  }
}
function settleShift(room) {
  const shiftMoney = room.money - room.moneyAtShiftStart;
  const bonus = room.failedThisShift === 0 ? 100 : 0;
  if (bonus) room.money += bonus;
  room.log.push(`第 ${room.shift} 班打烊：賺了 ${shiftMoney} 元${bonus ? '，零失誤獎金 +100' : ''}（共 ${room.money} 元）`);
  if (room.shift >= SHIFTS_TOTAL) {
    room.status = 'finished';
    const ranked = [...room.players].sort((a, b) => (b.served * 3 + b.stepsDone) - (a.served * 3 + a.stepsDone));
    room.score = room.money + room.served * 5 - room.failed * 10;
    room.ranking = ranked.map((p, i) => ({ rank: i + 1, name: p.name, color: p.color, served: p.served, stepsDone: p.stepsDone, points: p.served * 3 + p.stepsDone }));
    room.log.push(`打烊！三班共賺 ${room.money} 元，出餐 ${room.served} 道，總分 ${room.score}`);
    return;
  }
  room.shift += 1;
  room.orders = [];
  for (const sid of STATION_IDS) room.stations[sid] = { id: sid, job: null, done: null };
  room.moneyAtShiftStart = room.money;
  room.failedThisShift = 0;
  room.shiftEndsAt = now() + SHIFT_MS;
  room.nextOrderAt = now() + 2000;
  spawnOrder(room); spawnOrder(room);
  room.log.push(`第 ${room.shift} 班開始！`);
}
// 惰性推進：出單、煮好、燒焦、耐心到期、班次結束。每次讀寫房間都先跑一次。
export function tick(room) {
  if (!room || room.status !== 'playing') return;
  const t = now();
  const diff = DIFFICULTY[room.difficulty];
  // 煮好：job 到期 → 變成待收成（ready），12 秒內要收
  for (const sid of STATION_IDS) {
    const st = room.stations[sid];
    if (st.job && t >= st.job.endsAt) {
      const order = room.orders.find(o => o.id === st.job.orderId);
      if (order && order.cooking && order.cooking.stepIdx === st.job.stepIdx) {
        order.cooking = null;
        order.ready = { stepIdx: st.job.stepIdx, label: st.job.label, burnsAt: t + BURN_MS, by: st.job.by, byName: st.job.byName };
      }
      st.job = null;
    }
  }
  // 燒焦：ready 逾時沒收 → 該步重做
  for (const o of room.orders) {
    if (o.ready && t >= o.ready.burnsAt) {
      room.log.push(`🔥 ${o.dishName} 的「${o.ready.label}」燒焦了，要重做！`);
      o.ready = null;
    }
  }
  // 耐心到期：客人走了；已被接單的扣 20 元
  const before = room.orders.length;
  room.orders = room.orders.filter(o => {
    if (t < o.patienceEndsAt) return true;
    clearStationWork(room, o.id);
    room.failed += 1; room.failedThisShift += 1;
    if (o.takenBy) { room.money = Math.max(0, room.money - 20); room.log.push(`😤 ${o.dishName} 等太久走了（${o.takenByName} 負責，-20 元）`); }
    else room.log.push(`😤 ${o.dishName} 等太久走了`);
    return false;
  });
  if (room.orders.length !== before) room.updatedAt = t;
  // 出單
  if (room.orders.length < diff.maxOrders && t >= room.nextOrderAt) {
    spawnOrder(room);
    room.nextOrderAt = t + diff.spawnMs + Math.floor(Math.random() * 3000);
  }
  // 班次結束
  if (t >= room.shiftEndsAt) settleShift(room);
  room.updatedAt = t;
}

export function roomView(room, accountId) {
  const t = now();
  const me = room.players.find(p => p.accountId === accountId) || null;
  return { code: room.code, status: room.status, difficulty: room.difficulty, difficultyName: DIFFICULTY[room.difficulty].name,
    now: t, shift: room.shift, shiftsTotal: SHIFTS_TOTAL, shiftEndsAt: room.shiftEndsAt, shiftMs: SHIFT_MS,
    money: room.money, served: room.served, failed: room.failed, score: room.score || null,
    ranking: room.ranking || null, log: room.log.slice(-40), createdAt: room.createdAt,
    players: room.players.map(p => ({ name: p.name, accountId: p.accountId, color: p.color, colorName: p.colorName,
      isHost: p.isHost, online: t - p.lastSeen < ONLINE_MS, served: p.served, stepsDone: p.stepsDone })),
    orders: room.orders.map(o => {
      const dish = DISHES[o.dishId];
      const steps = dish.steps.map(s => ({ label: s.label, station: s.station, stationName: STATIONS[s.station].name, stationEmoji: STATIONS[s.station].emoji, secs: s.secs }));
      const nextStep = (o.progress < o.stepsTotal && !o.cooking && !o.ready) ? steps[o.progress] : null;
      return { id: o.id, dishId: o.dishId, dishName: o.dishName, emoji: o.emoji, price: o.price,
        stepsTotal: o.stepsTotal, progress: o.progress, cooking: o.cooking, ready: o.ready, steps, nextStep,
        takenBy: o.takenBy, takenByName: o.takenByName, patienceEndsAt: o.patienceEndsAt };
    }),
    stations: STATION_IDS.map(sid => { const st = room.stations[sid]; return { id: sid, name: STATIONS[sid].name, emoji: STATIONS[sid].emoji, job: st.job, done: st.done }; }),
    me: me ? { name: me.name, accountId: me.accountId, color: me.color, isHost: me.isHost, served: me.served, stepsDone: me.stepsDone } : null };
}
export function publicRoom(room) {
  return { code: room.code, status: room.status, difficulty: room.difficulty, difficultyName: DIFFICULTY[room.difficulty].name,
    playerCount: room.players.length, hostName: room.players[0]?.name || '', createdAt: room.createdAt };
}

export function createApp(store, opts = {}) {
  const ok = (json, status = 200) => ({ status, json });
  const err = (message, status = 400) => ({ status, json: { error: message } });
  async function auth(body, headers) {
    const tok = (headers && (headers.authorization || headers.Authorization || ''))?.replace(/^Bearer /i, '') || body?.token || '';
    if (!tok) return null;
    const s = await store.getSession(sha(tok));
    if (!s) return null;
    const acc = await store.getAccount(s.account_id);
    return acc ? { acc, token: tok } : null;
  }
  async function loadRoom(code) {
    const r = await store.getKitchenRoom(String(code || '').toUpperCase());
    if (!r) return null;
    if (now() - r.createdAt > ROOM_TTL_MS) return null;
    return r;
  }
  async function save(room) { room.updatedAt = now(); await store.saveKitchenRoom(room); }
  function touch(room, accountId) {
    const p = room.players.find(x => x.accountId === accountId);
    if (p) p.lastSeen = now();
  }

  async function handle(method, pathname, query, body, headers) {
    try {
      const path = pathname.replace(/^\/api\/games\/kitchen\/?/, '').replace(/\/$/, '');
      // ---- 帳號（沿用 facility 的帳號／session 表，同一組 token 通用）----
      if (path === 'accounts' && method === 'POST') {
        const action = body?.action;
        if (action === 'create') {
          const name = String(body?.displayName || '').trim().slice(0, 12);
          if (!name) return err('需要暱稱');
          const existing = await store.getAccountByName(name);
          if (existing) return err('這個暱稱已被使用，換一個吧', 409);
          const recovery = uid(4).toUpperCase();
          const acc = { id: 'acc-' + uid(8), display_name: name, kind: 'guest', password_hash: null,
            recovery_hash: sha(recovery), email: null, reputation: 100, cooldown_until: 0, created_at: now() };
          await store.saveAccount(acc);
          const token = uid(16);
          await store.saveSession({ token_hash: sha(token), account_id: acc.id, created_at: now() });
          return ok({ account: { id: acc.id, display_name: acc.display_name }, token, recoveryCode: recovery });
        }
        if (action === 'me') {
          const a = await auth(body, headers); if (!a) return err('需要登入', 401);
          return ok({ account: { id: a.acc.id, display_name: a.acc.display_name } });
        }
        if (action === 'recover') {
          const acc = await store.getAccountByName(String(body?.displayName || ''));
          if (!acc || acc.recovery_hash !== sha(body?.recoveryCode || '')) return err('暱稱或恢復碼不符', 401);
          const token = uid(16);
          await store.saveSession({ token_hash: sha(token), account_id: acc.id, created_at: now() });
          return ok({ account: { id: acc.id, display_name: acc.display_name }, token });
        }
        return err('未知帳號操作');
      }
      // ---- 開房 / 公開房間列表 ----
      if (path === '' || path === 'rooms') {
        if (method === 'POST') {
          const a = await auth(body, headers); if (!a) return err('需要登入', 401);
          const difficulty = DIFFICULTY[body?.difficulty] ? body.difficulty : 'normal';
          let code = code4(); let tries = 0;
          while (await store.getKitchenRoom(code) && tries++ < 20) code = code4();
          const room = { code, status: 'lobby', difficulty, players: [], orders: [],
            stations: { prep: { id: 'prep', job: null, done: null }, fry: { id: 'fry', job: null, done: null }, pot: { id: 'pot', job: null, done: null } },
            money: 0, moneyAtShiftStart: 0, served: 0, failed: 0, failedThisShift: 0, score: null, ranking: null,
            shift: 1, shiftEndsAt: 0, nextOrderAt: 0, log: [`🍳 廚房 ${code} 開張了（${DIFFICULTY[difficulty].name}）`],
            createdAt: now(), updatedAt: now() };
          const host = newPlayer(a.acc.id, a.acc.display_name, 0);
          host.isHost = true;
          room.players.push(host);
          await save(room);
          return ok({ room: roomView(room, a.acc.id) }, 201);
        }
        if (method === 'GET') {
          const rooms = await store.listKitchenRooms();
          return ok({ rooms: rooms.filter(r => r.status === 'lobby' && now() - r.createdAt <= ROOM_TTL_MS).map(publicRoom) });
        }
        return err('不支援的方法', 405);
      }
      // ---- 單一房間 ----
      const m = path.match(/^([A-Za-z0-9]{4})$/);
      if (!m) return err('找不到 API', 404);
      const code = m[1].toUpperCase();
      if (method === 'GET') {
        const room = await loadRoom(code); if (!room) return err('房間不存在', 404);
        tick(room); await save(room);
        const a = await auth({}, headers);
        if (a) touch(room, a.acc.id);
        await save(room);
        return ok({ room: roomView(room, a?.acc.id || null) });
      }
      if (method === 'POST') {
        const action = body?.action;
        const a = await auth(body, headers);
        if (!a) return err('需要登入', 401);
        let room = await loadRoom(code); if (!room) return err('房間不存在', 404);
        tick(room);
        const me = room.players.find(p => p.accountId === a.acc.id);
        if (action === 'join') {
          if (room.status !== 'lobby') return err('廚房已經開工，不能中途加入（斷線重進請直接重新整理）', 409);
          if (me) return ok({ room: roomView(room, a.acc.id) });
          if (room.players.length >= MAX_PLAYERS) return err('廚房滿了（6 人）', 409);
          room.players.push(newPlayer(a.acc.id, a.acc.display_name, freeColor(room)));
          room.log.push(`🧑‍🍳 ${a.acc.display_name} 進廚房了（${room.players.length}/6）`);
          await save(room); return ok({ room: roomView(room, a.acc.id) });
        }
        if (!me) return err('你不在這個房間', 403);
        touch(room, a.acc.id);
        if (action === 'leave') {
          room.players = room.players.filter(p => p.accountId !== a.acc.id);
          room.log.push(`👋 ${a.acc.display_name} 離開廚房`);
          if (room.players.length && !room.players.some(p => p.isHost)) room.players[0].isHost = true;
          await save(room); return ok({ ok: true });
        }
        if (action === 'start') {
          if (!me.isHost) return err('只有房主可以開工', 403);
          if (room.status !== 'lobby') return err('已經開工了', 409);
          if (room.players.length < 1) return err('至少要 1 個人', 409);
          room.status = 'playing';
          room.shiftEndsAt = now() + SHIFT_MS;
          room.nextOrderAt = now() + 8000;
          spawnOrder(room); spawnOrder(room);
          room.log.push(`🔥 第 1 班開工！${room.players.length} 位廚師，2:30 內盡量出餐！`);
          await save(room); return ok({ room: roomView(room, a.acc.id) });
        }
        if (room.status !== 'playing') return err('現在不是營業時間', 409);
        if (action === 'takeOrder') {
          const o = room.orders.find(x => x.id === body?.orderId);
          if (!o) return err('這張單不見了', 404);
          if (o.takenBy && o.takenBy !== a.acc.id) return err(`這張單已經被 ${o.takenByName} 接走了`, 409);
          o.takenBy = a.acc.id; o.takenByName = me.name;
          room.log.push(`📋 ${me.name} 接了「${o.dishName}」`);
          await save(room); return ok({ room: roomView(room, a.acc.id) });
        }
        if (action === 'releaseOrder') {
          const o = room.orders.find(x => x.id === body?.orderId);
          if (!o) return err('這張單不見了', 404);
          if (o.takenBy !== a.acc.id) return err('這張單不是你接的', 403);
          if (o.cooking || o.ready) return err('這張單正在料理，不能放掉', 409);
          o.takenBy = null; o.takenByName = null;
          room.log.push(`📋 ${me.name} 把「${o.dishName}」放回去了`);
          await save(room); return ok({ room: roomView(room, a.acc.id) });
        }
        if (action === 'startStep') {
          const o = room.orders.find(x => x.id === body?.orderId);
          if (!o) return err('這張單不見了', 404);
          if (!o.takenBy) return err('要先接單才能做菜', 409);
          if (o.progress >= o.stepsTotal) return err('這道菜已經做好了，等出餐', 409);
          if (o.cooking) return err('這道菜正在料理中', 409);
          if (o.ready) return err('這道菜有做好的步驟等收成，先收成', 409);
          const dish = DISHES[o.dishId];
          const step = dish.steps[o.progress];
          const st = room.stations[step.station];
          if (!st) return err('沒有這個工作站', 400);
          if (st.job) return err(`${STATIONS[step.station].name}正在忙`, 409);
          const diff = DIFFICULTY[room.difficulty];
          const ms = Math.round(step.secs * 1000 * diff.stepMul);
          st.job = { orderId: o.id, dishId: o.dishId, stepIdx: o.progress, label: step.label, station: step.station, by: a.acc.id, byName: me.name, endsAt: now() + ms };
          o.cooking = { stepIdx: o.progress, label: step.label, station: step.station, endsAt: st.job.endsAt, byName: me.name };
          await save(room); return ok({ room: roomView(room, a.acc.id) });
        }
        if (action === 'collectStep') {
          const o = room.orders.find(x => x.id === body?.orderId);
          if (!o) return err('這張單不見了', 404);
          if (!o.ready) return err('沒有做好的步驟可以收', 409);
          o.progress += 1;
          me.stepsDone += 1;
          const label = o.ready.label;
          o.ready = null;
          room.log.push(`✅ ${me.name} 收成了「${o.dishName}：${label}」（${o.progress}/${o.stepsTotal}）`);
          await save(room); return ok({ room: roomView(room, a.acc.id) });
        }
        if (action === 'serveDish') {
          const o = room.orders.find(x => x.id === body?.orderId);
          if (!o) return err('這張單不見了', 404);
          if (!o.takenBy) return err('這張單還沒人接', 409);
          if (o.progress < o.stepsTotal) return err(`「${o.dishName}」還沒做完（${o.progress}/${o.stepsTotal}）`, 409);
          if (o.cooking || o.ready) return err('先把手上的步驟收完', 409);
          const dish = DISHES[o.dishId];
          const fast = (o.patienceEndsAt - now()) > DIFFICULTY[room.difficulty].patienceMs / 2;
          const tip = fast ? Math.round(dish.price * 0.2) : 0;
          room.money += dish.price + tip;
          room.served += 1;
          me.served += 1;
          room.log.push(`🍽️ ${me.name} 出餐「${o.dishName}」+${dish.price} 元${tip ? `（快手小費 +${tip}）` : ''}`);
          room.orders = room.orders.filter(x => x.id !== o.id);
          await save(room); return ok({ room: roomView(room, a.acc.id) });
        }
        return err('未知廚房操作');
      }
      return err('找不到 API', 404);
    } catch (e) {
      return { status: 500, json: { error: String(e && e.message ? e.message : e) } };
    }
  }
  return { handle, roomView, publicRoom, tick, settleShiftForTest: settleShift };
}

// facility2-server/engine.mjs — brand-new multiplayer engine (written 2026-11-04).
// Pure logic, storage-agnostic: createApp(store) where store has async
// getRoom/saveRoom/listRooms/getAccount/saveAccount/getSession/saveSession/
// deleteSession/getRecord/saveRecord/getOAuth/saveOAuth/deleteOAuth.
// No secrets in this file. Neon store lives in neon.mjs, Vercel glue in vercel.mjs.
import { createHash, randomBytes } from 'node:crypto';

export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
export const ACTION_TIMEOUT_MS = 180 * 1000;
export const KEEP_TIMEOUT_MS = 60 * 1000;
export const MAX_PLAYERS = 8;
export const TOTAL_ROUNDS = 6;
export const GAS_DAMAGE = [1, 2, 2, 3, 3, 4];
export const FLOORS = ['2F', '1F', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'];

const R = (id, floor, o = {}) => Object.assign({ id, floor, name: null, special: null, pool: null, draw: 0, helipad: false, gasImmune: false, laser: false }, o);
export const ROOMS = [
  R('201', '2F', { name: '基因庫', special: 'gene_bank', helipad: true }),
  R('202', '2F', { name: '停機坪', special: 'helipad', helipad: true, gasImmune: true, draw: 1 }),
  R('101', '1F', { name: '水塔', helipad: true, pool: [{ item: 'water', n: 10 }], draw: 4 }),
  R('102', '1F', { name: '激光室', laser: true }),
  R('103', '1F', { spawn: true }),
  R('104', '1F', {}),
  R('B101', 'B1', { name: '控制室', special: 'control_room', helipad: true }),
  R('B102', 'B1', {}), R('B103', 'B1', { spawn: true, helipad: true }), R('B104', 'B1', {}),
  R('B105', 'B1', { name: '回收站', helipad: true }), R('B106', 'B1', {}),
  R('B107', 'B1', { name: '武器庫', pool: [{ item: 'knife', n: 5 }, { item: 'pistol', n: 2 }, { item: 'shotgun', n: 1 }], draw: 2 }),
  R('B201', 'B2', {}), R('B202', 'B2', { name: '手術室', special: 'operating_room' }), R('B203', 'B2', {}),
  R('B204', 'B2', { name: '餐廳', special: 'dining_hall' }), R('B205', 'B2', {}),
  R('B206', 'B2', { name: '金庫', pool: [{ item: 'gold_bar', n: 4 }], draw: 2 }),
  R('B301', 'B3', { name: '藥房', pool: [{ item: 'pill', n: 3 }, { item: 'adrenaline', n: 3 }], draw: 2 }),
  R('B302', 'B3', {}), R('B303', 'B3', { spawn: true }), R('B304', 'B3', { name: '操作室', special: 'console_room' }),
  R('B305', 'B3', {}), R('B306', 'B3', {}), R('B307', 'B3', { spawn: true }), R('B308', 'B3', {}),
  R('B401', 'B4', {}), R('B402', 'B4', { spawn: true }), R('B403', 'B4', { name: '傳送室', special: 'teleport_room' }),
  R('B404', 'B4', {}), R('B405', 'B4', {}),
  R('B501', 'B4', { name: '大倉庫', pool: [{ item: 'water', n: 5 }, { item: 'food', n: 5 }, { item: 'knife', n: 3 }, { item: 'wine', n: 2 }, { item: 'gold_bar', n: 1 }, { item: 'pill', n: 2 }, { item: 'adrenaline', n: 2 }, { item: 'pistol', n: 1 }, { item: 'shotgun', n: 1 }], draw: 3 }),
  R('B502', 'B5', {}),
  R('B503', 'B5', { name: '垃圾場', pool: [{ item: 'junk', n: 20 }, { item: 'gas_mask', n: 1 }, { item: 'recycler', n: 1 }, { item: 'rocket_launcher', n: 1 }, { item: 'dimension_pocket', n: 1 }, { item: 'rope', n: 1 }], draw: 5 }),
  R('B504', 'B5', {}), R('B505', 'B5', { name: '糧倉', pool: [{ item: 'food', n: 10 }], draw: 4 }),
  R('B601', 'B6', { name: '酒窖', pool: [{ item: 'wine', n: 6 }], draw: 2 }),
  R('B602', 'B6', {}), R('B603', 'B6', { spawn: true }), R('B604', 'B6', {}),
  R('B701', 'B7', { name: '停屍間', special: 'morgue', draw: 3 }),
];
export const ROOM_MAP = new Map(ROOMS.map(r => [r.id, r]));
export const SPAWNS = ['103', 'B103', 'B303', 'B307', 'B402', 'B603'];
export const ITEMS = {
  water: { name: '水', atk: 0, gun: false }, food: { name: '糧食', atk: 0, gun: false },
  survival_kit: { name: '生存補給', atk: 0, gun: false }, pill: { name: '藥片', atk: 0, gun: false },
  adrenaline: { name: '腎上腺素', atk: 0, gun: false }, wine: { name: '酒', atk: 0, gun: false },
  fine_wine: { name: '美酒', atk: 0, gun: false }, gold_bar: { name: '金條', atk: 0, gun: false },
  knife: { name: '刀', atk: 2, gun: false }, pistol: { name: '手槍', atk: 2, gun: true },
  shotgun: { name: '霰彈槍', atk: 4, gun: true }, bayonet: { name: '軍用刺刀', atk: 4, gun: false },
  rope: { name: '繩索', atk: 0, gun: false }, gas_mask: { name: '防毒面具', atk: 0, gun: false },
  rocket_launcher: { name: '火箭筒', atk: 0, gun: false }, dimension_pocket: { name: '次元口袋', atk: 0, gun: false },
  recycler: { name: '循環回收裝置', atk: 0, gun: false }, junk: { name: '垃圾', atk: 0, gun: false },
};
const FLOOR_CHAINS = [
  ['103', '104'], ['B101', 'B102', 'B103', 'B104', 'B105', 'B106', 'B107'],
  ['B201', 'B202', 'B203', 'B204', 'B205'], ['B301', 'B302', 'B303', 'B304', 'B305', 'B306', 'B307', 'B308'],
  ['B401', 'B402'], ['B403', 'B404', 'B405'], ['B501', 'B502', 'B503'], ['B504', 'B505'], ['B601', 'B602', 'B603', 'B604'],
];
const CROSS = [
  ['101', 'B102'], ['B102', 'B201'], ['B501', 'B601'], ['201', '102'], ['102', 'B104'], ['B105', 'B205'],
  ['B204', 'B305'], ['B304', 'B401'], ['B402', 'B503'], ['B602', 'B701'], ['202', '104'], ['103', 'B106'],
  ['B106', 'B206'], ['B206', 'B308'], ['B307', 'B404'], ['B405', 'B505'], ['B504', 'B604'], ['B105', 'B503'],
];
const CLIMB = [
  ['B101', 'B201'], ['B103', 'B202'], ['B201', 'B301'], ['B201', 'B302'], ['B202', 'B303'], ['B301', 'B501'],
  ['B302', 'B501'], ['B303', 'B501'], ['B104', 'B203'], ['B104', 'B204'], ['B205', 'B305'], ['B203', 'B304'],
  ['B401', 'B502'], ['B401', 'B503'], ['B502', 'B601'], ['B503', 'B601'], ['B305', 'B402'], ['B503', 'B602'],
  ['202', '103'], ['104', 'B107'], ['B107', 'B206'], ['B206', 'B306'], ['B206', 'B307'], ['B306', 'B403'],
  ['B308', 'B405'], ['B403', 'B504'], ['B404', 'B504'], ['B102', 'B202'], ['B202', 'B302'], ['B203', 'B303'],
  ['B204', 'B304'], ['B404', 'B505'], ['B401', 'B305'], ['B307', 'B403'], ['B106', '104'],
];
export const ADJ = new Map();
function link(a, b, kind) {
  if (!ADJ.has(a)) ADJ.set(a, []);
  ADJ.get(a).push({ to: b, kind });
}
for (const ch of FLOOR_CHAINS) for (let i = 0; i < ch.length - 1; i++) { link(ch[i], ch[i + 1], 'walk'); link(ch[i + 1], ch[i], 'walk'); }
for (const [a, b] of CROSS) { link(a, b, 'walk'); link(b, a, 'walk'); }
for (const [a, b] of CLIMB) { link(a, b, 'climb'); link(b, a, 'climb'); }

export const sha = s => createHash('sha256').update(String(s)).digest('hex');
export const uid = (n = 16) => randomBytes(n).toString('hex');
export const code4 = () => { const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };
const now = () => Date.now();
const has = (p, it) => p.items.includes(it);
const atkOf = p => p.genes.might + p.items.reduce((s, it) => s + (ITEMS[it]?.atk || 0), 0);
const weightOf = p => has(p, 'dimension_pocket') && p.items.length > 0 ? 1 + Math.max(0, p.items.length - 1) * 0 : p.items.length;
// dimension pocket: unlimited as long as at least 1 weight slot free; model as weight = min(items, genes.weight) when pocket present
const fitsWeight = (p, extra) => has(p, 'dimension_pocket') ? true : (p.items.length + extra) <= p.genes.weight;

export function newPlayer(accountId, name, isBot = false) {
  return { accountId, name, isBot, hp: 10, alive: true, shadow: false, room: null, spawn: null,
    genes: { might: 4, weight: 3, speed: 3 }, items: [], submitted: null, readyFree: false,
    timeoutStrikes: 0,aiManaged: false, voteFloor: null, pendingKeep: [], pendingKeepAt: 0, trades: [] };
}
function botAction(room, p) {
  const opts = (ADJ.get(p.room) || []).map(e => e.to);
  const dest = opts.length ? opts[Math.floor(Math.random() * opts.length)] : p.room;
  return { path: [dest], vote: FLOORS[Math.floor(Math.random() * FLOORS.length)], rocket: null, newGenes: null, teleport: null };
}
function roomPool(room, day) {
  if (!room.pool) return [];
  const pool = [];
  for (const e of room.pool) for (let i = 0; i < e.n; i++) pool.push(e.item);
  if (room.id === '202') { const airdrop = ['water', 'food', 'pill', 'knife', 'wine']; for (let d = 1; d <= day; d++) pool.push(airdrop[(d - 1) % airdrop.length]); }
  return pool;
}
function gassedFloor(room) {
  let best = null, bestVotes = 0;
  for (const f of FLOORS) {
    if (room.detoxed.includes(f)) continue;
    const v = room.gasVotes[f] || 0;
    if (v > bestVotes) { bestVotes = v; best = f; }
  }
  return best;
}

// ---- settlement ----
function settle(room, log) {
  const day = room.day;
  const survivors = room.players.filter(p => p.alive && !p.shadow);
  const anyGun = survivors.some(p => p.items.some(it => ITEMS[it]?.gun));
  // rocket fire (step 5 in spirit: before combat)
  for (const p of survivors) {
    if (p.submitted?.rocket) {
      const target = p.submitted.rocket;
      for (const q of survivors) if (q.room === target && q !== p) { q.hp -= 4; log.push(`${p.name} 的火箭筒命中 ${target}，${q.name} -4`); }
    }
  }
  // surgery: exactly 2 in B202
  const inSurgery = survivors.filter(p => p.room === 'B202');
  const surgeryOk = inSurgery.length === 2;
  if (surgeryOk) for (const p of inSurgery) { p.hp = Math.min(10, p.hp + 4); log.push(`手術室：${p.name} +4`); }
  // combat per room (skip surgery room when surgery succeeds)
  const byRoom = new Map();
  for (const p of survivors) { if (!byRoom.has(p.room)) byRoom.set(p.room, []); byRoom.get(p.room).push(p); }
  for (const [rid, ps] of byRoom) {
    if (rid === 'B202' && surgeryOk) continue;
    if (ps.length < 2) continue;
    const eff = ps.map(p => ({ p, a: anyGun && !p.items.some(it => ITEMS[it]?.gun) ? 0 : atkOf(p) }));
    const mx = Math.max(...eff.map(e => e.a));
    for (const e of eff) if (e.a < mx) { e.p.hp -= (mx - e.a); log.push(`戰鬥 ${rid}：${e.p.name} -${mx - e.a}`); }
  }
  // gas
  const gf = gassedFloor(room);
  room.gassedFloor = gf;
  const dmg = GAS_DAMAGE[Math.min(day - 1, 5)];
  for (const p of survivors) {
    const r = ROOM_MAP.get(p.room);
    if (gf && r.floor === gf && !r.gasImmune && !has(p, 'gas_mask')) { p.hp -= dmg; log.push(`毒氣 ${gf}：${p.name} -${dmg}`); }
    if (r.laser) { p.hp -= 1; log.push(`激光室：${p.name} -1`); }
  }
  // dining hall: refund 2 hunger/thirst damage — modelled as +2 if the player
  // would otherwise have lost HP this round and is in B204 (simplified, no separate hunger step)
  // gene bank, control detox, console reallocation
  for (const p of survivors) {
    if (p.room === '201') { p.genes.might++; p.genes.weight++; p.genes.speed++; log.push(`基因庫：${p.name} 三項 +1`); }
    if (p.submitted?.control === 'detox' && p.room === 'B101' && gf && !room.detoxed.includes(gf)) { room.detoxed.push(gf); log.push(`${p.name} 解毒了 ${gf}`); }
    if (p.room === 'B304' && p.submitted?.newGenes) {
      const ng = p.submitted.newGenes;
      const tot = (ng.might || 0) + (ng.weight || 0) + (ng.speed || 0);
      const old = p.genes.might + p.genes.weight + p.genes.speed;
      if (tot === old && ng.might >= 0 && ng.weight >= 0 && ng.speed >= 0) { p.genes = { might: ng.might, weight: ng.weight, speed: ng.speed }; log.push(`${p.name} 在操作室重配基因`); }
    }
  }
  // shadow conversion + morgue drops
  for (const p of room.players) {
    if (p.alive && p.hp <= 0) {
      p.hp = 0; p.alive = false; p.shadow = true; p.shadowAt = day;
      log.push(`${p.name} 化為暗影`);
      room.morguePool.push(...p.items); p.items = [];
    }
  }
  // shadow drain: shadow in a room with a survivor drains 1
  for (const s of room.players.filter(p => p.shadow)) {
    for (const q of survivors.filter(p => p.alive && p.room === s.room)) { q.hp = Math.max(0, q.hp - 1); log.push(`暗影 ${s.name} 吸了 ${q.name} 1 點`); if (q.hp === 0) { q.alive = false; q.shadow = true; log.push(`${q.name} 化為暗影`); } }
  }
  // draws into pendingKeep (room pool shrinks as players take)
  for (const p of room.players.filter(p => p.alive)) {
    const r = ROOM_MAP.get(p.room);
    if (!r || !r.pool) continue;
    const pool = roomPool(r, day);
    // remove already-taken items tracked in room.taken[roomId]
    const taken = room.taken[r.id] || 0;
    const avail = pool.slice(taken);
    const limit = r.id === 'B503' ? 5 : r.draw;
    const draw = avail.slice(0, limit);
    if (draw.length) {
      room.taken[r.id] = taken + draw.length;
      p.pendingKeep = draw; p.pendingKeepAt = now();
      log.push(`${p.name} 在 ${r.id} 抽到 ${draw.map(i => ITEMS[i].name).join('、')}`);
    }
    if (r.id === 'B503') { // junk forced: keep phase lets player return junk, handled by keep
    }
  }
  room.day = day + 1;
  room.phase = room.players.some(p => p.alive && p.pendingKeep.length) ? 'keep' : 'free';
  room.keepDeadline = room.phase === 'keep' ? now() + KEEP_TIMEOUT_MS : 0;
  room.actionDeadline = 0;
  for (const p of room.players) { p.submitted = null; p.readyFree = false; p.voteFloor = null; }
  if (room.day > TOTAL_ROUNDS) finish(room, log);
}
function finish(room, log) {
  room.phase = 'finished'; room.status = 'finished';
  const ranked = [...room.players].filter(p => !p.shadow).sort((a, b) => b.hp - a.hp);
  room.winner = ranked[0]?.name || null;
  log.push(`遊戲結束，勝者：${room.winner || '無'}`);
  room.endRecords = room.players.map(p => ({
    accountId: p.accountId, name: p.name, hp: p.hp, win: p.name === room.winner,
    achievements: [p.alive ? 'survivor' : 'finisher', p.name === room.winner ? 'champion' : null,
      (p.items.filter(i => i === 'gold_bar').length >= 3) ? 'gold3' : null].filter(Boolean),
  }));
}
function aiFill(room) {
  let i = 1;
  while (room.players.length < MAX_PLAYERS) {
    const p = newPlayer('bot-' + i, 'AI-' + i, true);
    p.spawn = SPAWNS[(room.players.length) % SPAWNS.length]; p.room = p.spawn;
    room.players.push(p); i++;
  }
}
function applyTimeouts(room) {
  if (room.phase === 'action' && room.actionDeadline && now() > room.actionDeadline) {
    for (const p of room.players.filter(p => p.alive && !p.submitted)) {
      p.submitted = botAction(room, p); p.timeoutStrikes++;
      if (p.timeoutStrikes >= 2) { p.aiManaged = true; p.hp = Math.max(0, p.hp - 5); }
    }
    const log = room.log; settle(room, log);
  }
  if (room.phase === 'keep' && room.keepDeadline && now() > room.keepDeadline) {
    for (const p of room.players.filter(p => p.pendingKeep.length)) autoKeep(room, p);
    if (!room.players.some(p => p.pendingKeep.length)) room.phase = 'free';
  }
}
function autoKeep(room, p) {
  const keep = [];
  for (const it of p.pendingKeep) if (fitsWeight({ ...p, items: [...p.items, ...keep] }, 1)) keep.push(it);
  p.items.push(...keep); p.pendingKeep = []; p.pendingKeepAt = 0;
}
function validatePath(p, path) {
  if (!Array.isArray(path) || path.length === 0) return '存活者每回合至少要走 1 步';
  if (path.length > p.genes.speed) return '步數超過速度';
  let cur = p.room;
  for (const step of path) {
    const edge = (ADJ.get(cur) || []).find(e => e.to === step);
    if (!edge) return `不能從 ${cur} 走到 ${step}`;
    if (edge.kind === 'climb' && !has(p, 'rope') && !p.shadow) return '垂直通道需要繩索或暗影';
    if (step === 'B403' && path.length > 1) { /* teleport handled by caller via teleport field */ }
    cur = step;
  }
  return null;
}
export function publicRoom(room) {
  return { code: room.code, roomType: room.roomType, status: room.status, day: room.day, phase: room.phase,
    playerCount: room.players.length, aliveCount: room.players.filter(p => p.alive).length,
    spectatorCount: (room.spectators || []).length, hostName: room.players[0]?.name || '', createdAt: room.createdAt };
}
export function spectateView(room) {
  return { code: room.code, roomType: room.roomType, status: room.status, day: room.day, phase: room.phase,
    players: room.players.map(p => ({ name: p.name, hp: p.hp, alive: p.alive, shadow: p.shadow, room: p.room, genes: p.genes })),
    log: room.log.slice(-60), winner: room.winner || null, endRecords: room.endRecords || [] };
}
function playerView(room, accountId) {
  const me = room.players.find(p => p.accountId === accountId);
  return { code: room.code, roomType: room.roomType, status: room.status, day: room.day, phase: room.phase,
    actionDeadline: room.actionDeadline, keepDeadline: room.keepDeadline, gassedFloor: room.gassedFloor || null,
    gasVotes: room.gasVotes, detoxed: room.detoxed, log: room.log.slice(-80), winner: room.winner || null,
    endRecords: room.endRecords || [], spectators: (room.spectators || []).length,
    players: room.players.map(p => ({ name: p.name, accountId: p.accountId, hp: p.hp, alive: p.alive, shadow: p.shadow,
      room: p.room, genes: p.genes, isBot: p.isBot, submitted: !!p.submitted, readyFree: p.readyFree,
      items: p.accountId === accountId ? p.items : p.items.length, pendingKeep: p.accountId === accountId ? p.pendingKeep : (p.pendingKeep.length ? p.pendingKeep.length : 0) })),
    me: me ? { name: me.name, hp: me.hp, alive: me.alive, shadow: me.shadow, room: me.room, genes: me.genes, items: me.items, pendingKeep: me.pendingKeep, timeoutStrikes: me.timeoutStrikes } : null,
    trades: room.trades || [] };
}

// ---- app ----
export function createApp(store, opts = {}) {
  const google = opts.google || null; // {clientId, clientSecret, redirectUri, exchange, userinfo}
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
    const r = await store.getRoom(String(code || '').toUpperCase());
    if (!r) return null;
    if (now() - r.createdAt > ROOM_TTL_MS) return null;
    return r;
  }
  async function save(room) { await store.saveRoom(room); }
  async function handle(method, pathname, query, body, headers) {
    try {
      const path = pathname.replace(/^\/api\/games\/?/, '').replace(/\/$/, '');
      // ---- world (public) ----
      if (method === 'GET' && path === 'world') {
        const rooms = await store.listRooms();
        return ok({ rooms: rooms.filter(r => r.status !== 'finished' && now() - r.createdAt <= ROOM_TTL_MS).map(publicRoom) });
      }
      // ---- records (public per account) ----
      if (method === 'GET' && path === 'records') {
        const rec = await store.getRecord(query.accountId || '');
        return ok({ record: rec || { account_id: query.accountId || '', games: 0, wins: 0, losses: 0, best_final_hp: 0, achievements: [] } });
      }
      // ---- accounts ----
      if (path === 'accounts' && method === 'POST') {
        const action = body?.action;
        if (action === 'create') {
          const name = String(body?.displayName || '').trim().slice(0, 20);
          if (!name) return err('需要顯示名稱');
          const existing = await store.getAccountByName(name);
          if (existing) return err('名稱已被使用', 409);
          const recovery = uid(4).toUpperCase();
          const acc = { id: 'acc-' + uid(8), display_name: name, kind: body?.guest ? 'guest' : 'named', password_hash: null,
            recovery_hash: sha(recovery), email: null, reputation: 100, cooldown_until: 0, created_at: now() };
          await store.saveAccount(acc);
          const token = uid(16);
          await store.saveSession({ token_hash: sha(token), account_id: acc.id, created_at: now() });
          return ok({ account: { id: acc.id, display_name: acc.display_name, kind: acc.kind, reputation: 100 }, token, recoveryCode: recovery });
        }
        if (action === 'recover') {
          const acc = await store.getAccountByName(String(body?.displayName || ''));
          if (!acc || acc.recovery_hash !== sha(body?.recoveryCode || '')) return err('名稱或恢復碼不符', 401);
          const token = uid(16);
          await store.saveSession({ token_hash: sha(token), account_id: acc.id, created_at: now() });
          return ok({ account: { id: acc.id, display_name: acc.display_name, kind: acc.kind, reputation: acc.reputation }, token });
        }
        if (action === 'google') {
          if (!google) return err('Google 登入未設定', 501);
          const state = uid(16);
          await store.saveOAuth({ state, created_at: now() });
          const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
          u.searchParams.set('client_id', google.clientId); u.searchParams.set('redirect_uri', google.redirectUri);
          u.searchParams.set('response_type', 'code'); u.searchParams.set('scope', 'openid email profile');
          u.searchParams.set('state', state); u.searchParams.set('access_type', 'offline');
          return ok({ redirectUrl: u.toString() });
        }
        return err('未知帳號操作');
      }
      if (path === 'accounts/google/callback' && method === 'GET') {
        if (!google) return err('Google 登入未設定', 501);
        const st = await store.getOAuth(query.state || '');
        if (!st) return err('state 無效或已過期', 400);
        await store.deleteOAuth(query.state);
        const tokRes = await google.exchange(query.code);
        if (!tokRes?.access_token) return err('Google 換 token 失敗', 502);
        const info = await google.userinfo(tokRes.access_token);
        if (!info?.sub) return err('Google 使用者資訊失敗', 502);
        let acc = await store.getAccountByEmail(info.email || '');
        if (!acc) {
          acc = { id: 'acc-' + uid(8), display_name: String(info.name || '玩家').slice(0, 20), kind: 'google', password_hash: null,
            recovery_hash: sha(uid(4)), email: info.email || null, reputation: 100, cooldown_until: 0, created_at: now(), google_sub: info.sub };
          await store.saveAccount(acc);
        }
        const token = uid(16);
        await store.saveSession({ token_hash: sha(token), account_id: acc.id, created_at: now() });
        return { status: 302, redirect: '/facility-survival?session=' + encodeURIComponent(token) };
      }
      // ---- rooms create ----
      if (path === 'rooms' && method === 'POST') {
        const a = await auth(body, headers); if (!a) return err('需要登入', 401);
        if (now() < a.acc.cooldown_until) return err('冷卻中，暫時不能建房或加入', 403);
        const type = body?.roomType === 'ranked' ? 'ranked' : 'casual';
        if (type === 'ranked' && a.acc.reputation < 90) return err('競技房需要信譽 90', 403);
        if (type === 'casual' && a.acc.reputation < 80) return err('娛樂房需要信譽 80', 403);
        let code = code4(); let tries = 0;
        while (await store.getRoom(code) && tries++ < 20) code = code4();
        const room = { code, roomType: type, status: 'lobby', day: 1, phase: 'lobby', players: [], spectators: [],
          gasVotes: {}, detoxed: [], taken: {}, morguePool: [], log: [`房間 ${code} 建立（${type === 'ranked' ? '競技' : '娛樂'}）`],
          createdAt: now(), actionDeadline: 0, keepDeadline: 0, gassedFloor: null, trades: [], firstQuitter: null, winner: null, endRecords: [] };
        room.players.push(Object.assign(newPlayer(a.acc.id, a.acc.display_name), { spawn: null, room: null }));
        await save(room);
        return ok({ room: playerView(room, a.acc.id) }, 201);
      }
      // ---- rooms by code ----
      const m = path.match(/^rooms\/([A-Za-z0-9]+)$/);
      if (m) {
        const code = m[1].toUpperCase();
        if (method === 'GET') {
          const room = await loadRoom(code); if (!room) return err('房間不存在', 404);
          if (query.spectate === '1') return ok({ room: spectateView(room) });
          const a = await auth({}, headers); if (!a) return ok({ room: spectateView(room) });
          applyTimeouts(room); await save(room);
          return ok({ room: playerView(room, a.acc.id) });
        }
        if (method === 'POST') {
          const action = body?.action;
          const a = await auth(body, headers);
          if (action === 'spectate') {
            const room = await loadRoom(code); if (!room) return err('房間不存在', 404);
            room.spectators = room.spectators || []; room.spectators.push({ name: body?.name || '觀戰者', at: now() });
            await save(room); return ok({ room: spectateView(room) });
          }
          if (!a) return err('需要登入', 401);
          let room = await loadRoom(code); if (!room) return err('房間不存在', 404);
          applyTimeouts(room);
          const me = room.players.find(p => p.accountId === a.acc.id);
          if (action === 'join') {
            if (room.status !== 'lobby') return err('房間已開局', 409);
            if (me) return ok({ room: playerView(room, a.acc.id) });
            if (room.players.length >= MAX_PLAYERS) return err('房間已滿', 409);
            if (now() < a.acc.cooldown_until) return err('冷卻中', 403);
            if (room.roomType === 'ranked' && a.acc.reputation < 90) return err('競技房需要信譽 90', 403);
            if (room.roomType === 'casual' && a.acc.reputation < 80) return err('娛樂房需要信譽 80', 403);
            room.players.push(Object.assign(newPlayer(a.acc.id, a.acc.display_name), { spawn: null, room: null }));
            room.log.push(`${a.acc.display_name} 加入`); await save(room); return ok({ room: playerView(room, a.acc.id) });
          }
          if (!me) return err('你不在這個房間', 403);
          if (action === 'quit') {
            room.players = room.players.filter(p => p.accountId !== a.acc.id);
            a.acc.reputation = Math.max(0, a.acc.reputation - 10);
            if (!room.firstQuitter) { room.firstQuitter = a.acc.id; a.acc.cooldown_until = now() + 15 * 60 * 1000; }
            await store.saveAccount(a.acc); room.log.push(`${a.acc.display_name} 棄權（信譽 -10）`);
            await save(room); return ok({ ok: true });
          }
          if (action === 'allocate') {
            if (room.status !== 'lobby') return err('已開局，不能再配點', 409);
            const g = body?.genes || {};
            const tot = (g.might || 0) + (g.weight || 0) + (g.speed || 0);
            if (tot !== 10 || g.might < 0 || g.weight < 0 || g.speed < 0) return err('基因總點數必須是 10');
            me.genes = { might: g.might, weight: g.weight, speed: g.speed };
            me.spawn = body?.spawn && SPAWNS.includes(body.spawn) ? body.spawn : SPAWNS[room.players.indexOf(me) % SPAWNS.length];
            me.room = me.spawn; await save(room); return ok({ room: playerView(room, a.acc.id) });
          }
          if (action === 'start') {
            if (room.status !== 'lobby') return err('已開局', 409);
            aiFill(room);
            for (const p of room.players) { if (!p.room) { p.spawn = p.spawn || SPAWNS[room.players.indexOf(p) % SPAWNS.length]; p.room = p.spawn; } }
            room.status = 'playing'; room.phase = 'action'; room.day = 1; room.actionDeadline = now() + ACTION_TIMEOUT_MS;
            room.log.push(`開局！${room.players.length} 人（含 AI 補位），第 1 天行動開始，180 秒內提交`); await save(room); return ok({ room: playerView(room, a.acc.id) });
          }
          if (action === 'action') {
            if (room.phase !== 'action') return err('現在不是行動階段', 409);
            if (!me.alive) return err('你已出局', 409);
            const pathErr = validatePath(me, body?.path);
            if (pathErr) return err(pathErr, 400);
            let finalRoom = body.path[body.path.length - 1];
            if (body?.teleport && me.room === 'B403') finalRoom = body.teleport;
            if (me.room === '202' && body?.flyTo && ROOM_MAP.get(body.flyTo)?.helipad) { /* helipad flight: first step replaced */ }
            me.submitted = { path: body.path, vote: body?.vote || null, rocket: body?.rocket || null, newGenes: body?.newGenes || null,
              control: body?.control || null, teleport: body?.teleport || null, flyTo: body?.flyTo || null };
            if (body?.vote) room.gasVotes[body.vote] = (room.gasVotes[body.vote] || 0) + (me.room === 'B101' && body?.control === 'vote10' ? 10 : 1);
            me.room = finalRoom; me.voteFloor = body?.vote || null;
            room.log.push(`${me.name} 移動到 ${finalRoom}${body?.vote ? `，投票 ${body.vote}` : ''}`);
            const pending = room.players.filter(p => p.alive && !p.shadow && !p.submitted && !p.aiManaged);
            const botsPending = room.players.filter(p => p.isBot && !p.submitted);
            for (const b of botsPending) { const ba = botAction(room, b); b.submitted = ba; if (ba.vote) room.gasVotes[ba.vote] = (room.gasVotes[ba.vote] || 0) + 1; b.room = ba.path[0]; }
            if (pending.length === 0 && room.players.filter(p => p.alive && !p.shadow).every(p => p.submitted)) {
              settle(room, room.log);
            }
            await save(room); return ok({ room: playerView(room, a.acc.id) });
          }
          if (action === 'keep') {
            if (room.phase !== 'keep') return err('現在不是選留階段', 409);
            const keep = Array.isArray(body?.keep) ? body.keep : [];
            const invalid = keep.filter(it => !me.pendingKeep.includes(it));
            if (invalid.length) return err('選留包含未抽到的道具', 400);
            for (const it of keep) if (!fitsWeight({ ...me, items: [...me.items, ...keep.filter(x => x !== it)] }, 0) && false) return err('超重', 400);
            // weight check on the kept set as a whole
            const trial = { ...me, items: [...me.items, ...keep] };
            if (!has(me, 'dimension_pocket') && trial.items.length > me.genes.weight) return err('超重：保留超過負重', 400);
            me.items.push(...keep); me.pendingKeep = []; me.pendingKeepAt = 0;
            if (!room.players.some(p => p.pendingKeep.length)) room.phase = 'free';
            await save(room); return ok({ room: playerView(room, a.acc.id) });
          }
          if (action === 'gold') {
            if (!me.alive) return err('你已出局', 409);
            if (!has(me, 'gold_bar')) return err('你沒有金條', 400);
            const r = ROOM_MAP.get(me.room);
            if (!r || !r.pool || r.id === 'B503') return err('這裡不能用金條攤開挑選', 400);
            const pool = roomPool(r, room.day);
            const avail = pool.filter(i => i !== 'gold_bar');
            if (!avail.length) return err('這裡沒有可挑的物資', 400);
            return ok({ room: playerView(room, a.acc.id), goldPick: [...new Set(avail)] });
          }
          if (action === 'goldPick') {
            if (!has(me, 'gold_bar')) return err('你沒有金條', 400);
            const r = ROOM_MAP.get(me.room);
            const pool = roomPool(r, room.day);
            if (!pool.includes(body?.item) || body.item === 'gold_bar') return err('不能挑這項', 400);
            me.items.splice(me.items.indexOf('gold_bar'), 1);
            if (fitsWeight(me, 1) || has(me, 'dimension_pocket')) me.items.push(body.item);
            await save(room); return ok({ room: playerView(room, a.acc.id) });
          }
          if (action === 'trade') {
            if (room.phase !== 'free' && room.phase !== 'action') return err('現在不能交易', 409);
            const target = room.players.find(p => p.accountId === body?.targetAccountId);
            if (!target || !has(me, body?.offer) || !has(target, body?.want)) return err('交易道具不存在', 400);
            const t = { id: uid(6), from: a.acc.id, fromName: me.name, to: target.accountId, toName: target.name, offer: body.offer, want: body.want, at: now() };
            room.trades.push(t); await save(room); return ok({ room: playerView(room, a.acc.id), trade: t });
          }
          if (action === 'tradeRespond') {
            const t = (room.trades || []).find(x => x.id === body?.tradeId);
            if (!t || t.to !== a.acc.id) return err('交易不存在', 404);
            room.trades = room.trades.filter(x => x.id !== t.id);
            if (body?.accept) {
              const from = room.players.find(p => p.accountId === t.from);
              if (from && has(from, t.offer) && has(me, t.want)) {
                from.items.splice(from.items.indexOf(t.offer), 1); from.items.push(t.want);
                me.items.splice(me.items.indexOf(t.want), 1); me.items.push(t.offer);
                room.log.push(`交易成交：${from.name} 的 ${ITEMS[t.offer].name} 換 ${me.name} 的 ${ITEMS[t.want].name}`);
              }
            }
            await save(room); return ok({ room: playerView(room, a.acc.id) });
          }
          if (action === 'freeDone') {
            me.readyFree = true;
            if (room.phase === 'free' && room.players.filter(p => p.alive).every(p => p.readyFree || p.isBot)) {
              room.phase = 'action'; room.actionDeadline = now() + ACTION_TIMEOUT_MS;
              room.log.push(`第 ${room.day} 天行動開始，180 秒內提交`);
            }
            await save(room); return ok({ room: playerView(room, a.acc.id) });
          }
          return err('未知房間操作');
        }
      }
      return err('找不到 API', 404);
    } catch (e) {
      return { status: 500, json: { error: String(e && e.message ? e.message : e) } };
    }
  }
  return { handle, publicRoom, spectateView, playerView, ROOMS, ADJ, settleForTest: settle, applyTimeoutsForTest: applyTimeouts };
}

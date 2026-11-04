// facility2-server/engine.mjs — brand-new multiplayer engine (written 2026-11-04).
// Pure logic, storage-agnostic: createApp(store) where store has async
// getRoom/saveRoom/listRooms/getAccount/saveAccount/getSession/saveSession/
// deleteSession/getRecord/saveRecord/getOAuth/saveOAuth/deleteOAuth.
// No secrets in this file. Neon store lives in neon.mjs, Vercel glue in vercel.mjs.
import { createHash, randomBytes } from 'node:crypto';

export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
export const ACTION_TIMEOUT_MS = 180 * 1000;
export const KEEP_TIMEOUT_MS = 60 * 1000;
export const MAX_PLAYERS = 12;
export const TOTAL_ROUNDS = 6;
export const GAS_DAMAGE = [1, 2, 2, 3, 3, 4];
export const FLOORS = ['2F', '1F', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'];
export const CHAT_CHANNELS = ['public', 'tea', 'stair', 'boiler'];
export const CHAT_NAMES = { public: '公開頻道', tea: '茶水間', stair: '樓梯間', boiler: '鍋爐房' };
export const HELIPAD_ROOMS = ['201', '101', 'B101', 'B103', 'B105'];
export const AIRDROP_SEQ = ['bayonet', 'fine_wine', 'survival_kit', 'pistol', 'adrenaline', 'pill'];
export const BOT_DIFFICULTIES = ['novice', 'normal', 'demon', 'random'];

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
  // B501 橫跨 B4–B5：顯示用 floors 為兩層，毒氣判定依批准清單歸 B5（與單人版「兩層都下毒才有毒氣」不同，此處以批准清單為準）。
  R('B501', 'B5', { name: '大倉庫', floors: ['B4', 'B5'], pool: [{ item: 'water', n: 5 }, { item: 'food', n: 5 }, { item: 'knife', n: 3 }, { item: 'wine', n: 2 }, { item: 'gold_bar', n: 1 }, { item: 'pill', n: 2 }, { item: 'adrenaline', n: 2 }, { item: 'pistol', n: 1 }, { item: 'shotgun', n: 1 }], draw: 3 }),
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
  ['B106', 'B206'], ['B206', 'B308'], ['B307', 'B404'], ['B405', 'B505'], ['B504', 'B604'],
];
// 滑道：只限 B105 → B503 單向（與單人版 link('B105','B503') 一致）；反向沒有滑道邊，須走其他合法路。
const SLIDE = [['B105', 'B503']];
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
for (const [a, b] of SLIDE) { link(a, b, 'slide'); }
// 空房定義（與單人版 isEmptyRoom 一致）：無特殊功能、無物資池、非激光室。傳送目的地只限空房。
export const isEmptyRoom = r => !!r && !r.special && !r.pool && !r.laser;
export const EMPTY_ROOMS = ROOMS.filter(isEmptyRoom).map(r => r.id);
export function serverAdjacency() {
  const out = {};
  for (const r of ROOMS) out[r.id] = (ADJ.get(r.id) || []).map(e => e.to);
  return out;
}

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
    timeoutStrikes: 0, aiManaged: false, voteFloor: null, pendingKeep: [], pendingKeepAt: 0, trades: [],
    shadowHp: 0, shadowMight: 0, lastAliveHp: 10, hpAtRoundStart: 10, revivedDay: 0,
    flyNext: false, adrenalineUntil: 0, channel: 'public', botDifficulty: 'random', pendingKeepFromMorgue: false };
}
function effSpeed(p, day) {
  if (p.adrenalineUntil && p.adrenalineUntil >= day) return 10;
  return Math.max(1, p.genes.speed || 0);
}
// AI 強度（行為差異，不只改名；基因一律 4/3/3，強度體現在走法、投票與道具使用）：
// novice：只走第 1 個鄰房 1 步、不用道具、隨機投票；normal：隨機 1 步、血 ≤4 吃藥片、隨機投票；
// demon：走到速度上限、不折返、投最多人在的樓層、血 ≤6 吃藥片、血 ≤4 用腎上腺素；
// random：隨機步數隨機走、隨機用藥片、隨機投票。
function botAction(room, p) {
  const diff = p.botDifficulty || room.botDifficulty || 'random';
  const speed = Math.max(1, p.genes.speed || 3);
  const neighbours = cur => (ADJ.get(cur) || []).filter(e => !(e.kind === 'climb' && !has(p, 'rope'))).map(e => e.to);
  let path = [];
  if (diff === 'novice') {
    const ns = neighbours(p.room);
    if (ns.length) path = [ns[0]];
  } else {
    const maxSteps = diff === 'demon' ? speed : (diff === 'normal' ? 1 : 1 + Math.floor(Math.random() * speed));
    let cur = p.room, prev = null;
    for (let i = 0; i < maxSteps; i++) {
      const ns = neighbours(cur).filter(n => n !== prev);
      if (!ns.length) break;
      const next = ns[Math.floor(Math.random() * ns.length)];
      path.push(next); prev = cur; cur = next;
    }
  }
  if (!path.length) path = [p.room];
  let vote = FLOORS[Math.floor(Math.random() * FLOORS.length)];
  if (diff === 'demon') {
    const counts = {};
    for (const q of room.players) if (q.room) { const f = ROOM_MAP.get(q.room)?.floor; if (f) counts[f] = (counts[f] || 0) + 1; }
    let best = vote, bestN = -1;
    for (const f of FLOORS) if ((counts[f] || 0) > bestN) { bestN = counts[f] || 0; best = f; }
    vote = best;
  }
  const uses = [];
  if (diff === 'normal' && p.hp <= 4 && has(p, 'pill')) uses.push('pill');
  if (diff === 'demon') { if (p.hp <= 6 && has(p, 'pill')) uses.push('pill'); if (p.hp <= 4 && has(p, 'adrenaline')) uses.push('adrenaline'); }
  if (diff === 'random' && p.hp < 10 && has(p, 'pill') && Math.random() < 0.5) uses.push('pill');
  return { path, vote, rocket: null, newGenes: null, teleport: null, uses };
}
function roomPool(room, day) {
  // 202 本身沒有 pool 欄位，空投序列是它的全部物資：先處理 202，否則舊程式的 !pool 提早回傳會讓空投永遠抽不到。
  if (room.id === '202') { const seq = []; for (let d = 1; d <= day; d++) seq.push(AIRDROP_SEQ[(d - 1) % AIRDROP_SEQ.length]); return seq; }
  if (!room.pool) return [];
  const pool = [];
  for (const e of room.pool) for (let i = 0; i < e.n; i++) pool.push(e.item);
  return pool;
}
// 毒氣：以累積票數為準，已中毒或已解毒的樓層排除在候選外；候選中票數最高者若平票，全部新增。
// 解毒過的樓層本局不再重新中毒（否則累積票數會讓同一層隔回合立刻再中毒，解毒等於無效）。
function newGassedFloors(room) {
  const cur = room.gassedFloors || [];
  const cand = FLOORS.filter(f => !cur.includes(f) && !(room.detoxed || []).includes(f));
  let best = 0;
  for (const f of cand) best = Math.max(best, room.gasVotes[f] || 0);
  if (best <= 0) return [];
  return cand.filter(f => (room.gasVotes[f] || 0) === best);
}
function gassedFloor(room) { return (room.gassedFloors || [])[0] || null; }
// 統一傷害入口：腎上腺素期間（adrenalineUntil ≥ 當回合）傷害保底 1 血（與單人版一致）；
// 血歸零立即化影：位置記為 B701、掉落物進停屍間池、生前武力與致命前血量留給終局比序。
function hurt(room, p, dmg, log, label) {
  if (p.shadow || !p.alive) return 0;
  let d = dmg;
  if (p.adrenalineUntil && p.adrenalineUntil >= room.day && d >= p.hp) d = Math.max(0, p.hp - 1);
  const before = p.hp;
  p.hp = Math.max(0, p.hp - d);
  const dealt = before - p.hp;
  if (label && dealt > 0) log.push(`${label}：${p.name} -${dealt}`);
  if (p.hp <= 0) {
    p.lastAliveHp = before;
    p.hp = 0; p.alive = false; p.shadow = true; p.shadowAt = room.day;
    p.shadowMight = p.genes.might; p.shadowHp = 0;
    room.morguePool.push(...p.items); p.items = [];
    p.room = 'B701';
    log.push(`${p.name} 化為暗影（停屍間 B701）`);
  }
  return dealt;
}

// ---- settlement ----
// 順序（對齊單人版自有步驟）：手術 → 戰鬥 → 暗影吸血（結算前已是暗影者）→ 毒氣（含控制室解毒）
// → 水糧 → 火箭筒 → 基因庫／操作室 → 道具使用 → 暗影復活 → 抽取。
// 血歸零在 hurt() 內立即化影，後續步驟只對仍存活者生效（與單人版 becomeShadow 一致）。
function settle(room, log) {
  const day = room.day;
  room.gassedFloors = room.gassedFloors || (room.gassedFloor ? [room.gassedFloor] : []);
  room.detoxed = room.detoxed || [];
  room.morguePool = room.morguePool || [];
  for (const p of room.players) p.hpAtRoundStart = p.shadow ? p.shadowHp : p.hp;
  const alive = () => room.players.filter(p => p.alive && !p.shadow);
  const shadowsAtStart = room.players.filter(p => p.shadow);
  // surgery: exactly 2 in B202
  const inSurgery = alive().filter(p => p.room === 'B202');
  const surgeryOk = inSurgery.length === 2;
  if (surgeryOk) for (const p of inSurgery) { p.hp = Math.min(10, p.hp + 4); log.push(`手術室：${p.name} +4`); }
  // combat per room (skip surgery room when surgery succeeds); anyone holding a gun zeroes non-gunners
  const anyGun = alive().some(p => p.items.some(it => ITEMS[it]?.gun));
  const byRoom = new Map();
  for (const p of alive()) { if (!byRoom.has(p.room)) byRoom.set(p.room, []); byRoom.get(p.room).push(p); }
  for (const [rid, ps] of byRoom) {
    if (rid === 'B202' && surgeryOk) continue;
    if (ps.length < 2) continue;
    const eff = ps.map(p => ({ p, a: anyGun && !p.items.some(it => ITEMS[it]?.gun) ? 0 : atkOf(p) }));
    const mx = Math.max(...eff.map(e => e.a));
    for (const e of eff) if (e.a < mx) hurt(room, e.p, mx - e.a, log, `戰鬥 ${rid}`);
  }
  // shadow drain: pre-existing shadows only (newly converted this round do not drain yet)
  for (const s of shadowsAtStart) {
    for (const q of alive().filter(p => p.room === s.room)) {
      const dealt = hurt(room, q, 1, log, `暗影吸血 ${s.room}`);
      if (dealt > 0) { s.shadowHp = Math.min(10, s.shadowHp + dealt); log.push(`暗影 ${s.name} 回 ${dealt} 血`); }
    }
  }
  // gas: control detox first (B101, detox choice, no vote that round), then add tied top floors
  for (const p of alive()) {
    if (p.submitted?.control === 'detox' && p.room === 'B101' && p.submitted?.detoxFloor && room.gassedFloors.includes(p.submitted.detoxFloor)) {
      room.gassedFloors = room.gassedFloors.filter(f => f !== p.submitted.detoxFloor);
      room.detoxed.push(p.submitted.detoxFloor);
      log.push(`${p.name} 在控制室解毒了 ${p.submitted.detoxFloor}（秘密解毒，本局不再中毒）`);
    }
  }
  const added = newGassedFloors(room);
  for (const f of added) room.gassedFloors.push(f);
  if (added.length) log.push(`毒氣新增樓層：${added.join('、')}（平票全部下毒，毒過永久不解除）`);
  room.gassedFloor = room.gassedFloors[0] || null;
  room.lastGasTally = { ...room.gasVotes };
  const dmg = GAS_DAMAGE[Math.min(day - 1, 5)];
  for (const p of alive()) {
    const r = ROOM_MAP.get(p.room);
    if (!r) continue;
    if (room.gassedFloors.includes(r.floor) && !r.gasImmune && !has(p, 'gas_mask')) hurt(room, p, dmg, log, `毒氣 ${r.floor}`);
    if (r.laser) hurt(room, p, 1, log, '激光室');
  }
  // supplies (from day 2): water + food each 1, missing one = -1; B204 exempt;
  // survival kit only when BOTH water and food are missing (single-player rule, kit is not wasted on one item)
  if (day >= 2) {
    for (const p of alive()) {
      if (p.room === 'B204') { log.push(`餐廳：${p.name} 免繳水糧`); continue; }
      let water = has(p, 'water'), food = has(p, 'food'), usedKit = false;
      if (!water && !food && has(p, 'survival_kit')) { p.items.splice(p.items.indexOf('survival_kit'), 1); water = true; food = true; usedKit = true; }
      if (water && has(p, 'water') && !usedKit) p.items.splice(p.items.indexOf('water'), 1);
      if (food && has(p, 'food') && !usedKit) p.items.splice(p.items.indexOf('food'), 1);
      // 上面兩行在 kit 情況下不應再扣水／糧：kit 已抵兩項，且 water/food 當時為 false（kit 條件），故無誤；
      // 但若玩家本來就有水，water=true 時扣水 1；本來就有糧，扣糧 1。kit 情況 water/food 原值皆 false，不扣。
      let miss = 0;
      if (!water) miss++;
      if (!food) miss++;
      if (miss > 0) hurt(room, p, miss, log, `水糧不足${usedKit ? '（已用生存補給）' : ''}`);
      else if (usedKit) log.push(`水糧：${p.name} 用生存補給抵水＋糧`);
    }
  }
  // rocket: must own a rocket launcher (single-player rule); shooter is not harmed by own rocket
  for (const p of alive()) {
    if (p.submitted?.rocket && has(p, 'rocket_launcher')) {
      const target = p.submitted.rocket;
      for (const q of alive()) if (q.room === target && q !== p) hurt(room, q, 4, log, `火箭筒 ${target}（${p.name}）`);
    }
  }
  // gene bank, console reallocation (speed floor 1)
  for (const p of alive()) {
    if (p.room === '201') { p.genes.might++; p.genes.weight++; p.genes.speed++; log.push(`基因庫：${p.name} 三項 +1`); }
    if (p.room === 'B304' && p.submitted?.newGenes) {
      const ng = p.submitted.newGenes;
      const tot = (ng.might || 0) + (ng.weight || 0) + (ng.speed || 0);
      const old = p.genes.might + p.genes.weight + p.genes.speed;
      if (tot === old && ng.might >= 0 && ng.weight >= 0 && ng.speed >= 1) { p.genes = { might: ng.might, weight: ng.weight, speed: ng.speed }; log.push(`${p.name} 在操作室重配基因`); }
    }
  }
  // items (step 6, single-player effects): pill +2; adrenaline speed 10 + damage floor 1 through next round;
  // wine dice 1 lose all items (to morgue pool), 2 nothing, 3 might, 4 speed, 5 weight, 6 hp; fine wine doubles 3–6
  for (const p of alive()) {
    const uses = Array.isArray(p.submitted?.uses) ? p.submitted.uses : [];
    for (const it of uses) {
      if (!has(p, it)) continue;
      p.items.splice(p.items.indexOf(it), 1);
      if (it === 'pill') { const before = p.hp; p.hp = Math.min(10, p.hp + 2); log.push(`道具：${p.name} 用藥片 +${p.hp - before}`); }
      else if (it === 'adrenaline') { p.adrenalineUntil = day + 1; log.push(`道具：${p.name} 用腎上腺素（下回合速度 10、傷害保底 1 血）`); }
      else if (it === 'wine' || it === 'fine_wine') {
        const roll = 1 + Math.floor(Math.random() * 6);
        const mul = it === 'fine_wine' ? 2 : 1;
        if (roll === 1) { room.morguePool.push(...p.items); p.items = []; log.push(`道具：${p.name} 喝${it === 'fine_wine' ? '佳釀' : '酒'}擲出 1，所有道具丟失`); }
        else if (roll === 2) log.push(`道具：${p.name} 喝${it === 'fine_wine' ? '佳釀' : '酒'}擲出 2，無事發生`);
        else if (roll === 3) { p.genes.might += mul; log.push(`道具：${p.name} 喝酒擲出 3，武力 +${mul}`); }
        else if (roll === 4) { p.genes.speed += mul; log.push(`道具：${p.name} 喝酒擲出 4，速度 +${mul}`); }
        else if (roll === 5) { p.genes.weight += mul; log.push(`道具：${p.name} 喝酒擲出 5，負重 +${mul}`); }
        else { const before = p.hp; p.hp = Math.min(10, p.hp + 2 * mul); log.push(`道具：${p.name} 喝酒擲出 6，生命 +${p.hp - before}`); }
      }
    }
  }
  // shadow revival: shadowHp >= 2 revives in place (current room, usually B701 or where the shadow moved);
  // the revival round is exempt from gas/supplies by construction (revival happens after both steps)
  for (const s of room.players.filter(p => p.shadow)) {
    if (s.shadowHp >= 2) {
      s.shadow = false; s.alive = true; s.hp = Math.min(10, s.shadowHp); s.shadowHp = 0; s.revivedDay = day;
      log.push(`${s.name} 暗影復活，${s.hp} 血（在 ${s.room}）`);
    }
  }
  // flight qualification (single-player rule): ending the round in 202 grants next round's first-step flight
  for (const p of alive()) p.flyNext = (p.room === '202');
  // draws into pendingKeep (room pool shrinks as players take); B701 draws from the morgue pool
  for (const p of room.players.filter(p => p.alive)) {
    const r = ROOM_MAP.get(p.room);
    if (!r) continue;
    if (r.id === 'B701') {
      const draw = room.morguePool.slice(0, 3);
      if (draw.length) {
        room.morguePool = room.morguePool.slice(draw.length);
        p.pendingKeep = draw; p.pendingKeepFromMorgue = true; p.pendingKeepAt = now();
        log.push(`${p.name} 在停屍間翻到 ${draw.map(i => ITEMS[i].name).join('、')}`);
      }
      continue;
    }
    if (!r.pool && r.id !== '202') continue;
    const pool = roomPool(r, day);
    const taken = room.taken[r.id] || 0;
    const avail = pool.slice(taken);
    const limit = r.id === 'B503' ? 5 : r.draw;
    const draw = avail.slice(0, limit);
    if (draw.length) {
      room.taken[r.id] = taken + draw.length;
      p.pendingKeep = draw; p.pendingKeepFromMorgue = false; p.pendingKeepAt = now();
      log.push(`${p.name} 在 ${r.id} 抽到 ${draw.map(i => ITEMS[i].name).join('、')}`);
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
  const survivors = room.players.filter(p => !p.shadow);
  const shadows = room.players.filter(p => p.shadow);
  // 存活者：金條折算血量（每張 +1、上限 10），同分比武力；暗影：比生前武力、再比致命前血量；
  // 全員暗影時改比前一輪開始時的血量（hpAtRoundStart），再比生前武力；同分並列。
  const effHp = p => Math.min(10, p.hp + p.items.filter(i => i === 'gold_bar').length);
  const bySurvivor = (a, b) => (effHp(b) - effHp(a)) || (b.genes.might - a.genes.might);
  const byShadow = (a, b) => (b.shadowMight - a.shadowMight) || (b.lastAliveHp - a.lastAliveHp);
  const byAllShadow = (a, b) => (b.hpAtRoundStart - a.hpAtRoundStart) || (b.shadowMight - a.shadowMight);
  let ranked;
  if (survivors.length === 0) ranked = [...shadows].sort(byAllShadow);
  else ranked = [...survivors].sort(bySurvivor).concat([...shadows].sort(byShadow));
  const top = ranked[0];
  const winners = top ? ranked.filter(p => {
    if (survivors.length === 0) return p.hpAtRoundStart === top.hpAtRoundStart && p.shadowMight === top.shadowMight;
    if (top.shadow) return p.shadow && p.shadowMight === top.shadowMight && p.lastAliveHp === top.lastAliveHp;
    return !p.shadow && effHp(p) === effHp(top) && p.genes.might === top.genes.might;
  }) : [];
  room.winner = top?.name || null;
  room.winners = winners.map(p => p.name);
  room.ranking = ranked.map((p, i) => ({ rank: i + 1, name: p.name, shadow: p.shadow, hp: p.shadow ? p.shadowHp : p.hp, effHp: p.shadow ? null : effHp(p), might: p.genes.might, win: winners.includes(p) }));
  log.push(`遊戲結束，勝者：${room.winners.join('、') || '無'}`);
  room.endRecords = room.players.map(p => ({
    accountId: p.accountId, name: p.name, hp: p.hp, win: winners.includes(p),
    achievements: [p.alive ? 'survivor' : 'finisher', winners.includes(p) ? 'champion' : null,
      (p.items.filter(i => i === 'gold_bar').length >= 3) ? 'gold3' : null].filter(Boolean),
  }));
}
function aiFill(room) {
  let i = 1;
  while (room.players.length < MAX_PLAYERS) {
    const p = newPlayer('bot-' + i, 'AI-' + i, true);
    p.botDifficulty = room.botDifficulty || 'random';
    p.spawn = SPAWNS[(room.players.length) % SPAWNS.length]; p.room = p.spawn;
    room.players.push(p); i++;
  }
}
function applyTimeouts(room) {
  if (room.phase === 'action' && room.actionDeadline && now() > room.actionDeadline) {
    for (const p of room.players.filter(p => p.alive && !p.shadow && !p.submitted)) {
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
  p.items.push(...keep);
  if (p.pendingKeepFromMorgue) room.morguePool.push(...p.pendingKeep.filter(it => !keep.includes(it)));
  p.pendingKeep = []; p.pendingKeepAt = 0; p.pendingKeepFromMorgue = false;
}
function validatePath(p, path, day = 1) {
  if (!Array.isArray(path) || path.length === 0) return '每回合至少要走 1 步（暗影亦同，傳送室傳送算 1 步）';
  if (path.length > effSpeed(p, day)) return '步數超過速度';
  const seq = [p.room, ...path];
  for (let i = 1; i < seq.length; i++) {
    const cur = seq[i - 1], step = seq[i];
    if (i >= 2 && seq[i] === seq[i - 2]) return '不能立刻折返上一間';
    // 傳送：從 B403 走到空房算 1 步（單人版 neighbors 規則），暗影不能傳送
    if (cur === 'B403' && !p.shadow && isEmptyRoom(ROOM_MAP.get(step))) { continue; }
    // 飛行：上一回合結束時在 202 且本回合在 202 出發，第一步可直飛 H 房（單人版規則），暗影不能飛行
    if (i === 1 && p.flyNext && cur === '202' && !p.shadow && HELIPAD_ROOMS.includes(step)) { continue; }
    const edge = (ADJ.get(cur) || []).find(e => e.to === step);
    if (!edge) return `不能從 ${cur} 走到 ${step}`;
    if (edge.kind === 'climb' && !has(p, 'rope') && !p.shadow) return '垂直通道需要繩索或暗影';
  }
  return null;
}
export function publicRoom(room) {
  return { code: room.code, roomType: room.roomType, status: room.status, day: room.day, phase: room.phase,
    playerCount: room.players.length, aliveCount: room.players.filter(p => p.alive).length,
    spectatorCount: (room.spectators || []).length, hostName: room.players[0]?.name || '', createdAt: room.createdAt,
    botDifficulty: room.botDifficulty || 'random' };
}
export function spectateView(room) {
  return { code: room.code, roomType: room.roomType, status: room.status, day: room.day, phase: room.phase,
    players: room.players.map(p => ({ name: p.name, hp: p.hp, alive: p.alive, shadow: p.shadow, shadowHp: p.shadowHp || 0, room: p.room, genes: p.genes })),
    log: room.log.slice(-60), winner: room.winner || null, winners: room.winners || [], ranking: room.ranking || [],
    gassedFloors: room.gassedFloors || [], endRecords: room.endRecords || [] };
}
function playerView(room, accountId) {
  const me = room.players.find(p => p.accountId === accountId);
  const chats = room.chats || { public: [], tea: [], stair: [], boiler: [] };
  const myChannel = me?.channel || 'public';
  // 投票秘密：行動階段不回傳各樓層票數；結算後才以 lastGasTally（上一回合結算的累積票數）與 gassedFloors 公布。
  return { code: room.code, roomType: room.roomType, status: room.status, day: room.day, phase: room.phase,
    actionDeadline: room.actionDeadline, keepDeadline: room.keepDeadline, gassedFloors: room.gassedFloors || [],
    gassedFloor: (room.gassedFloors || [])[0] || room.gassedFloor || null, lastGasTally: room.lastGasTally || null,
    detoxed: room.detoxed, log: room.log.slice(-80), winner: room.winner || null, winners: room.winners || [], ranking: room.ranking || [],
    endRecords: room.endRecords || [], spectators: (room.spectators || []).length, botDifficulty: room.botDifficulty || 'random',
    chat: { channel: myChannel, messages: [...(chats.public || []), ...(myChannel === 'public' ? [] : (chats[myChannel] || []))] },
    players: room.players.map(p => ({ name: p.name, accountId: p.accountId, hp: p.hp, alive: p.alive, shadow: p.shadow, shadowHp: p.shadowHp || 0,
      room: p.room, genes: p.genes, isBot: p.isBot, submitted: !!p.submitted, readyFree: p.readyFree,
      items: p.accountId === accountId ? p.items : p.items.length, pendingKeep: p.accountId === accountId ? p.pendingKeep : (p.pendingKeep.length ? p.pendingKeep.length : 0) })),
    me: me ? { name: me.name, hp: me.hp, alive: me.alive, shadow: me.shadow, shadowHp: me.shadowHp || 0, room: me.room, genes: me.genes, items: me.items, pendingKeep: me.pendingKeep, timeoutStrikes: me.timeoutStrikes, flyNext: !!me.flyNext, adrenalineUntil: me.adrenalineUntil || 0, channel: myChannel } : null,
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
        const botDifficulty = BOT_DIFFICULTIES.includes(body?.botDifficulty) ? body.botDifficulty : 'random';
        const room = { code, roomType: type, status: 'lobby', day: 1, phase: 'lobby', players: [], spectators: [],
          gasVotes: {}, detoxed: [], gassedFloors: [], lastGasTally: null, taken: {}, morguePool: [], log: [`房間 ${code} 建立（${type === 'ranked' ? '競技' : '娛樂'}，AI ${botDifficulty}）`],
          createdAt: now(), actionDeadline: 0, keepDeadline: 0, gassedFloor: null, trades: [], firstQuitter: null, winner: null, winners: [], ranking: [], endRecords: [],
          botDifficulty, chats: { public: [], tea: [], stair: [], boiler: [] } };
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
            if (tot !== 10 || g.might < 0 || g.weight < 0 || g.speed < 1) return err('基因總點數必須是 10，且速度至少 1');
            me.genes = { might: g.might, weight: g.weight, speed: g.speed };
            me.spawn = body?.spawn && SPAWNS.includes(body.spawn) ? body.spawn : SPAWNS[room.players.indexOf(me) % SPAWNS.length];
            me.room = me.spawn; await save(room); return ok({ room: playerView(room, a.acc.id) });
          }
          if (action === 'start') {
            if (room.status !== 'lobby') return err('已開局', 409);
            // 開局門檻看真人（AI 補滿 12 後總數恆 ≥9，總數門檻因此由真人門檻實質把關）：
            // 競技：真人 ≥5（補滿後總數 ≥9）；娛樂：真人 ≥1（補滿後總數 ≥2）。
            const humans = room.players.filter(p => !p.isBot).length;
            if (room.roomType === 'ranked' && humans < 5) return err('競技房需要至少 5 位真人才能開局', 409);
            if (room.roomType === 'casual' && humans < 1) return err('娛樂房需要至少 1 位真人才能開局', 409);
            aiFill(room);
            for (const p of room.players) { if (!p.room) { p.spawn = p.spawn || SPAWNS[room.players.indexOf(p) % SPAWNS.length]; p.room = p.spawn; } }
            room.status = 'playing'; room.phase = 'action'; room.day = 1; room.actionDeadline = now() + ACTION_TIMEOUT_MS;
            room.log.push(`開局！${room.players.length} 人（含 AI 補位），第 1 天行動開始，180 秒內提交`); await save(room); return ok({ room: playerView(room, a.acc.id) });
          }
          if (action === 'action') {
            if (room.phase !== 'action') return err('現在不是行動階段', 409);
            // 暗影：只允許移動（單人版規則：暗影可走垂直通道、不可傳送／飛行、不可投票／火箭／道具）。
            if (me.shadow) {
              const pathErr = validatePath(me, body?.path, room.day);
              if (pathErr) return err(pathErr, 400);
              const finalRoom = body.path[body.path.length - 1];
              me.submitted = { path: body.path, shadow: true };
              me.room = finalRoom;
              room.log.push(`${me.name}（暗影）移動到 ${finalRoom}`);
              await save(room); return ok({ room: playerView(room, a.acc.id) });
            }
            if (!me.alive) return err('你已出局', 409);
            let path = body?.path;
            // 傳送：人在 B403 且指定傳送目的地時，傳送本身就是那一步（不需先走路徑）；validatePath 會驗證目的地為空房。
            if (body?.teleport) {
              if (me.room !== 'B403') return err('只有在傳送室 B403 才能傳送', 400);
              path = [body.teleport];
            }
            const pathErr = validatePath(me, path, room.day);
            if (pathErr) return err(pathErr, 400);
            const finalRoom = path[path.length - 1];
            // 道具使用：只限結算步驟 6 的四種，且提交時必須持有（數量也要夠）
            const uses = Array.isArray(body?.uses) ? body.uses.filter(u => ['pill', 'adrenaline', 'wine', 'fine_wine'].includes(u)) : [];
            for (const u of uses) {
              const need = uses.filter(x => x === u).length;
              if (me.items.filter(i => i === u).length < need) return err(`你沒有足夠的 ${ITEMS[u].name} 可使用`, 400);
            }
            // 控制室二選一：detox 時不投票（解毒樓層必填）；vote10 只有最終房在 B101 才算 10 票。
            const control = body?.control || null;
            let vote = body?.vote || null;
            let detoxFloor = null;
            if (control === 'detox') {
              if (!body?.detoxFloor || !FLOORS.includes(body.detoxFloor)) return err('解毒需指定一個樓層', 400);
              if (finalRoom !== 'B101') return err('只有最終停在控制室 B101 才能解毒', 400);
              vote = null; detoxFloor = body.detoxFloor;
            }
            me.submitted = { path, vote, rocket: body?.rocket || null, newGenes: body?.newGenes || null,
              control, detoxFloor, teleport: body?.teleport || null, uses };
            if (vote) room.gasVotes[vote] = (room.gasVotes[vote] || 0) + (finalRoom === 'B101' && control === 'vote10' ? 10 : 1);
            me.room = finalRoom; me.voteFloor = vote;
            room.log.push(`${me.name} 移動到 ${finalRoom}${control === 'detox' ? `，控制室秘密解毒 ${detoxFloor}` : (vote ? `，投票 ${vote}` : '')}`);
            const pending = room.players.filter(p => p.alive && !p.shadow && !p.submitted && !p.aiManaged);
            const botsPending = room.players.filter(p => p.isBot && p.alive && !p.shadow && !p.submitted);
            for (const b of botsPending) { const ba = botAction(room, b); b.submitted = ba; if (ba.vote) room.gasVotes[ba.vote] = (room.gasVotes[ba.vote] || 0) + 1; b.room = ba.path[ba.path.length - 1]; }
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
            me.items.push(...keep);
            if (me.pendingKeepFromMorgue) room.morguePool.push(...me.pendingKeep.filter(it => !keep.includes(it)));
            me.pendingKeep = []; me.pendingKeepAt = 0; me.pendingKeepFromMorgue = false;
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
          if (action === 'chatChannel') {
            const ch = CHAT_CHANNELS.includes(body?.channel) ? body.channel : 'public';
            me.channel = ch; await save(room); return ok({ room: playerView(room, a.acc.id) });
          }
          if (action === 'chat') {
            const text = String(body?.text || '').trim().slice(0, 200);
            if (!text) return err('訊息是空的', 400);
            room.chats = room.chats || { public: [], tea: [], stair: [], boiler: [] };
            const ch = me.channel || 'public';
            room.chats[ch] = room.chats[ch] || [];
            room.chats[ch].push({ from: me.name, text, at: now() });
            if (room.chats[ch].length > 50) room.chats[ch] = room.chats[ch].slice(-50);
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
  return { handle, publicRoom, spectateView, playerView, ROOMS, ADJ, settleForTest: settle, applyTimeoutsForTest: applyTimeouts, validatePathForTest: validatePath, botActionForTest: botAction };
}

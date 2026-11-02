// 「封鎖設施求生」遊戲引擎：純函式模組，不依賴任何 I/O，
// 方便單元測試。伺服器權威狀態由 Neon 房間（見 store.ts）持有，
// 前端只做顯示與輸入，規則判定一律在這裡。
// （由 dontalk api-server 原樣移植，僅改此段註解以反映儲存層。）
//
// 原創遊戲，玩法致敬公開規則頁「禁閉逃殺」的核心機制
// （基因配點、六天循環、毒樓層投票、同房戰鬥、暗影復活），
// 但名稱、文案、地圖與數值皆為本專案自訂，並為線上輪詢遊玩做了簡化：
//  - 地圖縮為 3 層 × 5 房（原版 9 層）；出生點 6 個
//  - 行動順序卡交易省略；行動改為全員各自提交、到齊後結算
//    （原版依行動順序輪流），結算時的道具使用併入自由階段使用
//  - 火箭筒襲擊步驟省略（簡化地圖沒有火箭筒房）
//  - 暗影行動放寬為可停留（原版要求至少走一步），避免暗影被迫離開吸血目標

export type FloorId = "2F" | "1F" | "B1";

export type RoomKind =
  | "empty"
  | "laser"
  | "teleport"
  | "water"
  | "food"
  | "weapons"
  | "surgery"
  | "control"
  | "morgue"
  | "stairs";

export interface RoomDef {
  id: string;
  floor: FloorId;
  name: string;
  kind: RoomKind;
  /** 是否為出生點 */
  spawn: boolean;
}

export const ROOMS: RoomDef[] = [
  { id: "201", floor: "2F", name: "201 空房", kind: "empty", spawn: true },
  { id: "202", floor: "2F", name: "202 激光室", kind: "laser", spawn: false },
  { id: "203", floor: "2F", name: "203 樓梯間", kind: "stairs", spawn: true },
  { id: "204", floor: "2F", name: "204 傳送室", kind: "teleport", spawn: false },
  { id: "205", floor: "2F", name: "205 空房", kind: "empty", spawn: true },
  { id: "101", floor: "1F", name: "101 空房", kind: "empty", spawn: true },
  { id: "102", floor: "1F", name: "102 水塔", kind: "water", spawn: false },
  { id: "103", floor: "1F", name: "103 糧倉", kind: "food", spawn: false },
  { id: "104", floor: "1F", name: "104 樓梯間", kind: "stairs", spawn: true },
  { id: "105", floor: "1F", name: "105 手術室", kind: "surgery", spawn: false },
  { id: "B101", floor: "B1", name: "B101 控制室", kind: "control", spawn: false },
  { id: "B102", floor: "B1", name: "B102 空房", kind: "empty", spawn: true },
  { id: "B103", floor: "B1", name: "B103 停屍間", kind: "morgue", spawn: false },
  { id: "B104", floor: "B1", name: "B104 樓梯間", kind: "stairs", spawn: true },
  { id: "B105", floor: "B1", name: "B105 武器庫", kind: "weapons", spawn: false },
];

export const ROOM_MAP: Record<string, RoomDef> = Object.fromEntries(
  ROOMS.map((r) => [r.id, r]),
) as Record<string, RoomDef>;

export const SPAWN_ROOM_IDS: string[] = ROOMS.filter((r) => r.spawn).map((r) => r.id);
export const FLOORS: FloorId[] = ["2F", "1F", "B1"];
export const TOTAL_DAYS = 6;
export const MAX_HP = 10;
export const MAX_PLAYERS = 4;

/** 鄰接表：同層左右相鄰＋樓梯跨層。 */
export const ADJACENCY: Record<string, string[]> = (() => {
  const adj: Record<string, string[]> = {};
  for (const r of ROOMS) adj[r.id] = [];
  const link = (a: string, b: string): void => {
    adj[a]?.push(b);
    adj[b]?.push(a);
  };
  const rows: string[][] = [
    ["201", "202", "203", "204", "205"],
    ["101", "102", "103", "104", "105"],
    ["B101", "B102", "B103", "B104", "B105"],
  ];
  for (const row of rows) {
    for (let i = 0; i < row.length - 1; i++) link(row[i] as string, row[i + 1] as string);
  }
  link("203", "104");
  link("104", "B104");
  return adj;
})();

export type ItemKind =
  | "water"
  | "food"
  | "supply"
  | "gold"
  | "knife"
  | "pistol"
  | "rifle"
  | "medicine"
  | "wine"
  | "adrenaline";

export const ITEM_NAMES: Record<ItemKind, string> = {
  water: "水",
  food: "糧食",
  supply: "生存補給",
  gold: "金條",
  knife: "刀",
  pistol: "手槍",
  rifle: "步槍",
  medicine: "急救藥片",
  wine: "美酒",
  adrenaline: "腎上腺素",
};

export const WEAPON_BONUS: Partial<Record<ItemKind, number>> = {
  knife: 1,
  pistol: 2,
  rifle: 3,
};

export function isGun(kind: ItemKind): boolean {
  return kind === "pistol" || kind === "rifle";
}

export interface Item {
  id: string;
  kind: ItemKind;
}

export interface Player {
  id: string;
  name: string;
  isAI: boolean;
  isHost: boolean;
  /** 伺服器端才保留；公開視圖會剔除。 */
  token: string;
  might: number;
  carry: number;
  speed: number;
  hp: number;
  alive: boolean;
  /** 暗影累積的生命，達 2 以上可復活。 */
  shadowHp: number;
  room: string;
  items: Item[];
  /** 自由階段是否按了準備完成。 */
  ready: boolean;
  hasSetup: boolean;
  /** 腎上腺素給的當天速度加成（自由階段使用後，當天行動階段生效）。 */
  speedBoost: number;
}

export interface DayAction {
  playerId: string;
  /** 出發後依序走過的房間（不含起點）。暗影可停留，path 可為空。 */
  path: string[];
  voteFloor: FloorId | null;
  /** 經過傳送室時的目的地（必須是空房）。 */
  teleportTo?: string;
  /** 終點在控制室時，指定解毒的房間。 */
  detoxRoom?: string;
}

export interface LogEntry {
  day: number;
  text: string;
}

export interface Trade {
  id: string;
  fromId: string;
  toId: string;
  offerItemId: string;
  wantItemId: string;
}

export interface RankingEntry {
  playerId: string;
  finalHp: number;
  might: number;
  alive: boolean;
  rank: number;
}

export type GamePhase = "free" | "action";
export type GameStatus = "lobby" | "playing" | "finished";

export interface GameRoom {
  id: string;
  code: string;
  status: GameStatus;
  day: number;
  phase: GamePhase;
  players: Player[];
  /** 當天已提交的行動（playerId -> action）。 */
  actions: Record<string, DayAction>;
  /** 當天已被搜刮過的房間。 */
  lootedRooms: string[];
  /** 當天被解毒的房間（免毒氣傷害）。 */
  detoxedRooms: string[];
  /** 停屍間掉落物堆。 */
  morgue: Item[];
  log: LogEntry[];
  trades: Trade[];
  ranking: RankingEntry[];
  createdAt: number;
}

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function makeItem(kind: ItemKind): Item {
  return { id: newId("it"), kind };
}

export function roomOf(player: Player): RoomDef {
  return ROOM_MAP[player.room] as RoomDef;
}

export function effectiveSpeed(player: Player): number {
  return player.speed + player.speedBoost;
}

/** 最終武力 = 基因武力 + 手上最高武器加成。 */
export function finalMight(player: Player): number {
  let bonus = 0;
  for (const it of player.items) {
    const b = WEAPON_BONUS[it.kind] ?? 0;
    if (b > bonus) bonus = b;
  }
  return player.might + bonus;
}

export function hasGun(player: Player): boolean {
  return player.items.some((it) => isGun(it.kind));
}

export function createRoom(code: string, hostName: string): GameRoom {
  const host: Player = {
    id: newId("p"),
    name: hostName,
    isAI: false,
    isHost: true,
    token: newId("tok"),
    might: 0,
    carry: 0,
    speed: 0,
    hp: MAX_HP,
    alive: true,
    shadowHp: 0,
    room: "",
    items: [],
    ready: false,
    hasSetup: false,
    speedBoost: 0,
  };
  return {
    id: newId("room"),
    code,
    status: "lobby",
    day: 0,
    phase: "free",
    players: [host],
    actions: {},
    lootedRooms: [],
    detoxedRooms: [],
    morgue: [],
    log: [],
    trades: [],
    ranking: [],
    createdAt: Date.now(),
  };
}

export function addPlayer(room: GameRoom, name: string, isAI: boolean): Player {
  const p: Player = {
    id: newId("p"),
    name,
    isAI,
    isHost: false,
    token: newId("tok"),
    might: 0,
    carry: 0,
    speed: 0,
    hp: MAX_HP,
    alive: true,
    shadowHp: 0,
    room: "",
    items: [],
    ready: false,
    hasSetup: false,
    speedBoost: 0,
  };
  room.players.push(p);
  return p;
}

export function findPlayer(room: GameRoom, playerId: string): Player | undefined {
  return room.players.find((p) => p.id === playerId);
}

/** 驗證配點；回傳錯誤訊息，合法回傳 null。 */
export function validateSetup(might: number, carry: number, speed: number, spawn: string): string | null {
  if (![might, carry, speed].every((n) => Number.isInteger(n) && n >= 0)) {
    return "基因數值必須是非負整數";
  }
  if (might + carry + speed !== 10) return "武力＋負重＋速度總和必須剛好等於 10 點";
  if (speed < 1) return "速度至少要 1 點";
  if (!SPAWN_ROOM_IDS.includes(spawn)) return "出生點不在可選清單內";
  return null;
}

export function setSetup(
  room: GameRoom,
  playerId: string,
  might: number,
  carry: number,
  speed: number,
  spawn: string,
): string | null {
  if (room.status !== "lobby") return "遊戲已經開始，無法再配點";
  const p = findPlayer(room, playerId);
  if (!p) return "找不到玩家";
  const err = validateSetup(might, carry, speed, spawn);
  if (err) return err;
  p.might = might;
  p.carry = carry;
  p.speed = speed;
  p.room = spawn;
  p.hasSetup = true;
  return null;
}

/**
 * 驗證一步路徑。path 是出發後依序走過的房間（不含起點）。
 * 存活者：起點相鄰起手、步步相鄰、不重複房間、1..speed 步。
 * 暗影：不需相鄰（不受地形阻礙），但仍限不重複、0..speed 步（可停留）。
 */
export function validatePath(player: Player, path: string[]): string | null {
  if (!Array.isArray(path)) return "路徑格式錯誤";
  if (player.alive) {
    if (path.length < 1) return "每回合至少要走 1 步";
    if (path.length > effectiveSpeed(player)) return `步數超過速度上限（${effectiveSpeed(player)} 步）`;
    const seen = new Set<string>([player.room]);
    let prev = player.room;
    for (const step of path) {
      if (!ROOM_MAP[step]) return `不存在的房間：${step}`;
      if (seen.has(step)) return "同一回合內不能往回走、不能重複進入房間";
      if (!(ADJACENCY[prev] ?? []).includes(step)) return `無法從 ${prev} 直接走到 ${step}`;
      seen.add(step);
      prev = step;
    }
  } else {
    if (path.length > effectiveSpeed(player)) return `步數超過速度上限（${effectiveSpeed(player)} 步）`;
    const seen = new Set<string>();
    for (const step of path) {
      if (!ROOM_MAP[step]) return `不存在的房間：${step}`;
      if (seen.has(step)) return "同一回合內不能重複進入房間";
      seen.add(step);
    }
  }
  return null;
}

/** 路徑終點（傳送則為傳送目的地）。 */
export function finalRoomOf(player: Player, action: DayAction): string {
  if (action.teleportTo) return action.teleportTo;
  if (action.path.length === 0) return player.room;
  return action.path[action.path.length - 1] as string;
}

export function pathIncludesTeleport(action: DayAction): boolean {
  return action.path.some((id) => ROOM_MAP[id]?.kind === "teleport");
}

/** 驗證整份行動；合法回傳 null。 */
export function validateAction(room: GameRoom, player: Player, action: DayAction): string | null {
  if (room.status !== "playing" || room.phase !== "action") return "現在不是行動階段";
  const pathErr = validatePath(player, action.path);
  if (pathErr) return pathErr;
  if (player.alive) {
    if (!action.voteFloor || !FLOORS.includes(action.voteFloor)) return "必須秘密投出一票毒樓層";
    if (action.teleportTo) {
      if (!pathIncludesTeleport(action)) return "只有經過傳送室才能傳送";
      const dest = ROOM_MAP[action.teleportTo];
      if (!dest || dest.kind !== "empty") return "傳送目的地必須是空房";
    }
    if (action.detoxRoom) {
      if (finalRoomOf(player, action) !== "B101") return "只有終點在控制室時才能指定解毒房間";
      if (!ROOM_MAP[action.detoxRoom]) return "解毒目標房間不存在";
    }
  }
  return null;
}

function pushLog(room: GameRoom, text: string): void {
  room.log.push({ day: room.day, text });
}

/** 玩家死亡 → 變暗影，道具掉在停屍間。 */
export function killToShadow(room: GameRoom, player: Player, cause: string): void {
  if (!player.alive) return;
  player.alive = false;
  player.hp = 0;
  player.shadowHp = 0;
  for (const it of player.items) room.morgue.push(it);
  player.items = [];
  pushLog(room, `👻 ${player.name} ${cause}，生命歸零化為暗影，道具掉落在停屍間`);
}

export function damage(room: GameRoom, player: Player, amount: number, cause: string): void {
  if (!player.alive || amount <= 0) return;
  player.hp -= amount;
  if (player.hp <= 0) {
    player.hp = 0;
    killToShadow(room, player, cause);
  }
}

/** 搜刮：依房間種類擲出物資；每房每天限一次。回傳獲得的物品或 null。 */
export function rollLoot(roomId: string): Item | null {
  const kind = ROOM_MAP[roomId]?.kind;
  if (kind === "water") return makeItem("water");
  if (kind === "food") return makeItem("food");
  if (kind === "weapons") {
    const weapons: ItemKind[] = ["knife", "pistol", "rifle"];
    return makeItem(weapons[Math.floor(Math.random() * weapons.length)] as ItemKind);
  }
  if (kind === "empty" || kind === "stairs") {
    const pool: ItemKind[] = ["water", "food", "supply", "gold", "medicine", "wine", "adrenaline"];
    return makeItem(pool[Math.floor(Math.random() * pool.length)] as ItemKind);
  }
  return null; // 激光室／傳送室／手術室／控制室／停屍間不直接產物資
}

/** 手術室：剛好 2 名存活者時，武力高者吸取敗者 2 血。 */
function resolveSurgery(room: GameRoom): void {
  const occupants = room.players.filter((p) => p.alive && p.room === "105");
  if (occupants.length !== 2) return;
  const [a, b] = occupants as [Player, Player];
  const ma = finalMight(a);
  const mb = finalMight(b);
  if (ma === mb) {
    pushLog(room, "🏥 手術室：兩人武力相同，無人吸血");
    return;
  }
  const winner = ma > mb ? a : b;
  const loser = ma > mb ? b : a;
  const take = Math.min(2, loser.hp);
  loser.hp -= take;
  winner.hp = Math.min(MAX_HP, winner.hp + take);
  pushLog(room, `🏥 手術室：${winner.name} 勝出，從 ${loser.name} 吸取 ${take} 點生命`);
  if (loser.hp <= 0) killToShadow(room, loser, "在手術室被吸乾");
}

/**
 * 戰鬥／亂鬥＋暗影吸血。開局落地戰也會呼叫（此時全員存活，
 * 暗影吸血段自然無動作），所以匯出給 route 使用。
 */
export function resolveCombatAndShadows(room: GameRoom): void {
  const rooms = new Map<string, Player[]>();
  for (const p of room.players) {
    if (!rooms.has(p.room)) rooms.set(p.room, []);
    rooms.get(p.room)?.push(p);
  }
  for (const [roomId, occupants] of rooms) {
    const alive = occupants.filter((p) => p.alive);
    const shadows = occupants.filter((p) => !p.alive);
    // 暗影吸血：每位存活者扣 1，暗影每人回復等量
    for (const sh of shadows) {
      let drained = 0;
      for (const target of alive) {
        if (target.hp <= 0) continue;
        target.hp -= 1;
        drained += 1;
      }
      if (drained > 0) {
        sh.shadowHp += drained;
        pushLog(room, `👻 暗影 ${sh.name} 在 ${ROOM_MAP[roomId]?.name} 吸取 ${drained} 點生命`);
      }
    }
    for (const target of alive) {
      if (target.hp <= 0) killToShadow(room, target, "被暗影吸乾");
    }
    const fighters = occupants.filter((p) => p.alive);
    if (fighters.length < 2) continue;
    const anyGun = fighters.some((p) => hasGun(p));
    // 持槍絕對優勢：無槍者武力視為 0 且無法反擊
    const eff = fighters.map((p) => ({
      p,
      might: !hasGun(p) && anyGun ? 0 : finalMight(p),
    }));
    const max = Math.max(...eff.map((e) => e.might));
    const winners = eff.filter((e) => e.might === max);
    const roomName = ROOM_MAP[roomId]?.name ?? roomId;
    if (winners.length === 1) {
      const winnerName = (winners[0] as { p: Player }).p.name;
      for (const e of eff) {
        if (e.might === max) continue;
        const dmg = max - e.might;
        if (dmg > 0) {
          pushLog(
            room,
            `⚔️ ${roomName} 戰鬥：${winnerName} 勝出，${e.p.name} 承受 ${dmg} 點傷害`,
          );
          damage(room, e.p, dmg, "在戰鬥中落敗");
        }
      }
    } else {
      // 武力相同（或多人同為最高）：各扣 1 點相撞傷害
      for (const e of eff) {
        pushLog(room, `⚔️ ${roomName} 戰鬥：武力相同，${e.p.name} 承受 1 點相撞傷害`);
        damage(room, e.p, 1, "在戰鬥中相撞");
      }
    }
  }
}

/** 毒氣：得票最高樓層（同票取順序 2F > 1F > B1），停留者扣當天數血，解毒房除外。 */
function resolvePoison(room: GameRoom, votes: Record<string, FloorId | null>): void {
  const counts: Record<FloorId, number> = { "2F": 0, "1F": 0, B1: 0 };
  for (const p of room.players) {
    if (!p.alive) continue;
    const v = votes[p.id];
    if (v) counts[v] += 1;
  }
  let floor: FloorId = "2F";
  let best = -1;
  for (const f of FLOORS) {
    if (counts[f] > best) {
      best = counts[f];
      floor = f;
    }
  }
  if (best <= 0) {
    pushLog(room, "☣️ 本日無人投票，沒有樓層中毒");
    return;
  }
  pushLog(room, `☣️ 毒氣公布：第 ${room.day} 天，${floor} 樓層全面封死（得票 ${best}）`);
  for (const p of room.players) {
    if (!p.alive) continue;
    const def = ROOM_MAP[p.room];
    if (!def || def.floor !== floor) continue;
    if (room.detoxedRooms.includes(p.room)) {
      pushLog(room, `🛡️ ${p.name} 所在的 ${def.name} 已解毒，免受毒氣傷害`);
      continue;
    }
    pushLog(room, `☣️ ${p.name} 在毒氣樓層承受 ${room.day} 點傷害`);
    damage(room, p, room.day, "被毒氣侵蝕");
  }
}

/** 水糧上繳（第 2 天起）：生存補給可同時抵水＋糧，缺一項扣 2 血。 */
function resolveUpkeep(room: GameRoom): void {
  if (room.day < 2) return;
  for (const p of room.players) {
    if (!p.alive) continue;
    const supplyIdx = p.items.findIndex((it) => it.kind === "supply");
    if (supplyIdx >= 0) {
      p.items.splice(supplyIdx, 1);
      pushLog(room, `🍱 ${p.name} 繳交 1 份生存補給（抵水＋糧）`);
      continue;
    }
    let missing = 0;
    const waterIdx = p.items.findIndex((it) => it.kind === "water");
    if (waterIdx >= 0) p.items.splice(waterIdx, 1);
    else missing += 1;
    const foodIdx = p.items.findIndex((it) => it.kind === "food");
    if (foodIdx >= 0) p.items.splice(foodIdx, 1);
    else missing += 1;
    if (missing > 0) {
      pushLog(room, `🍱 ${p.name} 缺 ${missing} 項水糧，扣除 ${missing * 2} 點生命`);
      damage(room, p, missing * 2, "缺水缺糧");
    } else {
      pushLog(room, `🍱 ${p.name} 繳交水與糧食各 1 份`);
    }
  }
}

/** 暗影復活：結算時暗影生命達 2 以上，原地復活。 */
function resolveRevive(room: GameRoom): void {
  for (const p of room.players) {
    if (p.alive) continue;
    if (p.shadowHp >= 2) {
      p.alive = true;
      p.hp = Math.min(MAX_HP, p.shadowHp);
      p.shadowHp = 0;
      pushLog(room, `✨ 暗影 ${p.name} 累積足夠生命，在 ${ROOM_MAP[p.room]?.name} 原地復活（生命 ${p.hp}）`);
    }
  }
}

/** 終局排名：存活者優先於暗影；金條 1:1 折生命（補至 10 上限）；比生命、再比基因武力。 */
export function computeRanking(room: GameRoom): RankingEntry[] {
  const entries = room.players.map((p) => {
    const gold = p.items.filter((it) => it.kind === "gold").length;
    const finalHp = p.alive ? Math.min(MAX_HP, p.hp + gold) : 0;
    return { playerId: p.id, finalHp, might: p.might, alive: p.alive };
  });
  entries.sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (b.finalHp !== a.finalHp) return b.finalHp - a.finalHp;
    return b.might - a.might;
  });
  const ranked: RankingEntry[] = [];
  let rank = 0;
  let prevKey = "";
  entries.forEach((e, i) => {
    const key = `${e.alive}-${e.finalHp}-${e.might}`;
    if (key !== prevKey) {
      rank = i + 1;
      prevKey = key;
    }
    ranked.push({ ...e, rank });
  });
  return ranked;
}

/**
 * 執行當天結算。呼叫前需確認所有玩家（存活＋暗影）都已提交行動。
 * 結算後：若第 6 天或只剩 ≤1 名存活者 → 終局；否則進入下一天自由階段。
 */
export function runSettlement(room: GameRoom): void {
  const day = room.day;
  pushLog(room, `── 第 ${day} 天結算開始 ──`);

  // 0. 移動：先把所有人移到終點，再算激光傷害與搜刮
  const votes: Record<string, FloorId | null> = {};
  for (const p of room.players) {
    const action = room.actions[p.id];
    if (!action) continue;
    votes[p.id] = action.voteFloor;
    if (action.teleportTo) {
      p.room = action.teleportTo;
      pushLog(room, `🌀 ${p.name} 經傳送室傳送到 ${ROOM_MAP[action.teleportTo]?.name}`);
    } else if (action.path.length > 0) {
      p.room = action.path[action.path.length - 1] as string;
    }
    const pathText = action.path.length > 0 ? action.path.join(" → ") : "（停留）";
    pushLog(room, `🚶 ${p.name} 移動：${pathText}，終點 ${ROOM_MAP[p.room]?.name}`);
  }
  // 解毒房登記（終點在控制室者）
  for (const p of room.players) {
    const action = room.actions[p.id];
    if (action?.detoxRoom && p.alive && p.room === "B101") {
      room.detoxedRooms.push(action.detoxRoom);
      pushLog(room, `🛡️ ${p.name} 在控制室解毒了 ${ROOM_MAP[action.detoxRoom]?.name}`);
    }
  }
  // 激光：路徑經過（含終點）扣 1 血，暗影免疫
  for (const p of room.players) {
    if (!p.alive) continue;
    const action = room.actions[p.id];
    if (!action) continue;
    const passedLaser = action.path.some((id) => ROOM_MAP[id]?.kind === "laser");
    if (passedLaser) {
      pushLog(room, `🔦 ${p.name} 經過激光室，承受 1 點傷害`);
      damage(room, p, 1, "被激光灼傷");
    }
  }
  // 搜刮：終點房當天限一次；停屍間改撿掉落物（裝得下多少撿多少）
  for (const p of room.players) {
    if (!p.alive) continue;
    if (room.lootedRooms.includes(p.room)) continue;
    const def = ROOM_MAP[p.room];
    if (!def) continue;
    if (def.kind === "morgue") {
      const space = p.carry - p.items.length;
      const take = room.morgue.splice(0, Math.max(0, space));
      if (take.length > 0) {
        p.items.push(...take);
        pushLog(room, `🎒 ${p.name} 在停屍間撿回 ${take.map((it) => ITEM_NAMES[it.kind]).join("、")}`);
      }
      room.lootedRooms.push(p.room);
      continue;
    }
    const loot = rollLoot(p.room);
    if (!loot) continue;
    room.lootedRooms.push(p.room);
    if (p.items.length >= p.carry) {
      pushLog(room, `🎒 ${p.name} 在 ${def.name} 找到 ${ITEM_NAMES[loot.kind]}，但背包已滿無法撿拾`);
    } else {
      p.items.push(loot);
      pushLog(room, `🎒 ${p.name} 在 ${def.name} 搜刮到 ${ITEM_NAMES[loot.kind]}`);
    }
  }

  resolveSurgery(room);
  resolveCombatAndShadows(room);
  resolvePoison(room, votes);
  resolveUpkeep(room);
  resolveRevive(room);

  // 生命公告
  for (const p of room.players) {
    pushLog(
      room,
      p.alive
        ? `❤️ ${p.name}：${p.hp} 血，位於 ${ROOM_MAP[p.room]?.name}`
        : `👻 ${p.name}：暗影（累積 ${p.shadowHp} 血），位於 ${ROOM_MAP[p.room]?.name}`,
    );
  }

  const aliveCount = room.players.filter((p) => p.alive).length;
  if (day >= TOTAL_DAYS || aliveCount <= 1) {
    room.status = "finished";
    room.ranking = computeRanking(room);
    const top = room.ranking.filter((r) => r.rank === 1).map((r) => {
      const p = findPlayer(room, r.playerId);
      return p ? p.name : "?";
    });
    pushLog(room, `🏆 遊戲結束！冠軍：${top.join("、")}（最終生命 ${room.ranking[0]?.finalHp}）`);
    return;
  }
  // 下一天
  room.day += 1;
  room.phase = "free";
  room.actions = {};
  room.lootedRooms = [];
  room.detoxedRooms = [];
  room.trades = [];
  for (const p of room.players) {
    p.ready = false;
    p.speedBoost = 0;
  }
  pushLog(room, `── 第 ${room.day} 天開始（自由階段）──`);
}

/** 自由階段使用消耗品。 */
export function useItem(room: GameRoom, playerId: string, itemId: string): string | null {
  if (room.status !== "playing" || room.phase !== "free") return "只有自由階段可以使用道具";
  const p = findPlayer(room, playerId);
  if (!p || !p.alive) return "找不到玩家或玩家已是暗影";
  const idx = p.items.findIndex((it) => it.id === itemId);
  if (idx < 0) return "背包裡沒有這個道具";
  const item = p.items[idx] as Item;
  if (item.kind === "medicine") {
    p.hp = Math.min(MAX_HP, p.hp + 2);
    p.items.splice(idx, 1);
    pushLog(room, `💊 ${p.name} 使用急救藥片，回復至 ${p.hp} 血`);
    return null;
  }
  if (item.kind === "wine") {
    p.hp = Math.min(MAX_HP, p.hp + 1);
    p.items.splice(idx, 1);
    pushLog(room, `🍷 ${p.name} 喝下美酒，回復至 ${p.hp} 血`);
    return null;
  }
  if (item.kind === "adrenaline") {
    p.speedBoost = 1;
    p.items.splice(idx, 1);
    pushLog(room, `💉 ${p.name} 注射腎上腺素，今天速度 +1`);
    return null;
  }
  return "這個道具無法在自由階段使用";
}

/** 自由階段發起交易：一物換一物，對方接受才成交。 */
export function proposeTrade(
  room: GameRoom,
  fromId: string,
  toId: string,
  offerItemId: string,
  wantItemId: string,
): string | null {
  if (room.status !== "playing" || room.phase !== "free") return "只有自由階段可以交易";
  const from = findPlayer(room, fromId);
  const to = findPlayer(room, toId);
  if (!from || !to || !from.alive || !to.alive) return "交易對象無效";
  if (fromId === toId) return "不能跟自己交易";
  if (!from.items.some((it) => it.id === offerItemId)) return "你沒有要給出的道具";
  if (!to.items.some((it) => it.id === wantItemId)) return "對方沒有你要的道具";
  room.trades.push({ id: newId("tr"), fromId, toId, offerItemId, wantItemId });
  pushLog(room, `🤝 ${from.name} 向 ${to.name} 提出交易`);
  return null;
}

export function respondTrade(room: GameRoom, tradeId: string, toId: string, accept: boolean): string | null {
  if (room.status !== "playing" || room.phase !== "free") return "只有自由階段可以回覆交易";
  const idx = room.trades.findIndex((t) => t.id === tradeId && t.toId === toId);
  if (idx < 0) return "找不到這筆交易";
  const trade = room.trades[idx] as Trade;
  room.trades.splice(idx, 1);
  const from = findPlayer(room, trade.fromId);
  const to = findPlayer(room, trade.toId);
  if (!from || !to) return "交易對象已離開";
  if (!accept) {
    pushLog(room, `🤝 ${to.name} 拒絕了 ${from.name} 的交易`);
    return null;
  }
  const offerIdx = from.items.findIndex((it) => it.id === trade.offerItemId);
  const wantIdx = to.items.findIndex((it) => it.id === trade.wantItemId);
  if (offerIdx < 0 || wantIdx < 0) {
    pushLog(room, "🤝 交易失敗：道具已不在背包中");
    return null;
  }
  const offer = from.items[offerIdx] as Item;
  const want = to.items[wantIdx] as Item;
  from.items[offerIdx] = want;
  to.items[wantIdx] = offer;
  pushLog(room, `🤝 交易成交：${from.name} 的 ${ITEM_NAMES[offer.kind]} ↔ ${to.name} 的 ${ITEM_NAMES[want.kind]}`);
  return null;
}

/**
 * 公開視圖：剔除 token、他人背包內容（只留件數）、他人未結算的行動。
 * 自己的背包與待處理交易完整保留。
 */
export function publicView(room: GameRoom, token?: string): Record<string, unknown> {
  const self = token ? room.players.find((p) => p.token === token) : undefined;
  return {
    code: room.code,
    status: room.status,
    day: room.day,
    phase: room.phase,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      isHost: p.isHost,
      might: p.might,
      carry: p.carry,
      speed: p.speed,
      speedBoost: p.speedBoost,
      hp: p.hp,
      alive: p.alive,
      shadowHp: p.shadowHp,
      room: p.room,
      ready: p.ready,
      hasSetup: p.hasSetup,
      itemCount: p.items.length,
      // 交易需要知道對手有什麼種類，但物品 id 不公開（避免猜測偽造交易）
      itemKinds: p.items.map((it) => it.kind),
      items: self && self.id === p.id ? p.items : undefined,
      isSelf: self ? self.id === p.id : false,
    })),
    submittedCount: Object.keys(room.actions).length,
    submittedPlayerIds:
      room.phase === "action" ? room.players.filter((p) => room.actions[p.id]).map((p) => p.id) : [],
    lootedRooms: room.lootedRooms,
    detoxedRooms: room.detoxedRooms,
    morgueCount: room.morgue.length,
    log: room.log.slice(-200),
    trades: room.trades
      .filter((t) => !self || t.fromId === self.id || t.toId === self.id)
      .map((t) => {
        const from = findPlayer(room, t.fromId);
        const to = findPlayer(room, t.toId);
        const offer = from?.items.find((it) => it.id === t.offerItemId);
        const want = to?.items.find((it) => it.id === t.wantItemId);
        return {
          id: t.id,
          fromId: t.fromId,
          toId: t.toId,
          fromName: from?.name ?? "?",
          toName: to?.name ?? "?",
          offerKind: offer?.kind ?? "?",
          wantKind: want?.kind ?? "?",
        };
      }),
    ranking: room.ranking,
    selfId: self?.id ?? null,
  };
}

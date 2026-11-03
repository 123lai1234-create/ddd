// 「封鎖設施求生」多人完整規則版引擎（serverless 後端用）。
//
// 規則移植自本站自有資產 astro/public/games/lockdown-survival/js/
// （data.js／engine.js，純前端單人版），不是抄 ksever 的程式碼。
// 與單人版相同的部分：42 房地圖、9 樓層、6 回合、基因配點、
// 物資池抽取、毒氣投票（累積不消失）、手術室、戰鬥／亂鬥、
// 暗影吸血與復活、水糧上繳、火箭筒、控制室、操作室、基因庫、
// 傳送室、停機坪空投與飛行、垃圾場規則。
//
// 為了多人輪詢（2 秒 GET）可玩而做的簡化，見 README 與最終報告：
//   - 抽取不做「攤開選留」互動：伺服器自動保留（垃圾場垃圾強制帶走、
//     非垃圾最多 2 件、停機坪最多 1 件、背包容量為準），多餘的進棄置堆。
//   - 金條攤開挑選不做（金條仍可由抽取取得，終局仍 1:1 折生命）。
//   - 交易仍是自由階段一物換一物（舊版介面），不在結算內重跑交易步驟。
//   - 成就、戰績、觀戰、信譽、帳號系統皆不做（超出本次範圍）。
//   - 玩家人數維持 4 人（舊版上限），未滿由 AI 補滿。
//   - 暗影 lastAliveHp 取「致死傷害前」的生命（單人版 JS 在 hp 歸零後
//     才記錄，實質永遠是 0，排名上所有暗影同分；此處修為合理語意）。
//   - 容量計算用「剩餘負重」（carry − 現有件數）；單人版 JS 的 keep
//     步驟以基因負重為上限卻不扣現有背包，伺服器版改為剩餘制，
//     否則背包顯示件數會超過上限。

export type FloorId = "2F" | "1F" | "B1" | "B2" | "B3" | "B4" | "B5" | "B6" | "B7";

export type SpecialRoom =
  | "gene_bank"
  | "helipad"
  | "control_room"
  | "operating_room"
  | "dining_hall"
  | "console_room"
  | "teleport_room"
  | "morgue"
  | null;

export interface RoomDef {
  id: string;
  floors: FloorId[];
  name: string;
  special: SpecialRoom;
  /** null = 不是資源房；[] = 資源房但初始池為空（停機坪空投、停屍間）。 */
  resourcePool: { kind: ItemKind; qty: number }[] | null;
  drawLimit: number | "all";
  spawn: boolean;
  helipad: boolean;
  gasImmune: boolean;
  laser: boolean;
  maxNonJunkPickup: number | null;
}

const R = (o: Partial<RoomDef> & { id: string; floors: FloorId[] }): RoomDef => ({
  name: "(空房)",
  special: null,
  resourcePool: null,
  drawLimit: 0,
  spawn: false,
  helipad: false,
  gasImmune: false,
  laser: false,
  maxNonJunkPickup: null,
  ...o,
});

export const ROOMS: RoomDef[] = [
  /* 2F */
  R({ id: "201", floors: ["2F"], name: "基因庫", special: "gene_bank", helipad: true }),
  R({ id: "202", floors: ["2F"], name: "停機坪", special: "helipad", gasImmune: true, resourcePool: [], drawLimit: "all" }),
  /* 1F */
  R({ id: "101", floors: ["1F"], name: "水塔", helipad: true, resourcePool: [{ kind: "water", qty: 10 }], drawLimit: 4 }),
  R({ id: "102", floors: ["1F"], name: "激光室", laser: true }),
  R({ id: "103", floors: ["1F"], spawn: true }),
  R({ id: "104", floors: ["1F"] }),
  /* B1 */
  R({ id: "B101", floors: ["B1"], name: "控制室", special: "control_room", helipad: true }),
  R({ id: "B102", floors: ["B1"] }),
  R({ id: "B103", floors: ["B1"], spawn: true, helipad: true }),
  R({ id: "B104", floors: ["B1"] }),
  R({ id: "B105", floors: ["B1"], name: "回收站", helipad: true }),
  R({ id: "B106", floors: ["B1"] }),
  R({ id: "B107", floors: ["B1"], name: "武器庫", resourcePool: [{ kind: "knife", qty: 5 }, { kind: "pistol", qty: 2 }, { kind: "shotgun", qty: 1 }], drawLimit: 2 }),
  /* B2 */
  R({ id: "B201", floors: ["B2"] }),
  R({ id: "B202", floors: ["B2"], name: "手術室", special: "operating_room" }),
  R({ id: "B203", floors: ["B2"] }),
  R({ id: "B204", floors: ["B2"], name: "餐廳", special: "dining_hall" }),
  R({ id: "B205", floors: ["B2"] }),
  R({ id: "B206", floors: ["B2"], name: "金庫", resourcePool: [{ kind: "gold_bar", qty: 4 }], drawLimit: 2 }),
  /* B3 */
  R({ id: "B301", floors: ["B3"], name: "藥房", resourcePool: [{ kind: "pill", qty: 3 }, { kind: "adrenaline", qty: 3 }], drawLimit: 2 }),
  R({ id: "B302", floors: ["B3"] }),
  R({ id: "B303", floors: ["B3"], spawn: true }),
  R({ id: "B304", floors: ["B3"], name: "操作室", special: "console_room" }),
  R({ id: "B305", floors: ["B3"] }),
  R({ id: "B306", floors: ["B3"] }),
  R({ id: "B307", floors: ["B3"], spawn: true }),
  R({ id: "B308", floors: ["B3"] }),
  /* B4 */
  R({ id: "B401", floors: ["B4"] }),
  R({ id: "B402", floors: ["B4"], spawn: true }),
  R({ id: "B403", floors: ["B4"], name: "傳送室", special: "teleport_room" }),
  R({ id: "B404", floors: ["B4"] }),
  R({ id: "B405", floors: ["B4"] }),
  /* B5 */
  R({ id: "B501", floors: ["B4", "B5"], name: "大倉庫", resourcePool: [{ kind: "water", qty: 5 }, { kind: "food", qty: 5 }, { kind: "knife", qty: 3 }, { kind: "wine", qty: 2 }, { kind: "gold_bar", qty: 1 }, { kind: "pill", qty: 2 }, { kind: "adrenaline", qty: 2 }, { kind: "pistol", qty: 1 }, { kind: "shotgun", qty: 1 }], drawLimit: 3 }),
  R({ id: "B502", floors: ["B5"] }),
  R({ id: "B503", floors: ["B5"], name: "垃圾場", resourcePool: [{ kind: "junk", qty: 20 }, { kind: "gas_mask", qty: 1 }, { kind: "recycler", qty: 1 }, { kind: "rocket_launcher", qty: 1 }, { kind: "dimension_pocket", qty: 1 }, { kind: "rope", qty: 1 }], drawLimit: 5, maxNonJunkPickup: 2 }),
  R({ id: "B504", floors: ["B5"] }),
  R({ id: "B505", floors: ["B5"], name: "糧倉", resourcePool: [{ kind: "food", qty: 10 }], drawLimit: 4 }),
  /* B6 */
  R({ id: "B601", floors: ["B6"], name: "酒窖", resourcePool: [{ kind: "wine", qty: 6 }], drawLimit: 2 }),
  R({ id: "B602", floors: ["B6"] }),
  R({ id: "B603", floors: ["B6"], spawn: true }),
  R({ id: "B604", floors: ["B6"] }),
  /* B7 */
  R({ id: "B701", floors: ["B7"], name: "停屍間", special: "morgue", resourcePool: [], drawLimit: 3 }),
];

export const ROOM_MAP: Record<string, RoomDef> = Object.fromEntries(
  ROOMS.map((r) => [r.id, r]),
);
export const SPAWN_ROOM_IDS: string[] = ROOMS.filter((r) => r.spawn).map((r) => r.id);
export const FLOORS: FloorId[] = ["2F", "1F", "B1", "B2", "B3", "B4", "B5", "B6", "B7"];
export const TOTAL_DAYS = 6;
export const MAX_HP = 10;
export const MAX_PLAYERS = 4;
export const GAS_DAMAGE_BY_ROUND = [1, 2, 2, 3, 3, 4];
/** 停機坪飛行可抵達的 H 標記房（不含停機坪本身）。 */
export const HELIPAD_ROOMS: string[] = ROOMS.filter((r) => r.helipad).map((r) => r.id);

/** 沒有特殊功能、不是資源房、不是激光室的房間（傳送目的地）。 */
export function isEmptyRoom(roomId: string): boolean {
  const def = ROOM_MAP[roomId];
  return !!def && def.special === null && def.resourcePool === null && !def.laser;
}

// ---------------------------------------------------------------------------
// 連接：walk（一般通道）、climb（需繩索或暗影的垂直通道）、
// link（回收站 B105 → 垃圾場 B503 單向直達）。
// 與單人版 data.js 的 EDGES 逐一對照（B501 與 B401 之間不相通）。
// ---------------------------------------------------------------------------
function chain(ids: string[], type: "walk" | "climb", out: Record<string, string[]>): void {
  for (let i = 0; i < ids.length - 1; i++) {
    const a = ids[i] as string;
    const b = ids[i + 1] as string;
    (out[a] ??= []).push(b);
    (out[b] ??= []).push(a);
  }
}

function buildEdges(): { walk: Record<string, string[]>; climb: Record<string, string[]> } {
  const walk: Record<string, string[]> = {};
  const climb: Record<string, string[]> = {};
  const w = (ids: string[]) => chain(ids, "walk", walk);
  const c = (ids: string[]) => chain(ids, "climb", climb);
  w(["103", "104"]);
  w(["B101", "B102", "B103", "B104", "B105", "B106", "B107"]);
  w(["B201", "B202", "B203", "B204", "B205"]);
  w(["B301", "B302", "B303", "B304", "B305", "B306", "B307", "B308"]);
  w(["B401", "B402"]);
  w(["B403", "B404", "B405"]);
  w(["B501", "B502", "B503"]);
  w(["B504", "B505"]);
  w(["B601", "B602", "B603", "B604"]);
  w(["101", "B102"]);
  w(["B102", "B201"]);
  w(["B501", "B601"]);
  w(["201", "102"]);
  w(["102", "B104"]);
  w(["B105", "B205"]);
  w(["B204", "B305"]);
  w(["B304", "B401"]);
  w(["B402", "B503"]);
  w(["B602", "B701"]);
  w(["202", "104"]);
  w(["103", "B106"]);
  w(["B106", "B206"]);
  w(["B206", "B308"]);
  w(["B307", "B404"]);
  w(["B405", "B505"]);
  w(["B504", "B604"]);
  c(["B101", "B201"]);
  c(["B103", "B202"]);
  c(["B201", "B301"]);
  c(["B201", "B302"]);
  c(["B202", "B303"]);
  c(["B301", "B501"]);
  c(["B302", "B501"]);
  c(["B303", "B501"]);
  c(["B104", "B203"]);
  c(["B104", "B204"]);
  c(["B205", "B305"]);
  c(["B203", "B304"]);
  c(["B401", "B502"]);
  c(["B401", "B503"]);
  c(["B502", "B601"]);
  c(["B503", "B601"]);
  c(["B305", "B402"]);
  c(["B503", "B602"]);
  c(["202", "103"]);
  c(["104", "B107"]);
  c(["B107", "B206"]);
  c(["B206", "B306"]);
  c(["B206", "B307"]);
  c(["B306", "B403"]);
  c(["B308", "B405"]);
  c(["B403", "B504"]);
  c(["B404", "B504"]);
  c(["B102", "B202"]);
  c(["B202", "B302"]);
  c(["B203", "B303"]);
  c(["B204", "B304"]);
  c(["B404", "B505"]);
  c(["B401", "B305"]);
  c(["B307", "B403"]);
  c(["B106", "104"]);
  return { walk, climb };
}

const EDGES = buildEdges();
/** 一般通道＋回收站直達（不含需繩索的垂直通道；AI／前端另用 neighborsOf）。 */
export const ADJACENCY: Record<string, string[]> = (() => {
  const adj: Record<string, string[]> = {};
  for (const r of ROOMS) adj[r.id] = [...(EDGES.walk[r.id] ?? [])];
  (adj["B105"] ??= []).push("B503");
  return adj;
})();

/**
 * 從 from 出發可一步抵達的房間。
 * opts.helipadFirstStep：第一步且上一回合停在停機坪時，可飛到 H 標記房。
 */
export function neighborsOf(
  player: Player,
  from: string,
  opts: { helipadFirstStep?: boolean } = {},
): string[] {
  const out = new Set<string>(EDGES.walk[from] ?? []);
  if (from === "B105") out.add("B503");
  if (player.alive === false || player.items.some((it) => it.kind === "rope")) {
    for (const nb of EDGES.climb[from] ?? []) out.add(nb);
  }
  if (from === "B403") {
    for (const r of ROOMS) if (isEmptyRoom(r.id)) out.add(r.id);
  }
  if (opts.helipadFirstStep && player.helicopter && player.alive) {
    for (const h of HELIPAD_ROOMS) out.add(h);
  }
  out.delete(from);
  return [...out];
}

// ---------------------------------------------------------------------------
// 道具
// ---------------------------------------------------------------------------
export type ItemKind =
  | "water"
  | "food"
  | "survival_kit"
  | "pill"
  | "adrenaline"
  | "wine"
  | "fine_wine"
  | "gold_bar"
  | "knife"
  | "pistol"
  | "shotgun"
  | "bayonet"
  | "rope"
  | "gas_mask"
  | "rocket_launcher"
  | "dimension_pocket"
  | "recycler"
  | "junk";

export const ITEM_NAMES: Record<ItemKind, string> = {
  water: "水",
  food: "糧食",
  survival_kit: "生存補給",
  pill: "藥片",
  adrenaline: "腎上腺素",
  wine: "酒",
  fine_wine: "陳年美酒",
  gold_bar: "金條",
  knife: "刀",
  pistol: "手槍",
  shotgun: "霰彈槍",
  bayonet: "軍用刺刀",
  rope: "繩索",
  gas_mask: "防毒面具",
  rocket_launcher: "火箭筒",
  dimension_pocket: "次元口袋",
  recycler: "循環回收裝置",
  junk: "垃圾",
};

export const WEAPON_BONUS: Partial<Record<ItemKind, number>> = {
  knife: 2,
  pistol: 2,
  shotgun: 4,
  bayonet: 4,
};

export function isGun(kind: ItemKind): boolean {
  return kind === "pistol" || kind === "shotgun";
}

/** 結算步驟 6 可主動使用的道具（與單人版 usableInResolution 一致）。 */
export const USABLE_IN_RESOLUTION: ItemKind[] = ["pill", "adrenaline", "wine", "fine_wine"];

export interface Item {
  id: string;
  kind: ItemKind;
}

// ---------------------------------------------------------------------------
// 玩家／行動／房間
// ---------------------------------------------------------------------------
export interface Player {
  id: string;
  name: string;
  isAI: boolean;
  isHost: boolean;
  token: string;
  might: number;
  carry: number;
  speed: number;
  hp: number;
  alive: boolean;
  shadowHp: number;
  /** 暗影死前生命（致死傷害前的值，供排名用）。 */
  lastAliveHp: number;
  room: string;
  ready: boolean;
  hasSetup: boolean;
  items: Item[];
  /** AI 政策（gunner／hoarder／medic／ranger 等，見 game-ai）。 */
  policy?: string;
  /** 上一回合停在停機坪 → 本回合第一步可飛到 H 標記房。 */
  helicopter: boolean;
  /** 腎上腺素生效中：速度 10、傷害保底 1 血，直到使用後第一次結算結束。 */
  adrenalineActive: boolean;
  /** AI 記住的長期目標房（人類玩家不用）。 */
  targetRoom?: string;
}

export interface DayAction {
  playerId: string;
  path: string[];
  voteFloor: FloorId | null;
  teleportTo?: string;
  detoxRoom?: string;
  /** 終點在控制室 B101 時：vote = 本回合毒票算 10 票；detox = 永久解毒一房。 */
  controlChoice?: { mode: "vote" | "detox"; target?: string };
  /** 終點在操作室 B304 時：重配基因（總和須等於目前總和）。 */
  geneRealloc?: { might: number; carry: number; speed: number };
  /** 持有火箭筒時：結算步驟 5 轟炸的房間。 */
  rocketTarget?: string;
  /** 結算步驟 6 要使用的道具 id（僅 pill／adrenaline／wine／fine_wine）。 */
  itemUses?: string[];
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
  actions: Record<string, DayAction>;
  /** 各房剩餘物資池（死亡掉落也會回到當時房間的池子）。 */
  pools: Record<string, Item[]>;
  /** 停機坪累積的空投卡（每回合 1 張，停留者最多帶走 1 張）。 */
  airdrop: Item[];
  /** 被用掉的道具（回收機可從這裡隨機抽 1 張）。 */
  usedPile: Item[];
  /** 被丟回／抽後不要的道具（不可回收）。 */
  discardPile: Item[];
  /** 已中毒樓層（累積不消失）。 */
  gassedFloors: FloorId[];
  /** 已永久解毒的房間。 */
  detoxedRooms: string[];
  /** 上一回合毒氣投票結果（公開資訊，供玩家避開熱門毒層）。 */
  lastGasTally: { floorId: FloorId; votes: number; all: Record<string, number> } | null;
  log: LogEntry[];
  trades: Trade[];
  ranking: RankingEntry[];
  createdAt: number;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function makeItem(kind: ItemKind): Item {
  return { id: newId("it"), kind };
}

export function roomOf(player: Player): RoomDef {
  return ROOM_MAP[player.room] as RoomDef;
}

/** 腎上腺素生效中速度為 10，否則為基因速度。 */
export function effectiveSpeed(player: Player): number {
  return player.adrenalineActive ? 10 : player.speed;
}

/** 基因武力（排名同分比大小用；戰鬥另用 attackPower 含裝備）。 */
export function finalMight(player: Player): number {
  return player.might;
}

export function hasGun(player: Player): boolean {
  return player.items.some((it) => isGun(it.kind));
}

export function hasItemKind(player: Player, kind: ItemKind): boolean {
  return player.items.some((it) => it.kind === kind);
}

export function countKind(player: Player, kind: ItemKind): number {
  return player.items.filter((it) => it.kind === kind).length;
}

/** 攻擊力 = 基因武力＋裝備加成（每件都算）；是否持槍另回傳。 */
export function attackPower(player: Player): { total: number; hasFirearm: boolean } {
  let bonus = 0;
  let hasFirearm = false;
  for (const it of player.items) {
    bonus += WEAPON_BONUS[it.kind] ?? 0;
    if (isGun(it.kind)) hasFirearm = true;
  }
  return { total: player.might + bonus, hasFirearm };
}

/** 剩餘負重：次元口袋在還有至少 1 點額度時視為無限。 */
export function remainingCapacity(player: Player): number {
  const remaining = player.carry - player.items.length;
  if (remaining >= 1 && hasItemKind(player, "dimension_pocket")) return Infinity;
  return Math.max(0, remaining);
}

function pushLog(room: GameRoom, text: string): void {
  room.log.push({ day: room.day, text });
}

/** 舊版房間（改版前存入 Neon 的）補齊新欄位，避免讀取時崩潰。 */
export function ensureRoomShape(room: GameRoom): void {
  room.pools ??= {};
  room.airdrop ??= [];
  room.usedPile ??= [];
  room.discardPile ??= [];
  room.gassedFloors ??= [];
  room.detoxedRooms ??= [];
  room.lastGasTally ??= null;
  for (const p of room.players) {
    (p as Partial<Player>).helicopter ??= false;
    (p as Partial<Player>).adrenalineActive ??= false;
    (p as Partial<Player>).lastAliveHp ??= 0;
  }
}

/** 開局：各房物資池＋第 1 回合空投卡。由 start 端點呼叫一次。 */
export function initGameState(room: GameRoom): void {
  ensureRoomShape(room);
  room.pools = {};
  for (const def of ROOMS) {
    if (def.resourcePool === null) continue;
    const pool: Item[] = [];
    for (const entry of def.resourcePool) {
      for (let i = 0; i < entry.qty; i++) pool.push(makeItem(entry.kind));
    }
    room.pools[def.id] = pool;
  }
  room.airdrop = [];
  addAirdrop(room);
}

/** 每回合 1 張空投卡累積到停機坪（不含垃圾與金條，與單人版一致）。 */
export function addAirdrop(room: GameRoom): void {
  ensureRoomShape(room);
  const pool: ItemKind[] = (Object.keys(ITEM_NAMES) as ItemKind[]).filter(
    (k) => k !== "junk" && k !== "gold_bar",
  );
  const kind = pool[Math.floor(Math.random() * pool.length)] as ItemKind;
  room.airdrop.push(makeItem(kind));
}

export function createRoom(code: string, hostName: string): GameRoom {
  const room: GameRoom = {
    id: newId("room"),
    code,
    status: "lobby",
    day: 0,
    phase: "free",
    players: [],
    actions: {},
    pools: {},
    airdrop: [],
    usedPile: [],
    discardPile: [],
    gassedFloors: [],
    detoxedRooms: [],
    lastGasTally: null,
    log: [],
    trades: [],
    ranking: [],
    createdAt: Date.now(),
  };
  addPlayer(room, hostName, false);
  const host = room.players[0] as Player;
  host.isHost = true;
  return room;
}

export function addPlayer(room: GameRoom, name: string, isAI: boolean): Player {
  const player: Player = {
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
    lastAliveHp: MAX_HP,
    room: "",
    ready: false,
    hasSetup: false,
    items: [],
    helicopter: false,
    adrenalineActive: false,
  };
  room.players.push(player);
  return player;
}

export function findPlayer(room: GameRoom, playerId: string): Player | undefined {
  return room.players.find((p) => p.id === playerId);
}

export function validateSetup(
  might: number,
  carry: number,
  speed: number,
  spawn: string,
): string | null {
  if (![might, carry, speed].every((n) => Number.isInteger(n) && n >= 0)) {
    return "配點必須是整數";
  }
  if (might + carry + speed !== 10) return "武力＋負重＋速度總和必須是 10";
  if (speed < 1) return "速度至少要 1";
  if (!SPAWN_ROOM_IDS.includes(spawn)) return "出生點無效";
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
  if (room.status !== "lobby") return "遊戲已經開始，無法配點";
  const p = findPlayer(room, playerId);
  if (!p) return "找不到玩家";
  const e = validateSetup(might, carry, speed, spawn);
  if (e) return e;
  p.might = might;
  p.carry = carry;
  p.speed = speed;
  p.room = spawn;
  p.hasSetup = true;
  return null;
}

// ---------------------------------------------------------------------------
// 路徑驗證
// ---------------------------------------------------------------------------
/** 含傳送的實際路徑：路徑經過 B403 且另給 teleportTo 時，傳送到該空房。 */
export function effectivePath(player: Player, action: DayAction): string[] {
  const path = [...action.path];
  if (
    action.teleportTo &&
    path.includes("B403") &&
    isEmptyRoom(action.teleportTo) &&
    !path.includes(action.teleportTo) &&
    action.teleportTo !== player.room
  ) {
    path.push(action.teleportTo);
  }
  return path;
}

export function finalRoomOf(player: Player, action: DayAction): string {
  const path = effectivePath(player, action);
  return path.length > 0 ? (path[path.length - 1] as string) : player.room;
}

export function pathIncludesTeleport(action: DayAction): boolean {
  return action.path.includes("B403") || !!action.teleportTo;
}

export function validatePath(player: Player, path: string[]): string | null {
  const maxSteps = effectiveSpeed(player);
  if (player.alive) {
    if (path.length < 1) return "存活者每回合至少要走 1 步";
    if (path.length > maxSteps) return `步數超過速度上限（${maxSteps}）`;
  } else if (path.length > maxSteps) {
    return `步數超過速度上限（${maxSteps}）`;
  }
  const visited = new Set<string>([player.room]);
  let cur = player.room;
  for (let i = 0; i < path.length; i++) {
    const next = path[i] as string;
    if (!ROOM_MAP[next]) return `沒有這個房間：${next}`;
    if (visited.has(next)) return "路徑不可重複進房或往回走";
    visited.add(next);
    if (!player.alive) {
      // 暗影不受地形限制，可直接前往任一未去過的房間。
      cur = next;
      continue;
    }
    const opts = { helipadFirstStep: i === 0 };
    if (!neighborsOf(player, cur, opts).includes(next)) {
      return `無法從 ${cur} 直接走到 ${next}`;
    }
    cur = next;
  }
  return null;
}

export function validateAction(room: GameRoom, player: Player, action: DayAction): string | null {
  if (room.status !== "playing" || room.phase !== "action") return "現在不是行動階段";
  const path = effectivePath(player, action);
  const pathErr = validatePath(player, path);
  if (pathErr) return pathErr;
  if (player.alive) {
    if (!action.voteFloor || !FLOORS.includes(action.voteFloor)) return "請投一票毒樓層";
    const finalRoom = finalRoomOf(player, action);
    if (action.controlChoice) {
      if (finalRoom !== "B101") return "控制室選項只有終點在控制室時可用";
      if (action.controlChoice.mode === "detox") {
        if (!action.controlChoice.target || !ROOM_MAP[action.controlChoice.target]) {
          return "解毒目標房間無效";
        }
      }
    }
    if (action.geneRealloc) {
      const g = action.geneRealloc;
      const total = player.might + player.carry + player.speed;
      if (g.might + g.carry + g.speed !== total || g.speed < 1 || g.might < 0 || g.carry < 0) {
        return "重配基因總和必須等於目前總和，且速度至少 1";
      }
    }
    if (action.rocketTarget && !ROOM_MAP[action.rocketTarget]) return "火箭筒目標房間無效";
    if (action.itemUses) {
      for (const id of action.itemUses) {
        const item = player.items.find((it) => it.id === id);
        if (!item) return "結算使用的道具不在背包中";
        if (!(USABLE_IN_RESOLUTION as string[]).includes(item.kind)) {
          return `結算時不能使用${ITEM_NAMES[item.kind]}`;
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 傷害／死亡／戰鬥
// ---------------------------------------------------------------------------
/** 傷害：腎上腺素生效中若會致死，保底剩 1 血。死亡 → 暗影，道具留在當時房間的池子。 */
export function damage(room: GameRoom, player: Player, amount: number, cause: string): void {
  if (!player.alive || amount <= 0) return;
  let dmg = amount;
  if (player.adrenalineActive && dmg >= player.hp) {
    dmg = Math.max(0, player.hp - 1);
  }
  const before = player.hp;
  player.hp = Math.max(0, player.hp - dmg);
  if (player.hp <= 0) {
    killToShadow(room, player, before, cause);
  }
}

export function killToShadow(
  room: GameRoom,
  player: Player,
  lastHp: number,
  cause: string,
): void {
  if (!player.alive) return;
  player.alive = false;
  player.lastAliveHp = lastHp;
  player.hp = 0;
  player.shadowHp = 0;
  ensureRoomShape(room);
  const pool = (room.pools[player.room] ??= []);
  if (player.items.length > 0) {
    pool.push(...player.items);
    player.items = [];
  }
  pushLog(room, `👻 ${player.name} ${cause}，生命歸零化為暗影，道具留在 ${ROOM_MAP[player.room]?.name ?? player.room}`);
}

/** 攻擊力比較：持槍者在場時，無槍者攻擊力視為 0；傷害 = 最高有效攻擊力 − 自己有效攻擊力。 */
export function resolveCombatAndShadows(room: GameRoom, skipRooms: string[] = []): void {
  ensureRoomShape(room);
  const byRoom = new Map<string, Player[]>();
  for (const p of room.players) {
    if (!byRoom.has(p.room)) byRoom.set(p.room, []);
    byRoom.get(p.room)?.push(p);
  }
  for (const [roomId, occupants] of byRoom) {
    const alive = occupants.filter((p) => p.alive);
    const shadows = occupants.filter((p) => !p.alive);
    // 暗影吸血：每位暗影對每位同房存活者吸 max(1, 暗影攻擊力)，累積 shadowHp（上限 10）。
    for (const sh of shadows) {
      const drain = Math.max(1, attackPower(sh).total);
      let gained = 0;
      for (const target of alive) {
        if (!target.alive) continue;
        const before = target.hp;
        damage(room, target, drain, "被暗影吸血");
        const dealt = before - target.hp;
        gained += dealt;
      }
      if (gained > 0) {
        sh.shadowHp = Math.min(MAX_HP, sh.shadowHp + gained);
        pushLog(room, `👻 暗影 ${sh.name} 在 ${ROOM_MAP[roomId]?.name ?? roomId} 吸取 ${gained} 點生命（累積 ${sh.shadowHp}）`);
      }
    }
    const fighters = occupants.filter((p) => p.alive);
    if (fighters.length < 2 || skipRooms.includes(roomId)) continue;
    const powers = fighters.map((p) => attackPower(p));
    const anyGun = powers.some((pw) => pw.hasFirearm);
    const eff = fighters.map((p, i) => ({
      p,
      eff: anyGun && !(powers[i] as { hasFirearm: boolean }).hasFirearm ? 0 : (powers[i] as { total: number }).total,
    }));
    const max = Math.max(...eff.map((e) => e.eff));
    const roomName = ROOM_MAP[roomId]?.name ?? roomId;
    for (const e of eff) {
      const dmg = Math.max(0, max - e.eff);
      if (dmg > 0) {
        pushLog(room, `⚔️ ${roomName} 戰鬥：${e.p.name} 承受 ${dmg} 點傷害`);
        damage(room, e.p, dmg, "在戰鬥中落敗");
      }
    }
    if (eff.every((e) => e.eff === max)) {
      pushLog(room, `⚔️ ${roomName} 戰鬥：攻擊力相同，無人受傷`);
    }
  }
}

// ---------------------------------------------------------------------------
// 抽取（伺服器自動保留版，見檔頭簡化說明）
// ---------------------------------------------------------------------------
function drawLoot(room: GameRoom, player: Player, roomId: string): void {
  const def = ROOM_MAP[roomId];
  if (!def || def.resourcePool === null) return;
  ensureRoomShape(room);
  const roomName = def.name !== "(空房)" ? `${roomId} ${def.name}` : roomId;

  if (roomId === "202") {
    // 停機坪：攤開整疊空投卡，最多帶走 1 張（被拿走的才從池子扣除）。
    if (room.airdrop.length === 0) return;
    const space = remainingCapacity(player);
    const kept = space >= 1 ? room.airdrop[0] : undefined;
    if (kept) {
      room.airdrop.shift();
      player.items.push(kept as Item);
      pushLog(room, `🎒 ${player.name} 在停機坪空投帶走 ${ITEM_NAMES[(kept as Item).kind]}（還剩 ${room.airdrop.length} 張空投）`);
    } else {
      pushLog(room, `🎒 ${player.name} 在停機坪背包已滿，空投一張都帶不走`);
    }
    return;
  }

  const pool = (room.pools[roomId] ??= []);
  if (pool.length === 0) return;
  const limit = def.drawLimit === "all" ? pool.length : Math.min(def.drawLimit, pool.length);
  const drawn: Item[] = [];
  for (let i = 0; i < limit; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    drawn.push(pool.splice(idx, 1)[0] as Item);
  }
  // 垃圾場：翻到的垃圾強制帶走（回合結束前可丟回——伺服器版直接帶走），非垃圾最多 2 件。
  const forced = roomId === "B503" ? drawn.filter((it) => it.kind === "junk") : [];
  const rest = drawn.filter((it) => !forced.includes(it));
  const kept: Item[] = [...forced];
  let nonJunkKept = 0;
  let nonForcedKept = 0;
  for (const it of rest) {
    if (def.maxNonJunkPickup !== null && it.kind !== "junk" && nonJunkKept >= def.maxNonJunkPickup) {
      room.discardPile.push(it);
      continue;
    }
    // remainingCapacity 已扣現有背包；再扣本回合已保留的非強制件數。
    if (remainingCapacity(player) - nonForcedKept < 1) {
      room.discardPile.push(it);
      continue;
    }
    kept.push(it);
    nonForcedKept += 1;
    if (it.kind !== "junk") nonJunkKept += 1;
  }
  // 強制垃圾超出負重也照帶（與單人版 forced 行為一致）；其餘多餘的進棄置堆。
  for (const it of kept) player.items.push(it);
  if (kept.length > 0) {
    pushLog(room, `🎒 ${player.name} 在 ${roomName} 撿到 ${kept.map((it) => ITEM_NAMES[it.kind]).join("、")}`);
  }
  if (kept.length === 0 && drawn.length > 0) {
    pushLog(room, `🎒 ${player.name} 在 ${roomName} 翻到物資但背包已滿，一張都帶不走`);
  }
}

// ---------------------------------------------------------------------------
// 酒／道具效果（自由階段與結算步驟 6 共用）
// ---------------------------------------------------------------------------
function applyWine(room: GameRoom, player: Player, kind: "wine" | "fine_wine"): void {
  const roll = 1 + Math.floor(Math.random() * 6);
  const mul = kind === "fine_wine" ? 2 : 1;
  const label = kind === "fine_wine" ? "陳年美酒" : "酒";
  if (roll === 1) {
    const lost = player.items.slice();
    player.items = [];
    room.discardPile.push(...lost);
    pushLog(room, `🍷 ${player.name} 喝${label}擲出 1：所有道具丟失（${lost.map((it) => ITEM_NAMES[it.kind]).join("、") || "無"}）`);
  } else if (roll === 2) {
    pushLog(room, `🍷 ${player.name} 喝${label}擲出 2：無事發生`);
  } else if (roll === 3) {
    player.might += mul;
    pushLog(room, `🍷 ${player.name} 喝${label}擲出 3：武力 +${mul}`);
  } else if (roll === 4) {
    player.speed += mul;
    pushLog(room, `🍷 ${player.name} 喝${label}擲出 4：速度 +${mul}`);
  } else if (roll === 5) {
    player.carry += mul;
    pushLog(room, `🍷 ${player.name} 喝${label}擲出 5：負重 +${mul}`);
  } else {
    const before = player.hp;
    player.hp = Math.min(MAX_HP, player.hp + 2 * mul);
    pushLog(room, `🍷 ${player.name} 喝${label}擲出 6：生命 +${player.hp - before}`);
  }
}

function useConsumableInResolution(room: GameRoom, player: Player, item: Item): void {
  if (item.kind === "pill") {
    const before = player.hp;
    player.hp = Math.min(MAX_HP, player.hp + 2);
    pushLog(room, `💊 ${player.name} 結算時使用藥片，生命 ${before} → ${player.hp}`);
  } else if (item.kind === "adrenaline") {
    player.adrenalineActive = true;
    pushLog(room, `💉 ${player.name} 結算時使用腎上腺素：下回合速度 10、傷害保底 1 血`);
  } else if (item.kind === "wine" || item.kind === "fine_wine") {
    applyWine(room, player, item.kind);
  }
}

// ---------------------------------------------------------------------------
// 結算（順序與單人版 resolveRound 一致；交易已在自由階段完成，不重跑）
//   移動＋激光＋抽取＋特殊房 → 手術室 → 戰鬥／暗影吸血 → 毒氣
//   → 水糧上繳 → 火箭筒 → 道具卡使用 → 暗影復活 → 生命公告
// ---------------------------------------------------------------------------
export function runSettlement(room: GameRoom): void {
  ensureRoomShape(room);
  const day = room.day;
  pushLog(room, `── 第 ${day} 天結算開始 ──`);
  // 腎上腺素：結算開始時生效中的，到這次結算結束就失效；
  // 結算步驟 6 才用的，會留到下一次結算（見文末清除段）。
  const activeAtStart = new Set(room.players.filter((p) => p.adrenalineActive).map((p) => p.id));

  // 步驟 0：移動＋激光＋抽取＋特殊房效果
  for (const p of room.players) {
    const action = room.actions[p.id];
    if (!action) continue;
    const path = effectivePath(p, action);
    const from = p.room;
    if (path.length > 0) {
      p.room = path[path.length - 1] as string;
    }
    pushLog(
      room,
      `🚶 ${p.name} 移動：${path.length > 0 ? `${from} → ${path.join(" → ")}` : "（停留）"}，終點 ${ROOM_MAP[p.room]?.name ?? p.room}`,
    );
    if (!p.alive) continue;
    // 激光：路徑經過（含終點）扣 1 血，暗影免疫。
    if (path.some((id) => ROOM_MAP[id]?.laser)) {
      pushLog(room, `🔦 ${p.name} 經過激光室，承受 1 點傷害`);
      damage(room, p, 1, "被激光灼傷");
      if (!p.alive) continue;
    }
    // 抽取（終點是資源房才抽；死亡掉落會回到該房池子，可重複抽）。
    drawLoot(room, p, p.room);
    if (!p.alive) continue;
    // 基因庫：停留後武力、負重、速度各永久 +1。
    if (p.room === "201") {
      p.might += 1;
      p.carry += 1;
      p.speed += 1;
      pushLog(room, `🧬 ${p.name} 在基因庫：武力、負重、速度各 +1（${p.might}／${p.carry}／${p.speed}）`);
    }
    // 控制室：10 票在毒氣步驟算；解毒立即永久生效。
    if (p.room === "B101" && action.controlChoice?.mode === "detox" && action.controlChoice.target) {
      const target = action.controlChoice.target;
      if (!room.detoxedRooms.includes(target)) {
        room.detoxedRooms.push(target);
        pushLog(room, `🛡️ ${p.name} 在控制室永久解毒了 ${ROOM_MAP[target]?.name ?? target}`);
      }
    }
    // 操作室：重配基因（總和不變，驗證已在 validateAction 做過）。
    if (p.room === "B304" && action.geneRealloc) {
      const g = action.geneRealloc;
      p.might = g.might;
      p.carry = g.carry;
      p.speed = g.speed;
      pushLog(room, `🎛️ ${p.name} 在操作室重配基因：武 ${g.might}／負 ${g.carry}／速 ${g.speed}`);
    }
  }

  // 步驟 1：手術室——剛好 2 名存活者各 +4 血，且該房不結算戰鬥。
  const surgeryOccupants = room.players.filter((p) => p.alive && p.room === "B202");
  const skipRooms: string[] = [];
  if (surgeryOccupants.length === 2) {
    skipRooms.push("B202");
    for (const p of surgeryOccupants) {
      const before = p.hp;
      p.hp = Math.min(MAX_HP, p.hp + 4);
      pushLog(room, `🏥 手術室：${p.name} 生命 ${before} → ${p.hp}`);
    }
  } else if (surgeryOccupants.length >= 3) {
    pushLog(room, "🏥 手術室 3 人以上：沒有手術，照常亂鬥");
  }

  // 步驟 2：戰鬥／亂鬥／暗影吸血
  resolveCombatAndShadows(room, skipRooms);

  // 步驟 3：毒氣——票數加權（控制室 10 票），同票最高者全部新中毒（累積不消失）。
  const tally = new Map<FloorId, number>();
  for (const p of room.players) {
    if (!p.alive) continue;
    const action = room.actions[p.id];
    if (!action?.voteFloor) continue;
    const weight =
      p.room === "B101" && action.controlChoice?.mode === "vote" ? 10 : 1;
    tally.set(action.voteFloor, (tally.get(action.voteFloor) ?? 0) + weight);
  }
  const tallyObj: Record<string, number> = {};
  for (const [f, v] of tally) tallyObj[f] = v;
  let top = 0;
  for (const v of tally.values()) top = Math.max(top, v);
  const newGasFloors: FloorId[] = [];
  if (top > 0) {
    for (const [f, v] of tally) {
      if (v === top && !room.gassedFloors.includes(f)) {
        room.gassedFloors.push(f);
        newGasFloors.push(f);
      }
    }
    room.gassedFloors.sort((a, b) => FLOORS.indexOf(a) - FLOORS.indexOf(b));
  }
  room.lastGasTally =
    top > 0
      ? {
          floorId: [...tally.entries()].sort((a, b) => b[1] - a[1] || FLOORS.indexOf(a[0]) - FLOORS.indexOf(b[0]))[0]?.[0] as FloorId,
          votes: top,
          all: tallyObj,
        }
      : null;
  if (newGasFloors.length > 0) {
    pushLog(room, `☣️ 毒氣公布：第 ${day} 天，${newGasFloors.join("、")} 樓層新中毒（得票 ${top}）`);
  } else if (top > 0) {
    pushLog(room, `☣️ 毒氣公布：第 ${day} 天最高票樓層已中毒過，無新中毒樓層（得票 ${top}）`);
  } else {
    pushLog(room, "☣️ 本日無人投票，沒有樓層中毒");
  }
  const gasDmg = GAS_DAMAGE_BY_ROUND[day - 1] ?? 4;
  for (const p of room.players) {
    if (!p.alive) continue;
    const def = ROOM_MAP[p.room];
    if (!def) continue;
    if (room.detoxedRooms.includes(p.room)) continue;
    if (def.gasImmune) continue;
    if (hasItemKind(p, "gas_mask")) continue;
    if (!def.floors.every((f) => room.gassedFloors.includes(f))) continue;
    pushLog(room, `☣️ ${p.name} 在毒氣房 ${def.name} 承受 ${gasDmg} 點傷害`);
    damage(room, p, gasDmg, "被毒氣侵蝕");
  }

  // 步驟 4：水糧上繳（第 1 回合跳過；餐廳 B204 免繳）。
  if (day === 1) {
    pushLog(room, "🍱 第 1 天免繳水糧");
  } else {
    for (const p of room.players) {
      if (!p.alive) continue;
      if (p.room === "B204") {
        pushLog(room, `🍱 ${p.name} 在餐廳，免繳水糧`);
        continue;
      }
      let water = false;
      let food = false;
      let kit = false;
      const waterIdx = p.items.findIndex((it) => it.kind === "water");
      if (waterIdx >= 0) {
        water = true;
        p.items.splice(waterIdx, 1);
      }
      const foodIdx = p.items.findIndex((it) => it.kind === "food");
      if (foodIdx >= 0) {
        food = true;
        p.items.splice(foodIdx, 1);
      }
      if (!water && !food) {
        const kitIdx = p.items.findIndex((it) => it.kind === "survival_kit");
        if (kitIdx >= 0) {
          kit = true;
          water = true;
          food = true;
          p.items.splice(kitIdx, 1);
        }
      }
      let dmg = 0;
      if (!water) dmg += 1;
      if (!food) dmg += 1;
      if (kit) pushLog(room, `🍱 ${p.name} 繳交生存補給（抵水＋糧）`);
      else if (dmg === 0) pushLog(room, `🍱 ${p.name} 繳交水與糧食各 1 份`);
      else {
        pushLog(room, `🍱 ${p.name} 缺水糧，扣除 ${dmg} 點生命`);
        damage(room, p, dmg, "缺水缺糧");
      }
    }
  }

  // 步驟 5：火箭筒——持有者指定房間，該房每位存活者扣 4（暗影不受影響，可重複使用）。
  const bombedRooms: string[] = [];
  for (const p of room.players) {
    const action = room.actions[p.id];
    if (!p.alive || !action?.rocketTarget) continue;
    if (!hasItemKind(p, "rocket_launcher")) continue;
    if (!bombedRooms.includes(action.rocketTarget)) bombedRooms.push(action.rocketTarget);
  }
  for (const roomId of bombedRooms) {
    const victims = room.players.filter((p) => p.alive && p.room === roomId);
    if (victims.length > 0) {
      pushLog(room, `🚀 火箭筒轟炸 ${ROOM_MAP[roomId]?.name ?? roomId}：${victims.map((v) => v.name).join("、")} 各扣 4 血`);
    }
    for (const v of victims) damage(room, v, 4, "被火箭筒轟炸");
  }

  // 步驟 6：道具卡使用（僅 pill／adrenaline／wine／fine_wine）。
  for (const p of room.players) {
    if (!p.alive) continue;
    const action = room.actions[p.id];
    if (!action?.itemUses) continue;
    for (const id of action.itemUses) {
      const idx = p.items.findIndex((it) => it.id === id);
      if (idx < 0) continue;
      const item = p.items[idx] as Item;
      p.items.splice(idx, 1);
      room.usedPile.push(item);
      useConsumableInResolution(room, p, item);
      if (!p.alive) break;
    }
  }

  // 步驟 7：暗影復活（shadowHp ≥ 2，原地復活，生命 = shadowHp，上限 10）。
  for (const p of room.players) {
    if (p.alive) continue;
    if (p.shadowHp >= 2) {
      p.alive = true;
      p.hp = Math.min(MAX_HP, p.shadowHp);
      p.shadowHp = 0;
      pushLog(room, `✨ 暗影 ${p.name} 累積足夠生命，在 ${ROOM_MAP[p.room]?.name ?? p.room} 原地復活（生命 ${p.hp}）`);
    }
  }

  // 步驟 8：生命公告
  for (const p of room.players) {
    pushLog(
      room,
      p.alive
        ? `❤️ ${p.name}：${p.hp} 血，位於 ${ROOM_MAP[p.room]?.name ?? p.room}`
        : `👻 ${p.name}：暗影（累積 ${p.shadowHp} 血），位於 ${ROOM_MAP[p.room]?.name ?? p.room}`,
    );
  }

  // 停機坪飛行權：本回合停在 202 的存活者，下回合第一步可飛到 H 標記房。
  for (const p of room.players) {
    p.helicopter = p.alive && p.room === "202";
  }
  // 腎上腺素：結算開始時就生效的到此失效；步驟 6 才用的留到下次結算。
  for (const p of room.players) {
    if (activeAtStart.has(p.id)) p.adrenalineActive = false;
  }

  const aliveCount = room.players.filter((p) => p.alive).length;
  if (day >= TOTAL_DAYS || aliveCount <= 1) {
    room.status = "finished";
    room.ranking = computeRanking(room);
    const topNames = room.ranking
      .filter((r) => r.rank === 1)
      .map((r) => findPlayer(room, r.playerId)?.name ?? "?");
    pushLog(room, `🏆 遊戲結束！冠軍：${topNames.join("、")}（最終生命 ${room.ranking[0]?.finalHp}）`);
    return;
  }
  // 下一天：空投累積 1 張（下一回合停機坪可用），回到自由階段。
  room.day += 1;
  room.phase = "free";
  room.actions = {};
  room.trades = [];
  for (const p of room.players) p.ready = false;
  addAirdrop(room);
  pushLog(room, `── 第 ${room.day} 天開始（自由階段）──`);
}

/** 終局排名：存活者優先；金條 1:1 折生命（上限 10）；暗影以死前生命排在存活者之後；同分比武力。 */
export function computeRanking(room: GameRoom): RankingEntry[] {
  const entries = room.players.map((p) => {
    const gold = countKind(p, "gold_bar");
    const finalHp = p.alive ? Math.min(MAX_HP, p.hp + gold) : p.lastAliveHp;
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

/** 自由階段使用道具。酒／陳年美酒擲骰；回收機從用掉的堆隨機抽 1 張。 */
export function useItem(room: GameRoom, playerId: string, itemId: string): string | null {
  if (room.status !== "playing" || room.phase !== "free") return "只有自由階段可以使用道具";
  const p = findPlayer(room, playerId);
  if (!p || !p.alive) return "找不到玩家或玩家已是暗影";
  const idx = p.items.findIndex((it) => it.id === itemId);
  if (idx < 0) return "背包裡沒有這個道具";
  const item = p.items[idx] as Item;
  ensureRoomShape(room);
  if (item.kind === "pill") {
    p.hp = Math.min(MAX_HP, p.hp + 2);
    p.items.splice(idx, 1);
    room.usedPile.push(item);
    pushLog(room, `💊 ${p.name} 使用藥片，回復至 ${p.hp} 血`);
    return null;
  }
  if (item.kind === "adrenaline") {
    p.adrenalineActive = true;
    p.items.splice(idx, 1);
    room.usedPile.push(item);
    pushLog(room, `💉 ${p.name} 使用腎上腺素：下回合速度 10、傷害保底 1 血`);
    return null;
  }
  if (item.kind === "wine" || item.kind === "fine_wine") {
    p.items.splice(idx, 1);
    room.usedPile.push(item);
    applyWine(room, p, item.kind);
    return null;
  }
  if (item.kind === "recycler") {
    if (room.usedPile.length === 0) return "用掉的道具堆是空的，回收機抽不到東西";
    if (remainingCapacity(p) < 1) return "背包已滿，無法回收";
    const pick = Math.floor(Math.random() * room.usedPile.length);
    const got = room.usedPile.splice(pick, 1)[0] as Item;
    p.items.push(got);
    pushLog(room, `♻️ ${p.name} 用回收機從用掉的堆抽回 ${ITEM_NAMES[got.kind]}`);
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
 * 公開視圖：剔除 token、他人背包內容（只留件數與種類）、他人未結算的行動。
 * 自己的背包與待處理交易完整保留；物資池只公開剩餘張數，不公開內容。
 */
export function publicView(room: GameRoom, token?: string): Record<string, unknown> {
  ensureRoomShape(room);
  const self = token ? room.players.find((p) => p.token === token) : undefined;
  const poolCounts: Record<string, number> = {};
  for (const def of ROOMS) {
    if (def.resourcePool === null) continue;
    poolCounts[def.id] = room.pools[def.id]?.length ?? 0;
  }
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
      adrenalineActive: p.adrenalineActive,
      helicopter: p.helicopter,
      hp: p.hp,
      alive: p.alive,
      shadowHp: p.shadowHp,
      lastAliveHp: p.lastAliveHp,
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
    gassedFloors: room.gassedFloors,
    detoxedRooms: room.detoxedRooms,
    poolCounts,
    airdropCount: room.airdrop.length,
    usedPileCount: room.usedPile.length,
    discardCount: room.discardPile.length,
    lastGasTally: room.lastGasTally,
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

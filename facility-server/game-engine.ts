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
//   - 抽取攤開選留做成獨立 keep 階段（見 PendingDraw）：結算步驟 0
//     只移動＋攤開，不卡住等某人選；人類待選留時結算暫停在 keep
//     階段，選完或逾時（KEEP_TIMEOUT_MS，惰性檢查）才跑後續步驟。
//     AI 選留與逾時自動保留都用原本的伺服器自動保留貪心規則
//     （垃圾場垃圾強制帶走、非垃圾最多 2 件、停機坪最多 1 件、
//     背包剩餘容量為準），多餘的進棄置堆（停機坪沒選的留在空投池）。
//   - 金條攤開挑選做在自由階段（spendGoldPick）：花 1 張金條挑
//     當前房間物資池一項（不能挑金條；垃圾場禁用；池裡只剩金條
//     或無可換物時不扣金條、空手而歸），不佔抽取次數；花掉的金條
//     直接消失（不進用掉的堆，回收機抽不回來，與單人版 UI 一致）。
//   - 交易：自由階段一物換一物保留；另移植單人版結算內交易步驟
//     （見 resolveSettlementTrades）：行動提交可附 trade，結算時按
//     行動順序跑，AI 對象即判，人對人因輪詢不能卡結算，轉成自由
//     階段待回覆交易（下一自由階段回覆，詳見 README）。
//   - 帳號系統見 accounts.ts：玩家可綁 accountId（房間內公開視圖只附
//     加入時／每次請求刷新過的公開檔案快照，不含雜湊與 token）；觀戰者
//     另存 room.spectators，不佔玩家名額；棄權／逾時託管與戰績寫入由
//     handler 在提交後處理（見 handler.ts），引擎本身不碰資料庫。
//   - 玩家人數上限 8 人，未滿由 AI 補滿；出生點只有 6 個，
//     AI 出生點取人最少的出生點（不足時循環共用，絕不空白）。
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
  /** 單人版 data.js 的 goldBarDisabled：此房不能用金條攤開挑選（垃圾場）。 */
  goldBarDisabled: boolean;
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
  goldBarDisabled: false,
  ...o,
});

/** 選留逾時：keep 階段開始後這麼久未選，伺服器自動保留（惰性檢查，見 handler）。 */
export const KEEP_TIMEOUT_MS = 60_000;

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
  R({ id: "B503", floors: ["B5"], name: "垃圾場", resourcePool: [{ kind: "junk", qty: 20 }, { kind: "gas_mask", qty: 1 }, { kind: "recycler", qty: 1 }, { kind: "rocket_launcher", qty: 1 }, { kind: "dimension_pocket", qty: 1 }, { kind: "rope", qty: 1 }], drawLimit: 5, maxNonJunkPickup: 2, goldBarDisabled: true }),
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
export const MAX_PLAYERS = 8;
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
export interface AccountProfileSnapshot {
  displayName: string;
  reputation: number;
  games: number;
  wins: number;
  losses: number;
  achievements: string[];
}

/** 觀戰者：只讀，不佔玩家名額，不能行動／交易／投票（handler 擋）。 */
export interface Spectator {
  id: string;
  name: string;
  token: string;
  accountId?: string;
}

/** 待提交的信譽懲罰：由 handler 在房間寫回成功後才寫帳號表（見 handler
    postCommit），避免房間樂觀鎖重試時重複扣分；寫回前先清空佇列。 */
export interface PendingPenalty {
  accountId: string;
  repDelta: number;
  setCooldown: boolean;
}

export interface Player {
  id: string;
  name: string;
  isAI: boolean;
  isHost: boolean;
  token: string;
  /** 綁定的帳號（舊版匿名玩家為 undefined，流程不受影響）。 */
  accountId?: string;
  /** 公開檔案快照（handler 每次請求刷新，僅公開欄位）。 */
  accountProfile?: AccountProfileSnapshot | null;
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
  /** 結算內交易提案（單人版 resolveTrades 的移植）：一物換一物，
      wantKind 在結算時解析為對方背包裡第一張同類道具。 */
  trade?: { toId: string; offerItemId: string; wantKind: ItemKind };
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
  /** 結算內交易轉成的待回覆交易（人對人，下一自由階段回覆）。 */
  fromSettlement?: boolean;
  /** fromSettlement 交易建立時的回合（跨日未回覆者下一結算會被清掉）。 */
  createdDay?: number;
}

/**
 * 抽取攤開待選留：結算步驟 0 攤開後、玩家選留前的狀態。
 * 非停機坪：drawn 已先從房間物資池扣除（未選的進棄置堆）；
 * 停機坪：drawn 只是空投池的快照（未選的留在空投池，選走的才扣除）。
 */
export interface PendingDraw {
  playerId: string;
  roomId: string;
  drawn: Item[];
  /** 選項與 drawn 一一對應（index 即 drawn 下標）。 */
  options: { index: number; kind: ItemKind; forced: boolean; junk: boolean }[];
  rules: { maxNonJunk: number | null; maxTotal: number | null };
  airdrop: boolean;
}

export interface RankingEntry {
  playerId: string;
  finalHp: number;
  might: number;
  alive: boolean;
  rank: number;
}

export type GamePhase = "free" | "action" | "keep";
export type GameStatus = "lobby" | "playing" | "finished";

export interface GameRoom {
  id: string;
  code: string;
  status: GameStatus;
  day: number;
  phase: GamePhase;
  /** 房型：casual 娛樂（信譽 80）、ranked 競技（信譽 90），預設娛樂。 */
  roomType: "casual" | "ranked";
  spectators: Spectator[];
  /** 本房已棄權人次（第一位棄權者才有 15 分鐘冷卻）。 */
  quitCount: number;
  /** 終局戰績已寫入帳號表（避免輪詢重複寫入）。 */
  recordsWritten: boolean;
  /** 每位玩家選留逾時累積次數（達 2 次改 AI 託管並扣分）。 */
  timeoutStrikes: Record<string, number>;
  pendingPenalties: PendingPenalty[];
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
  /** 待選留（keep 階段才有內容；AI 的在步驟 0 結束時已自動解掉）。 */
  pendingDraws: Record<string, PendingDraw>;
  /** keep 階段逾時時刻（epoch ms）；null 表示不在 keep 階段。 */
  keepDeadline: number | null;
  /** 本回合行動順序（進行動階段時洗牌，見 generateSettlementOrder）。 */
  settlementOrder: string[];
  /** 結算開始時腎上腺素生效中的玩家（跨 keep 階段也保留，結算結束時清除）。 */
  adrenalineAtSettlementStart: string[];
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
  room.pendingDraws ??= {};
  room.keepDeadline ??= null;
  room.settlementOrder ??= [];
  room.adrenalineAtSettlementStart ??= [];
  room.roomType ??= "casual";
  room.spectators ??= [];
  room.quitCount ??= 0;
  room.recordsWritten ??= false;
  room.timeoutStrikes ??= {};
  room.pendingPenalties ??= [];
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

export function createRoom(
  code: string,
  hostName: string,
  roomType: "casual" | "ranked" = "casual",
  hostAccountId?: string,
): GameRoom {
  const room: GameRoom = {
    id: newId("room"),
    code,
    status: "lobby",
    day: 0,
    phase: "free",
    roomType,
    spectators: [],
    quitCount: 0,
    recordsWritten: false,
    timeoutStrikes: {},
    pendingPenalties: [],
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
    pendingDraws: {},
    keepDeadline: null,
    settlementOrder: [],
    adrenalineAtSettlementStart: [],
  };
  addPlayer(room, hostName, false, hostAccountId);
  const host = room.players[0] as Player;
  host.isHost = true;
  return room;
}

export function addPlayer(
  room: GameRoom,
  name: string,
  isAI: boolean,
  accountId?: string,
): Player {
  const player: Player = {
    id: newId("p"),
    name,
    isAI,
    isHost: false,
    token: newId("tok"),
    accountId,
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
    if (action.trade) {
      const target = findPlayer(room, action.trade.toId);
      if (!target || target.id === player.id) return "結算交易對象無效";
      if (!target.alive) return "結算交易對象已是暗影";
      if (!player.items.some((it) => it.id === action.trade?.offerItemId)) {
        return "結算交易給出的道具不在背包中";
      }
      if (!(action.trade.wantKind in ITEM_NAMES)) return "結算交易想要的道具種類無效";
    }
  }
  return null;
}

/**
 * 本回合行動順序：單人版 startRound 的移植——全員 id Fisher-Yates
 * 洗牌（單人版用 seeded rng，伺服器版用 Math.random），orderCard
 * 即順序下標＋1。結算各步驟按此順序跑（戰鬥按房間跑，與單人版同）。
 */
export function generateSettlementOrder(room: GameRoom): string[] {
  const ids = room.players.map((p) => p.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = ids[i] as string;
    ids[i] = ids[j] as string;
    ids[j] = tmp;
  }
  room.settlementOrder = ids;
  const names = ids.map((id, i) => `${findPlayer(room, id)?.name ?? "?"}(${i + 1})`).join(" → ");
  pushLog(room, `📋 第 ${room.day} 天行動順序：${names}`);
  return ids;
}

/** 按行動順序排玩家；順序表缺人時（舊房間）補在最後。 */
export function orderedPlayers(room: GameRoom): Player[] {
  ensureRoomShape(room);
  const order = room.settlementOrder.length > 0 ? room.settlementOrder : room.players.map((p) => p.id);
  const byId = new Map(room.players.map((p) => [p.id, p]));
  const out: Player[] = [];
  for (const id of order) {
    const p = byId.get(id);
    if (p) out.push(p);
  }
  for (const p of room.players) if (!out.includes(p)) out.push(p);
  return out;
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
// 抽取攤開＋選留（單人版 performDraw／applyKeep 的多人版移植）。
// 步驟 0 只攤開：drawPending 產生 PendingDraw，不直接給道具；
// 玩家在 keep 階段用 resolveKeep 選留，AI 與逾時用 autoKeep 解決。
// 驗證規則（手動選留超量一律整筆拒絕，不靜默裁剪）：
//   強制垃圾一定帶走（不計入選項容量）；其餘選項受背包剩餘容量、
//   垃圾場非垃圾上限、停機坪最多 1 張約束；選項下標超出範圍也拒絕。
// ---------------------------------------------------------------------------
function drawPending(room: GameRoom, player: Player, roomId: string): PendingDraw | null {
  const def = ROOM_MAP[roomId];
  if (!def || def.resourcePool === null) return null;
  ensureRoomShape(room);
  const roomName = def.name !== "(空房)" ? `${roomId} ${def.name}` : roomId;

  if (roomId === "202") {
    // 停機坪：攤開整疊空投卡（快照，不先扣），最多帶走 1 張。
    if (room.airdrop.length === 0) return null;
    const drawn = [...room.airdrop];
    const pending: PendingDraw = {
      playerId: player.id,
      roomId,
      drawn,
      options: drawn.map((it, i) => ({ index: i, kind: it.kind, forced: false, junk: it.kind === "junk" })),
      rules: { maxNonJunk: null, maxTotal: 1 },
      airdrop: true,
    };
    room.pendingDraws[player.id] = pending;
    pushLog(room, `🎴 ${player.name} 在停機坪攤開 ${drawn.length} 張空投卡（最多帶走 1 張）：${drawn.map((it) => ITEM_NAMES[it.kind]).join("、")}`);
    return pending;
  }

  const pool = (room.pools[roomId] ??= []);
  if (pool.length === 0) return null;
  const limit = def.drawLimit === "all" ? pool.length : Math.min(def.drawLimit, pool.length);
  const drawn: Item[] = [];
  for (let i = 0; i < limit; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    drawn.push(pool.splice(idx, 1)[0] as Item);
  }
  const pending: PendingDraw = {
    playerId: player.id,
    roomId,
    drawn,
    options: drawn.map((it, i) => ({
      index: i,
      kind: it.kind,
      forced: roomId === "B503" && it.kind === "junk",
      junk: it.kind === "junk",
    })),
    rules: { maxNonJunk: def.maxNonJunkPickup, maxTotal: null },
    airdrop: false,
  };
  room.pendingDraws[player.id] = pending;
  pushLog(room, `🎴 ${player.name} 在 ${roomName} 攤開 ${drawn.length} 張：${drawn.map((it) => ITEM_NAMES[it.kind]).join("、")}`);
  return pending;
}

/** 檢查一組選項是否合法；不合法回傳錯誤訊息（整筆拒絕用）。 */
function validateKeepSelection(player: Player, pending: PendingDraw, keepIndexes: number[]): string | null {
  const selected = new Set<number>();
  for (const raw of keepIndexes) {
    if (!Number.isInteger(raw)) return "選留索引必須是整數";
    if (raw < 0 || raw >= pending.options.length) return "選留索引超出攤開範圍";
    selected.add(raw);
  }
  const budget = remainingCapacity(player);
  let nonForcedCount = 0;
  let nonJunkCount = 0;
  for (const opt of pending.options) {
    if (opt.forced) continue;
    if (!selected.has(opt.index)) continue;
    nonForcedCount += 1;
    if (!opt.junk) nonJunkCount += 1;
  }
  if (pending.rules.maxTotal !== null && nonForcedCount > pending.rules.maxTotal) {
    return `停機坪空投最多帶走 ${pending.rules.maxTotal} 張`;
  }
  if (pending.rules.maxNonJunk !== null && nonJunkCount > pending.rules.maxNonJunk) {
    return `垃圾場非垃圾最多留 ${pending.rules.maxNonJunk} 件`;
  }
  if (nonForcedCount > budget) return "選留超出背包剩餘容量";
  return null;
}

/** 套用選留（呼叫前須先通過 validateKeepSelection；autoKeep 用貪心算出索引後也走這裡）。 */
function applyKeep(room: GameRoom, player: Player, pending: PendingDraw, keepIndexes: number[]): void {
  ensureRoomShape(room);
  const keepSet = new Set(keepIndexes);
  const kept: Item[] = [];
  const discarded: Item[] = [];
  for (const opt of pending.options) {
    const item = pending.drawn[opt.index] as Item;
    if (opt.forced || keepSet.has(opt.index)) {
      kept.push(item);
    } else {
      discarded.push(item);
    }
  }
  for (const it of kept) player.items.push(it);
  if (pending.airdrop) {
    // 停機坪：只有被帶走的卡才從空投池扣除（同回合後到的人還能挑剩下的）。
    for (const it of kept) {
      const idx = room.airdrop.findIndex((a) => a.kind === it.kind);
      if (idx >= 0) room.airdrop.splice(idx, 1);
    }
  } else {
    room.discardPile.push(...discarded);
  }
  delete room.pendingDraws[player.id];
  const roomName = ROOM_MAP[pending.roomId]?.name ?? pending.roomId;
  if (kept.length > 0) {
    pushLog(room, `🎒 ${player.name} 在 ${roomName} 帶走 ${kept.map((it) => ITEM_NAMES[it.kind]).join("、")}`);
  } else {
    pushLog(room, `🎒 ${player.name} 在 ${roomName} 一張都沒帶走`);
  }
  if (discarded.length > 0 && !pending.airdrop) {
    pushLog(room, `🗑️ ${player.name} 沒帶走的 ${discarded.map((it) => ITEM_NAMES[it.kind]).join("、")} 進了棄置堆`);
  }
}

/** 伺服器自動保留貪心規則（原本 drawLoot 的行為）：抽到順序保留，遇上限就跳過。 */
export function autoKeep(room: GameRoom, player: Player, pending: PendingDraw): void {
  const budget = remainingCapacity(player);
  const keep: number[] = [];
  let nonForcedCount = 0;
  let nonJunkCount = 0;
  for (const opt of pending.options) {
    if (opt.forced) continue;
    if (pending.rules.maxTotal !== null && nonForcedCount >= pending.rules.maxTotal) continue;
    if (pending.rules.maxNonJunk !== null && !opt.junk && nonJunkCount >= pending.rules.maxNonJunk) continue;
    if (nonForcedCount >= budget) continue;
    keep.push(opt.index);
    nonForcedCount += 1;
    if (!opt.junk) nonJunkCount += 1;
  }
  applyKeep(room, player, pending, keep);
}

/** 玩家手動選留：超量整筆拒絕（pending 保留，可重選）。 */
export function resolveKeep(room: GameRoom, playerId: string, keepIndexes: number[]): string | null {
  ensureRoomShape(room);
  const pending = room.pendingDraws[playerId];
  if (!pending) return "沒有待選留的攤開";
  const player = findPlayer(room, playerId);
  if (!player) return "找不到玩家";
  const err = validateKeepSelection(player, pending, keepIndexes);
  if (err) return err;
  applyKeep(room, player, pending, keepIndexes);
  return null;
}

/** keep 逾時：把所有未解決的待選留自動保留（AI 的早已解掉，這裡只剩人類）。 */
export function autoResolvePendingKeeps(room: GameRoom): void {
  ensureRoomShape(room);
  for (const playerId of Object.keys(room.pendingDraws)) {
    const pending = room.pendingDraws[playerId];
    const player = findPlayer(room, playerId);
    if (!pending || !player) continue;
    pushLog(room, `⏰ ${player.name} 選留逾時，伺服器自動保留`);
    autoKeep(room, player, pending);
  }
  room.pendingDraws = {};
  room.keepDeadline = null;
}

// ---------------------------------------------------------------------------
// 金條攤開挑選（單人版 data.js／ui.js：花 1 張金條挑當前房物資一項）。
// 只在自由階段用；不能挑金條；垃圾場禁用；池裡無可換物時不扣金條。
// ---------------------------------------------------------------------------
export function goldPickOptions(room: GameRoom, player: Player): ItemKind[] {
  ensureRoomShape(room);
  const def = ROOM_MAP[player.room];
  if (!def || def.resourcePool === null || def.goldBarDisabled) return [];
  const pool = room.pools[player.room] ?? [];
  const kinds: ItemKind[] = [];
  for (const it of pool) {
    if (it.kind === "gold_bar") continue;
    if (!kinds.includes(it.kind)) kinds.push(it.kind);
  }
  return kinds;
}

export function spendGoldPick(room: GameRoom, playerId: string, kind: ItemKind): string | null {
  if (room.status !== "playing" || room.phase !== "free") return "只有自由階段可以用金條換物資";
  const player = findPlayer(room, playerId);
  if (!player || !player.alive) return "找不到玩家或玩家已是暗影";
  const def = ROOM_MAP[player.room];
  if (!def || def.resourcePool === null) return "這個房間沒有物資池";
  if (def.goldBarDisabled) return "垃圾場不能用金條換物資";
  const goldIdx = player.items.findIndex((it) => it.kind === "gold_bar");
  if (goldIdx < 0) return "身上沒有金條";
  if (kind === "gold_bar") return "金條攤開挑選不能挑金條";
  if (!(kind in ITEM_NAMES)) return "想換的道具種類無效";
  ensureRoomShape(room);
  const pool = (room.pools[player.room] ??= []);
  const pickIdx = pool.findIndex((it) => it.kind === kind);
  if (pickIdx < 0) return "這個房間的物資池裡沒有這種道具（只剩金條就空手而歸，金條不會被扣）";
  const picked = pool.splice(pickIdx, 1)[0] as Item;
  player.items.splice(goldIdx, 1);
  player.items.push(picked);
  pushLog(room, `🪙 ${player.name} 花 1 張金條，在 ${def.name} 換到 ${ITEM_NAMES[kind]}`);
  return null;
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
// 結算（順序與單人版 resolveRound 一致；步驟按行動順序逐步跑，見 log）
//   步驟 0 移動＋激光＋抽取攤開＋特殊房 →（有待選留時進 keep 階段）
//   → 結算內交易 → 手術室 → 戰鬥／暗影吸血 → 毒氣
//   → 水糧上繳 → 火箭筒 → 道具卡使用 → 暗影復活 → 生命公告
// 結算分兩段跑，因為 keep 階段可能跨多次輪詢：phase0 只做移動與攤開，
// 待選留解完（手動／AI／逾時）後才由呼叫端跑 runSettlementRest。
// ---------------------------------------------------------------------------
/** 結算內交易的裁判：AI 對象回 true／false，人類對象回 null（轉待回覆）。 */
export type SettlementJudge = (
  target: Player,
  offerKind: ItemKind,
  wantKind: ItemKind,
) => boolean | null;

/**
 * 結算內交易（單人版 resolveTrades 的移植）：按行動順序跑，物品轉移
 * 趕在水糧上繳之前。AI 對象由 judge 即判；人類對象不卡結算，轉成
 * 自由階段待回覆交易（下一自由階段用既有 trade/respond 回覆）。
 */
export function resolveSettlementTrades(room: GameRoom, judge: SettlementJudge): void {
  ensureRoomShape(room);
  for (const p of orderedPlayers(room)) {
    if (!p.alive) continue;
    const t = room.actions[p.id]?.trade;
    if (!t) continue;
    const target = findPlayer(room, t.toId);
    if (!target || !target.alive || target.id === p.id) {
      pushLog(room, `🤝 ${p.name} 的結算交易無效（對象已不在場）`);
      continue;
    }
    const offerIdx = p.items.findIndex((it) => it.id === t.offerItemId);
    const want = target.items.find((it) => it.kind === t.wantKind);
    if (offerIdx < 0 || !want) {
      pushLog(room, `🤝 ${p.name} 的結算交易失敗：道具已不在背包中`);
      continue;
    }
    const verdict = judge(target, (p.items[offerIdx] as Item).kind, want.kind);
    if (verdict === null) {
      room.trades.push({
        id: newId("tr"),
        fromId: p.id,
        toId: target.id,
        offerItemId: t.offerItemId,
        wantItemId: want.id,
        fromSettlement: true,
        createdDay: room.day,
      });
      pushLog(room, `🤝 ${p.name} 在結算中向 ${target.name} 提出交易（待自由階段回覆）`);
      continue;
    }
    if (!verdict) {
      pushLog(room, `🤝 ${target.name} 拒絕了 ${p.name} 的結算交易`);
      continue;
    }
    const offer = p.items[offerIdx] as Item;
    p.items[offerIdx] = want;
    const wantIdx = target.items.findIndex((it) => it.id === want.id);
    target.items[wantIdx] = offer;
    pushLog(room, `🤝 結算交易成交：${p.name} 的 ${ITEM_NAMES[offer.kind]} ↔ ${target.name} 的 ${ITEM_NAMES[want.kind]}`);
  }
}

export function runSettlementPhase0(room: GameRoom, judge: SettlementJudge): void {
  ensureRoomShape(room);
  const day = room.day;
  pushLog(room, `── 第 ${day} 天結算開始 ──`);
  // 腎上腺素：結算開始時生效中的，到這次結算結束就失效；
  // 結算步驟 6 才用的，會留到下一次結算（見 runSettlementRest 文末）。
  room.adrenalineAtSettlementStart = room.players.filter((p) => p.adrenalineActive).map((p) => p.id);

  // 步驟 0：移動＋激光＋抽取攤開＋特殊房效果（按行動順序逐步跑）。
  for (const p of orderedPlayers(room)) {
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
    // 抽取攤開（終點是資源房才抽；死亡掉落會回到該房池子，可重複抽）。
    // 道具此時還不進背包，等 keep 階段選留完才給，故後續步驟不受未選道具影響。
    drawPending(room, p, p.room);
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

  // AI 的待選留立刻自動解決（不等人）；人類待選留則進 keep 階段，
  // 結算暫停在這裡，等選完或逾時才跑後續步驟（見 runSettlementRest）。
  for (const p of room.players) {
    if (!p.isAI) continue;
    const pending = room.pendingDraws[p.id];
    if (pending) autoKeep(room, p, pending);
  }
  if (Object.keys(room.pendingDraws).length > 0) {
    room.phase = "keep";
    room.keepDeadline = Date.now() + KEEP_TIMEOUT_MS;
    const waitNames = Object.keys(room.pendingDraws)
      .map((id) => findPlayer(room, id)?.name ?? "?")
      .join("、");
    pushLog(room, `🎴 等待選留：${waitNames}（${KEEP_TIMEOUT_MS / 1000} 秒內未選由伺服器自動保留）`);
    return;
  }
  runSettlementRest(room, judge);
}

/** 結算後半段：結算內交易 → 手術室 → 戰鬥 → 毒氣 → 上繳 → 火箭筒 → 道具 → 復活 → 公告。 */
export function runSettlementRest(room: GameRoom, judge: SettlementJudge): void {
  ensureRoomShape(room);
  const day = room.day;
  const activeAtStart = new Set(room.adrenalineAtSettlementStart ?? []);

  // 步驟 0.5：結算內交易（單人版 resolveRound 的第一步，趕在水糧上繳之前）。
  resolveSettlementTrades(room, judge);

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
    for (const p of orderedPlayers(room)) {
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
  for (const p of orderedPlayers(room)) {
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

  // 步驟 6：道具卡使用（單人版按 state.order 跑，這裡按行動順序）。
  for (const p of orderedPlayers(room)) {
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
  // 結算內交易轉成的待回覆交易（本日建立的）保留到下一自由階段；
  // 更早的未回覆交易與自由階段殘留交易一併清掉，避免永久殘留。
  const settlingDay = room.day;
  room.day += 1;
  room.phase = "free";
  room.actions = {};
  room.trades = room.trades.filter((t) => t.fromSettlement && t.createdDay === settlingDay);
  room.adrenalineAtSettlementStart = [];
  for (const p of room.players) p.ready = false;
  addAirdrop(room);
  pushLog(room, `── 第 ${room.day} 天開始（自由階段）──`);
}

/** 舊版 runSettlement 的相容入口：phase0，無待選留時直接跑完後半段。 */
export function runSettlement(room: GameRoom, judge: SettlementJudge = () => null): void {
  runSettlementPhase0(room, judge);
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
    roomType: room.roomType ?? "casual",
    // 觀戰者名單（只有名字與 id，不含 token；觀戰者不佔玩家名額）。
    spectators: (room.spectators ?? []).map((s) => ({ id: s.id, name: s.name })),
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      isHost: p.isHost,
      // 同房公開檔案：只有對局相關公開資訊（信譽、場次、勝負、成就），
      // 絕不含 accountId 以外的私密欄位，更無雜湊與 token。
      accountProfile: p.accountProfile ?? null,
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
    // 行動順序（公開資訊，單人版順序卡本來就公開）：card 即順序號。
    settlementOrder: room.settlementOrder.map((id, i) => ({
      playerId: id,
      name: findPlayer(room, id)?.name ?? "?",
      card: i + 1,
    })),
    // 待選留：只有自己的完整內容公開；他人只公開「還在選」名單。
    pendingDrawPlayerIds: Object.keys(room.pendingDraws),
    pendingDraw:
      self && room.pendingDraws[self.id]
        ? {
            roomId: room.pendingDraws[self.id]?.roomId,
            options: room.pendingDraws[self.id]?.options,
            rules: room.pendingDraws[self.id]?.rules,
            airdrop: room.pendingDraws[self.id]?.airdrop,
            keepDeadline: room.keepDeadline,
          }
        : null,
    // 金條可換選項：只有自由階段、自己持有金條時，公開自己房間物資池
    // 的非金條種類（否則玩家無從選；池子張數本來就公開，只差種類）。
    goldOptions:
      self && room.status === "playing" && room.phase === "free" && hasItemKind(self, "gold_bar")
        ? goldPickOptions(room, self)
        : [],
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

// AI 玩家決策：bots.js 政策的簡化移植（不做 13 種政策與難度分級）。
// 策略重點（與單人版 bots.js 相同的大方向）：
//   毒氣房優先逃離 → 缺水缺糧找補給房 → 依政策找目標房
//   → 投票毒其他存活者最多的樓層 → 有火箭筒就炸人多的房。
// 尋路用引擎的 neighborsOf（含繩索垂直通道、傳送室、停機坪首步飛行），
// 暗影不受地形限制。

import {
  FLOORS,
  HELIPAD_ROOMS,
  ROOM_MAP,
  ROOMS,
  SPAWN_ROOM_IDS,
  effectiveSpeed,
  finalMight,
  isEmptyRoom,
  neighborsOf,
  type DayAction,
  type FloorId,
  type GameRoom,
  type ItemKind,
  type Player,
} from "./game-engine";

/** 8 人房最多 7 名 AI，名字不重複（aiName 仍用 modulo 以防萬一）。 */
const AI_NAMES = ["阿鐵", "小夜", "老莫", "阿葵", "阿岩", "小梅", "老高", "阿雪"];

/** 政策 → 基因（與單人版 startingGenes 一致）與出生點偏好（POLICY_HOME）。 */
const POLICIES = [
  { id: "gunner", might: 5, carry: 3, speed: 3, home: "B307" },
  { id: "hoarder", might: 3, carry: 5, speed: 3, home: "B402" },
  { id: "medic", might: 3, carry: 4, speed: 4, home: "B303" },
  { id: "ranger", might: 4, carry: 3, speed: 4, home: "B603" },
] as const;

export function aiName(index: number): string {
  return AI_NAMES[index % AI_NAMES.length] as string;
}

/** 依序發政策；總和 10、速度至少 1。 */
export function aiSetup(index: number): { might: number; carry: number; speed: number; policy: string } {
  const p = POLICIES[index % POLICIES.length] as (typeof POLICIES)[number];
  return { might: p.might, carry: p.carry, speed: p.speed, policy: p.id };
}

/** 政策偏好出生點有人時，選人最少的出生點。出生點只有 6 個、
    玩家上限 8 人時一定會共用：人最少者勝出（同票取第一個），
    絕不回傳空白；同出生點者開局落地戰鬥由引擎處理。 */
export function aiSpawn(room: GameRoom, policy?: string): string {
  const home = POLICIES.find((p) => p.id === policy)?.home;
  if (home && !room.players.some((p) => p.room === home)) return home;
  let best = SPAWN_ROOM_IDS[0] as string;
  let bestCount = Infinity;
  for (const id of SPAWN_ROOM_IDS) {
    const count = room.players.filter((p) => p.room === id).length;
    if (count < bestCount) {
      bestCount = count;
      best = id;
    }
  }
  return best;
}

function hasKind(player: Player, kind: ItemKind): boolean {
  return player.items.some((it) => it.kind === kind);
}

function poolCount(room: GameRoom, roomId: string): number {
  return room.pools[roomId]?.length ?? 0;
}

/** 房間是否正在中毒（全部樓層都已中毒，且非解毒房、非戶外）。 */
function isGassed(room: GameRoom, roomId: string): boolean {
  const def = ROOM_MAP[roomId];
  if (!def) return false;
  if (room.detoxedRooms.includes(roomId)) return false;
  if (def.gasImmune) return false;
  return def.floors.every((f) => room.gassedFloors.includes(f));
}

/** BFS 最短路（暗影用全圖直連版另處理）；回傳不含起點的路徑。 */
export function bfsPath(room: GameRoom, player: Player, from: string, to: string): string[] {
  if (from === to) return [];
  const prev = new Map<string, string>();
  const queue = [from];
  const seen = new Set<string>([from]);
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    const nbs = neighborsOf(player, cur, { helipadFirstStep: cur === from });
    for (const next of nbs) {
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, cur);
      if (next === to) {
        const path: string[] = [];
        let node = to;
        while (node !== from) {
          path.unshift(node);
          node = prev.get(node) as string;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [];
}

/** 目標評分：逃毒 > 水糧 > 政策目標 > 有剩餘物資的房。 */
function aiTargetRoom(room: GameRoom, player: Player): string {
  const needWater = !hasKind(player, "water") && !hasKind(player, "survival_kit");
  const needFood = !hasKind(player, "food") && !hasKind(player, "survival_kit");
  const needWeapon = !player.items.some((it) => ["knife", "pistol", "shotgun", "bayonet"].includes(it.kind));
  const hasGun = player.items.some((it) => ["pistol", "shotgun"].includes(it.kind));
  const upkeepRound = room.day >= 2;
  const fleeing = isGassed(room, player.room);

  const score = (id: string): number => {
    if (id === player.room) return -1000;
    const def = ROOM_MAP[id];
    if (!def) return -1000;
    if (fleeing && isGassed(room, id)) return -500;
    if (fleeing && !isGassed(room, id)) return 400;
    if (upkeepRound && needWater && id === "101" && poolCount(room, id) > 0) return 300;
    if (upkeepRound && needFood && id === "B505" && poolCount(room, id) > 0) return 300;
    if (needWater && id === "101" && poolCount(room, id) > 0) return 200;
    if (needFood && id === "B505" && poolCount(room, id) > 0) return 200;
    if (player.hp <= 3 && id === "B301" && poolCount(room, id) > 0) return 190;
    if (player.policy === "gunner" && needWeapon && id === "B107" && poolCount(room, id) > 0) return 180;
    if (player.policy === "hoarder" && id === "B501" && poolCount(room, id) > 0) return 170;
    if (player.policy === "medic" && id === "B301" && poolCount(room, id) > 0) return 160;
    if (player.policy === "ranger" && id === "B505" && poolCount(room, id) > 0) return 150;
    if (hasGun) {
      // 有槍的槍手：往人多的房間走（戰鬥佔優）。
      const crowd = room.players.filter((p) => p.alive && p.id !== player.id && p.room === id).length;
      if (crowd > 0) return 120 + crowd * 10;
    }
    if (def.resourcePool !== null && poolCount(room, id) > 0) return 80;
    return 10;
  };

  let best: string | null = null;
  let bestScore = -Infinity;
  let bestDist = Infinity;
  for (const r of ROOMS) {
    const s = score(r.id);
    const full = bfsPath(room, player, player.room, r.id);
    if (full.length === 0) continue;
    const d = full.length;
    if (s > bestScore || (s === bestScore && d < bestDist)) {
      best = r.id;
      bestScore = s;
      bestDist = d;
    }
  }
  if (best) return best;
  // 走不到任何目標房：往相鄰房走一步（至少要走 1 步）。
  const nbs = neighborsOf(player, player.room, { helipadFirstStep: true });
  return nbs[0] ?? player.room;
}

export function aiAction(room: GameRoom, player: Player): DayAction {
  // 暗影：已同房則停留吸血，否則一步直達存活者房間（暗影不受地形限制）。
  if (!player.alive) {
    const targets = room.players.filter((p) => p.alive);
    if (targets.length === 0) return { playerId: player.id, path: [], voteFloor: null };
    if (targets.some((p) => p.room === player.room)) {
      return { playerId: player.id, path: [], voteFloor: null };
    }
    const target = targets[0] as Player;
    return { playerId: player.id, path: [target.room], voteFloor: null };
  }

  const speed = effectiveSpeed(player);
  const target = aiTargetRoom(room, player);
  let path = bfsPath(room, player, player.room, target).slice(0, speed);
  if (path.length === 0) {
    const nbs = neighborsOf(player, player.room, { helipadFirstStep: true });
    if (nbs.length > 0) path = [nbs[0] as string];
  }
  const action: DayAction = { playerId: player.id, path, voteFloor: aiVote(room, player, path) };
  // 經過傳送室：傳到任一空房（偏好離目標近的）。
  if (path.includes("B403")) {
    const dest = ROOMS.filter((r) => isEmptyRoom(r.id) && !path.includes(r.id) && r.id !== player.room)
      .map((r) => ({ id: r.id, d: bfsPath(room, player, r.id, target).length }))
      .sort((a, b) => a.d - b.d)[0];
    if (dest) action.teleportTo = dest.id;
  }
  // 終點在控制室：有已中毒且未解毒的房就解毒，否則用 10 票。
  const finalRoom = action.teleportTo ?? (path.length > 0 ? (path[path.length - 1] as string) : player.room);
  if (finalRoom === "B101") {
    const gassedRoom = ROOMS.find(
      (r) => !room.detoxedRooms.includes(r.id) && r.floors.every((f) => room.gassedFloors.includes(f)),
    );
    if (gassedRoom) {
      action.controlChoice = { mode: "detox", target: gassedRoom.id };
    } else {
      action.controlChoice = { mode: "vote" };
    }
  }
  // 有火箭筒：炸其他存活者最多的房（只炸有人房）。
  if (hasKind(player, "rocket_launcher")) {
    const counts = new Map<string, number>();
    for (const p of room.players) {
      if (!p.alive || p.id === player.id) continue;
      counts.set(p.room, (counts.get(p.room) ?? 0) + 1);
    }
    let bestRoom: string | null = null;
    let bestCount = 0;
    for (const [roomId, n] of counts) {
      if (n > bestCount) {
        bestCount = n;
        bestRoom = roomId;
      }
    }
    if (bestRoom) action.rocketTarget = bestRoom;
  }
  return action;
}

/** 投票：毒其他存活者最多的樓層；同票時避開自己終點樓層。 */
export function aiVote(room: GameRoom, player: Player, path: string[]): FloorId {
  const finalRoom = path.length > 0 ? (path[path.length - 1] as string) : player.room;
  const myFloors = ROOM_MAP[finalRoom]?.floors ?? [];
  const counts = new Map<FloorId, number>();
  for (const p of room.players) {
    if (!p.alive || p.id === player.id) continue;
    for (const f of ROOM_MAP[p.room]?.floors ?? []) {
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
  }
  let best: FloorId = "2F";
  let bestScore = -Infinity;
  for (const f of FLOORS) {
    const score = (counts.get(f) ?? 0) - (myFloors.includes(f) ? 0.5 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

const ITEM_VALUE: Record<ItemKind, number> = {
  water: 2,
  food: 2,
  survival_kit: 4,
  pill: 3,
  adrenaline: 3,
  wine: 2,
  fine_wine: 3,
  gold_bar: 2,
  knife: 3,
  pistol: 4,
  shotgun: 5,
  bayonet: 5,
  rope: 2,
  gas_mask: 4,
  rocket_launcher: 5,
  dimension_pocket: 5,
  recycler: 3,
  junk: 0,
};

/**
 * AI 是否接受交易：拿到的價值 ≥ 給出的價值就接受。
 * 注意：舊版參數順序與 handler 呼叫（want＝AI 給出、offer＝AI 收到）
 * 對不上，實質是「給出越貴越接受」；此處依 handler 呼叫順序修正語意。
 */
export function aiAcceptTrade(giveKind: ItemKind, receiveKind: ItemKind): boolean {
  return (ITEM_VALUE[receiveKind] ?? 0) >= (ITEM_VALUE[giveKind] ?? 0);
}

/**
 * AI 金條換物資（單人版 bots.js useGoldBar 的簡化版：原版按政策
 * KEEP_PRIORITY 排序，這裡按 ITEM_VALUE 價值排序）：自由階段持有
 * 金條、當前房物資池有非金條物時，挑價值最高的一種；垃圾場等
 * 無可換物時回 null（金條不扣）。
 */
export function aiGoldChoice(room: GameRoom, player: Player): ItemKind | null {
  const def = ROOM_MAP[player.room];
  if (!def || def.resourcePool === null || def.goldBarDisabled) return null;
  if (!player.items.some((it) => it.kind === "gold_bar")) return null;
  const pool = room.pools[player.room] ?? [];
  let best: ItemKind | null = null;
  let bestValue = -Infinity;
  for (const it of pool) {
    if (it.kind === "gold_bar") continue;
    const v = ITEM_VALUE[it.kind] ?? 0;
    if (v > bestValue) {
      bestValue = v;
      best = it.kind;
    }
  }
  return best;
}

export function aiMightHint(player: Player): number {
  return finalMight(player);
}

export { HELIPAD_ROOMS };

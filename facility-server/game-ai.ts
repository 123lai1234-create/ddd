// AI 玩家決策：只讀公開狀態＋自己的背包，做簡單但合理的選擇。
// 策略重點：缺水糧時優先往水塔／糧倉，缺武器時往武器庫，
// 投票毒人多的樓層，背包滿了就不撿（引擎端也會擋）。

import {
  ADJACENCY,
  FLOORS,
  ROOMS,
  ROOM_MAP,
  SPAWN_ROOM_IDS,
  effectiveSpeed,
  finalMight,
  type DayAction,
  type FloorId,
  type GameRoom,
  type ItemKind,
  type Player,
} from "./game-engine";

const AI_NAMES = ["阿鐵", "小夜", "老莫", "阿葵"];

export function aiName(index: number): string {
  return AI_NAMES[index % AI_NAMES.length] as string;
}

/** 依性格配點，總和 10、速度至少 1。 */
export function aiSetup(index: number): { might: number; carry: number; speed: number } {
  const presets = [
    { might: 4, carry: 3, speed: 3 },
    { might: 6, carry: 2, speed: 2 },
    { might: 2, carry: 6, speed: 2 },
    { might: 3, carry: 2, speed: 5 },
  ];
  return presets[index % presets.length] as { might: number; carry: number; speed: number };
}

/** 選人最少的出生點。 */
export function aiSpawn(room: GameRoom): string {
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

/** BFS 最短路（不重複房間天然成立）。 */
export function bfsPath(from: string, to: string): string[] {
  if (from === to) return [];
  const prev = new Map<string, string>();
  const queue = [from];
  const seen = new Set<string>([from]);
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    for (const next of ADJACENCY[cur] ?? []) {
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

function roomKind(roomId: string): string {
  return ROOM_MAP[roomId]?.kind ?? "empty";
}

function hasKind(player: Player, kind: ItemKind): boolean {
  return player.items.some((it) => it.kind === kind);
}

/** 挑一個想去的房間：依需求排序（水／糧／武器／其他有物資的房）。 */
function aiTargetRoom(room: GameRoom, player: Player): string {
  const candidates = ROOMS.filter((r) => !room.lootedRooms.includes(r.id));
  const needWater = !hasKind(player, "water") && !hasKind(player, "supply");
  const needFood = !hasKind(player, "food") && !hasKind(player, "supply");
  const needWeapon = !player.items.some((it) => ["knife", "pistol", "rifle"].includes(it.kind));
  const score = (id: string): number => {
    const kind = roomKind(id);
    if (kind === "water" && needWater) return 100;
    if (kind === "food" && needFood) return 100;
    if (kind === "weapons" && needWeapon) return 90;
    if (kind === "water" || kind === "food") return 60;
    if (kind === "weapons") return 50;
    if (kind === "empty" || kind === "stairs") return 30;
    return 0;
  };
  let best: string | null = null;
  let bestScore = -1;
  let bestDist = Infinity;
  for (const r of candidates) {
    const s = score(r.id);
    const d = bfsPath(player.room, r.id).length;
    if (s > bestScore || (s === bestScore && d < bestDist)) {
      best = r.id;
      bestScore = s;
      bestDist = d;
    }
  }
  return best ?? player.room;
}

export function aiAction(room: GameRoom, player: Player): DayAction {
  // 暗影：往最近的存活者房間移動；已同房則停留吸血。
  if (!player.alive) {
    const targets = room.players.filter((p) => p.alive);
    if (targets.length === 0) return { playerId: player.id, path: [], voteFloor: null };
    const coLocated = targets.some((p) => p.room === player.room);
    if (coLocated) return { playerId: player.id, path: [], voteFloor: null };
    const target = targets[0] as Player;
    return { playerId: player.id, path: [target.room], voteFloor: null };
  }

  const speed = effectiveSpeed(player);
  const target = aiTargetRoom(room, player);
  let path = bfsPath(player.room, target).slice(0, speed);
  if (path.length === 0) {
    // 已經在目標房：必須至少走 1 步，往相鄰房走一步
    const neighbors = ADJACENCY[player.room] ?? [];
    if (neighbors.length > 0) path = [neighbors[0] as string];
  }
  const action: DayAction = { playerId: player.id, path, voteFloor: aiVote(room, player) };
  // 經過傳送室：傳到還沒被搜刮的空房
  if (path.some((id) => roomKind(id) === "teleport")) {
    const dest = ROOMS.find((r) => r.kind === "empty" && !room.lootedRooms.includes(r.id));
    if (dest) action.teleportTo = dest.id;
  }
  // 終點在控制室：解毒自己所在的控制室（若該樓層中毒可保命）
  const finalRoom = action.teleportTo ?? (path.length > 0 ? (path[path.length - 1] as string) : player.room);
  if (finalRoom === "B101") action.detoxRoom = "B101";
  return action;
}

/** 投票：毒其他存活者最多的樓層；沒資訊則投自己不在的樓層。 */
export function aiVote(room: GameRoom, player: Player): FloorId {
  const counts: Record<FloorId, number> = { "2F": 0, "1F": 0, B1: 0 };
  for (const p of room.players) {
    if (!p.alive || p.id === player.id) continue;
    const floor = ROOM_MAP[p.room]?.floor;
    if (floor) counts[floor] += 1;
  }
  const myFloor = ROOM_MAP[player.room]?.floor;
  let best: FloorId = myFloor === "2F" ? "1F" : "2F";
  let bestCount = -1;
  for (const f of FLOORS) {
    if (f === myFloor) continue;
    if (counts[f] > bestCount) {
      bestCount = counts[f];
      best = f;
    }
  }
  return best;
}

const ITEM_VALUE: Record<ItemKind, number> = {
  water: 1,
  food: 1,
  supply: 3,
  gold: 2,
  knife: 3,
  pistol: 4,
  rifle: 5,
  medicine: 3,
  wine: 1,
  adrenaline: 2,
};

/** AI 是否接受交易：拿到的東西價值高於給出的就接受。 */
export function aiAcceptTrade(receiveKind: ItemKind, giveKind: ItemKind): boolean {
  return (ITEM_VALUE[receiveKind] ?? 0) > (ITEM_VALUE[giveKind] ?? 0);
}

export function aiMightHint(player: Player): number {
  return finalMight(player);
}

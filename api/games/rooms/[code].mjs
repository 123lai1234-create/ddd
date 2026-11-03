// facility-server/game-engine.ts
var R = (o) => ({
  name: "(\u7A7A\u623F)",
  special: null,
  resourcePool: null,
  drawLimit: 0,
  spawn: false,
  helipad: false,
  gasImmune: false,
  laser: false,
  maxNonJunkPickup: null,
  ...o
});
var ROOMS = [
  /* 2F */
  R({ id: "201", floors: ["2F"], name: "\u57FA\u56E0\u5EAB", special: "gene_bank", helipad: true }),
  R({ id: "202", floors: ["2F"], name: "\u505C\u6A5F\u576A", special: "helipad", gasImmune: true, resourcePool: [], drawLimit: "all" }),
  /* 1F */
  R({ id: "101", floors: ["1F"], name: "\u6C34\u5854", helipad: true, resourcePool: [{ kind: "water", qty: 10 }], drawLimit: 4 }),
  R({ id: "102", floors: ["1F"], name: "\u6FC0\u5149\u5BA4", laser: true }),
  R({ id: "103", floors: ["1F"], spawn: true }),
  R({ id: "104", floors: ["1F"] }),
  /* B1 */
  R({ id: "B101", floors: ["B1"], name: "\u63A7\u5236\u5BA4", special: "control_room", helipad: true }),
  R({ id: "B102", floors: ["B1"] }),
  R({ id: "B103", floors: ["B1"], spawn: true, helipad: true }),
  R({ id: "B104", floors: ["B1"] }),
  R({ id: "B105", floors: ["B1"], name: "\u56DE\u6536\u7AD9", helipad: true }),
  R({ id: "B106", floors: ["B1"] }),
  R({ id: "B107", floors: ["B1"], name: "\u6B66\u5668\u5EAB", resourcePool: [{ kind: "knife", qty: 5 }, { kind: "pistol", qty: 2 }, { kind: "shotgun", qty: 1 }], drawLimit: 2 }),
  /* B2 */
  R({ id: "B201", floors: ["B2"] }),
  R({ id: "B202", floors: ["B2"], name: "\u624B\u8853\u5BA4", special: "operating_room" }),
  R({ id: "B203", floors: ["B2"] }),
  R({ id: "B204", floors: ["B2"], name: "\u9910\u5EF3", special: "dining_hall" }),
  R({ id: "B205", floors: ["B2"] }),
  R({ id: "B206", floors: ["B2"], name: "\u91D1\u5EAB", resourcePool: [{ kind: "gold_bar", qty: 4 }], drawLimit: 2 }),
  /* B3 */
  R({ id: "B301", floors: ["B3"], name: "\u85E5\u623F", resourcePool: [{ kind: "pill", qty: 3 }, { kind: "adrenaline", qty: 3 }], drawLimit: 2 }),
  R({ id: "B302", floors: ["B3"] }),
  R({ id: "B303", floors: ["B3"], spawn: true }),
  R({ id: "B304", floors: ["B3"], name: "\u64CD\u4F5C\u5BA4", special: "console_room" }),
  R({ id: "B305", floors: ["B3"] }),
  R({ id: "B306", floors: ["B3"] }),
  R({ id: "B307", floors: ["B3"], spawn: true }),
  R({ id: "B308", floors: ["B3"] }),
  /* B4 */
  R({ id: "B401", floors: ["B4"] }),
  R({ id: "B402", floors: ["B4"], spawn: true }),
  R({ id: "B403", floors: ["B4"], name: "\u50B3\u9001\u5BA4", special: "teleport_room" }),
  R({ id: "B404", floors: ["B4"] }),
  R({ id: "B405", floors: ["B4"] }),
  /* B5 */
  R({ id: "B501", floors: ["B4", "B5"], name: "\u5927\u5009\u5EAB", resourcePool: [{ kind: "water", qty: 5 }, { kind: "food", qty: 5 }, { kind: "knife", qty: 3 }, { kind: "wine", qty: 2 }, { kind: "gold_bar", qty: 1 }, { kind: "pill", qty: 2 }, { kind: "adrenaline", qty: 2 }, { kind: "pistol", qty: 1 }, { kind: "shotgun", qty: 1 }], drawLimit: 3 }),
  R({ id: "B502", floors: ["B5"] }),
  R({ id: "B503", floors: ["B5"], name: "\u5783\u573E\u5834", resourcePool: [{ kind: "junk", qty: 20 }, { kind: "gas_mask", qty: 1 }, { kind: "recycler", qty: 1 }, { kind: "rocket_launcher", qty: 1 }, { kind: "dimension_pocket", qty: 1 }, { kind: "rope", qty: 1 }], drawLimit: 5, maxNonJunkPickup: 2 }),
  R({ id: "B504", floors: ["B5"] }),
  R({ id: "B505", floors: ["B5"], name: "\u7CE7\u5009", resourcePool: [{ kind: "food", qty: 10 }], drawLimit: 4 }),
  /* B6 */
  R({ id: "B601", floors: ["B6"], name: "\u9152\u7A96", resourcePool: [{ kind: "wine", qty: 6 }], drawLimit: 2 }),
  R({ id: "B602", floors: ["B6"] }),
  R({ id: "B603", floors: ["B6"], spawn: true }),
  R({ id: "B604", floors: ["B6"] }),
  /* B7 */
  R({ id: "B701", floors: ["B7"], name: "\u505C\u5C4D\u9593", special: "morgue", resourcePool: [], drawLimit: 3 })
];
var ROOM_MAP = Object.fromEntries(
  ROOMS.map((r) => [r.id, r])
);
var SPAWN_ROOM_IDS = ROOMS.filter((r) => r.spawn).map((r) => r.id);
var FLOORS = ["2F", "1F", "B1", "B2", "B3", "B4", "B5", "B6", "B7"];
var TOTAL_DAYS = 6;
var MAX_HP = 10;
var MAX_PLAYERS = 4;
var GAS_DAMAGE_BY_ROUND = [1, 2, 2, 3, 3, 4];
var HELIPAD_ROOMS = ROOMS.filter((r) => r.helipad).map((r) => r.id);
function isEmptyRoom(roomId) {
  const def = ROOM_MAP[roomId];
  return !!def && def.special === null && def.resourcePool === null && !def.laser;
}
function chain(ids, type, out) {
  for (let i = 0; i < ids.length - 1; i++) {
    const a = ids[i];
    const b = ids[i + 1];
    (out[a] ??= []).push(b);
    (out[b] ??= []).push(a);
  }
}
function buildEdges() {
  const walk = {};
  const climb = {};
  const w = (ids) => chain(ids, "walk", walk);
  const c = (ids) => chain(ids, "climb", climb);
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
var EDGES = buildEdges();
var ADJACENCY = (() => {
  const adj = {};
  for (const r of ROOMS) adj[r.id] = [...EDGES.walk[r.id] ?? []];
  (adj["B105"] ??= []).push("B503");
  return adj;
})();
function neighborsOf(player, from, opts = {}) {
  const out = new Set(EDGES.walk[from] ?? []);
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
var ITEM_NAMES = {
  water: "\u6C34",
  food: "\u7CE7\u98DF",
  survival_kit: "\u751F\u5B58\u88DC\u7D66",
  pill: "\u85E5\u7247",
  adrenaline: "\u814E\u4E0A\u817A\u7D20",
  wine: "\u9152",
  fine_wine: "\u9673\u5E74\u7F8E\u9152",
  gold_bar: "\u91D1\u689D",
  knife: "\u5200",
  pistol: "\u624B\u69CD",
  shotgun: "\u9730\u5F48\u69CD",
  bayonet: "\u8ECD\u7528\u523A\u5200",
  rope: "\u7E69\u7D22",
  gas_mask: "\u9632\u6BD2\u9762\u5177",
  rocket_launcher: "\u706B\u7BAD\u7B52",
  dimension_pocket: "\u6B21\u5143\u53E3\u888B",
  recycler: "\u5FAA\u74B0\u56DE\u6536\u88DD\u7F6E",
  junk: "\u5783\u573E"
};
var WEAPON_BONUS = {
  knife: 2,
  pistol: 2,
  shotgun: 4,
  bayonet: 4
};
function isGun(kind) {
  return kind === "pistol" || kind === "shotgun";
}
var USABLE_IN_RESOLUTION = ["pill", "adrenaline", "wine", "fine_wine"];
function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
function makeItem(kind) {
  return { id: newId("it"), kind };
}
function effectiveSpeed(player) {
  return player.adrenalineActive ? 10 : player.speed;
}
function hasItemKind(player, kind) {
  return player.items.some((it) => it.kind === kind);
}
function countKind(player, kind) {
  return player.items.filter((it) => it.kind === kind).length;
}
function attackPower(player) {
  let bonus = 0;
  let hasFirearm = false;
  for (const it of player.items) {
    bonus += WEAPON_BONUS[it.kind] ?? 0;
    if (isGun(it.kind)) hasFirearm = true;
  }
  return { total: player.might + bonus, hasFirearm };
}
function remainingCapacity(player) {
  const remaining = player.carry - player.items.length;
  if (remaining >= 1 && hasItemKind(player, "dimension_pocket")) return Infinity;
  return Math.max(0, remaining);
}
function pushLog(room, text) {
  room.log.push({ day: room.day, text });
}
function ensureRoomShape(room) {
  room.pools ??= {};
  room.airdrop ??= [];
  room.usedPile ??= [];
  room.discardPile ??= [];
  room.gassedFloors ??= [];
  room.detoxedRooms ??= [];
  room.lastGasTally ??= null;
  for (const p of room.players) {
    p.helicopter ??= false;
    p.adrenalineActive ??= false;
    p.lastAliveHp ??= 0;
  }
}
function initGameState(room) {
  ensureRoomShape(room);
  room.pools = {};
  for (const def of ROOMS) {
    if (def.resourcePool === null) continue;
    const pool = [];
    for (const entry of def.resourcePool) {
      for (let i = 0; i < entry.qty; i++) pool.push(makeItem(entry.kind));
    }
    room.pools[def.id] = pool;
  }
  room.airdrop = [];
  addAirdrop(room);
}
function addAirdrop(room) {
  ensureRoomShape(room);
  const pool = Object.keys(ITEM_NAMES).filter(
    (k) => k !== "junk" && k !== "gold_bar"
  );
  const kind = pool[Math.floor(Math.random() * pool.length)];
  room.airdrop.push(makeItem(kind));
}
function createRoom(code, hostName) {
  const room = {
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
    createdAt: Date.now()
  };
  addPlayer(room, hostName, false);
  const host = room.players[0];
  host.isHost = true;
  return room;
}
function addPlayer(room, name, isAI) {
  const player = {
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
    adrenalineActive: false
  };
  room.players.push(player);
  return player;
}
function findPlayer(room, playerId) {
  return room.players.find((p) => p.id === playerId);
}
function validateSetup(might, carry, speed, spawn) {
  if (![might, carry, speed].every((n) => Number.isInteger(n) && n >= 0)) {
    return "\u914D\u9EDE\u5FC5\u9808\u662F\u6574\u6578";
  }
  if (might + carry + speed !== 10) return "\u6B66\u529B\uFF0B\u8CA0\u91CD\uFF0B\u901F\u5EA6\u7E3D\u548C\u5FC5\u9808\u662F 10";
  if (speed < 1) return "\u901F\u5EA6\u81F3\u5C11\u8981 1";
  if (!SPAWN_ROOM_IDS.includes(spawn)) return "\u51FA\u751F\u9EDE\u7121\u6548";
  return null;
}
function setSetup(room, playerId, might, carry, speed, spawn) {
  if (room.status !== "lobby") return "\u904A\u6232\u5DF2\u7D93\u958B\u59CB\uFF0C\u7121\u6CD5\u914D\u9EDE";
  const p = findPlayer(room, playerId);
  if (!p) return "\u627E\u4E0D\u5230\u73A9\u5BB6";
  const e = validateSetup(might, carry, speed, spawn);
  if (e) return e;
  p.might = might;
  p.carry = carry;
  p.speed = speed;
  p.room = spawn;
  p.hasSetup = true;
  return null;
}
function effectivePath(player, action) {
  const path = [...action.path];
  if (action.teleportTo && path.includes("B403") && isEmptyRoom(action.teleportTo) && !path.includes(action.teleportTo) && action.teleportTo !== player.room) {
    path.push(action.teleportTo);
  }
  return path;
}
function finalRoomOf(player, action) {
  const path = effectivePath(player, action);
  return path.length > 0 ? path[path.length - 1] : player.room;
}
function validatePath(player, path) {
  const maxSteps = effectiveSpeed(player);
  if (player.alive) {
    if (path.length < 1) return "\u5B58\u6D3B\u8005\u6BCF\u56DE\u5408\u81F3\u5C11\u8981\u8D70 1 \u6B65";
    if (path.length > maxSteps) return `\u6B65\u6578\u8D85\u904E\u901F\u5EA6\u4E0A\u9650\uFF08${maxSteps}\uFF09`;
  } else if (path.length > maxSteps) {
    return `\u6B65\u6578\u8D85\u904E\u901F\u5EA6\u4E0A\u9650\uFF08${maxSteps}\uFF09`;
  }
  const visited = /* @__PURE__ */ new Set([player.room]);
  let cur = player.room;
  for (let i = 0; i < path.length; i++) {
    const next = path[i];
    if (!ROOM_MAP[next]) return `\u6C92\u6709\u9019\u500B\u623F\u9593\uFF1A${next}`;
    if (visited.has(next)) return "\u8DEF\u5F91\u4E0D\u53EF\u91CD\u8907\u9032\u623F\u6216\u5F80\u56DE\u8D70";
    visited.add(next);
    if (!player.alive) {
      cur = next;
      continue;
    }
    const opts = { helipadFirstStep: i === 0 };
    if (!neighborsOf(player, cur, opts).includes(next)) {
      return `\u7121\u6CD5\u5F9E ${cur} \u76F4\u63A5\u8D70\u5230 ${next}`;
    }
    cur = next;
  }
  return null;
}
function validateAction(room, player, action) {
  if (room.status !== "playing" || room.phase !== "action") return "\u73FE\u5728\u4E0D\u662F\u884C\u52D5\u968E\u6BB5";
  const path = effectivePath(player, action);
  const pathErr = validatePath(player, path);
  if (pathErr) return pathErr;
  if (player.alive) {
    if (!action.voteFloor || !FLOORS.includes(action.voteFloor)) return "\u8ACB\u6295\u4E00\u7968\u6BD2\u6A13\u5C64";
    const finalRoom = finalRoomOf(player, action);
    if (action.controlChoice) {
      if (finalRoom !== "B101") return "\u63A7\u5236\u5BA4\u9078\u9805\u53EA\u6709\u7D42\u9EDE\u5728\u63A7\u5236\u5BA4\u6642\u53EF\u7528";
      if (action.controlChoice.mode === "detox") {
        if (!action.controlChoice.target || !ROOM_MAP[action.controlChoice.target]) {
          return "\u89E3\u6BD2\u76EE\u6A19\u623F\u9593\u7121\u6548";
        }
      }
    }
    if (action.geneRealloc) {
      const g = action.geneRealloc;
      const total = player.might + player.carry + player.speed;
      if (g.might + g.carry + g.speed !== total || g.speed < 1 || g.might < 0 || g.carry < 0) {
        return "\u91CD\u914D\u57FA\u56E0\u7E3D\u548C\u5FC5\u9808\u7B49\u65BC\u76EE\u524D\u7E3D\u548C\uFF0C\u4E14\u901F\u5EA6\u81F3\u5C11 1";
      }
    }
    if (action.rocketTarget && !ROOM_MAP[action.rocketTarget]) return "\u706B\u7BAD\u7B52\u76EE\u6A19\u623F\u9593\u7121\u6548";
    if (action.itemUses) {
      for (const id of action.itemUses) {
        const item = player.items.find((it) => it.id === id);
        if (!item) return "\u7D50\u7B97\u4F7F\u7528\u7684\u9053\u5177\u4E0D\u5728\u80CC\u5305\u4E2D";
        if (!USABLE_IN_RESOLUTION.includes(item.kind)) {
          return `\u7D50\u7B97\u6642\u4E0D\u80FD\u4F7F\u7528${ITEM_NAMES[item.kind]}`;
        }
      }
    }
  }
  return null;
}
function damage(room, player, amount, cause) {
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
function killToShadow(room, player, lastHp, cause) {
  if (!player.alive) return;
  player.alive = false;
  player.lastAliveHp = lastHp;
  player.hp = 0;
  player.shadowHp = 0;
  ensureRoomShape(room);
  const pool = room.pools[player.room] ??= [];
  if (player.items.length > 0) {
    pool.push(...player.items);
    player.items = [];
  }
  pushLog(room, `\u{1F47B} ${player.name} ${cause}\uFF0C\u751F\u547D\u6B78\u96F6\u5316\u70BA\u6697\u5F71\uFF0C\u9053\u5177\u7559\u5728 ${ROOM_MAP[player.room]?.name ?? player.room}`);
}
function resolveCombatAndShadows(room, skipRooms = []) {
  ensureRoomShape(room);
  const byRoom = /* @__PURE__ */ new Map();
  for (const p of room.players) {
    if (!byRoom.has(p.room)) byRoom.set(p.room, []);
    byRoom.get(p.room)?.push(p);
  }
  for (const [roomId, occupants] of byRoom) {
    const alive = occupants.filter((p) => p.alive);
    const shadows = occupants.filter((p) => !p.alive);
    for (const sh of shadows) {
      const drain = Math.max(1, attackPower(sh).total);
      let gained = 0;
      for (const target of alive) {
        if (!target.alive) continue;
        const before = target.hp;
        damage(room, target, drain, "\u88AB\u6697\u5F71\u5438\u8840");
        const dealt = before - target.hp;
        gained += dealt;
      }
      if (gained > 0) {
        sh.shadowHp = Math.min(MAX_HP, sh.shadowHp + gained);
        pushLog(room, `\u{1F47B} \u6697\u5F71 ${sh.name} \u5728 ${ROOM_MAP[roomId]?.name ?? roomId} \u5438\u53D6 ${gained} \u9EDE\u751F\u547D\uFF08\u7D2F\u7A4D ${sh.shadowHp}\uFF09`);
      }
    }
    const fighters = occupants.filter((p) => p.alive);
    if (fighters.length < 2 || skipRooms.includes(roomId)) continue;
    const powers = fighters.map((p) => attackPower(p));
    const anyGun = powers.some((pw) => pw.hasFirearm);
    const eff = fighters.map((p, i) => ({
      p,
      eff: anyGun && !powers[i].hasFirearm ? 0 : powers[i].total
    }));
    const max = Math.max(...eff.map((e) => e.eff));
    const roomName = ROOM_MAP[roomId]?.name ?? roomId;
    for (const e of eff) {
      const dmg = Math.max(0, max - e.eff);
      if (dmg > 0) {
        pushLog(room, `\u2694\uFE0F ${roomName} \u6230\u9B25\uFF1A${e.p.name} \u627F\u53D7 ${dmg} \u9EDE\u50B7\u5BB3`);
        damage(room, e.p, dmg, "\u5728\u6230\u9B25\u4E2D\u843D\u6557");
      }
    }
    if (eff.every((e) => e.eff === max)) {
      pushLog(room, `\u2694\uFE0F ${roomName} \u6230\u9B25\uFF1A\u653B\u64CA\u529B\u76F8\u540C\uFF0C\u7121\u4EBA\u53D7\u50B7`);
    }
  }
}
function drawLoot(room, player, roomId) {
  const def = ROOM_MAP[roomId];
  if (!def || def.resourcePool === null) return;
  ensureRoomShape(room);
  const roomName = def.name !== "(\u7A7A\u623F)" ? `${roomId} ${def.name}` : roomId;
  if (roomId === "202") {
    if (room.airdrop.length === 0) return;
    const space = remainingCapacity(player);
    const kept2 = space >= 1 ? room.airdrop[0] : void 0;
    if (kept2) {
      room.airdrop.shift();
      player.items.push(kept2);
      pushLog(room, `\u{1F392} ${player.name} \u5728\u505C\u6A5F\u576A\u7A7A\u6295\u5E36\u8D70 ${ITEM_NAMES[kept2.kind]}\uFF08\u9084\u5269 ${room.airdrop.length} \u5F35\u7A7A\u6295\uFF09`);
    } else {
      pushLog(room, `\u{1F392} ${player.name} \u5728\u505C\u6A5F\u576A\u80CC\u5305\u5DF2\u6EFF\uFF0C\u7A7A\u6295\u4E00\u5F35\u90FD\u5E36\u4E0D\u8D70`);
    }
    return;
  }
  const pool = room.pools[roomId] ??= [];
  if (pool.length === 0) return;
  const limit = def.drawLimit === "all" ? pool.length : Math.min(def.drawLimit, pool.length);
  const drawn = [];
  for (let i = 0; i < limit; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    drawn.push(pool.splice(idx, 1)[0]);
  }
  const forced = roomId === "B503" ? drawn.filter((it) => it.kind === "junk") : [];
  const rest = drawn.filter((it) => !forced.includes(it));
  const kept = [...forced];
  let nonJunkKept = 0;
  let nonForcedKept = 0;
  for (const it of rest) {
    if (def.maxNonJunkPickup !== null && it.kind !== "junk" && nonJunkKept >= def.maxNonJunkPickup) {
      room.discardPile.push(it);
      continue;
    }
    if (remainingCapacity(player) - nonForcedKept < 1) {
      room.discardPile.push(it);
      continue;
    }
    kept.push(it);
    nonForcedKept += 1;
    if (it.kind !== "junk") nonJunkKept += 1;
  }
  for (const it of kept) player.items.push(it);
  if (kept.length > 0) {
    pushLog(room, `\u{1F392} ${player.name} \u5728 ${roomName} \u64BF\u5230 ${kept.map((it) => ITEM_NAMES[it.kind]).join("\u3001")}`);
  }
  if (kept.length === 0 && drawn.length > 0) {
    pushLog(room, `\u{1F392} ${player.name} \u5728 ${roomName} \u7FFB\u5230\u7269\u8CC7\u4F46\u80CC\u5305\u5DF2\u6EFF\uFF0C\u4E00\u5F35\u90FD\u5E36\u4E0D\u8D70`);
  }
}
function applyWine(room, player, kind) {
  const roll = 1 + Math.floor(Math.random() * 6);
  const mul = kind === "fine_wine" ? 2 : 1;
  const label = kind === "fine_wine" ? "\u9673\u5E74\u7F8E\u9152" : "\u9152";
  if (roll === 1) {
    const lost = player.items.slice();
    player.items = [];
    room.discardPile.push(...lost);
    pushLog(room, `\u{1F377} ${player.name} \u559D${label}\u64F2\u51FA 1\uFF1A\u6240\u6709\u9053\u5177\u4E1F\u5931\uFF08${lost.map((it) => ITEM_NAMES[it.kind]).join("\u3001") || "\u7121"}\uFF09`);
  } else if (roll === 2) {
    pushLog(room, `\u{1F377} ${player.name} \u559D${label}\u64F2\u51FA 2\uFF1A\u7121\u4E8B\u767C\u751F`);
  } else if (roll === 3) {
    player.might += mul;
    pushLog(room, `\u{1F377} ${player.name} \u559D${label}\u64F2\u51FA 3\uFF1A\u6B66\u529B +${mul}`);
  } else if (roll === 4) {
    player.speed += mul;
    pushLog(room, `\u{1F377} ${player.name} \u559D${label}\u64F2\u51FA 4\uFF1A\u901F\u5EA6 +${mul}`);
  } else if (roll === 5) {
    player.carry += mul;
    pushLog(room, `\u{1F377} ${player.name} \u559D${label}\u64F2\u51FA 5\uFF1A\u8CA0\u91CD +${mul}`);
  } else {
    const before = player.hp;
    player.hp = Math.min(MAX_HP, player.hp + 2 * mul);
    pushLog(room, `\u{1F377} ${player.name} \u559D${label}\u64F2\u51FA 6\uFF1A\u751F\u547D +${player.hp - before}`);
  }
}
function useConsumableInResolution(room, player, item) {
  if (item.kind === "pill") {
    const before = player.hp;
    player.hp = Math.min(MAX_HP, player.hp + 2);
    pushLog(room, `\u{1F48A} ${player.name} \u7D50\u7B97\u6642\u4F7F\u7528\u85E5\u7247\uFF0C\u751F\u547D ${before} \u2192 ${player.hp}`);
  } else if (item.kind === "adrenaline") {
    player.adrenalineActive = true;
    pushLog(room, `\u{1F489} ${player.name} \u7D50\u7B97\u6642\u4F7F\u7528\u814E\u4E0A\u817A\u7D20\uFF1A\u4E0B\u56DE\u5408\u901F\u5EA6 10\u3001\u50B7\u5BB3\u4FDD\u5E95 1 \u8840`);
  } else if (item.kind === "wine" || item.kind === "fine_wine") {
    applyWine(room, player, item.kind);
  }
}
function runSettlement(room) {
  ensureRoomShape(room);
  const day = room.day;
  pushLog(room, `\u2500\u2500 \u7B2C ${day} \u5929\u7D50\u7B97\u958B\u59CB \u2500\u2500`);
  const activeAtStart = new Set(room.players.filter((p) => p.adrenalineActive).map((p) => p.id));
  for (const p of room.players) {
    const action = room.actions[p.id];
    if (!action) continue;
    const path = effectivePath(p, action);
    const from = p.room;
    if (path.length > 0) {
      p.room = path[path.length - 1];
    }
    pushLog(
      room,
      `\u{1F6B6} ${p.name} \u79FB\u52D5\uFF1A${path.length > 0 ? `${from} \u2192 ${path.join(" \u2192 ")}` : "\uFF08\u505C\u7559\uFF09"}\uFF0C\u7D42\u9EDE ${ROOM_MAP[p.room]?.name ?? p.room}`
    );
    if (!p.alive) continue;
    if (path.some((id) => ROOM_MAP[id]?.laser)) {
      pushLog(room, `\u{1F526} ${p.name} \u7D93\u904E\u6FC0\u5149\u5BA4\uFF0C\u627F\u53D7 1 \u9EDE\u50B7\u5BB3`);
      damage(room, p, 1, "\u88AB\u6FC0\u5149\u707C\u50B7");
      if (!p.alive) continue;
    }
    drawLoot(room, p, p.room);
    if (!p.alive) continue;
    if (p.room === "201") {
      p.might += 1;
      p.carry += 1;
      p.speed += 1;
      pushLog(room, `\u{1F9EC} ${p.name} \u5728\u57FA\u56E0\u5EAB\uFF1A\u6B66\u529B\u3001\u8CA0\u91CD\u3001\u901F\u5EA6\u5404 +1\uFF08${p.might}\uFF0F${p.carry}\uFF0F${p.speed}\uFF09`);
    }
    if (p.room === "B101" && action.controlChoice?.mode === "detox" && action.controlChoice.target) {
      const target = action.controlChoice.target;
      if (!room.detoxedRooms.includes(target)) {
        room.detoxedRooms.push(target);
        pushLog(room, `\u{1F6E1}\uFE0F ${p.name} \u5728\u63A7\u5236\u5BA4\u6C38\u4E45\u89E3\u6BD2\u4E86 ${ROOM_MAP[target]?.name ?? target}`);
      }
    }
    if (p.room === "B304" && action.geneRealloc) {
      const g = action.geneRealloc;
      p.might = g.might;
      p.carry = g.carry;
      p.speed = g.speed;
      pushLog(room, `\u{1F39B}\uFE0F ${p.name} \u5728\u64CD\u4F5C\u5BA4\u91CD\u914D\u57FA\u56E0\uFF1A\u6B66 ${g.might}\uFF0F\u8CA0 ${g.carry}\uFF0F\u901F ${g.speed}`);
    }
  }
  const surgeryOccupants = room.players.filter((p) => p.alive && p.room === "B202");
  const skipRooms = [];
  if (surgeryOccupants.length === 2) {
    skipRooms.push("B202");
    for (const p of surgeryOccupants) {
      const before = p.hp;
      p.hp = Math.min(MAX_HP, p.hp + 4);
      pushLog(room, `\u{1F3E5} \u624B\u8853\u5BA4\uFF1A${p.name} \u751F\u547D ${before} \u2192 ${p.hp}`);
    }
  } else if (surgeryOccupants.length >= 3) {
    pushLog(room, "\u{1F3E5} \u624B\u8853\u5BA4 3 \u4EBA\u4EE5\u4E0A\uFF1A\u6C92\u6709\u624B\u8853\uFF0C\u7167\u5E38\u4E82\u9B25");
  }
  resolveCombatAndShadows(room, skipRooms);
  const tally = /* @__PURE__ */ new Map();
  for (const p of room.players) {
    if (!p.alive) continue;
    const action = room.actions[p.id];
    if (!action?.voteFloor) continue;
    const weight = p.room === "B101" && action.controlChoice?.mode === "vote" ? 10 : 1;
    tally.set(action.voteFloor, (tally.get(action.voteFloor) ?? 0) + weight);
  }
  const tallyObj = {};
  for (const [f, v] of tally) tallyObj[f] = v;
  let top = 0;
  for (const v of tally.values()) top = Math.max(top, v);
  const newGasFloors = [];
  if (top > 0) {
    for (const [f, v] of tally) {
      if (v === top && !room.gassedFloors.includes(f)) {
        room.gassedFloors.push(f);
        newGasFloors.push(f);
      }
    }
    room.gassedFloors.sort((a, b) => FLOORS.indexOf(a) - FLOORS.indexOf(b));
  }
  room.lastGasTally = top > 0 ? {
    floorId: [...tally.entries()].sort((a, b) => b[1] - a[1] || FLOORS.indexOf(a[0]) - FLOORS.indexOf(b[0]))[0]?.[0],
    votes: top,
    all: tallyObj
  } : null;
  if (newGasFloors.length > 0) {
    pushLog(room, `\u2623\uFE0F \u6BD2\u6C23\u516C\u5E03\uFF1A\u7B2C ${day} \u5929\uFF0C${newGasFloors.join("\u3001")} \u6A13\u5C64\u65B0\u4E2D\u6BD2\uFF08\u5F97\u7968 ${top}\uFF09`);
  } else if (top > 0) {
    pushLog(room, `\u2623\uFE0F \u6BD2\u6C23\u516C\u5E03\uFF1A\u7B2C ${day} \u5929\u6700\u9AD8\u7968\u6A13\u5C64\u5DF2\u4E2D\u6BD2\u904E\uFF0C\u7121\u65B0\u4E2D\u6BD2\u6A13\u5C64\uFF08\u5F97\u7968 ${top}\uFF09`);
  } else {
    pushLog(room, "\u2623\uFE0F \u672C\u65E5\u7121\u4EBA\u6295\u7968\uFF0C\u6C92\u6709\u6A13\u5C64\u4E2D\u6BD2");
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
    pushLog(room, `\u2623\uFE0F ${p.name} \u5728\u6BD2\u6C23\u623F ${def.name} \u627F\u53D7 ${gasDmg} \u9EDE\u50B7\u5BB3`);
    damage(room, p, gasDmg, "\u88AB\u6BD2\u6C23\u4FB5\u8755");
  }
  if (day === 1) {
    pushLog(room, "\u{1F371} \u7B2C 1 \u5929\u514D\u7E73\u6C34\u7CE7");
  } else {
    for (const p of room.players) {
      if (!p.alive) continue;
      if (p.room === "B204") {
        pushLog(room, `\u{1F371} ${p.name} \u5728\u9910\u5EF3\uFF0C\u514D\u7E73\u6C34\u7CE7`);
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
      if (kit) pushLog(room, `\u{1F371} ${p.name} \u7E73\u4EA4\u751F\u5B58\u88DC\u7D66\uFF08\u62B5\u6C34\uFF0B\u7CE7\uFF09`);
      else if (dmg === 0) pushLog(room, `\u{1F371} ${p.name} \u7E73\u4EA4\u6C34\u8207\u7CE7\u98DF\u5404 1 \u4EFD`);
      else {
        pushLog(room, `\u{1F371} ${p.name} \u7F3A\u6C34\u7CE7\uFF0C\u6263\u9664 ${dmg} \u9EDE\u751F\u547D`);
        damage(room, p, dmg, "\u7F3A\u6C34\u7F3A\u7CE7");
      }
    }
  }
  const bombedRooms = [];
  for (const p of room.players) {
    const action = room.actions[p.id];
    if (!p.alive || !action?.rocketTarget) continue;
    if (!hasItemKind(p, "rocket_launcher")) continue;
    if (!bombedRooms.includes(action.rocketTarget)) bombedRooms.push(action.rocketTarget);
  }
  for (const roomId of bombedRooms) {
    const victims = room.players.filter((p) => p.alive && p.room === roomId);
    if (victims.length > 0) {
      pushLog(room, `\u{1F680} \u706B\u7BAD\u7B52\u8F5F\u70B8 ${ROOM_MAP[roomId]?.name ?? roomId}\uFF1A${victims.map((v) => v.name).join("\u3001")} \u5404\u6263 4 \u8840`);
    }
    for (const v of victims) damage(room, v, 4, "\u88AB\u706B\u7BAD\u7B52\u8F5F\u70B8");
  }
  for (const p of room.players) {
    if (!p.alive) continue;
    const action = room.actions[p.id];
    if (!action?.itemUses) continue;
    for (const id of action.itemUses) {
      const idx = p.items.findIndex((it) => it.id === id);
      if (idx < 0) continue;
      const item = p.items[idx];
      p.items.splice(idx, 1);
      room.usedPile.push(item);
      useConsumableInResolution(room, p, item);
      if (!p.alive) break;
    }
  }
  for (const p of room.players) {
    if (p.alive) continue;
    if (p.shadowHp >= 2) {
      p.alive = true;
      p.hp = Math.min(MAX_HP, p.shadowHp);
      p.shadowHp = 0;
      pushLog(room, `\u2728 \u6697\u5F71 ${p.name} \u7D2F\u7A4D\u8DB3\u5920\u751F\u547D\uFF0C\u5728 ${ROOM_MAP[p.room]?.name ?? p.room} \u539F\u5730\u5FA9\u6D3B\uFF08\u751F\u547D ${p.hp}\uFF09`);
    }
  }
  for (const p of room.players) {
    pushLog(
      room,
      p.alive ? `\u2764\uFE0F ${p.name}\uFF1A${p.hp} \u8840\uFF0C\u4F4D\u65BC ${ROOM_MAP[p.room]?.name ?? p.room}` : `\u{1F47B} ${p.name}\uFF1A\u6697\u5F71\uFF08\u7D2F\u7A4D ${p.shadowHp} \u8840\uFF09\uFF0C\u4F4D\u65BC ${ROOM_MAP[p.room]?.name ?? p.room}`
    );
  }
  for (const p of room.players) {
    p.helicopter = p.alive && p.room === "202";
  }
  for (const p of room.players) {
    if (activeAtStart.has(p.id)) p.adrenalineActive = false;
  }
  const aliveCount = room.players.filter((p) => p.alive).length;
  if (day >= TOTAL_DAYS || aliveCount <= 1) {
    room.status = "finished";
    room.ranking = computeRanking(room);
    const topNames = room.ranking.filter((r) => r.rank === 1).map((r) => findPlayer(room, r.playerId)?.name ?? "?");
    pushLog(room, `\u{1F3C6} \u904A\u6232\u7D50\u675F\uFF01\u51A0\u8ECD\uFF1A${topNames.join("\u3001")}\uFF08\u6700\u7D42\u751F\u547D ${room.ranking[0]?.finalHp}\uFF09`);
    return;
  }
  room.day += 1;
  room.phase = "free";
  room.actions = {};
  room.trades = [];
  for (const p of room.players) p.ready = false;
  addAirdrop(room);
  pushLog(room, `\u2500\u2500 \u7B2C ${room.day} \u5929\u958B\u59CB\uFF08\u81EA\u7531\u968E\u6BB5\uFF09\u2500\u2500`);
}
function computeRanking(room) {
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
  const ranked = [];
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
function useItem(room, playerId, itemId) {
  if (room.status !== "playing" || room.phase !== "free") return "\u53EA\u6709\u81EA\u7531\u968E\u6BB5\u53EF\u4EE5\u4F7F\u7528\u9053\u5177";
  const p = findPlayer(room, playerId);
  if (!p || !p.alive) return "\u627E\u4E0D\u5230\u73A9\u5BB6\u6216\u73A9\u5BB6\u5DF2\u662F\u6697\u5F71";
  const idx = p.items.findIndex((it) => it.id === itemId);
  if (idx < 0) return "\u80CC\u5305\u88E1\u6C92\u6709\u9019\u500B\u9053\u5177";
  const item = p.items[idx];
  ensureRoomShape(room);
  if (item.kind === "pill") {
    p.hp = Math.min(MAX_HP, p.hp + 2);
    p.items.splice(idx, 1);
    room.usedPile.push(item);
    pushLog(room, `\u{1F48A} ${p.name} \u4F7F\u7528\u85E5\u7247\uFF0C\u56DE\u5FA9\u81F3 ${p.hp} \u8840`);
    return null;
  }
  if (item.kind === "adrenaline") {
    p.adrenalineActive = true;
    p.items.splice(idx, 1);
    room.usedPile.push(item);
    pushLog(room, `\u{1F489} ${p.name} \u4F7F\u7528\u814E\u4E0A\u817A\u7D20\uFF1A\u4E0B\u56DE\u5408\u901F\u5EA6 10\u3001\u50B7\u5BB3\u4FDD\u5E95 1 \u8840`);
    return null;
  }
  if (item.kind === "wine" || item.kind === "fine_wine") {
    p.items.splice(idx, 1);
    room.usedPile.push(item);
    applyWine(room, p, item.kind);
    return null;
  }
  if (item.kind === "recycler") {
    if (room.usedPile.length === 0) return "\u7528\u6389\u7684\u9053\u5177\u5806\u662F\u7A7A\u7684\uFF0C\u56DE\u6536\u6A5F\u62BD\u4E0D\u5230\u6771\u897F";
    if (remainingCapacity(p) < 1) return "\u80CC\u5305\u5DF2\u6EFF\uFF0C\u7121\u6CD5\u56DE\u6536";
    const pick = Math.floor(Math.random() * room.usedPile.length);
    const got = room.usedPile.splice(pick, 1)[0];
    p.items.push(got);
    pushLog(room, `\u267B\uFE0F ${p.name} \u7528\u56DE\u6536\u6A5F\u5F9E\u7528\u6389\u7684\u5806\u62BD\u56DE ${ITEM_NAMES[got.kind]}`);
    return null;
  }
  return "\u9019\u500B\u9053\u5177\u7121\u6CD5\u5728\u81EA\u7531\u968E\u6BB5\u4F7F\u7528";
}
function proposeTrade(room, fromId, toId, offerItemId, wantItemId) {
  if (room.status !== "playing" || room.phase !== "free") return "\u53EA\u6709\u81EA\u7531\u968E\u6BB5\u53EF\u4EE5\u4EA4\u6613";
  const from = findPlayer(room, fromId);
  const to = findPlayer(room, toId);
  if (!from || !to || !from.alive || !to.alive) return "\u4EA4\u6613\u5C0D\u8C61\u7121\u6548";
  if (fromId === toId) return "\u4E0D\u80FD\u8DDF\u81EA\u5DF1\u4EA4\u6613";
  if (!from.items.some((it) => it.id === offerItemId)) return "\u4F60\u6C92\u6709\u8981\u7D66\u51FA\u7684\u9053\u5177";
  if (!to.items.some((it) => it.id === wantItemId)) return "\u5C0D\u65B9\u6C92\u6709\u4F60\u8981\u7684\u9053\u5177";
  room.trades.push({ id: newId("tr"), fromId, toId, offerItemId, wantItemId });
  pushLog(room, `\u{1F91D} ${from.name} \u5411 ${to.name} \u63D0\u51FA\u4EA4\u6613`);
  return null;
}
function respondTrade(room, tradeId, toId, accept) {
  if (room.status !== "playing" || room.phase !== "free") return "\u53EA\u6709\u81EA\u7531\u968E\u6BB5\u53EF\u4EE5\u56DE\u8986\u4EA4\u6613";
  const idx = room.trades.findIndex((t) => t.id === tradeId && t.toId === toId);
  if (idx < 0) return "\u627E\u4E0D\u5230\u9019\u7B46\u4EA4\u6613";
  const trade = room.trades[idx];
  room.trades.splice(idx, 1);
  const from = findPlayer(room, trade.fromId);
  const to = findPlayer(room, trade.toId);
  if (!from || !to) return "\u4EA4\u6613\u5C0D\u8C61\u5DF2\u96E2\u958B";
  if (!accept) {
    pushLog(room, `\u{1F91D} ${to.name} \u62D2\u7D55\u4E86 ${from.name} \u7684\u4EA4\u6613`);
    return null;
  }
  const offerIdx = from.items.findIndex((it) => it.id === trade.offerItemId);
  const wantIdx = to.items.findIndex((it) => it.id === trade.wantItemId);
  if (offerIdx < 0 || wantIdx < 0) {
    pushLog(room, "\u{1F91D} \u4EA4\u6613\u5931\u6557\uFF1A\u9053\u5177\u5DF2\u4E0D\u5728\u80CC\u5305\u4E2D");
    return null;
  }
  const offer = from.items[offerIdx];
  const want = to.items[wantIdx];
  from.items[offerIdx] = want;
  to.items[wantIdx] = offer;
  pushLog(room, `\u{1F91D} \u4EA4\u6613\u6210\u4EA4\uFF1A${from.name} \u7684 ${ITEM_NAMES[offer.kind]} \u2194 ${to.name} \u7684 ${ITEM_NAMES[want.kind]}`);
  return null;
}
function publicView(room, token) {
  ensureRoomShape(room);
  const self = token ? room.players.find((p) => p.token === token) : void 0;
  const poolCounts = {};
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
      items: self && self.id === p.id ? p.items : void 0,
      isSelf: self ? self.id === p.id : false
    })),
    submittedCount: Object.keys(room.actions).length,
    submittedPlayerIds: room.phase === "action" ? room.players.filter((p) => room.actions[p.id]).map((p) => p.id) : [],
    gassedFloors: room.gassedFloors,
    detoxedRooms: room.detoxedRooms,
    poolCounts,
    airdropCount: room.airdrop.length,
    usedPileCount: room.usedPile.length,
    discardCount: room.discardPile.length,
    lastGasTally: room.lastGasTally,
    log: room.log.slice(-200),
    trades: room.trades.filter((t) => !self || t.fromId === self.id || t.toId === self.id).map((t) => {
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
        wantKind: want?.kind ?? "?"
      };
    }),
    ranking: room.ranking,
    selfId: self?.id ?? null
  };
}

// facility-server/game-ai.ts
var AI_NAMES = ["\u963F\u9435", "\u5C0F\u591C", "\u8001\u83AB", "\u963F\u8475"];
var POLICIES = [
  { id: "gunner", might: 5, carry: 3, speed: 3, home: "B307" },
  { id: "hoarder", might: 3, carry: 5, speed: 3, home: "B402" },
  { id: "medic", might: 3, carry: 4, speed: 4, home: "B303" },
  { id: "ranger", might: 4, carry: 3, speed: 4, home: "B603" }
];
function aiName(index) {
  return AI_NAMES[index % AI_NAMES.length];
}
function aiSetup(index) {
  const p = POLICIES[index % POLICIES.length];
  return { might: p.might, carry: p.carry, speed: p.speed, policy: p.id };
}
function aiSpawn(room, policy) {
  const home = POLICIES.find((p) => p.id === policy)?.home;
  if (home && !room.players.some((p) => p.room === home)) return home;
  let best = SPAWN_ROOM_IDS[0];
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
function hasKind(player, kind) {
  return player.items.some((it) => it.kind === kind);
}
function poolCount(room, roomId) {
  return room.pools[roomId]?.length ?? 0;
}
function isGassed(room, roomId) {
  const def = ROOM_MAP[roomId];
  if (!def) return false;
  if (room.detoxedRooms.includes(roomId)) return false;
  if (def.gasImmune) return false;
  return def.floors.every((f) => room.gassedFloors.includes(f));
}
function bfsPath(room, player, from, to) {
  if (from === to) return [];
  const prev = /* @__PURE__ */ new Map();
  const queue = [from];
  const seen = /* @__PURE__ */ new Set([from]);
  while (queue.length > 0) {
    const cur = queue.shift();
    const nbs = neighborsOf(player, cur, { helipadFirstStep: cur === from });
    for (const next of nbs) {
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, cur);
      if (next === to) {
        const path = [];
        let node = to;
        while (node !== from) {
          path.unshift(node);
          node = prev.get(node);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [];
}
function aiTargetRoom(room, player) {
  const needWater = !hasKind(player, "water") && !hasKind(player, "survival_kit");
  const needFood = !hasKind(player, "food") && !hasKind(player, "survival_kit");
  const needWeapon = !player.items.some((it) => ["knife", "pistol", "shotgun", "bayonet"].includes(it.kind));
  const hasGun = player.items.some((it) => ["pistol", "shotgun"].includes(it.kind));
  const upkeepRound = room.day >= 2;
  const fleeing = isGassed(room, player.room);
  const score = (id) => {
    if (id === player.room) return -1e3;
    const def = ROOM_MAP[id];
    if (!def) return -1e3;
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
      const crowd = room.players.filter((p) => p.alive && p.id !== player.id && p.room === id).length;
      if (crowd > 0) return 120 + crowd * 10;
    }
    if (def.resourcePool !== null && poolCount(room, id) > 0) return 80;
    return 10;
  };
  let best = null;
  let bestScore = -Infinity;
  let bestDist = Infinity;
  for (const r of ROOMS) {
    const s = score(r.id);
    const full = bfsPath(room, player, player.room, r.id);
    if (full.length === 0) continue;
    const d = full.length;
    if (s > bestScore || s === bestScore && d < bestDist) {
      best = r.id;
      bestScore = s;
      bestDist = d;
    }
  }
  if (best) return best;
  const nbs = neighborsOf(player, player.room, { helipadFirstStep: true });
  return nbs[0] ?? player.room;
}
function aiAction(room, player) {
  if (!player.alive) {
    const targets = room.players.filter((p) => p.alive);
    if (targets.length === 0) return { playerId: player.id, path: [], voteFloor: null };
    if (targets.some((p) => p.room === player.room)) {
      return { playerId: player.id, path: [], voteFloor: null };
    }
    const target2 = targets[0];
    return { playerId: player.id, path: [target2.room], voteFloor: null };
  }
  const speed = effectiveSpeed(player);
  const target = aiTargetRoom(room, player);
  let path = bfsPath(room, player, player.room, target).slice(0, speed);
  if (path.length === 0) {
    const nbs = neighborsOf(player, player.room, { helipadFirstStep: true });
    if (nbs.length > 0) path = [nbs[0]];
  }
  const action = { playerId: player.id, path, voteFloor: aiVote(room, player, path) };
  if (path.includes("B403")) {
    const dest = ROOMS.filter((r) => isEmptyRoom(r.id) && !path.includes(r.id) && r.id !== player.room).map((r) => ({ id: r.id, d: bfsPath(room, player, r.id, target).length })).sort((a, b) => a.d - b.d)[0];
    if (dest) action.teleportTo = dest.id;
  }
  const finalRoom = action.teleportTo ?? (path.length > 0 ? path[path.length - 1] : player.room);
  if (finalRoom === "B101") {
    const gassedRoom = ROOMS.find(
      (r) => !room.detoxedRooms.includes(r.id) && r.floors.every((f) => room.gassedFloors.includes(f))
    );
    if (gassedRoom) {
      action.controlChoice = { mode: "detox", target: gassedRoom.id };
    } else {
      action.controlChoice = { mode: "vote" };
    }
  }
  if (hasKind(player, "rocket_launcher")) {
    const counts = /* @__PURE__ */ new Map();
    for (const p of room.players) {
      if (!p.alive || p.id === player.id) continue;
      counts.set(p.room, (counts.get(p.room) ?? 0) + 1);
    }
    let bestRoom = null;
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
function aiVote(room, player, path) {
  const finalRoom = path.length > 0 ? path[path.length - 1] : player.room;
  const myFloors = ROOM_MAP[finalRoom]?.floors ?? [];
  const counts = /* @__PURE__ */ new Map();
  for (const p of room.players) {
    if (!p.alive || p.id === player.id) continue;
    for (const f of ROOM_MAP[p.room]?.floors ?? []) {
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
  }
  let best = "2F";
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
var ITEM_VALUE = {
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
  junk: 0
};
function aiAcceptTrade(giveKind, receiveKind) {
  return (ITEM_VALUE[receiveKind] ?? 0) >= (ITEM_VALUE[giveKind] ?? 0);
}

// facility-server/neon.ts
function dbUrl() {
  const url = process.env.DATABASE_URL || process.env.DATABASE_URL_NEON;
  return url && url.length > 0 ? url : null;
}
function neonConfigured() {
  return dbUrl() !== null;
}
function endpoint(url) {
  return `https://${new URL(url).hostname}/sql`;
}
async function neonQuery(sql, params = []) {
  const url = dbUrl();
  if (!url) throw new Error("DATABASE_URL / DATABASE_URL_NEON is not set");
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6e3);
  let res;
  try {
    res = await fetch(endpoint(url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Neon-Connection-String": url
      },
      body: JSON.stringify({ query: sql, params }),
      signal: ctrl.signal
    });
  } catch (e) {
    clearTimeout(tid);
    throw new Error(`Neon fetch failed: ${e.name}: ${e.message}`);
  }
  clearTimeout(tid);
  const text = await res.text();
  if (!res.ok) throw new Error(`Neon HTTP ${res.status}: ${text.slice(0, 200)}`);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Neon JSON parse failed");
  }
  if (json.error) throw new Error(json.error.message || "Neon error");
  const rows = Array.isArray(json.rows) ? json.rows : [];
  return { rows };
}

// facility-server/store.ts
var TABLE = "facility_rooms";
var ROOM_TTL_MS = 12 * 60 * 60 * 1e3;
var CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ${TABLE} (
  code TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;
async function withTable(fn) {
  try {
    return await fn();
  } catch (e) {
    const msg = e.message || "";
    if (/does not exist/i.test(msg)) {
      await neonQuery(CREATE_TABLE_SQL);
      return await fn();
    }
    throw e;
  }
}
function parseRow(row) {
  const state = row.state;
  const room = typeof state === "string" ? JSON.parse(state) : state;
  return { room, version: Number(row.version) };
}
async function fetchRoom(code) {
  const upper = code.toUpperCase();
  const stored = await withTable(async () => {
    const { rows } = await neonQuery(
      `SELECT code, state, version FROM ${TABLE} WHERE code = $1`,
      [upper]
    );
    return rows.length > 0 ? parseRow(rows[0]) : null;
  });
  if (!stored) return null;
  if (Date.now() - stored.room.createdAt > ROOM_TTL_MS) {
    await withTable(
      () => neonQuery(`DELETE FROM ${TABLE} WHERE code = $1`, [upper])
    ).catch(() => void 0);
    return null;
  }
  return stored;
}
async function insertRoom(room) {
  return withTable(async () => {
    const { rows } = await neonQuery(
      `INSERT INTO ${TABLE} (code, state, version, updated_at) VALUES ($1, $2::jsonb, 1, now())
       ON CONFLICT (code) DO NOTHING RETURNING code`,
      [room.code, JSON.stringify(room)]
    );
    return rows.length > 0;
  });
}
async function updateRoom(room, version) {
  return withTable(async () => {
    const { rows } = await neonQuery(
      `UPDATE ${TABLE} SET state = $2::jsonb, version = version + 1, updated_at = now()
       WHERE code = $1 AND version = $3 RETURNING version`,
      [room.code, JSON.stringify(room), version]
    );
    return rows.length > 0;
  });
}
async function sweepExpired() {
  await withTable(
    () => neonQuery(
      `DELETE FROM ${TABLE} WHERE updated_at < now() - interval '12 hours'`
    )
  ).catch(() => void 0);
}

// facility-server/handler.ts
var CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}
function cleanName(raw) {
  const name = typeof raw === "string" ? raw.trim().slice(0, 12) : "";
  return name || "\u7121\u540D\u73A9\u5BB6";
}
function err(status, message) {
  return { status, body: { error: message } };
}
function playerFromToken(room, token) {
  if (typeof token !== "string") return void 0;
  return room.players.find((p) => p.token === token);
}
function sendRoom(room, token) {
  return { status: 200, body: { room: publicView(room, token) } };
}
function aiFreePhase(room) {
  for (const p of room.players) {
    if (!p.isAI || !p.alive || p.ready) continue;
    if (p.hp <= 5) {
      const med = p.items.find((it) => it.kind === "pill");
      if (med) {
        p.items = p.items.filter((it) => it.id !== med.id);
        p.hp = Math.min(10, p.hp + 2);
        room.log.push({ day: room.day, text: `\u{1F48A} ${p.name} \u4F7F\u7528\u85E5\u7247\uFF0C\u56DE\u5FA9\u81F3 ${p.hp} \u8840` });
      }
    }
    p.ready = true;
  }
}
function autoAiActions(room) {
  if (room.status !== "playing" || room.phase !== "action") return;
  for (const p of room.players) {
    if (!p.isAI || room.actions[p.id]) continue;
    room.actions[p.id] = aiAction(room, p);
  }
  maybeSettle(room);
}
function maybeSettle(room) {
  if (room.status !== "playing" || room.phase !== "action") return;
  const allSubmitted = room.players.every((p) => room.actions[p.id]);
  if (!allSubmitted) return;
  runSettlement(room);
  const phaseAfterSettlement = room.phase;
  if (room.status === "playing" && phaseAfterSettlement === "free") {
    aiFreePhase(room);
  }
}
function maybeAdvanceToAction(room) {
  if (room.status !== "playing" || room.phase !== "free") return;
  const allReady = room.players.filter((p) => p.alive).every((p) => p.ready);
  if (!allReady) return;
  room.phase = "action";
  room.log.push({ day: room.day, text: `\u2500\u2500 \u7B2C ${room.day} \u5929\u884C\u52D5\u968E\u6BB5\u958B\u59CB \u2500\u2500` });
  autoAiActions(room);
}
function lazyAdvance(room) {
  aiFreePhase(room);
  maybeAdvanceToAction(room);
  autoAiActions(room);
  maybeSettle(room);
}
async function withRoom(code, notFoundMsg, fn) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const stored = await fetchRoom(code);
    if (!stored) return err(404, notFoundMsg);
    const { room, version } = stored;
    const before = JSON.stringify(room);
    lazyAdvance(room);
    const result = fn(room);
    if (JSON.stringify(room) === before) return result;
    if (await updateRoom(room, version)) return result;
  }
  return err(409, "\u623F\u9593\u525B\u88AB\u5176\u4ED6\u73A9\u5BB6\u66F4\u65B0\uFF0C\u8ACB\u518D\u8A66\u4E00\u6B21");
}
function matchPath(path) {
  const parts = path.split("/").filter((s) => s.length > 0);
  if (parts[0] !== "rooms") return null;
  if (parts.length === 1) return { name: "create" };
  const code = parts[1];
  if (parts.length === 2) return { name: "get", code };
  if (parts.length === 3) {
    if (parts[2] === "join") return { name: "join", code };
    if (parts[2] === "setup") return { name: "setup", code };
    if (parts[2] === "start") return { name: "start", code };
    if (parts[2] === "ready") return { name: "ready", code };
    if (parts[2] === "action") return { name: "action", code };
    if (parts[2] === "use-item") return { name: "use-item", code };
    if (parts[2] === "trade") return { name: "trade", code };
  }
  if (parts.length === 4 && parts[2] === "trade" && parts[3] === "respond") {
    return { name: "trade-respond", code };
  }
  return null;
}
async function handleGamesRequest(method, fullPath, query, bodyText) {
  if (!neonConfigured()) {
    return err(503, "\u8CC7\u6599\u5EAB\u5C1A\u672A\u8A2D\u5B9A\uFF08DATABASE_URL\uFF0FDATABASE_URL_NEON\uFF09\uFF0C\u8ACB\u806F\u7D61\u7AD9\u9577");
  }
  let body = {};
  if (method === "POST") {
    if (bodyText.trim().length > 0) {
      try {
        const parsed = JSON.parse(bodyText);
        body = parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return err(400, "\u8ACB\u6C42\u683C\u5F0F\u932F\u8AA4");
      }
    }
  }
  const path = fullPath.replace(/^\/api\/games\/?/, "/").replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  const route = matchPath(path);
  if (!route) return err(404, "\u627E\u4E0D\u5230\u623F\u9593");
  try {
    if (route.name === "create" && method === "POST") {
      await sweepExpired();
      for (let i = 0; i < 10; i++) {
        const code2 = newCode();
        const room = createRoom(code2, cleanName(body.name));
        if (await insertRoom(room)) {
          const host = room.players[0];
          return {
            status: 201,
            body: {
              code: code2,
              playerId: host?.id,
              token: host?.token,
              room: publicView(room, host?.token)
            }
          };
        }
      }
      return err(500, "\u623F\u9593\u78BC\u7522\u751F\u5931\u6557\uFF0C\u8ACB\u518D\u8A66\u4E00\u6B21");
    }
    const code = route.code;
    if (route.name === "join" && method === "POST") {
      return withRoom(
        code,
        "\u627E\u4E0D\u5230\u623F\u9593\uFF08\u623F\u9593\u78BC\u932F\u8AA4\uFF0C\u6216\u623F\u9593\u5DF2\u904E\u671F\uFF0F\u4F3A\u670D\u5668\u91CD\u555F\uFF09",
        (room) => {
          if (room.status !== "lobby") return err(400, "\u904A\u6232\u5DF2\u7D93\u958B\u59CB\uFF0C\u7121\u6CD5\u52A0\u5165");
          if (room.players.length >= MAX_PLAYERS) return err(400, "\u623F\u9593\u5DF2\u6EFF\uFF084 \u4EBA\uFF09");
          const player = addPlayer(room, cleanName(body.name), false);
          return {
            status: 201,
            body: {
              playerId: player.id,
              token: player.token,
              room: publicView(room, player.token)
            }
          };
        }
      );
    }
    if (route.name === "get" && method === "GET") {
      return withRoom(
        code,
        "\u627E\u4E0D\u5230\u623F\u9593",
        (room) => sendRoom(room, query.get("token") ?? void 0)
      );
    }
    if (route.name === "setup" && method === "POST") {
      return withRoom(code, "\u627E\u4E0D\u5230\u623F\u9593", (room) => {
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "\u6191\u8B49\u7121\u6548\uFF0C\u8ACB\u91CD\u65B0\u52A0\u5165\u623F\u9593");
        const e = setSetup(
          room,
          player.id,
          Number(body.might),
          Number(body.carry),
          Number(body.speed),
          String(body.spawn ?? "")
        );
        if (e) return err(400, e);
        return sendRoom(room, player.token);
      });
    }
    if (route.name === "start" && method === "POST") {
      return withRoom(code, "\u627E\u4E0D\u5230\u623F\u9593", (room) => {
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "\u6191\u8B49\u7121\u6548\uFF0C\u8ACB\u91CD\u65B0\u52A0\u5165\u623F\u9593");
        if (!player.isHost) return err(403, "\u53EA\u6709\u623F\u4E3B\u53EF\u4EE5\u958B\u59CB\u904A\u6232");
        if (room.status !== "lobby") return err(400, "\u904A\u6232\u5DF2\u7D93\u958B\u59CB");
        if (room.players.length < 1) return err(400, "\u623F\u9593\u88E1\u6C92\u6709\u73A9\u5BB6");
        for (const p of room.players.filter((x) => !x.isAI && !x.hasSetup)) {
          setSetup(room, p.id, 4, 3, 3, aiSpawn(room));
        }
        let aiIndex = 0;
        while (room.players.length < MAX_PLAYERS) {
          const ai = addPlayer(room, aiName(aiIndex), true);
          const setup = aiSetup(aiIndex);
          ai.might = setup.might;
          ai.carry = setup.carry;
          ai.speed = setup.speed;
          ai.room = aiSpawn(room, setup.policy);
          ai.hasSetup = true;
          ai.policy = setup.policy;
          aiIndex += 1;
        }
        room.status = "playing";
        room.day = 1;
        room.phase = "free";
        room.log.push({ day: 1, text: "\u2500\u2500 \u904A\u6232\u958B\u59CB\uFF01\u7B2C 1 \u5929\uFF08\u81EA\u7531\u968E\u6BB5\uFF09\u2500\u2500" });
        initGameState(room);
        resolveCombatAndShadows(room);
        aiFreePhase(room);
        return sendRoom(room, player.token);
      });
    }
    if (route.name === "ready" && method === "POST") {
      return withRoom(code, "\u627E\u4E0D\u5230\u623F\u9593", (room) => {
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "\u6191\u8B49\u7121\u6548\uFF0C\u8ACB\u91CD\u65B0\u52A0\u5165\u623F\u9593");
        if (room.status !== "playing" || room.phase !== "free") {
          return err(400, "\u73FE\u5728\u4E0D\u662F\u81EA\u7531\u968E\u6BB5");
        }
        player.ready = true;
        maybeAdvanceToAction(room);
        return sendRoom(room, player.token);
      });
    }
    if (route.name === "action" && method === "POST") {
      return withRoom(code, "\u627E\u4E0D\u5230\u623F\u9593", (room) => {
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "\u6191\u8B49\u7121\u6548\uFF0C\u8ACB\u91CD\u65B0\u52A0\u5165\u623F\u9593");
        if (room.actions[player.id]) return err(400, "\u672C\u56DE\u5408\u5DF2\u7D93\u63D0\u4EA4\u904E\u884C\u52D5");
        const rawControl = body.controlChoice;
        const controlMode = rawControl?.mode === "vote" || rawControl?.mode === "detox" ? rawControl.mode : void 0;
        const rawGene = body.geneRealloc;
        const action = {
          playerId: player.id,
          path: Array.isArray(body.path) ? body.path.map(String) : [],
          voteFloor: body.voteFloor ?? null,
          teleportTo: typeof body.teleportTo === "string" ? body.teleportTo : void 0,
          detoxRoom: typeof body.detoxRoom === "string" ? body.detoxRoom : void 0,
          controlChoice: controlMode ? { mode: controlMode, target: typeof rawControl?.target === "string" ? rawControl.target : void 0 } : void 0,
          geneRealloc: rawGene && Number.isInteger(rawGene.might) && Number.isInteger(rawGene.carry) && Number.isInteger(rawGene.speed) ? { might: Number(rawGene.might), carry: Number(rawGene.carry), speed: Number(rawGene.speed) } : void 0,
          rocketTarget: typeof body.rocketTarget === "string" ? body.rocketTarget : void 0,
          itemUses: Array.isArray(body.itemUses) ? body.itemUses.map(String) : void 0
        };
        const e = validateAction(room, player, action);
        if (e) return err(400, e);
        room.actions[player.id] = action;
        maybeSettle(room);
        return sendRoom(room, player.token);
      });
    }
    if (route.name === "use-item" && method === "POST") {
      return withRoom(code, "\u627E\u4E0D\u5230\u623F\u9593", (room) => {
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "\u6191\u8B49\u7121\u6548\uFF0C\u8ACB\u91CD\u65B0\u52A0\u5165\u623F\u9593");
        const e = useItem(room, player.id, String(body.itemId ?? ""));
        if (e) return err(400, e);
        return sendRoom(room, player.token);
      });
    }
    if (route.name === "trade" && method === "POST") {
      return withRoom(code, "\u627E\u4E0D\u5230\u623F\u9593", (room) => {
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "\u6191\u8B49\u7121\u6548\uFF0C\u8ACB\u91CD\u65B0\u52A0\u5165\u623F\u9593");
        const target = room.players.find((p) => p.id === String(body.toId ?? ""));
        const wantItem = target?.items.find((it) => it.kind === String(body.wantKind ?? ""));
        if (!target || !wantItem) return err(400, "\u5C0D\u65B9\u6C92\u6709\u4F60\u8981\u7684\u90A3\u7A2E\u9053\u5177");
        const e = proposeTrade(
          room,
          player.id,
          String(body.toId ?? ""),
          String(body.offerItemId ?? ""),
          wantItem.id
        );
        if (e) return err(400, e);
        const trade = room.trades[room.trades.length - 1];
        if (trade && target?.isAI) {
          const offer = player.items.find((it) => it.id === trade.offerItemId);
          const want = target.items.find((it) => it.id === trade.wantItemId);
          if (offer && want) {
            respondTrade(room, trade.id, target.id, aiAcceptTrade(want.kind, offer.kind));
          }
        }
        return sendRoom(room, player.token);
      });
    }
    if (route.name === "trade-respond" && method === "POST") {
      return withRoom(code, "\u627E\u4E0D\u5230\u623F\u9593", (room) => {
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "\u6191\u8B49\u7121\u6548\uFF0C\u8ACB\u91CD\u65B0\u52A0\u5165\u623F\u9593");
        const e = respondTrade(
          room,
          String(body.tradeId ?? ""),
          player.id,
          body.accept === true
        );
        if (e) return err(400, e);
        return sendRoom(room, player.token);
      });
    }
    return err(404, "\u627E\u4E0D\u5230\u623F\u9593");
  } catch (e) {
    return err(500, e.message || "\u4F3A\u670D\u5668\u932F\u8AA4");
  }
}

// facility-server/vercel-entry.ts
async function readNodeBody(req) {
  const chunks = [];
  const it = req[Symbol.asyncIterator];
  if (!it) return "";
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}
function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
async function handler(req, res) {
  const nodeRes = res;
  const isNodeRes = nodeRes && typeof nodeRes.setHeader === "function" && typeof nodeRes.end === "function";
  if (!isNodeRes) {
    const request = req;
    try {
      const url = new URL(request.url);
      let bodyText = "";
      if (request.method === "POST") {
        bodyText = await request.text().catch(() => "");
      }
      const result = await handleGamesRequest(
        request.method,
        url.pathname,
        url.searchParams,
        bodyText
      );
      return jsonResponse(result.body, result.status);
    } catch (e) {
      return jsonResponse({ error: e.message || "\u4F3A\u670D\u5668\u932F\u8AA4" }, 500);
    }
  }
  const nodeReq = req;
  try {
    const url = new URL(nodeReq.url || "/", "https://localhost");
    let bodyText = "";
    if (nodeReq.method === "POST") {
      bodyText = await readNodeBody(nodeReq);
    }
    const result = await handleGamesRequest(
      nodeReq.method || "GET",
      url.pathname,
      url.searchParams,
      bodyText
    );
    nodeRes.statusCode = result.status;
    nodeRes.setHeader("Content-Type", "application/json");
    nodeRes.end(JSON.stringify(result.body));
  } catch (e) {
    try {
      if (!nodeRes.headersSent) nodeRes.statusCode = 500;
      nodeRes.setHeader("Content-Type", "application/json");
      nodeRes.end(JSON.stringify({ error: e.message || "\u4F3A\u670D\u5668\u932F\u8AA4" }));
    } catch {
    }
  }
}
var config = { maxDuration: 60 };
export {
  config,
  handler as default
};

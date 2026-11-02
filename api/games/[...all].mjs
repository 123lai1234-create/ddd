// game-engine.ts
var ROOMS = [
  { id: "201", floor: "2F", name: "201 \u7A7A\u623F", kind: "empty", spawn: true },
  { id: "202", floor: "2F", name: "202 \u6FC0\u5149\u5BA4", kind: "laser", spawn: false },
  { id: "203", floor: "2F", name: "203 \u6A13\u68AF\u9593", kind: "stairs", spawn: true },
  { id: "204", floor: "2F", name: "204 \u50B3\u9001\u5BA4", kind: "teleport", spawn: false },
  { id: "205", floor: "2F", name: "205 \u7A7A\u623F", kind: "empty", spawn: true },
  { id: "101", floor: "1F", name: "101 \u7A7A\u623F", kind: "empty", spawn: true },
  { id: "102", floor: "1F", name: "102 \u6C34\u5854", kind: "water", spawn: false },
  { id: "103", floor: "1F", name: "103 \u7CE7\u5009", kind: "food", spawn: false },
  { id: "104", floor: "1F", name: "104 \u6A13\u68AF\u9593", kind: "stairs", spawn: true },
  { id: "105", floor: "1F", name: "105 \u624B\u8853\u5BA4", kind: "surgery", spawn: false },
  { id: "B101", floor: "B1", name: "B101 \u63A7\u5236\u5BA4", kind: "control", spawn: false },
  { id: "B102", floor: "B1", name: "B102 \u7A7A\u623F", kind: "empty", spawn: true },
  { id: "B103", floor: "B1", name: "B103 \u505C\u5C4D\u9593", kind: "morgue", spawn: false },
  { id: "B104", floor: "B1", name: "B104 \u6A13\u68AF\u9593", kind: "stairs", spawn: true },
  { id: "B105", floor: "B1", name: "B105 \u6B66\u5668\u5EAB", kind: "weapons", spawn: false }
];
var ROOM_MAP = Object.fromEntries(
  ROOMS.map((r) => [r.id, r])
);
var SPAWN_ROOM_IDS = ROOMS.filter((r) => r.spawn).map((r) => r.id);
var FLOORS = ["2F", "1F", "B1"];
var TOTAL_DAYS = 6;
var MAX_HP = 10;
var MAX_PLAYERS = 4;
var ADJACENCY = (() => {
  const adj = {};
  for (const r of ROOMS) adj[r.id] = [];
  const link = (a, b) => {
    adj[a]?.push(b);
    adj[b]?.push(a);
  };
  const rows = [
    ["201", "202", "203", "204", "205"],
    ["101", "102", "103", "104", "105"],
    ["B101", "B102", "B103", "B104", "B105"]
  ];
  for (const row of rows) {
    for (let i = 0; i < row.length - 1; i++) link(row[i], row[i + 1]);
  }
  link("203", "104");
  link("104", "B104");
  return adj;
})();
var ITEM_NAMES = {
  water: "\u6C34",
  food: "\u7CE7\u98DF",
  supply: "\u751F\u5B58\u88DC\u7D66",
  gold: "\u91D1\u689D",
  knife: "\u5200",
  pistol: "\u624B\u69CD",
  rifle: "\u6B65\u69CD",
  medicine: "\u6025\u6551\u85E5\u7247",
  wine: "\u7F8E\u9152",
  adrenaline: "\u814E\u4E0A\u817A\u7D20"
};
var WEAPON_BONUS = {
  knife: 1,
  pistol: 2,
  rifle: 3
};
function isGun(kind) {
  return kind === "pistol" || kind === "rifle";
}
var idCounter = 0;
function newId(prefix) {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}
function makeItem(kind) {
  return { id: newId("it"), kind };
}
function effectiveSpeed(player) {
  return player.speed + player.speedBoost;
}
function finalMight(player) {
  let bonus = 0;
  for (const it of player.items) {
    const b = WEAPON_BONUS[it.kind] ?? 0;
    if (b > bonus) bonus = b;
  }
  return player.might + bonus;
}
function hasGun(player) {
  return player.items.some((it) => isGun(it.kind));
}
function createRoom(code, hostName) {
  const host = {
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
    speedBoost: 0
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
    createdAt: Date.now()
  };
}
function addPlayer(room, name, isAI) {
  const p = {
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
    speedBoost: 0
  };
  room.players.push(p);
  return p;
}
function findPlayer(room, playerId) {
  return room.players.find((p) => p.id === playerId);
}
function validateSetup(might, carry, speed, spawn) {
  if (![might, carry, speed].every((n) => Number.isInteger(n) && n >= 0)) {
    return "\u57FA\u56E0\u6578\u503C\u5FC5\u9808\u662F\u975E\u8CA0\u6574\u6578";
  }
  if (might + carry + speed !== 10) return "\u6B66\u529B\uFF0B\u8CA0\u91CD\uFF0B\u901F\u5EA6\u7E3D\u548C\u5FC5\u9808\u525B\u597D\u7B49\u65BC 10 \u9EDE";
  if (speed < 1) return "\u901F\u5EA6\u81F3\u5C11\u8981 1 \u9EDE";
  if (!SPAWN_ROOM_IDS.includes(spawn)) return "\u51FA\u751F\u9EDE\u4E0D\u5728\u53EF\u9078\u6E05\u55AE\u5167";
  return null;
}
function setSetup(room, playerId, might, carry, speed, spawn) {
  if (room.status !== "lobby") return "\u904A\u6232\u5DF2\u7D93\u958B\u59CB\uFF0C\u7121\u6CD5\u518D\u914D\u9EDE";
  const p = findPlayer(room, playerId);
  if (!p) return "\u627E\u4E0D\u5230\u73A9\u5BB6";
  const err2 = validateSetup(might, carry, speed, spawn);
  if (err2) return err2;
  p.might = might;
  p.carry = carry;
  p.speed = speed;
  p.room = spawn;
  p.hasSetup = true;
  return null;
}
function validatePath(player, path) {
  if (!Array.isArray(path)) return "\u8DEF\u5F91\u683C\u5F0F\u932F\u8AA4";
  if (player.alive) {
    if (path.length < 1) return "\u6BCF\u56DE\u5408\u81F3\u5C11\u8981\u8D70 1 \u6B65";
    if (path.length > effectiveSpeed(player)) return `\u6B65\u6578\u8D85\u904E\u901F\u5EA6\u4E0A\u9650\uFF08${effectiveSpeed(player)} \u6B65\uFF09`;
    const seen = /* @__PURE__ */ new Set([player.room]);
    let prev = player.room;
    for (const step of path) {
      if (!ROOM_MAP[step]) return `\u4E0D\u5B58\u5728\u7684\u623F\u9593\uFF1A${step}`;
      if (seen.has(step)) return "\u540C\u4E00\u56DE\u5408\u5167\u4E0D\u80FD\u5F80\u56DE\u8D70\u3001\u4E0D\u80FD\u91CD\u8907\u9032\u5165\u623F\u9593";
      if (!(ADJACENCY[prev] ?? []).includes(step)) return `\u7121\u6CD5\u5F9E ${prev} \u76F4\u63A5\u8D70\u5230 ${step}`;
      seen.add(step);
      prev = step;
    }
  } else {
    if (path.length > effectiveSpeed(player)) return `\u6B65\u6578\u8D85\u904E\u901F\u5EA6\u4E0A\u9650\uFF08${effectiveSpeed(player)} \u6B65\uFF09`;
    const seen = /* @__PURE__ */ new Set();
    for (const step of path) {
      if (!ROOM_MAP[step]) return `\u4E0D\u5B58\u5728\u7684\u623F\u9593\uFF1A${step}`;
      if (seen.has(step)) return "\u540C\u4E00\u56DE\u5408\u5167\u4E0D\u80FD\u91CD\u8907\u9032\u5165\u623F\u9593";
      seen.add(step);
    }
  }
  return null;
}
function finalRoomOf(player, action) {
  if (action.teleportTo) return action.teleportTo;
  if (action.path.length === 0) return player.room;
  return action.path[action.path.length - 1];
}
function pathIncludesTeleport(action) {
  return action.path.some((id) => ROOM_MAP[id]?.kind === "teleport");
}
function validateAction(room, player, action) {
  if (room.status !== "playing" || room.phase !== "action") return "\u73FE\u5728\u4E0D\u662F\u884C\u52D5\u968E\u6BB5";
  const pathErr = validatePath(player, action.path);
  if (pathErr) return pathErr;
  if (player.alive) {
    if (!action.voteFloor || !FLOORS.includes(action.voteFloor)) return "\u5FC5\u9808\u79D8\u5BC6\u6295\u51FA\u4E00\u7968\u6BD2\u6A13\u5C64";
    if (action.teleportTo) {
      if (!pathIncludesTeleport(action)) return "\u53EA\u6709\u7D93\u904E\u50B3\u9001\u5BA4\u624D\u80FD\u50B3\u9001";
      const dest = ROOM_MAP[action.teleportTo];
      if (!dest || dest.kind !== "empty") return "\u50B3\u9001\u76EE\u7684\u5730\u5FC5\u9808\u662F\u7A7A\u623F";
    }
    if (action.detoxRoom) {
      if (finalRoomOf(player, action) !== "B101") return "\u53EA\u6709\u7D42\u9EDE\u5728\u63A7\u5236\u5BA4\u6642\u624D\u80FD\u6307\u5B9A\u89E3\u6BD2\u623F\u9593";
      if (!ROOM_MAP[action.detoxRoom]) return "\u89E3\u6BD2\u76EE\u6A19\u623F\u9593\u4E0D\u5B58\u5728";
    }
  }
  return null;
}
function pushLog(room, text) {
  room.log.push({ day: room.day, text });
}
function killToShadow(room, player, cause) {
  if (!player.alive) return;
  player.alive = false;
  player.hp = 0;
  player.shadowHp = 0;
  for (const it of player.items) room.morgue.push(it);
  player.items = [];
  pushLog(room, `\u{1F47B} ${player.name} ${cause}\uFF0C\u751F\u547D\u6B78\u96F6\u5316\u70BA\u6697\u5F71\uFF0C\u9053\u5177\u6389\u843D\u5728\u505C\u5C4D\u9593`);
}
function damage(room, player, amount, cause) {
  if (!player.alive || amount <= 0) return;
  player.hp -= amount;
  if (player.hp <= 0) {
    player.hp = 0;
    killToShadow(room, player, cause);
  }
}
function rollLoot(roomId) {
  const kind = ROOM_MAP[roomId]?.kind;
  if (kind === "water") return makeItem("water");
  if (kind === "food") return makeItem("food");
  if (kind === "weapons") {
    const weapons = ["knife", "pistol", "rifle"];
    return makeItem(weapons[Math.floor(Math.random() * weapons.length)]);
  }
  if (kind === "empty" || kind === "stairs") {
    const pool = ["water", "food", "supply", "gold", "medicine", "wine", "adrenaline"];
    return makeItem(pool[Math.floor(Math.random() * pool.length)]);
  }
  return null;
}
function resolveSurgery(room) {
  const occupants = room.players.filter((p) => p.alive && p.room === "105");
  if (occupants.length !== 2) return;
  const [a, b] = occupants;
  const ma = finalMight(a);
  const mb = finalMight(b);
  if (ma === mb) {
    pushLog(room, "\u{1F3E5} \u624B\u8853\u5BA4\uFF1A\u5169\u4EBA\u6B66\u529B\u76F8\u540C\uFF0C\u7121\u4EBA\u5438\u8840");
    return;
  }
  const winner = ma > mb ? a : b;
  const loser = ma > mb ? b : a;
  const take = Math.min(2, loser.hp);
  loser.hp -= take;
  winner.hp = Math.min(MAX_HP, winner.hp + take);
  pushLog(room, `\u{1F3E5} \u624B\u8853\u5BA4\uFF1A${winner.name} \u52DD\u51FA\uFF0C\u5F9E ${loser.name} \u5438\u53D6 ${take} \u9EDE\u751F\u547D`);
  if (loser.hp <= 0) killToShadow(room, loser, "\u5728\u624B\u8853\u5BA4\u88AB\u5438\u4E7E");
}
function resolveCombatAndShadows(room) {
  const rooms = /* @__PURE__ */ new Map();
  for (const p of room.players) {
    if (!rooms.has(p.room)) rooms.set(p.room, []);
    rooms.get(p.room)?.push(p);
  }
  for (const [roomId, occupants] of rooms) {
    const alive = occupants.filter((p) => p.alive);
    const shadows = occupants.filter((p) => !p.alive);
    for (const sh of shadows) {
      let drained = 0;
      for (const target of alive) {
        if (target.hp <= 0) continue;
        target.hp -= 1;
        drained += 1;
      }
      if (drained > 0) {
        sh.shadowHp += drained;
        pushLog(room, `\u{1F47B} \u6697\u5F71 ${sh.name} \u5728 ${ROOM_MAP[roomId]?.name} \u5438\u53D6 ${drained} \u9EDE\u751F\u547D`);
      }
    }
    for (const target of alive) {
      if (target.hp <= 0) killToShadow(room, target, "\u88AB\u6697\u5F71\u5438\u4E7E");
    }
    const fighters = occupants.filter((p) => p.alive);
    if (fighters.length < 2) continue;
    const anyGun = fighters.some((p) => hasGun(p));
    const eff = fighters.map((p) => ({
      p,
      might: !hasGun(p) && anyGun ? 0 : finalMight(p)
    }));
    const max = Math.max(...eff.map((e) => e.might));
    const winners = eff.filter((e) => e.might === max);
    const roomName = ROOM_MAP[roomId]?.name ?? roomId;
    if (winners.length === 1) {
      const winnerName = winners[0].p.name;
      for (const e of eff) {
        if (e.might === max) continue;
        const dmg = max - e.might;
        if (dmg > 0) {
          pushLog(
            room,
            `\u2694\uFE0F ${roomName} \u6230\u9B25\uFF1A${winnerName} \u52DD\u51FA\uFF0C${e.p.name} \u627F\u53D7 ${dmg} \u9EDE\u50B7\u5BB3`
          );
          damage(room, e.p, dmg, "\u5728\u6230\u9B25\u4E2D\u843D\u6557");
        }
      }
    } else {
      for (const e of eff) {
        pushLog(room, `\u2694\uFE0F ${roomName} \u6230\u9B25\uFF1A\u6B66\u529B\u76F8\u540C\uFF0C${e.p.name} \u627F\u53D7 1 \u9EDE\u76F8\u649E\u50B7\u5BB3`);
        damage(room, e.p, 1, "\u5728\u6230\u9B25\u4E2D\u76F8\u649E");
      }
    }
  }
}
function resolvePoison(room, votes) {
  const counts = { "2F": 0, "1F": 0, B1: 0 };
  for (const p of room.players) {
    if (!p.alive) continue;
    const v = votes[p.id];
    if (v) counts[v] += 1;
  }
  let floor = "2F";
  let best = -1;
  for (const f of FLOORS) {
    if (counts[f] > best) {
      best = counts[f];
      floor = f;
    }
  }
  if (best <= 0) {
    pushLog(room, "\u2623\uFE0F \u672C\u65E5\u7121\u4EBA\u6295\u7968\uFF0C\u6C92\u6709\u6A13\u5C64\u4E2D\u6BD2");
    return;
  }
  pushLog(room, `\u2623\uFE0F \u6BD2\u6C23\u516C\u5E03\uFF1A\u7B2C ${room.day} \u5929\uFF0C${floor} \u6A13\u5C64\u5168\u9762\u5C01\u6B7B\uFF08\u5F97\u7968 ${best}\uFF09`);
  for (const p of room.players) {
    if (!p.alive) continue;
    const def = ROOM_MAP[p.room];
    if (!def || def.floor !== floor) continue;
    if (room.detoxedRooms.includes(p.room)) {
      pushLog(room, `\u{1F6E1}\uFE0F ${p.name} \u6240\u5728\u7684 ${def.name} \u5DF2\u89E3\u6BD2\uFF0C\u514D\u53D7\u6BD2\u6C23\u50B7\u5BB3`);
      continue;
    }
    pushLog(room, `\u2623\uFE0F ${p.name} \u5728\u6BD2\u6C23\u6A13\u5C64\u627F\u53D7 ${room.day} \u9EDE\u50B7\u5BB3`);
    damage(room, p, room.day, "\u88AB\u6BD2\u6C23\u4FB5\u8755");
  }
}
function resolveUpkeep(room) {
  if (room.day < 2) return;
  for (const p of room.players) {
    if (!p.alive) continue;
    const supplyIdx = p.items.findIndex((it) => it.kind === "supply");
    if (supplyIdx >= 0) {
      p.items.splice(supplyIdx, 1);
      pushLog(room, `\u{1F371} ${p.name} \u7E73\u4EA4 1 \u4EFD\u751F\u5B58\u88DC\u7D66\uFF08\u62B5\u6C34\uFF0B\u7CE7\uFF09`);
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
      pushLog(room, `\u{1F371} ${p.name} \u7F3A ${missing} \u9805\u6C34\u7CE7\uFF0C\u6263\u9664 ${missing * 2} \u9EDE\u751F\u547D`);
      damage(room, p, missing * 2, "\u7F3A\u6C34\u7F3A\u7CE7");
    } else {
      pushLog(room, `\u{1F371} ${p.name} \u7E73\u4EA4\u6C34\u8207\u7CE7\u98DF\u5404 1 \u4EFD`);
    }
  }
}
function resolveRevive(room) {
  for (const p of room.players) {
    if (p.alive) continue;
    if (p.shadowHp >= 2) {
      p.alive = true;
      p.hp = Math.min(MAX_HP, p.shadowHp);
      p.shadowHp = 0;
      pushLog(room, `\u2728 \u6697\u5F71 ${p.name} \u7D2F\u7A4D\u8DB3\u5920\u751F\u547D\uFF0C\u5728 ${ROOM_MAP[p.room]?.name} \u539F\u5730\u5FA9\u6D3B\uFF08\u751F\u547D ${p.hp}\uFF09`);
    }
  }
}
function computeRanking(room) {
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
function runSettlement(room) {
  const day = room.day;
  pushLog(room, `\u2500\u2500 \u7B2C ${day} \u5929\u7D50\u7B97\u958B\u59CB \u2500\u2500`);
  const votes = {};
  for (const p of room.players) {
    const action = room.actions[p.id];
    if (!action) continue;
    votes[p.id] = action.voteFloor;
    if (action.teleportTo) {
      p.room = action.teleportTo;
      pushLog(room, `\u{1F300} ${p.name} \u7D93\u50B3\u9001\u5BA4\u50B3\u9001\u5230 ${ROOM_MAP[action.teleportTo]?.name}`);
    } else if (action.path.length > 0) {
      p.room = action.path[action.path.length - 1];
    }
    const pathText = action.path.length > 0 ? action.path.join(" \u2192 ") : "\uFF08\u505C\u7559\uFF09";
    pushLog(room, `\u{1F6B6} ${p.name} \u79FB\u52D5\uFF1A${pathText}\uFF0C\u7D42\u9EDE ${ROOM_MAP[p.room]?.name}`);
  }
  for (const p of room.players) {
    const action = room.actions[p.id];
    if (action?.detoxRoom && p.alive && p.room === "B101") {
      room.detoxedRooms.push(action.detoxRoom);
      pushLog(room, `\u{1F6E1}\uFE0F ${p.name} \u5728\u63A7\u5236\u5BA4\u89E3\u6BD2\u4E86 ${ROOM_MAP[action.detoxRoom]?.name}`);
    }
  }
  for (const p of room.players) {
    if (!p.alive) continue;
    const action = room.actions[p.id];
    if (!action) continue;
    const passedLaser = action.path.some((id) => ROOM_MAP[id]?.kind === "laser");
    if (passedLaser) {
      pushLog(room, `\u{1F526} ${p.name} \u7D93\u904E\u6FC0\u5149\u5BA4\uFF0C\u627F\u53D7 1 \u9EDE\u50B7\u5BB3`);
      damage(room, p, 1, "\u88AB\u6FC0\u5149\u707C\u50B7");
    }
  }
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
        pushLog(room, `\u{1F392} ${p.name} \u5728\u505C\u5C4D\u9593\u64BF\u56DE ${take.map((it) => ITEM_NAMES[it.kind]).join("\u3001")}`);
      }
      room.lootedRooms.push(p.room);
      continue;
    }
    const loot = rollLoot(p.room);
    if (!loot) continue;
    room.lootedRooms.push(p.room);
    if (p.items.length >= p.carry) {
      pushLog(room, `\u{1F392} ${p.name} \u5728 ${def.name} \u627E\u5230 ${ITEM_NAMES[loot.kind]}\uFF0C\u4F46\u80CC\u5305\u5DF2\u6EFF\u7121\u6CD5\u64BF\u62FE`);
    } else {
      p.items.push(loot);
      pushLog(room, `\u{1F392} ${p.name} \u5728 ${def.name} \u641C\u522E\u5230 ${ITEM_NAMES[loot.kind]}`);
    }
  }
  resolveSurgery(room);
  resolveCombatAndShadows(room);
  resolvePoison(room, votes);
  resolveUpkeep(room);
  resolveRevive(room);
  for (const p of room.players) {
    pushLog(
      room,
      p.alive ? `\u2764\uFE0F ${p.name}\uFF1A${p.hp} \u8840\uFF0C\u4F4D\u65BC ${ROOM_MAP[p.room]?.name}` : `\u{1F47B} ${p.name}\uFF1A\u6697\u5F71\uFF08\u7D2F\u7A4D ${p.shadowHp} \u8840\uFF09\uFF0C\u4F4D\u65BC ${ROOM_MAP[p.room]?.name}`
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
    pushLog(room, `\u{1F3C6} \u904A\u6232\u7D50\u675F\uFF01\u51A0\u8ECD\uFF1A${top.join("\u3001")}\uFF08\u6700\u7D42\u751F\u547D ${room.ranking[0]?.finalHp}\uFF09`);
    return;
  }
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
  pushLog(room, `\u2500\u2500 \u7B2C ${room.day} \u5929\u958B\u59CB\uFF08\u81EA\u7531\u968E\u6BB5\uFF09\u2500\u2500`);
}
function useItem(room, playerId, itemId) {
  if (room.status !== "playing" || room.phase !== "free") return "\u53EA\u6709\u81EA\u7531\u968E\u6BB5\u53EF\u4EE5\u4F7F\u7528\u9053\u5177";
  const p = findPlayer(room, playerId);
  if (!p || !p.alive) return "\u627E\u4E0D\u5230\u73A9\u5BB6\u6216\u73A9\u5BB6\u5DF2\u662F\u6697\u5F71";
  const idx = p.items.findIndex((it) => it.id === itemId);
  if (idx < 0) return "\u80CC\u5305\u88E1\u6C92\u6709\u9019\u500B\u9053\u5177";
  const item = p.items[idx];
  if (item.kind === "medicine") {
    p.hp = Math.min(MAX_HP, p.hp + 2);
    p.items.splice(idx, 1);
    pushLog(room, `\u{1F48A} ${p.name} \u4F7F\u7528\u6025\u6551\u85E5\u7247\uFF0C\u56DE\u5FA9\u81F3 ${p.hp} \u8840`);
    return null;
  }
  if (item.kind === "wine") {
    p.hp = Math.min(MAX_HP, p.hp + 1);
    p.items.splice(idx, 1);
    pushLog(room, `\u{1F377} ${p.name} \u559D\u4E0B\u7F8E\u9152\uFF0C\u56DE\u5FA9\u81F3 ${p.hp} \u8840`);
    return null;
  }
  if (item.kind === "adrenaline") {
    p.speedBoost = 1;
    p.items.splice(idx, 1);
    pushLog(room, `\u{1F489} ${p.name} \u6CE8\u5C04\u814E\u4E0A\u817A\u7D20\uFF0C\u4ECA\u5929\u901F\u5EA6 +1`);
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
  const self = token ? room.players.find((p) => p.token === token) : void 0;
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
      items: self && self.id === p.id ? p.items : void 0,
      isSelf: self ? self.id === p.id : false
    })),
    submittedCount: Object.keys(room.actions).length,
    submittedPlayerIds: room.phase === "action" ? room.players.filter((p) => room.actions[p.id]).map((p) => p.id) : [],
    lootedRooms: room.lootedRooms,
    detoxedRooms: room.detoxedRooms,
    morgueCount: room.morgue.length,
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

// game-ai.ts
var AI_NAMES = ["\u963F\u9435", "\u5C0F\u591C", "\u8001\u83AB", "\u963F\u8475"];
function aiName(index) {
  return AI_NAMES[index % AI_NAMES.length];
}
function aiSetup(index) {
  const presets = [
    { might: 4, carry: 3, speed: 3 },
    { might: 6, carry: 2, speed: 2 },
    { might: 2, carry: 6, speed: 2 },
    { might: 3, carry: 2, speed: 5 }
  ];
  return presets[index % presets.length];
}
function aiSpawn(room) {
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
function bfsPath(from, to) {
  if (from === to) return [];
  const prev = /* @__PURE__ */ new Map();
  const queue = [from];
  const seen = /* @__PURE__ */ new Set([from]);
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const next of ADJACENCY[cur] ?? []) {
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
function roomKind(roomId) {
  return ROOM_MAP[roomId]?.kind ?? "empty";
}
function hasKind(player, kind) {
  return player.items.some((it) => it.kind === kind);
}
function aiTargetRoom(room, player) {
  const candidates = ROOMS.filter((r) => !room.lootedRooms.includes(r.id));
  const needWater = !hasKind(player, "water") && !hasKind(player, "supply");
  const needFood = !hasKind(player, "food") && !hasKind(player, "supply");
  const needWeapon = !player.items.some((it) => ["knife", "pistol", "rifle"].includes(it.kind));
  const score = (id) => {
    const kind = roomKind(id);
    if (kind === "water" && needWater) return 100;
    if (kind === "food" && needFood) return 100;
    if (kind === "weapons" && needWeapon) return 90;
    if (kind === "water" || kind === "food") return 60;
    if (kind === "weapons") return 50;
    if (kind === "empty" || kind === "stairs") return 30;
    return 0;
  };
  let best = null;
  let bestScore = -1;
  let bestDist = Infinity;
  for (const r of candidates) {
    const s = score(r.id);
    const d = bfsPath(player.room, r.id).length;
    if (s > bestScore || s === bestScore && d < bestDist) {
      best = r.id;
      bestScore = s;
      bestDist = d;
    }
  }
  return best ?? player.room;
}
function aiAction(room, player) {
  if (!player.alive) {
    const targets = room.players.filter((p) => p.alive);
    if (targets.length === 0) return { playerId: player.id, path: [], voteFloor: null };
    const coLocated = targets.some((p) => p.room === player.room);
    if (coLocated) return { playerId: player.id, path: [], voteFloor: null };
    const target2 = targets[0];
    return { playerId: player.id, path: [target2.room], voteFloor: null };
  }
  const speed = effectiveSpeed(player);
  const target = aiTargetRoom(room, player);
  let path = bfsPath(player.room, target).slice(0, speed);
  if (path.length === 0) {
    const neighbors = ADJACENCY[player.room] ?? [];
    if (neighbors.length > 0) path = [neighbors[0]];
  }
  const action = { playerId: player.id, path, voteFloor: aiVote(room, player) };
  if (path.some((id) => roomKind(id) === "teleport")) {
    const dest = ROOMS.find((r) => r.kind === "empty" && !room.lootedRooms.includes(r.id));
    if (dest) action.teleportTo = dest.id;
  }
  const finalRoom = action.teleportTo ?? (path.length > 0 ? path[path.length - 1] : player.room);
  if (finalRoom === "B101") action.detoxRoom = "B101";
  return action;
}
function aiVote(room, player) {
  const counts = { "2F": 0, "1F": 0, B1: 0 };
  for (const p of room.players) {
    if (!p.alive || p.id === player.id) continue;
    const floor = ROOM_MAP[p.room]?.floor;
    if (floor) counts[floor] += 1;
  }
  const myFloor = ROOM_MAP[player.room]?.floor;
  let best = myFloor === "2F" ? "1F" : "2F";
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
var ITEM_VALUE = {
  water: 1,
  food: 1,
  supply: 3,
  gold: 2,
  knife: 3,
  pistol: 4,
  rifle: 5,
  medicine: 3,
  wine: 1,
  adrenaline: 2
};
function aiAcceptTrade(receiveKind, giveKind) {
  return (ITEM_VALUE[receiveKind] ?? 0) > (ITEM_VALUE[giveKind] ?? 0);
}

// neon.ts
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

// store.ts
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

// handler.ts
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
      const med = p.items.find((it) => it.kind === "medicine");
      if (med) {
        p.items = p.items.filter((it) => it.id !== med.id);
        p.hp = Math.min(10, p.hp + 2);
        room.log.push({ day: room.day, text: `\u{1F48A} ${p.name} \u4F7F\u7528\u6025\u6551\u85E5\u7247\uFF0C\u56DE\u5FA9\u81F3 ${p.hp} \u8840` });
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
          setSetup(room, ai.id, setup.might, setup.carry, setup.speed, aiSpawn(room));
          aiIndex += 1;
        }
        room.status = "playing";
        room.day = 1;
        room.phase = "free";
        room.log.push({ day: 1, text: "\u2500\u2500 \u904A\u6232\u958B\u59CB\uFF01\u7B2C 1 \u5929\uFF08\u81EA\u7531\u968E\u6BB5\uFF09\u2500\u2500" });
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
        const action = {
          playerId: player.id,
          path: Array.isArray(body.path) ? body.path.map(String) : [],
          voteFloor: body.voteFloor ?? null,
          teleportTo: typeof body.teleportTo === "string" ? body.teleportTo : void 0,
          detoxRoom: typeof body.detoxRoom === "string" ? body.detoxRoom : void 0
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

// vercel-entry.ts
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

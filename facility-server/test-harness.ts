// 「封鎖設施求生」多人完整規則版的端到端 harness（本機驗證用，不部署）。
// 攔截 global fetch，用 in-memory 假 Neon 實作 handler 實際發出的
// SELECT／INSERT／UPDATE／DELETE 語意，跑完整遊戲流程並斷言。
// 執行：用 esbuild 打包本檔（見 README），再 node bundle。
//
// 確定性設計：人類兩名出生點與配點固定，AI 政策順序固定
// （第 1 隻槍手→B307、第 2 隻拾荒→B402），因此第 1、2 天的結算
// 結果可以精確斷言（毒氣投票、抽取、扣血）；第 3 天起用 BFS
// 走一步＋固定投 B7，跑到終局，只斷言終局結構不硬編號。

import { handleGamesRequest } from "./handler";
import { fetchRoom, insertRoom, updateRoom } from "./store";
import {
  neighborsOf,
  validatePath,
  type FloorId,
  type GameRoom,
  type Player,
} from "./game-engine";

// --- 假 Neon ---------------------------------------------------------------
interface FakeRow {
  code: string;
  state: Record<string, unknown>;
  version: number;
  updated_at: number;
}
const table = new Map<string, FakeRow>();
let tableExists = false;

function fakeResponse(rows: unknown[]) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ rows }),
  };
}

function installFakeNeon() {
  (globalThis as unknown as { fetch: unknown }).fetch = async (
    _url: string,
    opts: { body?: string },
  ) => {
    const { query, params } = JSON.parse(opts.body as string) as {
      query: string;
      params: unknown[];
    };
    if (!tableExists) {
      if (/CREATE TABLE/i.test(query)) {
        tableExists = true;
        return fakeResponse([]);
      }
      throw new Error('relation "facility_rooms" does not exist');
    }
    if (/SELECT/i.test(query)) {
      const row = table.get(String(params[0]));
      return fakeResponse(
        row ? [{ code: row.code, state: row.state, version: row.version }] : [],
      );
    }
    if (/INSERT/i.test(query)) {
      const code = String(params[0]);
      if (table.has(code)) return fakeResponse([]);
      table.set(code, {
        code,
        state: JSON.parse(String(params[1])) as Record<string, unknown>,
        version: 1,
        updated_at: Date.now(),
      });
      return fakeResponse([{ code }]);
    }
    if (/UPDATE/i.test(query)) {
      const code = String(params[0]);
      const row = table.get(code);
      if (!row || row.version !== Number(params[2])) return fakeResponse([]);
      row.state = JSON.parse(String(params[1])) as Record<string, unknown>;
      row.version += 1;
      row.updated_at = Date.now();
      return fakeResponse([{ version: row.version }]);
    }
    if (/DELETE/i.test(query)) {
      if (/updated_at/i.test(query)) {
        const cutoff = Date.now() - 12 * 60 * 60 * 1000;
        for (const [code, row] of table) {
          if (row.updated_at < cutoff) table.delete(code);
        }
      } else {
        table.delete(String(params[0]));
      }
      return fakeResponse([]);
    }
    throw new Error(`fake Neon: unhandled query: ${query.slice(0, 80)}`);
  };
}

// --- 小工具 ---------------------------------------------------------------
let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}`, extra ?? "");
  }
}

interface PlayerView {
  id: string;
  name: string;
  isAI: boolean;
  isHost: boolean;
  hp: number;
  alive: boolean;
  shadowHp: number;
  room: string;
  ready: boolean;
  hasSetup: boolean;
  itemCount: number;
  itemKinds: string[];
  helicopter: boolean;
}

interface RoomView {
  code: string;
  status: string;
  day: number;
  phase: string;
  players: PlayerView[];
  submittedCount: number;
  gassedFloors: string[];
  detoxedRooms: string[];
  poolCounts: Record<string, number>;
  airdropCount: number;
  lastGasTally: { floorId: string; votes: number; all: Record<string, number> } | null;
  log: { day: number; text: string }[];
  ranking: { playerId: string; finalHp: number; alive: boolean; rank: number }[];
  selfId: string | null;
}

async function call(
  method: string,
  path: string,
  body?: unknown,
  query = "",
) {
  const res = await handleGamesRequest(
    method,
    path,
    new URLSearchParams(query),
    body === undefined ? "" : JSON.stringify(body),
  );
  return res as { status: number; body: Record<string, unknown> };
}

function roomOf(res: { body: Record<string, unknown> }): RoomView {
  return res.body.room as unknown as RoomView;
}

function playerOf(view: RoomView, id: string): PlayerView {
  return view.players.find((p) => p.id === id) as PlayerView;
}

// --- 測試流程 ---------------------------------------------------------------
async function main() {
  installFakeNeon();

  // 0. 引擎單元檢查：傳送／繩索／停機坪路徑規則
  {
    const stub = (room: string, alive: boolean, kinds: string[], helicopter: boolean): Player =>
      ({
        room,
        alive,
        items: kinds.map((kind) => ({ id: `x-${kind}`, kind })),
        helicopter,
      }) as unknown as Player;
    const nbs = neighborsOf(stub("B403", true, [], false), "B403");
    check("engine: B403 可傳送到空房 103", nbs.includes("103"), nbs.slice(0, 8));
    check("engine: B403 不可直達資源房 101", !nbs.includes("101"));
    const noRope = stub("B101", true, [], false);
    check(
      "engine: 無繩索不能走垂直通道 B101→B201",
      validatePath(noRope, ["B201"]) !== null,
      validatePath(noRope, ["B201"]),
    );
    const withRope = stub("B101", true, ["rope"], false);
    check("engine: 有繩索可走垂直通道 B101→B201", validatePath(withRope, ["B201"]) === null);
    const flyer = stub("202", true, [], true);
    check(
      "engine: 停機坪飛行首步可到 H 房 101",
      neighborsOf(flyer, "202", { helipadFirstStep: true }).includes("101"),
    );
  }

  // 1. 兩者皆未設定 → 503
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_URL_NEON;
  let r = await call("POST", "/api/games/rooms", { name: "阿明" });
  check("no DATABASE_URL/NEON → 503", r.status === 503, r.status);

  // 1b. 只有 DATABASE_URL_NEON → fallback 生效，不再 503
  delete process.env.DATABASE_URL;
  process.env.DATABASE_URL_NEON =
    "postgresql://user:pass@fake-host.neon.tech/neondb?sslmode=require";
  r = await call("POST", "/api/games/rooms", { name: "阿明" });
  check("only DATABASE_URL_NEON → 201 (fallback)", r.status === 201, r.status);
  delete process.env.DATABASE_URL_NEON;
  process.env.DATABASE_URL =
    "postgresql://user:pass@fake-host.neon.tech/neondb?sslmode=require";

  // 2. 建房（同時驗證 lazy 建表：假 Neon 一開始 tableExists=false）
  r = await call("POST", "/api/games/rooms", { name: "阿明" });
  check("create → 201", r.status === 201, r.status);
  const code = r.body.code as string;
  const hostToken = r.body.token as string;
  const hostId = r.body.playerId as string;
  check("create returns code/token", !!code && !!hostToken && !!hostId);
  check("room starts in lobby", roomOf(r).status === "lobby");

  // 3. 加入＋錯誤路徑
  r = await call("POST", "/api/games/rooms/XXXXXX/join", { name: "路人" });
  check("join bad code → 404", r.status === 404, r.status);
  r = await call("POST", `/api/games/rooms/${code}/join`, { name: "小芬" });
  check("join → 201", r.status === 201, r.status);
  const guestToken = r.body.token as string;
  const guestId = r.body.playerId as string;

  // 4. 配點＋錯誤路徑（房主 103、客人 B103；AI 將是槍手 B307、拾荒 B402）
  r = await call("POST", `/api/games/rooms/${code}/setup`, {
    token: "bad-token",
    might: 4,
    carry: 3,
    speed: 3,
    spawn: "103",
  });
  check("setup bad token → 401", r.status === 401, r.status);
  r = await call("POST", `/api/games/rooms/${code}/setup`, {
    token: hostToken,
    might: 4,
    carry: 3,
    speed: 3,
    spawn: "103",
  });
  check("host setup → 200", r.status === 200, r.status);
  r = await call("POST", `/api/games/rooms/${code}/setup`, {
    token: guestToken,
    might: 3,
    carry: 4,
    speed: 3,
    spawn: "B103",
  });
  check("guest setup → 200", r.status === 200, r.status);
  r = await call("POST", `/api/games/rooms/${code}/setup`, {
    token: guestToken,
    might: 5,
    carry: 5,
    speed: 5,
    spawn: "B103",
  });
  check("setup sum != 10 → 400", r.status === 400, r.status);
  r = await call("POST", `/api/games/rooms/${code}/setup`, {
    token: guestToken,
    might: 4,
    carry: 3,
    speed: 3,
    spawn: "202",
  });
  check("setup non-spawn room → 400", r.status === 400, r.status);

  // 5. 開始（非房主 403；房主開始後 AI 補滿 4 人、AI 已 ready、物資池已建）
  r = await call("POST", `/api/games/rooms/${code}/start`, { token: guestToken });
  check("start by non-host → 403", r.status === 403, r.status);
  r = await call("POST", `/api/games/rooms/${code}/start`, { token: hostToken });
  const started = roomOf(r);
  check("start → 200 playing day1 free", r.status === 200 && started.status === "playing" && started.day === 1 && started.phase === "free", `${r.status} ${started.status} d${started.day} ${started.phase}`);
  check("AI filled to 4", started.players.length === 4, started.players.length);
  check("AI ready after start", started.players.filter((p) => p.isAI).every((p) => p.ready));
  check(
    "AI policy homes B307/B402",
    started.players.filter((p) => p.isAI).map((p) => p.room).sort().join(",") === "B307,B402",
    started.players.filter((p) => p.isAI).map((p) => p.room),
  );
  check("pools initialized (101=10, B107=8, B501=22)", started.poolCounts["101"] === 10 && started.poolCounts["B107"] === 8 && started.poolCounts["B501"] === 22, started.poolCounts);
  check("airdrop starts at 1", started.airdropCount === 1, started.airdropCount);
  check("public view hides tokens", !JSON.stringify(started).includes("tok_"));

  // 6. 加入已開始的遊戲 → 400；開始後配點 → 400
  r = await call("POST", `/api/games/rooms/${code}/join`, { name: "遲到" });
  check("join after start → 400", r.status === 400, r.status);
  r = await call("POST", `/api/games/rooms/${code}/setup`, {
    token: hostToken,
    might: 4,
    carry: 3,
    speed: 3,
    spawn: "103",
  });
  check("setup after start → 400", r.status === 400, r.status);

  // 7. 並行 ready：兩人同時按準備，兩次都 200、最終兩人都 ready（觸發 version 衝突重試）
  const [r1, r2] = await Promise.all([
    call("POST", `/api/games/rooms/${code}/ready`, { token: hostToken }),
    call("POST", `/api/games/rooms/${code}/ready`, { token: guestToken }),
  ]);
  check("concurrent ready both 200", r1.status === 200 && r2.status === 200, `${r1.status}/${r2.status}`);
  r = await call("GET", `/api/games/rooms/${code}`, undefined, `token=${hostToken}`);
  const afterReady = roomOf(r);
  check("after ready: action phase", afterReady.phase === "action", afterReady.phase);
  check("AI actions auto-submitted", afterReady.submittedCount >= 2, afterReady.submittedCount);

  // 8. 第 1 天行動：房主 103→104、客人 B103→B102；投票 2F／B1。
  //    AI 投票皆為 1F（2 票最高）→ 1F 中毒，房主在 104（1F）扣毒氣 1 血。
  r = await call("POST", `/api/games/rooms/${code}/action`, {
    token: guestToken,
    path: ["B102"],
    voteFloor: "2F",
  });
  check("guest action → 200", r.status === 200, r.status);
  r = await call("POST", `/api/games/rooms/${code}/action`, {
    token: guestToken,
    path: ["B102"],
    voteFloor: "2F",
  });
  check("duplicate action → 400", r.status === 400, r.status);
  r = await call("POST", `/api/games/rooms/${code}/action`, {
    token: hostToken,
    path: ["104"],
    voteFloor: "B1",
  });
  const settled1 = roomOf(r);
  check("after all actions: day 2 free", settled1.day === 2 && settled1.phase === "free", `d${settled1.day} ${settled1.phase}`);
  check("day1: 1F gassed", settled1.gassedFloors.includes("1F"), settled1.gassedFloors);
  check("day1: lastGasTally 1F with 2 votes", settled1.lastGasTally?.floorId === "1F" && settled1.lastGasTally?.votes === 2, settled1.lastGasTally);
  check("day1: host hp 9 (gas 1)", playerOf(settled1, hostId).hp === 9, playerOf(settled1, hostId).hp);
  check("day1: guest hp 10 (B1 safe)", playerOf(settled1, guestId).hp === 10, playerOf(settled1, guestId).hp);
  check("day1: settlement logged", settled1.log.length > 0);

  // 9. 自由階段錯誤路徑＋交易錯誤路徑
  r = await call("POST", `/api/games/rooms/${code}/use-item`, {
    token: hostToken,
    itemId: "it_nope",
  });
  check("use-item bogus → 400", r.status === 400, r.status);
  r = await call("POST", `/api/games/rooms/${code}/trade`, {
    token: hostToken,
    toId: "p_nope",
    offerItemId: "it_x",
    wantKind: "water",
  });
  check("trade bogus target → 400", r.status === 400, r.status);
  r = await call("POST", `/api/games/rooms/${code}/trade/respond`, {
    token: hostToken,
    tradeId: "tr_nope",
    accept: true,
  });
  check("trade respond bogus → 400", r.status === 400, r.status);

  // 10. 第 2 天：客人 B102→水塔 101（抽 4 水，池 10→6）；
  //     房主 104→停機坪 202（空投帶 1 張，戶外免毒）。
  //     客人：水塔在已中毒的 1F → 毒氣 2 血；上繳缺糧 → 1 血；10→7。
  //     空投：開局 1＋第 1 天結算後 1＝2，房主帶走 1，結算後再補 1 → 2。
  await call("POST", `/api/games/rooms/${code}/ready`, { token: hostToken });
  await call("POST", `/api/games/rooms/${code}/ready`, { token: guestToken });
  r = await call("POST", `/api/games/rooms/${code}/action`, {
    token: guestToken,
    path: ["101"],
    voteFloor: "B7",
  });
  check("day2 guest action → 200", r.status === 200, r.status);
  r = await call("POST", `/api/games/rooms/${code}/action`, {
    token: hostToken,
    path: ["202"],
    voteFloor: "B7",
  });
  const settled2 = roomOf(r);
  check("after day2: day 3 free", settled2.day === 3 && settled2.phase === "free", `d${settled2.day} ${settled2.phase}`);
  const guest2 = playerOf(settled2, guestId);
  check("day2: guest drew water (3 left after upkeep)", guest2.itemKinds.includes("water") && guest2.itemCount === 3, `${guest2.itemKinds} x${guest2.itemCount}`);
  check("day2: pool 101 10→6", settled2.poolCounts["101"] === 6, settled2.poolCounts["101"]);
  check("day2: guest hp 7 (gas 2 + upkeep 1)", guest2.hp === 7, guest2.hp);
  // 房主空投物若是水／糧／補給會在上繳被吃掉，故不斷言持有數，
  // 改斷言 log 有帶走紀錄（抽取一定會記 log，容量 3 一定帶得走）。
  check(
    "day2: host drew airdrop (log)",
    settled2.log.some((e) => e.text.includes("停機坪空投帶走")),
    settled2.log.slice(-8).map((e) => e.text),
  );
  check("day2: airdrop back to 2", settled2.airdropCount === 2, settled2.airdropCount);
  check("day2: B7 newly gassed", settled2.gassedFloors.includes("B7"), settled2.gassedFloors);

  // 11. GET 錯誤路徑＋token 隔離
  r = await call("GET", "/api/games/rooms/XXXXXX", undefined, "token=x");
  check("get bad code → 404", r.status === 404, r.status);
  r = await call("GET", `/api/games/rooms/${code}`, undefined, "token=wrong");
  check("get wrong token still 200, selfId null", r.status === 200 && (roomOf(r) as unknown as { selfId: unknown }).selfId === null, JSON.stringify(r.body).slice(0, 120));

  // 12. 過期房間：直接寫入一個 13 小時前的房間，GET 應 404 且列被刪除
  const oldRoom: GameRoom = {
    id: "room_old",
    code: "OLD123",
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
    createdAt: Date.now() - 13 * 60 * 60 * 1000,
  };
  await insertRoom(oldRoom);
  r = await call("GET", "/api/games/rooms/OLD123", undefined, "");
  check("expired room GET → 404", r.status === 404, r.status);
  const gone = await fetchRoom("OLD123");
  check("expired room row deleted", gone === null);

  // 12b. 樂觀鎖單元測試：同 version 並行寫入，恰好一個成功
  const stored = await fetchRoom(code);
  check("fetchRoom for lock test", stored !== null);
  if (stored) {
    const [w1, w2] = await Promise.all([
      updateRoom(stored.room, stored.version),
      updateRoom(stored.room, stored.version),
    ]);
    check("optimistic lock: exactly one writer wins", (w1 ? 1 : 0) + (w2 ? 1 : 0) === 1, `${w1}/${w2}`);
    const after = await fetchRoom(code);
    check("version bumped by exactly 1", after !== null && after.version === stored.version + 1, after?.version);
  }

  // 13. 跑滿全場：第 3 天起每回合人類走 BFS 第一步、投 B7（暗影停留），
  //     直到終局。驗證：終局、4 人排名、有人確實撿過物資。
  let guard = 0;
  let view: RoomView | null = null;
  while (guard++ < 40) {
    r = await call("GET", `/api/games/rooms/${code}`, undefined, `token=${hostToken}`);
    view = roomOf(r);
    if (view.status === "finished") break;
    if (view.phase === "free") {
      for (const human of [hostToken, guestToken]) {
        await call("POST", `/api/games/rooms/${code}/ready`, { token: human });
      }
      r = await call("GET", `/api/games/rooms/${code}`, undefined, `token=${hostToken}`);
      view = roomOf(r);
      if (view.status === "finished") break;
    }
    if (view.phase === "action") {
      for (const [token, pid] of [[hostToken, hostId], [guestToken, guestId]] as const) {
        const me = playerOf(view as RoomView, pid);
        const submitted = (view as RoomView).submittedCount;
        void submitted;
        const stub = {
          room: me.room,
          alive: me.alive,
          items: me.itemKinds.map((kind) => ({ id: `x-${kind}`, kind })),
          helicopter: me.helicopter,
        } as unknown as Player;
        const nbs = neighborsOf(stub, me.room, { helipadFirstStep: true });
        const path = me.alive ? (nbs.length > 0 ? [nbs[0] as string] : []) : [];
        const res = await call("POST", `/api/games/rooms/${code}/action`, {
          token,
          path,
          voteFloor: "B7" as FloorId,
        });
        if (res.status === 200) view = roomOf(res);
        // 400 = 已提交（lazyAdvance 提前結算等）或階段已變，直接以 GET 為準
      }
      r = await call("GET", `/api/games/rooms/${code}`, undefined, `token=${hostToken}`);
      view = roomOf(r);
    }
  }
  check("game finishes within guard", view !== null && view.status === "finished", view ? `${view.status} d${view.day} ${view.phase}` : "no view");
  if (view) {
    check("ranking has 4 entries", view.ranking.length === 4, view.ranking.length);
    check("ranking top rank is 1", view.ranking[0]?.rank === 1, view.ranking[0]);
    const allLog = view.log.map((e) => e.text).join("\n");
    check("someone looted something during the game", /撿到|帶走/.test(allLog), "(no loot lines in last 200 logs)");
    console.log("FINAL", JSON.stringify({ day: view.day, ranking: view.ranking }));
  }

  // 14. 房間碼即憑證：public view 不含他人 token（再確認一次，取自 GET）
  r = await call("GET", `/api/games/rooms/${code}`, undefined, `token=${hostToken}`);
  check("GET view hides tokens", !JSON.stringify(r.body.room).includes("tok_"));

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("HARNESS CRASH", e);
  process.exit(1);
});

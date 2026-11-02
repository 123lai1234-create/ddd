// 「封鎖設施求生」serverless 後端的端到端 harness（本機驗證用，不部署）。
// 攔截 global fetch，用 in-memory 假 Neon 實作 handler 實際發出的
// SELECT／INSERT／UPDATE／DELETE 語意，跑完整遊戲流程並斷言。
// 執行：先用 esbuild 打包（見 README），再 node bundle。

import { handleGamesRequest } from "./handler";
import { fetchRoom, insertRoom, updateRoom } from "./store";

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

interface RoomView {
  code: string;
  status: string;
  day: number;
  phase: string;
  players: {
    id: string;
    name: string;
    isAI: boolean;
    isHost: boolean;
    room: string;
    ready: boolean;
    hasSetup: boolean;
  }[];
  submittedCount: number;
  log: { day: number; text: string }[];
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

// --- 測試流程 ---------------------------------------------------------------
async function main() {
  installFakeNeon();

  // 1. 未設定 DATABASE_URL → 503
  delete process.env.DATABASE_URL;
  let r = await call("POST", "/api/games/rooms", { name: "阿明" });
  check("no DATABASE_URL → 503", r.status === 503, r.status);
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

  // 4. 配點＋錯誤路徑
  r = await call("POST", `/api/games/rooms/${code}/setup`, {
    token: "bad-token",
    might: 4,
    carry: 3,
    speed: 3,
    spawn: "201",
  });
  check("setup bad token → 401", r.status === 401, r.status);
  r = await call("POST", `/api/games/rooms/${code}/setup`, {
    token: hostToken,
    might: 4,
    carry: 3,
    speed: 3,
    spawn: "201",
  });
  check("host setup → 200", r.status === 200, r.status);
  r = await call("POST", `/api/games/rooms/${code}/setup`, {
    token: guestToken,
    might: 3,
    carry: 4,
    speed: 3,
    spawn: "205",
  });
  check("guest setup → 200", r.status === 200, r.status);
  r = await call("POST", `/api/games/rooms/${code}/setup`, {
    token: guestToken,
    might: 5,
    carry: 5,
    speed: 5,
    spawn: "205",
  });
  check("setup sum != 10 → 400", r.status === 400, r.status);

  // 5. 開始（非房主 403；房主開始後 AI 補滿 4 人、AI 已 ready）
  r = await call("POST", `/api/games/rooms/${code}/start`, { token: guestToken });
  check("start by non-host → 403", r.status === 403, r.status);
  r = await call("POST", `/api/games/rooms/${code}/start`, { token: hostToken });
  const started = roomOf(r);
  check("start → 200 playing day1 free", r.status === 200 && started.status === "playing" && started.day === 1 && started.phase === "free", `${r.status} ${started.status} d${started.day} ${started.phase}`);
  check("AI filled to 4", started.players.length === 4, started.players.length);
  check("AI ready after start", started.players.filter((p) => p.isAI).every((p) => p.ready));
  check("public view hides tokens", !JSON.stringify(started).includes("tok_"));

  // 6. 加入已開始的遊戲 → 400；開始後配點 → 400
  r = await call("POST", `/api/games/rooms/${code}/join`, { name: "遲到" });
  check("join after start → 400", r.status === 400, r.status);
  r = await call("POST", `/api/games/rooms/${code}/setup`, {
    token: hostToken,
    might: 4,
    carry: 3,
    speed: 3,
    spawn: "201",
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

  // 8. 行動：重複提交 400；兩人提交後結算進第 2 天
  r = await call("POST", `/api/games/rooms/${code}/action`, {
    token: guestToken,
    path: ["204"],
    voteFloor: "2F",
  });
  check("guest action → 200", r.status === 200, r.status);
  r = await call("POST", `/api/games/rooms/${code}/action`, {
    token: guestToken,
    path: ["204"],
    voteFloor: "2F",
  });
  check("duplicate action → 400", r.status === 400, r.status);
  r = await call("POST", `/api/games/rooms/${code}/action`, {
    token: hostToken,
    path: ["202"],
    voteFloor: "B1",
  });
  const settled = roomOf(r);
  check("after all actions: day 2 free", settled.day === 2 && settled.phase === "free", `d${settled.day} ${settled.phase}`);
  check("settlement logged", settled.log.length > 0);

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

  // 10. GET 錯誤路徑＋token 隔離
  r = await call("GET", "/api/games/rooms/XXXXXX", undefined, "token=x");
  check("get bad code → 404", r.status === 404, r.status);
  r = await call("GET", `/api/games/rooms/${code}`, undefined, "token=wrong");
  check("get wrong token still 200, selfId null", r.status === 200 && (roomOf(r) as unknown as { selfId: unknown }).selfId === null, JSON.stringify(r.body).slice(0, 120));

  // 11. 過期房間：直接寫入一個 13 小時前的房間，GET 應 404 且列被刪除
  const oldRoom = {
    id: "room_old",
    code: "OLD123",
    status: "lobby",
    day: 0,
    phase: "free",
    players: [],
    actions: {},
    lootedRooms: [],
    detoxedRooms: [],
    morgue: [],
    log: [],
    trades: [],
    ranking: [],
    createdAt: Date.now() - 13 * 60 * 60 * 1000,
  };
  await insertRoom(oldRoom as never);
  r = await call("GET", "/api/games/rooms/OLD123", undefined, "");
  check("expired room GET → 404", r.status === 404, r.status);
  const gone = await fetchRoom("OLD123");
  check("expired room row deleted", gone === null);

  // 11b. 樂觀鎖單元測試：同 version 並行寫入，恰好一個成功
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

  // 12. 房間碼即憑證：public view 不含他人 token（再確認一次，取自 GET）
  r = await call("GET", `/api/games/rooms/${code}`, undefined, `token=${hostToken}`);
  check("GET view hides tokens", !JSON.stringify(r.body.room).includes("tok_"));

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("HARNESS CRASH", e);
  process.exit(1);
});

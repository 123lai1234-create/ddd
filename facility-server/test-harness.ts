// 「封鎖設施求生」多人完整規則版的端到端 harness（本機驗證用，不部署）。
// 攔截 global fetch，用 in-memory 假 Neon 實作 handler 實際發出的
// SELECT／INSERT／UPDATE／DELETE 語意，跑完整遊戲流程並斷言。
// 執行：用 esbuild 打包本檔（見 README），再 node bundle。
//
// 確定性設計：人類兩名出生點與配點固定，AI 政策順序固定
// （6 隻 AI：槍手→B307、拾荒→B402、醫者→B303、遊俠→B603、
// 槍手→103、拾荒→B103，後兩隻為出生點循環共用），因此第 1、2 天
// 的結算結果可以精確斷言（毒氣投票、落地戰鬥、扣血、選留）；
// 第 3 天起用 BFS 走一步＋固定投 B7，跑到終局，只斷言終局結構
// 不硬編號。另有專項房：垃圾場選留＋逾時、大倉庫選留、金條挑選、
// 8 名真人房（金條房用 patchRoom 直接佈置確定性狀態）。

import { adjustReputation } from "./accounts";
import { handleGamesRequest } from "./handler";
import { fetchRoom, insertRoom, updateRoom } from "./store";
import {
  neighborsOf,
  validatePath,
  type FloorId,
  type GameRoom,
  type ItemKind,
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

// 假 Google 端點模式（harness 第 25 節切換）：ok 換 token 成功、
// tokenFail 換 token 失敗、userinfoFail 取 userinfo 失敗。
export let googleTestMode: "ok" | "tokenFail" | "userinfoFail" = "ok";

function installFakeNeon() {
  // 假 Neon：除 facility_rooms 外，另支援 facility_accounts /
  // facility_sessions / facility_records / facility_oauth_states
  // （accounts.ts 實際發出的語意）。各表一開始皆不存在，
  // CREATE TABLE 後才可用（lazy 建表測試用）。
  const accountsById = new Map<string, Record<string, unknown>>();
  const sessions = new Map<string, string>();
  const records = new Map<string, Record<string, unknown>>();
  const oauthStates = new Map<string, number>();
  const existingTables = new Set<string>();
  const tableOf = (query: string): string | null => {
    const m =
      query.match(/CREATE TABLE IF NOT EXISTS (\w+)/i) ||
      query.match(/FROM (\w+)/i) ||
      query.match(/INTO (\w+)/i) ||
      query.match(/UPDATE (\w+)/i);
    return m ? (m[1] as string) : null;
  };
  (globalThis as unknown as { fetch: unknown }).fetch = async (
    _url: string,
    opts: { body?: string; headers?: Record<string, string> },
  ) => {
    // 假 Google 端點（非 Neon）：handler 的 token／userinfo fetch 走這裡，
    // 絕不真的打 Google。端點由 GOOGLE_TOKEN_ENDPOINT／
    // GOOGLE_USERINFO_ENDPOINT 環境變數注入（測試用 google-test.invalid）。
    if (String(_url).startsWith("https://google-test.invalid")) {
      const googleResponse = (ok: boolean, status: number, payload: unknown) => ({
        ok,
        status,
        text: async () => JSON.stringify(payload),
        json: async () => payload,
      });
      if (String(_url).endsWith("/token")) {
        if (googleTestMode === "tokenFail") {
          return googleResponse(false, 400, { error: "invalid_grant" });
        }
        return googleResponse(true, 200, { access_token: "fake-google-access", token_type: "Bearer" });
      }
      if (String(_url).endsWith("/userinfo")) {
        if (googleTestMode === "userinfoFail") {
          return googleResponse(false, 401, { error: "invalid_token" });
        }
        return googleResponse(true, 200, { email: "google-test@example.com", name: "Google測試" });
      }
      return googleResponse(false, 404, { error: "not_found" });
    }
    const { query, params } = JSON.parse(opts.body as string) as {
      query: string;
      params: unknown[];
    };
    const tbl = tableOf(query);
    if (/CREATE TABLE/i.test(query)) {
      if (tbl) existingTables.add(tbl);
      if (tbl === "facility_rooms") tableExists = true;
      return fakeResponse([]);
    }
    if (tbl && !existingTables.has(tbl)) {
      throw new Error(`relation "${tbl}" does not exist`);
    }
    if (tbl === "facility_accounts") {
      if (/SELECT/i.test(query)) {
        if (/WHERE display_name/i.test(query)) {
          const row = [...accountsById.values()].find((r) => r.display_name === params[0]);
          return fakeResponse(row ? [row] : []);
        }
        if (/WHERE email/i.test(query)) {
          const row = [...accountsById.values()].find((r) => r.email === params[0]);
          return fakeResponse(row ? [row] : []);
        }
        const row = accountsById.get(String(params[0]));
        return fakeResponse(row ? [row] : []);
      }
      if (/INSERT/i.test(query)) {
        const id = String(params[0]);
        if (accountsById.has(id)) return fakeResponse([]);
        accountsById.set(id, {
          id,
          display_name: params[1],
          kind: params[2],
          password_hash: params[3],
          recovery_hash: params[4],
          email: params[5] ?? null,
          reputation: params[6],
          cooldown_until: params[7],
          created_at: params[8],
        });
        return fakeResponse([{ id }]);
      }
      if (/UPDATE/i.test(query)) {
        const row = accountsById.get(String(params[0]));
        if (row) {
          row.reputation = params[1];
          row.cooldown_until = params[2];
        }
        return fakeResponse([]);
      }
      throw new Error(`fake Neon accounts: unhandled query: ${query.slice(0, 80)}`);
    }
    if (tbl === "facility_sessions") {
      if (/SELECT/i.test(query)) {
        const accountId = sessions.get(String(params[0]));
        return fakeResponse(accountId ? [{ token_hash: params[0], account_id: accountId }] : []);
      }
      if (/INSERT/i.test(query)) {
        const hash = String(params[0]);
        if (!sessions.has(hash)) sessions.set(hash, String(params[1]));
        return fakeResponse([{ token_hash: hash }]);
      }
      if (/DELETE/i.test(query)) {
        sessions.delete(String(params[0]));
        return fakeResponse([]);
      }
      throw new Error(`fake Neon sessions: unhandled query: ${query.slice(0, 80)}`);
    }
    if (tbl === "facility_oauth_states") {
      if (/SELECT/i.test(query)) {
        const createdAt = oauthStates.get(String(params[0]));
        return fakeResponse(createdAt === undefined ? [] : [{ state: params[0], created_at: createdAt }]);
      }
      if (/INSERT/i.test(query)) {
        oauthStates.set(String(params[0]), Number(params[1]));
        return fakeResponse([]);
      }
      if (/DELETE/i.test(query)) {
        if (/created_at/i.test(query)) {
          const cutoff = Number(params[0]);
          for (const [s, t] of oauthStates) if (t < cutoff) oauthStates.delete(s);
        } else {
          oauthStates.delete(String(params[0]));
        }
        return fakeResponse([]);
      }
      throw new Error(`fake Neon oauth_states: unhandled query: ${query.slice(0, 80)}`);
    }
    if (tbl === "facility_records") {
      if (/SELECT/i.test(query)) {
        const row = records.get(String(params[0]));
        return fakeResponse(row ? [row] : []);
      }
      if (/INSERT/i.test(query)) {
        const accountId = String(params[0]);
        if (records.has(accountId)) return fakeResponse([]);
        records.set(accountId, {
          account_id: accountId,
          games: params[1],
          wins: params[2],
          losses: params[3],
          best_final_hp: params[4],
          achievements: params[5],
        });
        return fakeResponse([{ account_id: accountId }]);
      }
      if (/UPDATE/i.test(query)) {
        const row = records.get(String(params[0]));
        if (row) {
          row.games = params[1];
          row.wins = params[2];
          row.losses = params[3];
          row.best_final_hp = params[4];
          row.achievements = params[5];
        }
        return fakeResponse([]);
      }
      throw new Error(`fake Neon records: unhandled query: ${query.slice(0, 80)}`);
    }
    if (!tableExists) {
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
  accountProfile?: {
    displayName: string;
    reputation: number;
    games: number;
    wins: number;
    losses: number;
    achievements: string[];
  } | null;
  isAI: boolean;
  isHost: boolean;
  might: number;
  carry: number;
  speed: number;
  hp: number;
  alive: boolean;
  shadowHp: number;
  room: string;
  ready: boolean;
  hasSetup: boolean;
  itemCount: number;
  itemKinds: string[];
  items?: { id: string; kind: string }[];
  helicopter: boolean;
}

interface PendingDrawView {
  roomId: string;
  options: { index: number; kind: string; forced: boolean; junk: boolean }[];
  rules: { maxNonJunk: number | null; maxTotal: number | null };
  airdrop: boolean;
  keepDeadline: number | null;
}

interface RoomView {
  code: string;
  status: string;
  day: number;
  phase: string;
  roomType?: string;
  spectators?: { id: string; name: string }[];
  isSpectator?: boolean;
  selfSpectatorId?: string | null;
  players: PlayerView[];
  submittedCount: number;
  submittedPlayerIds: string[];
  settlementOrder: { playerId: string; name: string; card: number }[];
  pendingDrawPlayerIds: string[];
  pendingDraw: PendingDrawView | null;
  goldOptions: string[];
  gassedFloors: string[];
  detoxedRooms: string[];
  poolCounts: Record<string, number>;
  airdropCount: number;
  discardCount: number;
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
  return res as { status: number; body: Record<string, unknown>; headers?: Record<string, string> };
}

/** 轉址回應的 Location（headers 優先，body.redirect 備援）。 */
function redirectOf(res: { headers?: Record<string, string>; body: Record<string, unknown> }): string {
  return res.headers?.Location ?? (res.body.redirect as string) ?? "";
}

function roomOf(res: { body: Record<string, unknown> }): RoomView {
  return res.body.room as unknown as RoomView;
}

function playerOf(view: RoomView, id: string): PlayerView {
  return view.players.find((p) => p.id === id) as PlayerView;
}

/**
 * 對 keep 階段的人類玩家算出一組合法選留（貪心：抽到順序、容量與
 * 上限內全選），再 POST /keep。回傳 keep 回應的房間視圖。
 */
async function keepValid(code: string, token: string): Promise<RoomView> {
  const cur = roomOf(await call("GET", `/api/games/rooms/${code}`, undefined, `token=${token}`));
  const pd = cur.pendingDraw;
  if (!pd) return cur;
  const me = cur.players.find((p) => p.id === cur.selfId) as PlayerView;
  let budget = me.carry - me.itemCount;
  if (budget >= 1 && me.itemKinds.includes("dimension_pocket")) budget = Infinity;
  const keep: number[] = [];
  let nonForced = 0;
  let nonJunk = 0;
  for (const o of pd.options) {
    if (o.forced) continue;
    if (pd.rules.maxTotal !== null && nonForced >= pd.rules.maxTotal) continue;
    if (pd.rules.maxNonJunk !== null && !o.junk && nonJunk >= pd.rules.maxNonJunk) continue;
    if (nonForced >= budget) continue;
    keep.push(o.index);
    nonForced += 1;
    if (!o.junk) nonJunk += 1;
  }
  const res = await call("POST", `/api/games/rooms/${code}/keep`, { token, keepIndexes: keep });
  check("keep valid → 200", res.status === 200, res.status);
  return roomOf(res);
}

/** 直接改假 Neon 裡的房間狀態（金條測試等需要確定性佈置時用）。 */
async function patchRoom(code: string, fn: (room: GameRoom) => void): Promise<boolean> {
  const stored = await fetchRoom(code);
  if (!stored) return false;
  fn(stored.room);
  return updateRoom(stored.room, stored.version);
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

  // 5. 開始（非房主 403；房主開始後 AI 補滿 8 人、AI 已 ready、物資池已建）
  r = await call("POST", `/api/games/rooms/${code}/start`, { token: guestToken });
  check("start by non-host → 403", r.status === 403, r.status);
  r = await call("POST", `/api/games/rooms/${code}/start`, { token: hostToken });
  const started = roomOf(r);
  check("start → 200 playing day1 free", r.status === 200 && started.status === "playing" && started.day === 1 && started.phase === "free", `${r.status} ${started.status} d${started.day} ${started.phase}`);
  check("AI filled to 8", started.players.length === 8, started.players.length);
  check("AI ready after start", started.players.filter((p) => p.isAI).every((p) => p.ready));
  check("AI names unique", new Set(started.players.filter((p) => p.isAI).map((p) => p.name)).size === 6, started.players.filter((p) => p.isAI).map((p) => p.name));
  check(
    "AI spawns: policy homes + least-occupied cycle (6 spawns, 6 AI)",
    started.players.filter((p) => p.isAI).map((p) => p.room).sort().join(",") === "103,B103,B303,B307,B402,B603",
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
  check("AI actions auto-submitted", afterReady.submittedCount >= 6, afterReady.submittedCount);
  check(
    "settlement order: 8 players, cards 1..8",
    afterReady.settlementOrder.length === 8 &&
      afterReady.settlementOrder.map((o) => o.card).sort((a, b) => a - b).join(",") === "1,2,3,4,5,6,7,8",
    afterReady.settlementOrder,
  );
  check(
    "order logged at action phase start",
    afterReady.log.some((e) => e.text.includes("行動順序")),
    afterReady.log.slice(-3).map((e) => e.text),
  );

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
  // 8 人時第 5 隻 AI 循環出生點也落在 103，開局落地戰鬥房主先扣 1 血；
  // AI 投票受終點樓層 -0.5 懲罰，其中一票由 B1 轉向 B3，故 1F 得 4 票。
  check("day1: lastGasTally 1F with 4 votes", settled1.lastGasTally?.floorId === "1F" && settled1.lastGasTally?.votes === 4, settled1.lastGasTally);
  check("day1: host hp 8 (spawn fight 1 + gas 1)", playerOf(settled1, hostId).hp === 8, playerOf(settled1, hostId).hp);
  check("day1: guest hp 10 (B1 safe)", playerOf(settled1, guestId).hp === 10, playerOf(settled1, guestId).hp);
  check("day1: settlement logged", settled1.log.length > 0);
  {
    // 行動順序：步驟 0 的移動 log 順序須與 settlementOrder 一致。
    const orderNames = settled1.settlementOrder.map((o) => o.name);
    const moveNames = settled1.log
      .filter((e) => e.day === 1 && e.text.startsWith("🚶"))
      .map((e) => e.text.replace(/^🚶 /, "").split(" 移動")[0] as string);
    check("day1: movement logs follow settlement order", JSON.stringify(moveNames) === JSON.stringify(orderNames), { orderNames, moveNames });
  }

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

  // 10. 第 2 天：客人 B102→B201 空房（無抽取）；房主 104→停機坪 202
  //     （攤開空投 → keep 階段，超量先被拒、再選留 1 張 → 結算跑完）。
  //     客人：B201 在 B2 未中毒，無毒氣；上繳缺水缺糧 → 2 血；10→8。
  //     房主空投物若是水／糧／補給會在上繳被吃掉，故不斷言持有數，
  //     改斷言 log 有帶走紀錄。空投數不斷言精確值（AI 也可能停 202）。
  await call("POST", `/api/games/rooms/${code}/ready`, { token: hostToken });
  await call("POST", `/api/games/rooms/${code}/ready`, { token: guestToken });
  r = await call("POST", `/api/games/rooms/${code}/action`, {
    token: guestToken,
    path: ["B201"],
    voteFloor: "B7",
  });
  check("day2 guest action → 200", r.status === 200, r.status);
  r = await call("POST", `/api/games/rooms/${code}/action`, {
    token: hostToken,
    path: ["202"],
    voteFloor: "B7",
  });
  const keepPhase = roomOf(r);
  check("day2: after all actions → keep phase (host airdrop pending)", keepPhase.phase === "keep" && keepPhase.pendingDrawPlayerIds.includes(hostId), `${keepPhase.phase} ${keepPhase.pendingDrawPlayerIds}`);
  r = await call("GET", `/api/games/rooms/${code}`, undefined, `token=${hostToken}`);
  const hostPending = roomOf(r);
  check("day2: host pendingDraw is airdrop", hostPending.pendingDraw !== null && hostPending.pendingDraw.airdrop === true, hostPending.pendingDraw);
  r = await call("POST", `/api/games/rooms/${code}/keep`, {
    token: hostToken,
    keepIndexes: [0, 1],
  });
  check("day2: keep over-limit (airdrop max 1 / index range) → 400", r.status === 400, r.status);
  r = await call("POST", `/api/games/rooms/${code}/keep`, {
    token: hostToken,
    keepIndexes: [0],
  });
  const settled2 = roomOf(r);
  check("day2: keep [0] → 200 and day 3 free", r.status === 200 && settled2.day === 3 && settled2.phase === "free", `${r.status} d${settled2.day} ${settled2.phase}`);
  const guest2 = playerOf(settled2, guestId);
  check("day2: guest hp 8 (upkeep 2, no gas)", guest2.hp === 8, guest2.hp);
  check(
    "day2: host kept airdrop (log)",
    settled2.log.some((e) => e.day === 2 && e.text.includes("帶走")),
    settled2.log.filter((e) => e.day === 2).map((e) => e.text),
  );
  check("day2: airdrop still present (>= 1)", settled2.airdropCount >= 1, settled2.airdropCount);

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
    pendingDraws: {},
    keepDeadline: null,
    settlementOrder: [],
    adrenalineAtSettlementStart: [],
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
  //     直到終局。驗證：終局、8 人排名、有人確實撿過物資。
  //     keep 階段出現時，兩名人類各用合法貪心選留解掉。
  let guard = 0;
  let view: RoomView | null = null;
  while (guard++ < 60) {
    r = await call("GET", `/api/games/rooms/${code}`, undefined, `token=${hostToken}`);
    view = roomOf(r);
    if (view.status === "finished") break;
    if (view.phase === "keep") {
      for (const humanToken of [hostToken, guestToken]) {
        const cur = roomOf(await call("GET", `/api/games/rooms/${code}`, undefined, `token=${humanToken}`));
        if (cur.phase === "keep" && cur.pendingDraw) {
          await keepValid(code, humanToken);
        }
      }
      r = await call("GET", `/api/games/rooms/${code}`, undefined, `token=${hostToken}`);
      view = roomOf(r);
      if (view.status === "finished") break;
    }
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
    check("ranking has 8 entries", view.ranking.length === 8, view.ranking.length);
    check("ranking top rank is 1", view.ranking[0]?.rank === 1, view.ranking[0]);
    const allLog = view.log.map((e) => e.text).join("\n");
    check("someone looted something during the game", /撿到|帶走/.test(allLog), "(no loot lines in last 200 logs)");
    console.log("FINAL", JSON.stringify({ day: view.day, ranking: view.ranking }));
  }

  // 14. 房間碼即憑證：public view 不含他人 token（再確認一次，取自 GET）
  r = await call("GET", `/api/games/rooms/${code}`, undefined, `token=${hostToken}`);
  check("GET view hides tokens", !JSON.stringify(r.body.room).includes("tok_"));

  // 15. 垃圾場選留＋逾時自動保留：人類出生 B402、負重 1，第 1 天走進
  //     B503 攤開 5 張。逾時（把 keepDeadline 改到過去再輪詢）後，
  //     強制垃圾全帶走、非垃圾最多留 1 件（負重 1）。
  r = await call("POST", "/api/games/rooms", { name: "阿保" });
  const codeKeep = r.body.code as string;
  const keepToken = r.body.token as string;
  const keepId = r.body.playerId as string;
  await call("POST", `/api/games/rooms/${codeKeep}/setup`, { token: keepToken, might: 6, carry: 1, speed: 3, spawn: "B402" });
  r = await call("POST", `/api/games/rooms/${codeKeep}/start`, { token: keepToken });
  check("keep-room start → 8 players", roomOf(r).players.length === 8, roomOf(r).players.length);
  await call("POST", `/api/games/rooms/${codeKeep}/ready`, { token: keepToken });
  r = await call("POST", `/api/games/rooms/${codeKeep}/action`, { token: keepToken, path: ["B503"], voteFloor: "B7" });
  const keepPhase2 = roomOf(r);
  check("keep-room: day1 → keep phase", keepPhase2.phase === "keep", keepPhase2.phase);
  r = await call("GET", `/api/games/rooms/${codeKeep}`, undefined, `token=${keepToken}`);
  const keepPending = roomOf(r).pendingDraw as PendingDrawView;
  check("keep-room: pending is B503, 5 options", keepPending !== null && keepPending.roomId === "B503" && keepPending.options.length === 5, keepPending);
  const forcedCount = keepPending.options.filter((o) => o.forced).length;
  const nonForcedIdx = keepPending.options.filter((o) => !o.forced).map((o) => o.index);
  if (nonForcedIdx.length >= 2) {
    r = await call("POST", `/api/games/rooms/${codeKeep}/keep`, { token: keepToken, keepIndexes: nonForcedIdx.slice(0, 2) });
    check("keep-room: over capacity (carry 1, keep 2) → 400", r.status === 400, r.status);
    // 400 回應沒有 room 欄位，另用 GET 確認 pending 還在（可重選）。
    r = await call("GET", `/api/games/rooms/${codeKeep}`, undefined, `token=${keepToken}`);
    check("keep-room: rejected keep leaves pending intact", roomOf(r).pendingDraw !== null, roomOf(r).pendingDraw);
  } else {
    check("keep-room: draw too junky for capacity over-limit branch (airdrop test covers it)", true, nonForcedIdx);
  }
  const patched = await patchRoom(codeKeep, (room) => {
    room.keepDeadline = Date.now() - 1000;
  });
  check("keep-room: deadline patched to past", patched);
  r = await call("GET", `/api/games/rooms/${codeKeep}`, undefined, `token=${keepToken}`);
  const afterTimeout = roomOf(r);
  check("keep-room: timeout → day 2 free", afterTimeout.day === 2 && afterTimeout.phase === "free", `d${afterTimeout.day} ${afterTimeout.phase}`);
  const keeper = playerOf(afterTimeout, keepId);
  check("keep-room: timeout kept all forced junk", keeper.itemKinds.filter((k) => k === "junk").length === forcedCount, `${keeper.itemKinds} forced=${forcedCount}`);
  check("keep-room: timeout kept at most 1 non-junk (carry 1)", keeper.itemKinds.filter((k) => k !== "junk").length <= 1, keeper.itemKinds);
  check("keep-room: timeout logged", afterTimeout.log.some((e) => e.text.includes("選留逾時")), afterTimeout.log.filter((e) => e.day === 1).map((e) => e.text));

  // 16. 大倉庫選留：人類出生 B402、負重 1，第 1 天走 B402→B503→B502→B501
  //     攤開 3 張（無垃圾、無強制）。選全部 3 張 → 400（負重 1）；
  //     選第 1 張 → 200，背包恰好多該種 1 張，另 2 張進棄置堆。
  r = await call("POST", "/api/games/rooms", { name: "阿倉" });
  const codeStore = r.body.code as string;
  const storeToken = r.body.token as string;
  const storeId = r.body.playerId as string;
  await call("POST", `/api/games/rooms/${codeStore}/setup`, { token: storeToken, might: 6, carry: 1, speed: 3, spawn: "B402" });
  await call("POST", `/api/games/rooms/${codeStore}/start`, { token: storeToken });
  await call("POST", `/api/games/rooms/${codeStore}/ready`, { token: storeToken });
  r = await call("POST", `/api/games/rooms/${codeStore}/action`, { token: storeToken, path: ["B503", "B502", "B501"], voteFloor: "B7" });
  check("store-room: day1 → keep phase", roomOf(r).phase === "keep", roomOf(r).phase);
  r = await call("GET", `/api/games/rooms/${codeStore}`, undefined, `token=${storeToken}`);
  const storePending = roomOf(r).pendingDraw as PendingDrawView;
  check("store-room: pending is B501, 3 options, no forced", storePending !== null && storePending.roomId === "B501" && storePending.options.length === 3 && storePending.options.every((o) => !o.forced), storePending);
  r = await call("POST", `/api/games/rooms/${codeStore}/keep`, { token: storeToken, keepIndexes: [0, 1, 2] });
  check("store-room: keep all 3 over carry 1 → 400", r.status === 400, r.status);
  const firstKind = storePending.options[0]?.kind as string;
  r = await call("POST", `/api/games/rooms/${codeStore}/keep`, { token: storeToken, keepIndexes: [0] });
  const storeSettled = roomOf(r);
  check("store-room: keep [0] → 200 day 2 free", r.status === 200 && storeSettled.day === 2 && storeSettled.phase === "free", `${r.status} d${storeSettled.day} ${storeSettled.phase}`);
  const storer = playerOf(storeSettled, storeId);
  check("store-room: kept exactly the selected kind", storer.itemKinds.length === 1 && storer.itemKinds[0] === firstKind, storer.itemKinds);
  check("store-room: other 2 discarded", storeSettled.discardCount >= 2, storeSettled.discardCount);

  // 17. 金條攤開挑選（確定性佈置：直接改假 Neon 房間狀態）：
  //     不能挑金條、只剩金條空手（金條不扣）、挑中（金條扣 1、得物 1）、垃圾場禁用。
  r = await call("POST", "/api/games/rooms", { name: "阿金" });
  const codeGold = r.body.code as string;
  const goldToken = r.body.token as string;
  const goldId = r.body.playerId as string;
  await call("POST", `/api/games/rooms/${codeGold}/setup`, { token: goldToken, might: 4, carry: 3, speed: 3, spawn: "B103" });
  await call("POST", `/api/games/rooms/${codeGold}/start`, { token: goldToken });
  const giveGoldAt = async (roomId: string, pool: { kind: ItemKind }[]) => {
    await patchRoom(codeGold, (room) => {
      const me = room.players.find((p) => p.id === goldId) as Player;
      me.items = [{ id: "it-gold-1", kind: "gold_bar" }];
      me.room = roomId;
      room.pools[roomId] = pool.map((x, i) => ({ id: `it-pool-${i}`, kind: x.kind }));
    });
  };
  await giveGoldAt("B206", [{ kind: "gold_bar" }, { kind: "gold_bar" }]);
  r = await call("POST", `/api/games/rooms/${codeGold}/gold-pick`, { token: goldToken, kind: "gold_bar" });
  check("gold: pick gold_bar → 400", r.status === 400, r.status);
  r = await call("POST", `/api/games/rooms/${codeGold}/gold-pick`, { token: goldToken, kind: "water" });
  check("gold: pool only gold, pick water → 400 (empty-handed)", r.status === 400, r.status);
  r = await call("GET", `/api/games/rooms/${codeGold}`, undefined, `token=${goldToken}`);
  check("gold: gold not spent after failed picks", playerOf(roomOf(r), goldId).itemKinds.join(",") === "gold_bar", playerOf(roomOf(r), goldId).itemKinds);
  await giveGoldAt("B206", [{ kind: "water" }, { kind: "gold_bar" }]);
  r = await call("POST", `/api/games/rooms/${codeGold}/gold-pick`, { token: goldToken, kind: "water" });
  check("gold: pick water → 200", r.status === 200, r.status);
  r = await call("GET", `/api/games/rooms/${codeGold}`, undefined, `token=${goldToken}`);
  const goldView = roomOf(r);
  check("gold: gold spent, water gained", playerOf(goldView, goldId).itemKinds.join(",") === "water", playerOf(goldView, goldId).itemKinds);
  check("gold: pool left with the gold only", goldView.poolCounts["B206"] === 1, goldView.poolCounts["B206"]);
  await giveGoldAt("B503", [{ kind: "knife" }]);
  r = await call("POST", `/api/games/rooms/${codeGold}/gold-pick`, { token: goldToken, kind: "knife" });
  check("gold: junkyard disabled → 400", r.status === 400, r.status);

  // 18. 8 名真人房：房主＋7 名加入＝8 人，第 9 名被拒；開局無 AI。
  r = await call("POST", "/api/games/rooms", { name: "房主8" });
  const code8 = r.body.code as string;
  const host8Token = r.body.token as string;
  for (let i = 1; i <= 7; i++) {
    r = await call("POST", `/api/games/rooms/${code8}/join`, { name: `隊員${i}` });
    check(`8-human room: join ${i} → 201`, r.status === 201, r.status);
  }
  r = await call("POST", `/api/games/rooms/${code8}/join`, { name: "第九人" });
  check("8-human room: 9th join → 400 full (8)", r.status === 400, r.status);
  r = await call("POST", `/api/games/rooms/${code8}/start`, { token: host8Token });
  const started8 = roomOf(r);
  check("8-human room: start → 8 players, 0 AI", started8.players.length === 8 && started8.players.every((p) => !p.isAI), `${started8.players.length} players, AI=${started8.players.filter((p) => p.isAI).length}`);

  // 19. 帳號服務：註冊（恢復碼只回傳一次、me 不洩雜湊）、重複名稱、
  //     密碼登入錯誤／正確、恢復碼登入、訪客帳號、Google 待接 501。
  r = await call("POST", "/api/games/accounts/register", { displayName: "阿哲", password: "pw1234" });
  check("account register → 201 with recoveryCode once", r.status === 201 && typeof r.body.recoveryCode === "string" && (r.body.recoveryCode as string).length > 0, r.status);
  const acctToken = r.body.token as string;
  const acctId = (r.body.account as { id: string }).id;
  const acctRecovery = r.body.recoveryCode as string;
  check("account register: default reputation 100", (r.body.account as { reputation: number }).reputation === 100, r.body.account);
  r = await call("POST", "/api/games/accounts/register", { displayName: "阿哲", password: "pw1234" });
  check("account duplicate name → 409", r.status === 409, r.status);
  r = await call("GET", "/api/games/accounts/me", undefined, `accountToken=${acctToken}`);
  check("account me → 200, no hashes or recovery code leaked", r.status === 200 && !JSON.stringify(r.body).includes("password_hash") && !JSON.stringify(r.body).includes("recovery_hash") && !JSON.stringify(r.body).includes(acctRecovery), JSON.stringify(r.body).slice(0, 200));
  r = await call("POST", "/api/games/accounts/login", { displayName: "阿哲", password: "wrong" });
  check("account login wrong password → 401", r.status === 401, r.status);
  r = await call("POST", "/api/games/accounts/login", { displayName: "阿哲", password: "pw1234" });
  check("account login correct → 200 new token", r.status === 200 && typeof r.body.token === "string" && r.body.token !== acctToken, r.status);
  const loginToken = r.body.token as string;
  r = await call("POST", "/api/games/accounts/recover", { displayName: "阿哲", recoveryCode: "WRONG-CODE-0000" });
  check("account recover wrong code → 401", r.status === 401, r.status);
  r = await call("POST", "/api/games/accounts/recover", { displayName: "阿哲", recoveryCode: acctRecovery });
  check("account recover correct → 200", r.status === 200 && typeof r.body.token === "string", r.status);
  r = await call("POST", "/api/games/accounts/guest", { displayName: "訪客甲" });
  check("account guest → 201 with recoveryCode", r.status === 201 && typeof r.body.recoveryCode === "string", r.status);
  const guestAcctToken = r.body.token as string;
  const guestAcctId = (r.body.account as { id: string }).id;
  r = await call("GET", "/api/games/accounts/google", undefined, "");
  check("account google → 501 pending (no fake credential)", r.status === 501, r.status);
  r = await call("GET", "/api/games/accounts/me", undefined, "accountToken=stale-token");
  check("account me stale token → 401 with guest path hint", r.status === 401 && JSON.stringify(r.body).includes("訪客"), r.body);

  // 20. 信譽門檻：競技房需 90、娛樂房需 80；扣到 85 時競技被拒、
  //     娛樂可進；扣到 75 時娛樂也被拒（adjustReputation 佈置門檻）。
  r = await call("POST", "/api/games/rooms", { name: "阿哲", accountToken: loginToken, roomType: "ranked" });
  check("ranked create rep 100 → 201", r.status === 201 && roomOf(r).roomType === "ranked", r.status);
  const codeRanked = r.body.code as string;
  await adjustReputation(acctId, -15, null);
  r = await call("POST", "/api/games/rooms", { name: "阿哲", accountToken: loginToken, roomType: "ranked" });
  check("ranked create rep 85 → 403", r.status === 403, r.status);
  r = await call("POST", "/api/games/rooms", { name: "阿哲", accountToken: loginToken, roomType: "casual" });
  check("casual create rep 85 → 201", r.status === 201, r.status);
  const codeCasual85 = r.body.code as string;
  void codeCasual85;
  r = await call("POST", `/api/games/rooms/${codeRanked}/join`, { name: "阿哲", accountToken: loginToken });
  check("ranked join rep 85 → 403", r.status === 403, r.status);
  await adjustReputation(acctId, -10, null);
  r = await call("POST", "/api/games/rooms", { name: "阿哲", accountToken: loginToken, roomType: "casual" });
  check("casual create rep 75 → 403", r.status === 403, r.status);
  await adjustReputation(acctId, 25, null);
  r = await call("POST", "/api/games/rooms", { name: "阿哲", accountToken: loginToken, roomType: "casual" });
  check("casual create rep restored 100 → 201", r.status === 201, r.status);

  // 21. 觀戰：只讀輪詢、行動被拒、不佔玩家名額。
  r = await call("POST", "/api/games/rooms", { name: "房主觀" });
  const codeSpec = r.body.code as string;
  const specHostToken = r.body.token as string;
  r = await call("POST", `/api/games/rooms/${codeSpec}/spectate`, { name: "觀眾甲" });
  check("spectate → 201", r.status === 201, r.status);
  const specToken = r.body.token as string;
  r = await call("GET", `/api/games/rooms/${codeSpec}`, undefined, `token=${specToken}`);
  check("spectate GET → 200 read-only view", r.status === 200 && (roomOf(r).isSpectator === true) && (roomOf(r).spectators?.length ?? 0) === 1 && roomOf(r).players.length === 1, JSON.stringify(roomOf(r).spectators));
  r = await call("POST", `/api/games/rooms/${codeSpec}/setup`, { token: specToken, might: 4, carry: 3, speed: 3, spawn: "103" });
  check("spectate setup → 403", r.status === 403, r.status);
  r = await call("POST", `/api/games/rooms/${codeSpec}/start`, { token: specToken });
  check("spectate start → 403", r.status === 403, r.status);
  r = await call("POST", `/api/games/rooms/${codeSpec}/quit`, { token: specToken });
  check("spectate quit leaves (200, spectators 0)", r.status === 200 && (roomOf(r).spectators?.length ?? -1) === 0, roomOf(r).spectators);
  void specHostToken;

  // 22. 棄權與冷卻：對局中棄權改 AI 託管、扣 10 分、第一位棄權者冷卻；
  //     第二位棄權者扣分但無冷卻；大廳棄權不扣分。
  r = await call("POST", "/api/games/rooms", { name: "棄權房主", accountToken: loginToken });
  const codeQuit = r.body.code as string;
  const quitHostToken = r.body.token as string;
  const quitHostId = r.body.playerId as string;
  r = await call("POST", `/api/games/rooms/${codeQuit}/join`, { name: "訪客甲", accountToken: guestAcctToken });
  const quitGuestToken = r.body.token as string;
  await call("POST", `/api/games/rooms/${codeQuit}/setup`, { token: quitHostToken, might: 4, carry: 3, speed: 3, spawn: "103" });
  await call("POST", `/api/games/rooms/${codeQuit}/setup`, { token: quitGuestToken, might: 4, carry: 3, speed: 3, spawn: "B103" });
  r = await call("POST", `/api/games/rooms/${codeQuit}/start`, { token: quitHostToken });
  check("quit-room start → playing", roomOf(r).status === "playing", roomOf(r).status);
  r = await call("POST", `/api/games/rooms/${codeQuit}/quit`, { token: quitHostToken });
  const quitView = roomOf(r);
  check("quit playing → 200, quitter becomes AI", r.status === 200 && (quitView.players.find((p) => p.id === quitHostId)?.isAI === true), quitView.players.find((p) => p.id === quitHostId));
  r = await call("GET", "/api/games/accounts/me", undefined, `accountToken=${loginToken}`);
  check("quit: first quitter rep 100 → 90, cooldown set", (r.body.account as { reputation: number }).reputation === 90 && (r.body.account as { cooldownUntil: number }).cooldownUntil > Date.now(), r.body.account);
  r = await call("POST", "/api/games/rooms", { name: "阿哲", accountToken: loginToken });
  check("quit: cooled-down account cannot create → 403", r.status === 403, r.status);
  r = await call("POST", `/api/games/rooms/${codeQuit}/quit`, { token: quitGuestToken });
  check("quit: second quitter → 200", r.status === 200, r.status);
  r = await call("GET", "/api/games/accounts/me", undefined, `accountToken=${guestAcctToken}`);
  check("quit: second quitter rep 100 → 90, no cooldown", (r.body.account as { reputation: number }).reputation === 90 && (r.body.account as { cooldownUntil: number }).cooldownUntil <= Date.now(), r.body.account);
  // 大廳棄權不扣分：用已冷卻帳號以外的訪客帳號新開大廳房再 quit。
  r = await call("POST", "/api/games/accounts/guest", { displayName: "訪客乙" });
  const guestBToken = r.body.token as string;
  const guestBRoomToken = (await call("POST", "/api/games/rooms", { name: "訪客乙", accountToken: guestBToken })).body.token as string;
  const guestBCode = (await call("GET", "/api/games/accounts/me", undefined, `accountToken=${guestBToken}`)).body as unknown;
  void guestBCode;
  // 取房間碼：直接用上一支建房回應的 code（重取一次以免變數混淆）
  r = await call("POST", "/api/games/rooms", { name: "訪客乙", accountToken: guestBToken });
  const lobbyCode = r.body.code as string;
  const lobbyToken = r.body.token as string;
  void guestBRoomToken;
  r = await call("POST", `/api/games/rooms/${lobbyCode}/quit`, { token: lobbyToken });
  check("quit lobby → 200 leaves room", r.status === 200 && roomOf(r).players.length === 0, roomOf(r).players.length);
  r = await call("GET", "/api/games/accounts/me", undefined, `accountToken=${guestBToken}`);
  check("quit lobby: no reputation penalty", (r.body.account as { reputation: number }).reputation === 100, r.body.account);

  // 23. 戰績寫入與公開顯示＋舊 token 相容：
  //     把一間帳號房直接佈置成終局（ranking 房主第 1），GET 觸發提交後
  //     寫入戰績；下一次 GET 的同房公開檔案應顯示 games=1、wins=1。
  //     同時驗證：無帳號舊流程建房／加入／配點仍 201／200（不 401 死路），
  //     帶過期 accountToken 建房也 201 並附 accountNote。
  r = await call("POST", "/api/games/rooms", { name: "戰績房主", accountToken: guestBToken });
  const codeRec = r.body.code as string;
  const recHostToken = r.body.token as string;
  const recHostId = r.body.playerId as string;
  await call("POST", `/api/games/rooms/${codeRec}/setup`, { token: recHostToken, might: 4, carry: 3, speed: 3, spawn: "103" });
  await call("POST", `/api/games/rooms/${codeRec}/start`, { token: recHostToken });
  const recPatched = await patchRoom(codeRec, (room) => {
    room.status = "finished";
    room.ranking = room.players.map((p, i) => ({
      playerId: p.id,
      finalHp: p.id === recHostId ? 9 : 5,
      might: p.might,
      alive: true,
      rank: p.id === recHostId ? 1 : 2,
    }));
    room.recordsWritten = false;
  });
  check("record-room: patched to finished", recPatched);
  await call("GET", `/api/games/rooms/${codeRec}`, undefined, `token=${recHostToken}`);
  r = await call("GET", "/api/games/accounts/me", undefined, `accountToken=${guestBToken}`);
  check("record: games 1, wins 1, champion+finisher+survivor", (r.body.record as { games: number; wins: number; achievements: string[] }).games === 1 && (r.body.record as { wins: number }).wins === 1 && (r.body.record as { achievements: string[] }).achievements.includes("champion") && (r.body.record as { achievements: string[] }).achievements.includes("finisher"), r.body.record);
  r = await call("GET", `/api/games/rooms/${codeRec}`, undefined, `token=${recHostToken}`);
  const recProfile = roomOf(r).players.find((p) => p.id === recHostId)?.accountProfile;
  check("record: in-room public profile shows games=1 wins=1", recProfile?.games === 1 && recProfile?.wins === 1, recProfile);
  r = await call("GET", `/api/games/rooms/${codeRec}`, undefined, `token=${recHostToken}`);
  check("record: room view leaks no hashes/tokens", !JSON.stringify(r.body.room).includes("tok_") && !JSON.stringify(r.body.room).includes("recovery_hash") && !JSON.stringify(r.body.room).includes("password_hash"));
  r = await call("POST", "/api/games/rooms", { name: "舊版玩家" });
  check("legacy: create without account → 201", r.status === 201, r.status);
  const legacyCode = r.body.code as string;
  const legacyToken = r.body.token as string;
  r = await call("POST", `/api/games/rooms/${legacyCode}/join`, { name: "舊版二號" });
  check("legacy: join without account → 201", r.status === 201, r.status);
  r = await call("POST", `/api/games/rooms/${legacyCode}/setup`, { token: legacyToken, might: 4, carry: 3, speed: 3, spawn: "103" });
  check("legacy: old room token setup → 200 (not 401 dead end)", r.status === 200, r.status);
  r = await call("POST", "/api/games/rooms", { name: "過期登入者", accountToken: "stale-token" });
  check("legacy: stale accountToken create → 201 with accountNote", r.status === 201 && typeof r.body.accountNote === "string", `${r.status} ${JSON.stringify(r.body.accountNote)}`);

  // 24. 多次逾時託管：帳號玩家 keep 逾時第 2 次 → 改 AI、扣 5 分。
  r = await call("POST", "/api/games/accounts/guest", { displayName: "逾時客" });
  const toAcctToken = r.body.token as string;
  const toAcctId = (r.body.account as { id: string }).id;
  r = await call("POST", "/api/games/rooms", { name: "逾時客", accountToken: toAcctToken });
  const codeTo = r.body.code as string;
  const toToken = r.body.token as string;
  const toId = r.body.playerId as string;
  await call("POST", `/api/games/rooms/${codeTo}/setup`, { token: toToken, might: 6, carry: 1, speed: 3, spawn: "B402" });
  await call("POST", `/api/games/rooms/${codeTo}/start`, { token: toToken });
  await call("POST", `/api/games/rooms/${codeTo}/ready`, { token: toToken });
  r = await call("POST", `/api/games/rooms/${codeTo}/action`, { token: toToken, path: ["B503"], voteFloor: "B7" });
  check("timeout-room: day1 → keep phase", roomOf(r).phase === "keep", roomOf(r).phase);
  const toPatched = await patchRoom(codeTo, (room) => {
    room.keepDeadline = Date.now() - 1000;
    room.timeoutStrikes[toId] = 1;
  });
  check("timeout-room: strikes preset to 1, deadline past", toPatched);
  r = await call("GET", `/api/games/rooms/${codeTo}`, undefined, `token=${toToken}`);
  const toView = roomOf(r);
  // 全員皆 AI 後，惰性推進會連續跑完下一天結算（既有全 AI 自動推進），
  // 故只斷言已離開 keep 階段、進入自由階段且玩家已託管，不硬編 day=2。
  check("timeout-room: 2nd timeout → free phase, player now AI", toView.day >= 2 && toView.phase === "free" && toView.players.find((p) => p.id === toId)?.isAI === true, `d${toView.day} ${toView.phase} isAI=${toView.players.find((p) => p.id === toId)?.isAI}`);
  r = await call("GET", "/api/games/accounts/me", undefined, `accountToken=${toAcctToken}`);
  check("timeout-room: rep 100 → 95", (r.body.account as { reputation: number }).reputation === 95, r.body.account);
  void toAcctId;

  // 25. Google OAuth（授權碼流程，假端點注入，不真的打 Google）：
  //     未設憑證 501 → 起始轉址含 state → 拒絕／錯誤 state／過期 state
  //     被拒 → 換 token 失敗被拒 → 成功建帳號＋session（新帳號帶恢復碼）
  //     → 同一 email 第二次登入是同一帳號且不重發恢復碼。
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  r = await call("GET", "/api/games/accounts/google");
  check("google: no credential → 501", r.status === 501, r.status);
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.GOOGLE_TOKEN_ENDPOINT = "https://google-test.invalid/token";
  process.env.GOOGLE_USERINFO_ENDPOINT = "https://google-test.invalid/userinfo";
  googleTestMode = "ok";
  r = await call("GET", "/api/games/accounts/google");
  const googleStartLoc = redirectOf(r);
  check(
    "google: start → 302 to accounts.google.com with client_id + state",
    r.status === 302 && googleStartLoc.includes("accounts.google.com/o/oauth2/v2/auth") && googleStartLoc.includes("client_id=test-client-id") && googleStartLoc.includes("state="),
    googleStartLoc,
  );
  const googleState = new URL(googleStartLoc).searchParams.get("state") ?? "";
  check("google: start state present", googleState.length >= 32, googleState.length);
  r = await call("GET", "/api/games/accounts/google/callback", undefined, "error=access_denied&state=" + googleState);
  check("google: denied → redirect google_error=denied", r.status === 302 && redirectOf(r).includes("google_error=denied"), redirectOf(r));
  r = await call("GET", "/api/games/accounts/google/callback", undefined, "code=fake&state=not-a-real-state");
  check("google: bad state → redirect google_error=invalid", r.status === 302 && redirectOf(r).includes("google_error=invalid"), redirectOf(r));
  // 過期 state：TTL 設為 -1，讓剛建的 state 立刻過期。
  process.env.GOOGLE_OAUTH_STATE_TTL_MS = "-1";
  r = await call("GET", "/api/games/accounts/google");
  const expiredState = new URL(redirectOf(r)).searchParams.get("state") ?? "";
  r = await call("GET", "/api/games/accounts/google/callback", undefined, `code=fake&state=${expiredState}`);
  check("google: expired state → redirect google_error=expired", r.status === 302 && redirectOf(r).includes("google_error=expired"), redirectOf(r));
  delete process.env.GOOGLE_OAUTH_STATE_TTL_MS;
  // 換 token 失敗：state 已消耗，callback 應回 token_failed（不建帳號）。
  r = await call("GET", "/api/games/accounts/google");
  const failState = new URL(redirectOf(r)).searchParams.get("state") ?? "";
  googleTestMode = "tokenFail";
  r = await call("GET", "/api/games/accounts/google/callback", undefined, `code=fake&state=${failState}`);
  check("google: token fail → redirect google_error=token_failed", r.status === 302 && redirectOf(r).includes("google_error=token_failed"), redirectOf(r));
  googleTestMode = "ok";
  // 成功：新帳號（帶恢復碼參數）＋ session token 可用。
  r = await call("GET", "/api/games/accounts/google");
  const okState = new URL(redirectOf(r)).searchParams.get("state") ?? "";
  r = await call("GET", "/api/games/accounts/google/callback", undefined, `code=fake&state=${okState}`);
  const googleBack = redirectOf(r);
  const googleToken = new URL(googleBack, "https://example.invalid").searchParams.get("accountToken") ?? "";
  check(
    "google: callback ok → redirect with accountToken + recoveryCode (new account)",
    r.status === 302 && googleBack.startsWith("/facility-survival?") && googleToken.startsWith("acct_") && googleBack.includes("googleRecoveryCode="),
    googleBack.replace(/accountToken=[^&]*/, "accountToken=…").replace(/googleRecoveryCode=[^&]*/, "googleRecoveryCode=…"),
  );
  r = await call("GET", "/api/games/accounts/me", undefined, `accountToken=${googleToken}`);
  const googleAccountId = (r.body.account as { id: string }).id;
  check(
    "google: me → named account, rep 100, no hashes leaked",
    r.status === 200 && (r.body.account as { kind: string }).kind === "named" && (r.body.account as { reputation: number }).reputation === 100 && !JSON.stringify(r.body).includes("password_hash"),
    r.body.account,
  );
  // 同一 email 第二次：同一帳號、不重發恢復碼。
  r = await call("GET", "/api/games/accounts/google");
  const okState2 = new URL(redirectOf(r)).searchParams.get("state") ?? "";
  r = await call("GET", "/api/games/accounts/google/callback", undefined, `code=fake&state=${okState2}`);
  const googleBack2 = redirectOf(r);
  const googleToken2 = new URL(googleBack2, "https://example.invalid").searchParams.get("accountToken") ?? "";
  check(
    "google: second login same email → no recoveryCode param",
    r.status === 302 && googleToken2.startsWith("acct_") && !googleBack2.includes("googleRecoveryCode="),
    googleBack2.replace(/accountToken=[^&]*/, "accountToken=…"),
  );
  r = await call("GET", "/api/games/accounts/me", undefined, `accountToken=${googleToken2}`);
  check("google: second login → same account id", (r.body.account as { id: string }).id === googleAccountId, r.body.account);
  // state 用完即刪：同一 state 再用一次應為 invalid。
  r = await call("GET", "/api/games/accounts/google/callback", undefined, `code=fake&state=${okState2}`);
  check("google: reused state → redirect google_error=invalid", r.status === 302 && redirectOf(r).includes("google_error=invalid"), redirectOf(r));
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_TOKEN_ENDPOINT;
  delete process.env.GOOGLE_USERINFO_ENDPOINT;

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("HARNESS CRASH", e);
  process.exit(1);
});

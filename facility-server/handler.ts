// 「封鎖設施求生」serverless 後端：Express 版 routes/games.ts 的完整移植。
//
// API 介面與 Express 版完全相同（路徑、請求欄位、回應 shape、房間碼＋
// 玩家 token 驗證、狀態碼與錯誤訊息），前端零修改即可對接。
// 差別只在房間儲存：in-memory Map → Neon（見 store.ts），以及
// 每次請求先惰性推進（見 lazyAdvance）——serverless 沒有計時器，
// 所有原本由請求觸發的 AI 動作都必須在請求內完成。

import {
  GOOGLE_AUTH_URL,
  QUIT_COOLDOWN_MS,
  QUIT_REPUTATION_PENALTY,
  TIMEOUT_REPUTATION_PENALTY,
  TIMEOUT_STRIKES_TO_HANDOVER,
  adjustReputation,
  consumeOAuthState,
  createAccount,
  createOAuthState,
  gateError,
  getPublicProfile,
  googleClientId,
  googleClientSecret,
  googleConfigured,
  googleRedirectUri,
  googleTokenUrl,
  googleUserinfoUrl,
  loginByPassword,
  loginByRecovery,
  loginOrCreateGoogleAccount,
  logoutSession,
  publicAccount,
  recordGameResult,
  resolveSession,
  type Account,
  type RoomType,
} from "./accounts";
import {
  ACTION_TIMEOUT_MS,
  MAX_PLAYERS,
  addPlayer,
  autoKeep,
  autoResolvePendingKeeps,
  createRoom,
  ensureRoomShape,
  findPlayer,
  generateSettlementOrder,
  initGameState,
  publicView,
  resolveCombatAndShadows,
  resolveKeep,
  runSettlementPhase0,
  runSettlementRest,
  setSetup,
  spendGoldPick,
  useItem,
  proposeTrade,
  respondTrade,
  validateAction,
  type DayAction,
  type FloorId,
  newId,
  type GameRoom,
  type ItemKind,
  type SettlementJudge,
} from "./game-engine";
import {
  aiAcceptTrade,
  aiAction,
  aiGoldChoice,
  aiName,
  aiSetup,
  aiSpawn,
} from "./game-ai";
import { neonConfigured } from "./neon";
import { fetchRoom, insertRoom, listPublicRooms, sweepExpired, updateRoom } from "./store";

export interface GamesResponse {
  status: number;
  body: unknown;
  /** 轉址用（Google OAuth）：vercel-entry 會寫 Location header 而非 JSON。 */
  headers?: Record<string, string>;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().slice(0, 12) : "";
  return name || "無名玩家";
}

function err(status: number, message: string): GamesResponse {
  return { status, body: { error: message } };
}

/** 302 轉址（Google OAuth 起始／callback 回遊戲頁；body 也帶 redirect 供測試讀取）。 */
function redirectTo(location: string): GamesResponse {
  return { status: 302, headers: { Location: location }, body: { redirect: location } };
}

/** Google 登入失敗回遊戲頁的錯誤碼（前端對照成中文訊息，見 FacilityGame.tsx）。 */
function googleErrorRedirect(code: string): GamesResponse {
  return redirectTo(`/facility-survival?google_error=${encodeURIComponent(code)}`);
}

function playerFromToken(
  room: GameRoom,
  token: unknown,
): GameRoom["players"][number] | undefined {
  if (typeof token !== "string") return undefined;
  return room.players.find((p) => p.token === token);
}

function sendRoom(room: GameRoom, token?: string): GamesResponse {
  return { status: 200, body: { room: publicView(room, token) } };
}

function spectatorFromToken(room: GameRoom, token: unknown) {
  if (typeof token !== "string") return undefined;
  return (room.spectators ?? []).find((sp) => sp.token === token);
}

/** 觀戰視圖：publicView（自己不是玩家，故不含任何玩家背包）＋觀戰標記。 */
function spectatorView(room: GameRoom, spectatorId: string): GamesResponse {
  return {
    status: 200,
    body: {
      room: { ...publicView(room), isSpectator: true, selfSpectatorId: spectatorId },
    },
  };
}

/**
 * 匿名相容（見 README「舊版相容」）：舊版前端／舊 token 只有房間 token、
 * 沒有帳號。建房／加入時若帶了 accountToken 但 session 已失效（過期、
 * 登出、舊版），不要直接 401 死掉：改以未登入身分繼續，並在回應附
 * accountNote 指引重新登入（訪客亦可）以保留戰績。房間 token 本身的
 * 行動流程完全不動，舊 token 繼續可用。
 */
async function resolveAccountFromBody(
  body: Record<string, unknown>,
): Promise<{ account: Account | null; staleToken: boolean }> {
  const tok = typeof body.accountToken === "string" ? body.accountToken : undefined;
  if (!tok) return { account: null, staleToken: false };
  try {
    const account = await resolveSession(tok);
    return { account, staleToken: account === null };
  } catch {
    return { account: null, staleToken: true };
  }
}

function accountNote(staleToken: boolean): string | undefined {
  return staleToken
    ? "舊登入已過期，已以未登入身分繼續；重新登入（訪客帳號亦可）才能累積戰績與信譽"
    : undefined;
}

/** 每次請求刷新同房玩家的公開檔案快照（只含公開欄位；查不到就留空）。 */
async function enrichProfiles(room: GameRoom): Promise<void> {
  const ids = [...new Set(room.players.filter((p) => p.accountId).map((p) => p.accountId as string))];
  for (const id of ids) {
    try {
      const prof = await getPublicProfile(id);
      if (!prof) continue;
      for (const p of room.players.filter((x) => x.accountId === id)) {
        p.accountProfile = {
          displayName: prof.account.displayName,
          reputation: prof.account.reputation,
          games: prof.record.games,
          wins: prof.record.wins,
          losses: prof.record.losses,
          achievements: prof.record.achievements,
        };
      }
    } catch {
      // 檔案查不到不擋遊戲流程（公開視圖留 null）。
    }
  }
}

/**
 * 提交後工作（房間寫回成功後才跑，避免樂觀鎖重試重複扣分／重複寫戰績）：
 * 棄權／逾時懲罰寫帳號表、終局戰績寫入。任一步失敗都不擋遊戲回應，
 * 但 recordsWritten 已寫入房間故不會重試（見 README 簡化說明）。
 */
async function postCommit(room: GameRoom, penalties: GameRoom["pendingPenalties"], finished: boolean): Promise<void> {
  for (const pen of penalties) {
    try {
      await adjustReputation(
        pen.accountId,
        pen.repDelta,
        pen.setCooldown ? Date.now() + QUIT_COOLDOWN_MS : null,
      );
    } catch {
      // 帳號表寫失敗不擋遊戲流程。
    }
  }
  if (!finished) return;
  for (const p of room.players) {
    if (p.isAI || !p.accountId) continue;
    const rank = room.ranking.find((r) => r.playerId === p.id);
    try {
      await recordGameResult(p.accountId, rank?.rank === 1, p.alive, rank?.finalHp ?? p.hp);
    } catch {
      // 同上。
    }
  }
}

/**
 * 結算內交易的裁判（引擎 resolveSettlementTrades 用）：AI 對象按
 * aiAcceptTrade 即判，人類對象回 null，轉成自由階段待回覆交易。
 */
const settlementJudge: SettlementJudge = (target, offerKind, wantKind) =>
  target.isAI ? aiAcceptTrade(wantKind, offerKind) : null;

// ---------------------------------------------------------------------------
// 惰性推進：與 Express 版相同的 AI 觸發點，但全部做成冪等，
// 讓每次請求都能安全地先跑一遍（serverless 沒有請求之間的記憶體狀態）。
// aiFreePhase 特別注意：只對尚未 ready 的 AI 用藥——Express 版只在
// 自由階段入口呼叫它（此時 AI ready 皆為 false），用 !ready 守衛就
// 能完全重現該語意，避免每次 GET 都重複消耗藥品。
// ---------------------------------------------------------------------------
function aiFreePhase(room: GameRoom): void {
  for (const p of room.players) {
    if (!p.isAI || !p.alive || p.ready) continue;
    if (p.hp <= 5) {
      const med = p.items.find((it) => it.kind === "pill");
      if (med) {
        p.items = p.items.filter((it) => it.id !== med.id);
        p.hp = Math.min(10, p.hp + 2);
        room.log.push({ day: room.day, text: `💊 ${p.name} 使用藥片，回復至 ${p.hp} 血` });
      }
    }
    // AI 金條：自由階段持有金條且當前房有可換物時換價值最高的一種
    // （與人類 gold-pick 同規則：不能挑金條、垃圾場禁用、無可換物不扣）。
    const goldKind = aiGoldChoice(room, p);
    if (goldKind) spendGoldPick(room, p.id, goldKind);
    p.ready = true;
  }
}

function autoAiActions(room: GameRoom): void {
  if (room.status !== "playing" || room.phase !== "action") return;
  for (const p of room.players) {
    if (!p.isAI || room.actions[p.id]) continue;
    room.actions[p.id] = aiAction(room, p);
  }
  maybeSettle(room);
}

function maybeSettle(room: GameRoom): void {
  if (room.status !== "playing" || room.phase !== "action") return;
  const allSubmitted = room.players.every((p) => room.actions[p.id]);
  if (!allSubmitted) return;
  runSettlementPhase0(room, settlementJudge);
  const phaseAfterSettlement: string = room.phase;
  if (room.status === "playing" && phaseAfterSettlement === "free") {
    aiFreePhase(room);
  }
}

/** keep 逾時（惰性檢查）：期限到就自動保留全部待選留，跑完後半段結算。 */
function maybeResolveKeepTimeout(room: GameRoom): void {
  if (room.status !== "playing" || room.phase !== "keep") return;
  if (room.keepDeadline === null || Date.now() < room.keepDeadline) return;
  // 多次逾時被 AI 託管：與行動逾時共用 timeoutStrikes（見 maybeResolveActionTimeout）。
  // 累積 2 次者改 AI 託管並扣 5 分，
  // 懲罰先進 pendingPenalties，房間寫回成功後才寫帳號表。
  for (const pid of Object.keys(room.pendingDraws)) {
    const p = room.players.find((x) => x.id === pid);
    if (!p || p.isAI) continue;
    room.timeoutStrikes[pid] = (room.timeoutStrikes[pid] ?? 0) + 1;
    if (room.timeoutStrikes[pid] >= TIMEOUT_STRIKES_TO_HANDOVER) {
      p.isAI = true;
      if (p.accountId) {
        room.pendingPenalties.push({ accountId: p.accountId, repDelta: TIMEOUT_REPUTATION_PENALTY, setCooldown: false });
      }
      room.log.push({ day: room.day, text: `🤖 ${p.name} 選留多次逾時，改由 AI 託管` });
    }
  }
  autoResolvePendingKeeps(room);
  runSettlementRest(room, settlementJudge);
  // room.phase 經 TS 收窄為 "keep"，先存成 string 再比對。
  const phaseAfterRest: string = room.phase;
  if (room.status === "playing" && phaseAfterRest === "free") {
    aiFreePhase(room);
  }
}

function maybeAdvanceToAction(room: GameRoom): void {
  if (room.status !== "playing" || room.phase !== "free") return;
  const allReady = room.players.filter((p) => p.alive).every((p) => p.ready);
  if (!allReady) return;
  room.phase = "action";
  room.actionDeadline = Date.now() + ACTION_TIMEOUT_MS;
  room.log.push({ day: room.day, text: `── 第 ${room.day} 天行動階段開始 ──（${ACTION_TIMEOUT_MS / 1000} 秒內未提交由 AI 代打）` });
  // 單人版 startRound：回合開始洗牌決定行動順序，結算各步驟按此順序跑。
  generateSettlementOrder(room);
  autoAiActions(room);
}

/** 行動逾時（惰性檢查，輪詢觸發）：期限到仍未提交的人類玩家由 AI 代打；與選留逾時共用 timeoutStrikes，累積 2 次改 AI 託管並扣 5 分。 */
function maybeResolveActionTimeout(room: GameRoom): void {
  if (room.status !== "playing" || room.phase !== "action") return;
  if (room.actionDeadline === null || Date.now() < room.actionDeadline) return;
  for (const p of room.players) {
    if (p.isAI || room.actions[p.id]) continue;
    room.timeoutStrikes[p.id] = (room.timeoutStrikes[p.id] ?? 0) + 1;
    if (room.timeoutStrikes[p.id] >= TIMEOUT_STRIKES_TO_HANDOVER) {
      p.isAI = true;
      if (p.accountId) {
        room.pendingPenalties.push({ accountId: p.accountId, repDelta: TIMEOUT_REPUTATION_PENALTY, setCooldown: false });
      }
      room.log.push({ day: room.day, text: `🤖 ${p.name} 行動多次逾時，改由 AI 託管` });
    } else {
      room.log.push({ day: room.day, text: `⏰ ${p.name} 行動逾時，由 AI 代打本回合` });
    }
    room.actions[p.id] = aiAction(room, p);
  }
  maybeSettle(room);
}

function lazyAdvance(room: GameRoom): void {
  maybeResolveKeepTimeout(room);
  aiFreePhase(room);
  maybeAdvanceToAction(room);
  autoAiActions(room);
  maybeResolveActionTimeout(room);
  maybeSettle(room);
}

// ---------------------------------------------------------------------------
// withRoom：讀取 → 惰性推進 → 執行 endpoint → 有變化才寫回。
// 寫回用 version 樂觀鎖，衝突時重讀重試（最多 3 次），避免兩人同時
// 行動互相覆蓋。endpoint 的錯誤路徑不改狀態（與 Express 版一致）。
// ---------------------------------------------------------------------------
type EndpointFn = (room: GameRoom) => GamesResponse;

async function withRoom(
  code: string,
  notFoundMsg: string,
  fn: EndpointFn,
): Promise<GamesResponse> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const stored = await fetchRoom(code);
    if (!stored) return err(404, notFoundMsg);
    const { room, version } = stored;
    ensureRoomShape(room);
    // 公開檔案快照在快照「之前」刷新：快照本身不觸發寫回，避免
    // 每 2 秒輪詢都因檔案刷新而 bump version。
    await enrichProfiles(room);
    const before = JSON.stringify(room);
    lazyAdvance(room);
    const result = fn(room);
    // 提交前先取走本輪懲罰佇列並標記戰績已寫入：寫回成功後才由
    // postCommit 寫帳號表；寫回失敗重試時 fn 會重新排入懲罰。
    const penalties = [...(room.pendingPenalties ?? [])];
    room.pendingPenalties = [];
    const finished = room.status === "finished" && !room.recordsWritten;
    if (finished) room.recordsWritten = true;
    const changed = JSON.stringify(room) !== before;
    if (changed) {
      if (!(await updateRoom(room, version))) continue;
    }
    await postCommit(room, penalties, finished);
    return result;
  }
  return err(409, "房間剛被其他玩家更新，請再試一次");
}

function matchPath(
  path: string,
): { name: string; code?: string } | null {
  // path 已去掉 /api/games 前綴，例如 /rooms/ABC123/join
  const parts = path.split("/").filter((s) => s.length > 0);
  if (parts[0] === "accounts") {
    if (parts.length === 2) {
      if (["register", "login", "guest", "recover", "logout", "me", "google"].includes(parts[1] as string)) {
        return { name: `account-${parts[1]}` };
      }
    }
    // Google callback 是三段路徑，須有明確檔案路由（見 build.mjs）。
    if (parts.length === 3 && parts[1] === "google" && parts[2] === "callback") {
      return { name: "account-google-callback" };
    }
    return null;
  }
  if (parts[0] === "world" && parts.length === 1) return { name: "world" };
  if (parts[0] !== "rooms") return null;
  if (parts.length === 1) return { name: "create" };
  const code = parts[1] as string;
  if (parts.length === 2) return { name: "get", code };
  if (parts.length === 3) {
    if (parts[2] === "join") return { name: "join", code };
    if (parts[2] === "setup") return { name: "setup", code };
    if (parts[2] === "start") return { name: "start", code };
    if (parts[2] === "ready") return { name: "ready", code };
    if (parts[2] === "action") return { name: "action", code };
    if (parts[2] === "use-item") return { name: "use-item", code };
    if (parts[2] === "keep") return { name: "keep", code };
    if (parts[2] === "gold-pick") return { name: "gold-pick", code };
    if (parts[2] === "trade") return { name: "trade", code };
    if (parts[2] === "spectate") return { name: "spectate", code };
    if (parts[2] === "quit") return { name: "quit", code };
  }
  if (parts.length === 4 && parts[2] === "trade" && parts[3] === "respond") {
    return { name: "trade-respond", code };
  }
  return null;
}

export async function handleGamesRequest(
  method: string,
  fullPath: string,
  query: URLSearchParams,
  bodyText: string,
): Promise<GamesResponse> {
  if (!neonConfigured()) {
    return err(503, "資料庫尚未設定（DATABASE_URL／DATABASE_URL_NEON），請聯絡站長");
  }
  let body: Record<string, unknown> = {};
  if (method === "POST") {
    if (bodyText.trim().length > 0) {
      try {
        const parsed: unknown = JSON.parse(bodyText);
        body = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
      } catch {
        return err(400, "請求格式錯誤");
      }
    }
  }
  const path = fullPath
    .replace(/^\/api\/games\/?/, "/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "") || "/";
  const route = matchPath(path);
  if (!route) return err(404, "找不到房間");

  try {
    // ---- 帳號服務（不走房間流程；Google 見下方 google 路由） ----
    if (route.name === "account-register" && method === "POST") {
      const name = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 12) : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!name) return err(400, "請輸入顯示名稱");
      if (password.length < 4) return err(400, "密碼至少 4 個字元");
      const created = await createAccount(name, "named", password);
      if (!created) return err(409, "顯示名稱已被使用");
      return {
        status: 201,
        body: {
          account: publicAccount(created.account),
          token: created.token,
          // 恢復碼只在此回傳一次明文，前端只顯示一次；伺服器只存雜湊。
          recoveryCode: created.recoveryCode,
          record: { games: 0, wins: 0, losses: 0, bestFinalHp: 0, achievements: [] },
        },
      };
    }
    if (route.name === "account-guest" && method === "POST") {
      const name = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 12) : "";
      const created = await createAccount(name, "guest");
      if (!created) return err(500, "訪客帳號建立失敗，請再試一次");
      return {
        status: 201,
        body: {
          account: publicAccount(created.account),
          token: created.token,
          recoveryCode: created.recoveryCode,
          record: { games: 0, wins: 0, losses: 0, bestFinalHp: 0, achievements: [] },
        },
      };
    }
    if (route.name === "account-login" && method === "POST") {
      const token = await loginByPassword(String(body.displayName ?? ""), String(body.password ?? ""));
      if (!token) return err(401, "顯示名稱或密碼錯誤（訪客帳號請用恢復碼登入）");
      const account = await resolveSession(token);
      if (!account) return err(401, "登入失敗，請再試一次");
      return { status: 200, body: { account: publicAccount(account), token } };
    }
    if (route.name === "account-recover" && method === "POST") {
      const token = await loginByRecovery(String(body.displayName ?? ""), String(body.recoveryCode ?? ""));
      if (!token) return err(401, "顯示名稱或恢復碼錯誤");
      const account = await resolveSession(token);
      if (!account) return err(401, "恢復登入失敗，請再試一次");
      return { status: 200, body: { account: publicAccount(account), token } };
    }
    if (route.name === "account-me" && method === "GET") {
      const account = await resolveSession(query.get("accountToken") ?? "");
      if (!account) return err(401, "登入已過期，請重新登入（訪客帳號亦可）");
      const profile = await getPublicProfile(account.id);
      if (!profile) return err(401, "登入已過期，請重新登入（訪客帳號亦可）");
      return { status: 200, body: profile };
    }
    if (route.name === "account-logout" && method === "POST") {
      if (typeof body.accountToken === "string") await logoutSession(body.accountToken);
      return { status: 200, body: { ok: true } };
    }
    if (route.name === "account-google" && method === "GET") {
      // Google OAuth 起始：未設定憑證回 501（不寫假憑證、不導向假授權頁）。
      if (!googleConfigured()) {
        return err(501, "Google 登入尚未設定：站長需在 Google Cloud 建立 OAuth 憑證並設定 GOOGLE_CLIENT_ID／GOOGLE_CLIENT_SECRET（見 facility-server/README.md）");
      }
      const state = await createOAuthState();
      const params = new URLSearchParams({
        client_id: googleClientId(),
        redirect_uri: googleRedirectUri(),
        response_type: "code",
        scope: "openid email profile",
        state,
        access_type: "online",
      });
      return redirectTo(`${GOOGLE_AUTH_URL}?${params.toString()}`);
    }
    if (route.name === "account-google-callback" && method === "GET") {
      const state = query.get("state") ?? "";
      // 使用者在 Google 端拒絕授權：清掉 state（若有）後回遊戲頁顯示中文錯誤。
      if (query.get("error")) {
        if (state) await consumeOAuthState(state).catch(() => "invalid" as const);
        return googleErrorRedirect("denied");
      }
      const code = query.get("code") ?? "";
      if (!code || !state) return googleErrorRedirect("invalid");
      const consumed = await consumeOAuthState(state);
      if (consumed === "invalid") return googleErrorRedirect("invalid");
      if (consumed === "expired") return googleErrorRedirect("expired");
      if (!googleConfigured()) return googleErrorRedirect("not_configured");
      // 授權碼換 token（失敗不洩 Google 回應細節，只回錯誤碼）。
      let tokenJson: { access_token?: unknown } = {};
      try {
        const res = await fetch(googleTokenUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: googleClientId(),
            client_secret: googleClientSecret(),
            redirect_uri: googleRedirectUri(),
            grant_type: "authorization_code",
          }).toString(),
        });
        tokenJson = (await res.json().catch(() => ({}))) as typeof tokenJson;
        if (!res.ok || typeof tokenJson.access_token !== "string" || !tokenJson.access_token) {
          return googleErrorRedirect("token_failed");
        }
      } catch {
        return googleErrorRedirect("token_failed");
      }
      // 取 userinfo：只要 email（去重）與 name（顯示名稱）。
      let userinfo: { email?: unknown; name?: unknown } = {};
      try {
        const res = await fetch(googleUserinfoUrl(), {
          headers: { Authorization: `Bearer ${tokenJson.access_token as string}` },
        });
        userinfo = (await res.json().catch(() => ({}))) as typeof userinfo;
      } catch {
        return googleErrorRedirect("userinfo_failed");
      }
      const email = typeof userinfo.email === "string" ? userinfo.email : "";
      if (!email) return googleErrorRedirect("userinfo_failed");
      const created = await loginOrCreateGoogleAccount(
        email,
        typeof userinfo.name === "string" ? userinfo.name : "",
      );
      if (!created) return googleErrorRedirect("account_failed");
      // 新帳號的恢復碼只用這次轉址帶回、前端顯示一次後清掉網址參數；
      // 舊帳號不帶（不重發）。session token 以 accountToken 帶回。
      const back = new URLSearchParams({ accountToken: created.token });
      if (created.isNew && created.recoveryCode) back.set("googleRecoveryCode", created.recoveryCode);
      return redirectTo(`/facility-survival?${back.toString()}`);
    }
    if (route.name.startsWith("account-")) return err(404, "找不到房間");

    // 世界：公開房間列表（大廳／進行中，不含已結束房與任何 token／帳號資料）。
    if (route.name === "world" && method === "GET") {
      const rooms = await listPublicRooms();
      return { status: 200, body: { rooms } };
    }
    if (route.name === "world") return err(405, "世界列表只支援 GET");

    // 建房（房型預設娛樂；競技房必須有帳號且信譽 90 以上）
    if (route.name === "create" && method === "POST") {
      const { account, staleToken } = await resolveAccountFromBody(body);
      const roomType: RoomType = body.roomType === "ranked" ? "ranked" : "casual";
      if (roomType === "ranked" && !account) {
        return err(403, "競技房需先登入（訪客帳號亦可）且信譽 90 分以上");
      }
      const gate = gateError(roomType, account);
      if (gate) return err(403, gate);
      await sweepExpired();
      for (let i = 0; i < 10; i++) {
        const code = newCode();
        const room = createRoom(code, account?.displayName ?? cleanName(body.name), roomType, account?.id);
        if (account) {
          const prof = await getPublicProfile(account.id).catch(() => null);
          const host = room.players[0];
          if (host && prof) {
            host.accountProfile = {
              displayName: prof.account.displayName,
              reputation: prof.account.reputation,
              games: prof.record.games,
              wins: prof.record.wins,
              losses: prof.record.losses,
              achievements: prof.record.achievements,
            };
          }
        }
        if (await insertRoom(room)) {
          const host = room.players[0];
          return {
            status: 201,
            body: {
              code,
              playerId: host?.id,
              token: host?.token,
              room: publicView(room, host?.token),
              accountNote: accountNote(staleToken),
            },
          };
        }
      }
      return err(500, "房間碼產生失敗，請再試一次");
    }

    const code = route.code as string;

    // 加入房間（大廳階段才可加入；觀戰不走這裡，見 spectate）
    if (route.name === "join" && method === "POST") {
      const { account, staleToken } = await resolveAccountFromBody(body);
      const joinProfile = account ? await getPublicProfile(account.id).catch(() => null) : null;
      return withRoom(
        code,
        "找不到房間（房間碼錯誤，或房間已過期／伺服器重啟）",
        (room) => {
          if (room.status !== "lobby") return err(400, "遊戲已經開始，無法加入");
          if (room.players.length >= MAX_PLAYERS) return err(400, "房間已滿（8 人）");
          if (room.roomType === "ranked" && !account) {
            return err(403, "競技房需先登入（訪客帳號亦可）且信譽 90 分以上");
          }
          const gate = gateError(room.roomType ?? "casual", account);
          if (gate) return err(403, gate);
          const player = addPlayer(room, account?.displayName ?? cleanName(body.name), false, account?.id);
          if (joinProfile) {
            player.accountProfile = {
              displayName: joinProfile.account.displayName,
              reputation: joinProfile.account.reputation,
              games: joinProfile.record.games,
              wins: joinProfile.record.wins,
              losses: joinProfile.record.losses,
              achievements: joinProfile.record.achievements,
            };
          }
          return {
            status: 201,
            body: {
              playerId: player.id,
              token: player.token,
              room: publicView(room, player.token),
              accountNote: accountNote(staleToken),
            },
          };
        },
      );
    }

    // 觀戰加入（任何階段皆可，只讀，不佔玩家名額）
    if (route.name === "spectate" && method === "POST") {
      const { account } = await resolveAccountFromBody(body);
      return withRoom(code, "找不到房間", (room) => {
        const sp = {
          id: newId("sp"),
          name: account?.displayName ?? cleanName(body.name),
          token: newId("tok"),
          accountId: account?.id,
        };
        room.spectators.push(sp);
        return {
          status: 201,
          body: { spectatorId: sp.id, token: sp.token, room: spectatorView(room, sp.id).body.room },
        };
      });
    }

    // 棄權：大廳直接離開（不扣分）；對局中改 AI 託管並扣分，第一位
    // 棄權者冷卻 15 分鐘（懲罰進 pendingPenalties，寫回成功後才寫帳號表）。
    // 觀戰者 quit 只是離開觀戰。終局後 quit 不做事（回目前房間）。
    if (route.name === "quit" && method === "POST") {
      return withRoom(code, "找不到房間", (room) => {
        const sp = spectatorFromToken(room, body.token);
        if (sp) {
          room.spectators = room.spectators.filter((x) => x.id !== sp.id);
          return { status: 200, body: { left: true, room: publicView(room) } };
        }
        if (spectatorFromToken(room, body.token)) {
          return err(403, "觀戰者只能觀看，不能行動／交易／投票");
        }
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "憑證無效，請重新加入房間");
        if (room.status === "finished") return sendRoom(room, player.token);
        if (room.status === "lobby") {
          const wasHost = player.isHost;
          room.players = room.players.filter((x) => x.id !== player.id);
          if (wasHost && room.players.length > 0) {
            const next = room.players.find((x) => !x.isAI) ?? room.players[0];
            if (next) next.isHost = true;
          }
          return { status: 200, body: { left: true, room: publicView(room) } };
        }
        const wasHost = player.isHost;
        const firstQuit = room.quitCount === 0;
        room.quitCount += 1;
        if (player.accountId) {
          room.pendingPenalties.push({ accountId: player.accountId, repDelta: QUIT_REPUTATION_PENALTY, setCooldown: firstQuit });
        }
        player.isAI = true;
        player.ready = true;
        room.log.push({ day: room.day, text: `🚪 ${player.name} 棄權，改由 AI 託管${firstQuit ? "（第一位棄權者冷卻 15 分鐘）" : ""}` });
        if (wasHost) {
          const next = room.players.find((x) => !x.isAI && x.id !== player.id);
          if (next) {
            player.isHost = false;
            next.isHost = true;
          }
        }
        // 託管後的 AI 立刻補動作：行動階段補提交、keep 階段自動選留
        // 並在無待選留者時跑完後半段結算，避免託管者卡住結算。
        if (room.phase === "keep" && room.pendingDraws[player.id]) {
          const pending = room.pendingDraws[player.id];
          if (pending) autoKeep(room, player, pending);
          if (Object.keys(room.pendingDraws).length === 0) {
            room.keepDeadline = null;
            runSettlementRest(room, settlementJudge);
            const phaseAfterRest: string = room.phase;
            if (room.status === "playing" && phaseAfterRest === "free") aiFreePhase(room);
          }
        }
        if (room.phase === "action" && !room.actions[player.id]) {
          room.actions[player.id] = aiAction(room, player);
          maybeSettle(room);
        }
        if (room.phase === "free") aiFreePhase(room);
        return sendRoom(room, player.token);
      });
    }

    // 查房間狀態（前端每 2 秒輪詢；觀戰 token 回只讀視圖）
    if (route.name === "get" && method === "GET") {
      return withRoom(code, "找不到房間", (room) => {
        const sp = spectatorFromToken(room, query.get("token") ?? undefined);
        if (sp) return spectatorView(room, sp.id);
        return sendRoom(room, query.get("token") ?? undefined);
      });
    }

    // 大廳配點＋選出生點
    if (route.name === "setup" && method === "POST") {
      return withRoom(code, "找不到房間", (room) => {
        if (spectatorFromToken(room, body.token)) {
          return err(403, "觀戰者只能觀看，不能行動／交易／投票");
        }
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "憑證無效，請重新加入房間");
        const e = setSetup(
          room,
          player.id,
          Number(body.might),
          Number(body.carry),
          Number(body.speed),
          String(body.spawn ?? ""),
        );
        if (e) return err(400, e);
        return sendRoom(room, player.token);
      });
    }

    // 房主開始遊戲：未滿 8 人由 AI 補滿；未配點者用預設值
    if (route.name === "start" && method === "POST") {
      return withRoom(code, "找不到房間", (room) => {
        if (spectatorFromToken(room, body.token)) {
          return err(403, "觀戰者只能觀看，不能行動／交易／投票");
        }
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "憑證無效，請重新加入房間");
        if (!player.isHost) return err(403, "只有房主可以開始遊戲");
        if (room.status !== "lobby") return err(400, "遊戲已經開始");
        if (room.players.length < 1) return err(400, "房間裡沒有玩家");
        for (const p of room.players.filter((x) => !x.isAI && !x.hasSetup)) {
          setSetup(room, p.id, 4, 3, 3, aiSpawn(room));
        }
        let aiIndex = 0;
        while (room.players.length < MAX_PLAYERS) {
          const ai = addPlayer(room, aiName(aiIndex), true);
          const setup = aiSetup(aiIndex);
          // 注意：單人版 bots.js 的政策基因總和是 11 點（例如槍手 5/3/3），
          // 不是人類配點的 10 點，故不走 setSetup 的總和驗證，直接套用。
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
        room.log.push({ day: 1, text: "── 遊戲開始！第 1 天（自由階段）──" });
        initGameState(room);
        resolveCombatAndShadows(room);
        aiFreePhase(room);
        return sendRoom(room, player.token);
      });
    }

    // 自由階段：按準備完成
    if (route.name === "ready" && method === "POST") {
      return withRoom(code, "找不到房間", (room) => {
        if (spectatorFromToken(room, body.token)) {
          return err(403, "觀戰者只能觀看，不能行動／交易／投票");
        }
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "憑證無效，請重新加入房間");
        if (room.status !== "playing" || room.phase !== "free") {
          return err(400, "現在不是自由階段");
        }
        player.ready = true;
        maybeAdvanceToAction(room);
        return sendRoom(room, player.token);
      });
    }

    // 行動階段：提交路徑＋毒樓層投票（暗影只提交路徑）
    if (route.name === "action" && method === "POST") {
      return withRoom(code, "找不到房間", (room) => {
        if (spectatorFromToken(room, body.token)) {
          return err(403, "觀戰者只能觀看，不能行動／交易／投票");
        }
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "憑證無效，請重新加入房間");
        if (room.actions[player.id]) return err(400, "本回合已經提交過行動");
        const rawControl = body.controlChoice as { mode?: unknown; target?: unknown } | undefined;
        const controlMode = rawControl?.mode === "vote" || rawControl?.mode === "detox" ? rawControl.mode : undefined;
        const rawGene = body.geneRealloc as { might?: unknown; carry?: unknown; speed?: unknown } | undefined;
        const rawTrade = body.trade as { toId?: unknown; offerItemId?: unknown; wantKind?: unknown } | undefined;
        const trade =
          rawTrade && typeof rawTrade.toId === "string" && typeof rawTrade.offerItemId === "string" && typeof rawTrade.wantKind === "string"
            ? { toId: rawTrade.toId, offerItemId: rawTrade.offerItemId, wantKind: rawTrade.wantKind as ItemKind }
            : undefined;
        const action: DayAction = {
          playerId: player.id,
          path: Array.isArray(body.path) ? (body.path as unknown[]).map(String) : [],
          voteFloor: (body.voteFloor as FloorId | null) ?? null,
          teleportTo: typeof body.teleportTo === "string" ? body.teleportTo : undefined,
          detoxRoom: typeof body.detoxRoom === "string" ? body.detoxRoom : undefined,
          controlChoice: controlMode
            ? { mode: controlMode, target: typeof rawControl?.target === "string" ? rawControl.target : undefined }
            : undefined,
          geneRealloc:
            rawGene && Number.isInteger(rawGene.might) && Number.isInteger(rawGene.carry) && Number.isInteger(rawGene.speed)
              ? { might: Number(rawGene.might), carry: Number(rawGene.carry), speed: Number(rawGene.speed) }
              : undefined,
          rocketTarget: typeof body.rocketTarget === "string" ? body.rocketTarget : undefined,
          itemUses: Array.isArray(body.itemUses) ? (body.itemUses as unknown[]).map(String) : undefined,
          trade,
        };
        const e = validateAction(room, player, action);
        if (e) return err(400, e);
        room.actions[player.id] = action;
        maybeSettle(room);
        return sendRoom(room, player.token);
      });
    }

    // 選留階段：提交攤開選留（超量整筆拒絕，pending 保留可重選）。
    // 選完且無待選留者時，跑完後半段結算。
    if (route.name === "keep" && method === "POST") {
      return withRoom(code, "找不到房間", (room) => {
        if (spectatorFromToken(room, body.token)) {
          return err(403, "觀戰者只能觀看，不能行動／交易／投票");
        }
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "憑證無效，請重新加入房間");
        if (room.status !== "playing" || room.phase !== "keep") {
          return err(400, "現在不是選留階段");
        }
        const keepIndexes = Array.isArray(body.keepIndexes)
          ? (body.keepIndexes as unknown[]).map(Number)
          : [];
        const e = resolveKeep(room, player.id, keepIndexes);
        if (e) return err(400, e);
        if (Object.keys(room.pendingDraws).length === 0) {
          room.keepDeadline = null;
          runSettlementRest(room, settlementJudge);
          const phaseAfterRest: string = room.phase;
          if (room.status === "playing" && phaseAfterRest === "free") {
            aiFreePhase(room);
          }
        }
        return sendRoom(room, player.token);
      });
    }

    // 自由階段：金條攤開挑選（花 1 張金條換當前房物資一項）
    if (route.name === "gold-pick" && method === "POST") {
      return withRoom(code, "找不到房間", (room) => {
        if (spectatorFromToken(room, body.token)) {
          return err(403, "觀戰者只能觀看，不能行動／交易／投票");
        }
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "憑證無效，請重新加入房間");
        const e = spendGoldPick(room, player.id, String(body.kind ?? "") as ItemKind);
        if (e) return err(400, e);
        return sendRoom(room, player.token);
      });
    }

    // 自由階段：使用消耗品
    if (route.name === "use-item" && method === "POST") {
      return withRoom(code, "找不到房間", (room) => {
        if (spectatorFromToken(room, body.token)) {
          return err(403, "觀戰者只能觀看，不能行動／交易／投票");
        }
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "憑證無效，請重新加入房間");
        const e = useItem(room, player.id, String(body.itemId ?? ""));
        if (e) return err(400, e);
        return sendRoom(room, player.token);
      });
    }

    // 自由階段：發起交易（對 AI 交易會立刻自動回覆）
    if (route.name === "trade" && method === "POST") {
      return withRoom(code, "找不到房間", (room) => {
        if (spectatorFromToken(room, body.token)) {
          return err(403, "觀戰者只能觀看，不能行動／交易／投票");
        }
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "憑證無效，請重新加入房間");
        const target = room.players.find((p) => p.id === String(body.toId ?? ""));
        const wantItem = target?.items.find((it) => it.kind === String(body.wantKind ?? ""));
        if (!target || !wantItem) return err(400, "對方沒有你要的那種道具");
        const e = proposeTrade(
          room,
          player.id,
          String(body.toId ?? ""),
          String(body.offerItemId ?? ""),
          wantItem.id,
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

    // 自由階段：回覆交易
    if (route.name === "trade-respond" && method === "POST") {
      return withRoom(code, "找不到房間", (room) => {
        if (spectatorFromToken(room, body.token)) {
          return err(403, "觀戰者只能觀看，不能行動／交易／投票");
        }
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "憑證無效，請重新加入房間");
        const e = respondTrade(
          room,
          String(body.tradeId ?? ""),
          player.id,
          body.accept === true,
        );
        if (e) return err(400, e);
        return sendRoom(room, player.token);
      });
    }

    return err(404, "找不到房間");
  } catch (e) {
    return err(500, (e as Error).message || "伺服器錯誤");
  }
}

// 「封鎖設施求生」serverless 後端：Express 版 routes/games.ts 的完整移植。
//
// API 介面與 Express 版完全相同（路徑、請求欄位、回應 shape、房間碼＋
// 玩家 token 驗證、狀態碼與錯誤訊息），前端零修改即可對接。
// 差別只在房間儲存：in-memory Map → Neon（見 store.ts），以及
// 每次請求先惰性推進（見 lazyAdvance）——serverless 沒有計時器，
// 所有原本由請求觸發的 AI 動作都必須在請求內完成。

import {
  MAX_PLAYERS,
  addPlayer,
  createRoom,
  findPlayer,
  publicView,
  resolveCombatAndShadows,
  runSettlement,
  setSetup,
  useItem,
  proposeTrade,
  respondTrade,
  validateAction,
  type DayAction,
  type FloorId,
  type GameRoom,
} from "./game-engine";
import {
  aiAcceptTrade,
  aiAction,
  aiName,
  aiSetup,
  aiSpawn,
} from "./game-ai";
import { neonConfigured } from "./neon";
import { fetchRoom, insertRoom, sweepExpired, updateRoom } from "./store";

export interface GamesResponse {
  status: number;
  body: unknown;
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
      const med = p.items.find((it) => it.kind === "medicine");
      if (med) {
        p.items = p.items.filter((it) => it.id !== med.id);
        p.hp = Math.min(10, p.hp + 2);
        room.log.push({ day: room.day, text: `💊 ${p.name} 使用急救藥片，回復至 ${p.hp} 血` });
      }
    }
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
  runSettlement(room);
  const phaseAfterSettlement: string = room.phase;
  if (room.status === "playing" && phaseAfterSettlement === "free") {
    aiFreePhase(room);
  }
}

function maybeAdvanceToAction(room: GameRoom): void {
  if (room.status !== "playing" || room.phase !== "free") return;
  const allReady = room.players.filter((p) => p.alive).every((p) => p.ready);
  if (!allReady) return;
  room.phase = "action";
  room.log.push({ day: room.day, text: `── 第 ${room.day} 天行動階段開始 ──` });
  autoAiActions(room);
}

function lazyAdvance(room: GameRoom): void {
  aiFreePhase(room);
  maybeAdvanceToAction(room);
  autoAiActions(room);
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
    const before = JSON.stringify(room);
    lazyAdvance(room);
    const result = fn(room);
    if (JSON.stringify(room) === before) return result;
    if (await updateRoom(room, version)) return result;
    // version 衝突：重讀最新狀態再跑一次（fn 的錯誤路徑不改狀態，
    // 成功路徑的重跑等同於第一次執行，因為前一次根本沒寫進去）。
  }
  return err(409, "房間剛被其他玩家更新，請再試一次");
}

function matchPath(
  path: string,
): { name: string; code?: string } | null {
  // path 已去掉 /api/games 前綴，例如 /rooms/ABC123/join
  const parts = path.split("/").filter((s) => s.length > 0);
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
    if (parts[2] === "trade") return { name: "trade", code };
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
    return err(503, "資料庫尚未設定（DATABASE_URL），請聯絡站長");
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
    // 建房
    if (route.name === "create" && method === "POST") {
      await sweepExpired();
      for (let i = 0; i < 10; i++) {
        const code = newCode();
        const room = createRoom(code, cleanName(body.name));
        if (await insertRoom(room)) {
          const host = room.players[0];
          return {
            status: 201,
            body: {
              code,
              playerId: host?.id,
              token: host?.token,
              room: publicView(room, host?.token),
            },
          };
        }
      }
      return err(500, "房間碼產生失敗，請再試一次");
    }

    const code = route.code as string;

    // 加入房間（大廳階段才可加入）
    if (route.name === "join" && method === "POST") {
      return withRoom(
        code,
        "找不到房間（房間碼錯誤，或房間已過期／伺服器重啟）",
        (room) => {
          if (room.status !== "lobby") return err(400, "遊戲已經開始，無法加入");
          if (room.players.length >= MAX_PLAYERS) return err(400, "房間已滿（4 人）");
          const player = addPlayer(room, cleanName(body.name), false);
          return {
            status: 201,
            body: {
              playerId: player.id,
              token: player.token,
              room: publicView(room, player.token),
            },
          };
        },
      );
    }

    // 查房間狀態（前端每 2 秒輪詢）
    if (route.name === "get" && method === "GET") {
      return withRoom(code, "找不到房間", (room) =>
        sendRoom(room, query.get("token") ?? undefined),
      );
    }

    // 大廳配點＋選出生點
    if (route.name === "setup" && method === "POST") {
      return withRoom(code, "找不到房間", (room) => {
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

    // 房主開始遊戲：未滿 4 人由 AI 補滿；未配點者用預設值
    if (route.name === "start" && method === "POST") {
      return withRoom(code, "找不到房間", (room) => {
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
          setSetup(room, ai.id, setup.might, setup.carry, setup.speed, aiSpawn(room));
          aiIndex += 1;
        }
        room.status = "playing";
        room.day = 1;
        room.phase = "free";
        room.log.push({ day: 1, text: "── 遊戲開始！第 1 天（自由階段）──" });
        resolveCombatAndShadows(room);
        aiFreePhase(room);
        return sendRoom(room, player.token);
      });
    }

    // 自由階段：按準備完成
    if (route.name === "ready" && method === "POST") {
      return withRoom(code, "找不到房間", (room) => {
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
        const player = playerFromToken(room, body.token);
        if (!player) return err(401, "憑證無效，請重新加入房間");
        if (room.actions[player.id]) return err(400, "本回合已經提交過行動");
        const action: DayAction = {
          playerId: player.id,
          path: Array.isArray(body.path) ? (body.path as unknown[]).map(String) : [],
          voteFloor: (body.voteFloor as FloorId | null) ?? null,
          teleportTo: typeof body.teleportTo === "string" ? body.teleportTo : undefined,
          detoxRoom: typeof body.detoxRoom === "string" ? body.detoxRoom : undefined,
        };
        const e = validateAction(room, player, action);
        if (e) return err(400, e);
        room.actions[player.id] = action;
        maybeSettle(room);
        return sendRoom(room, player.token);
      });
    }

    // 自由階段：使用消耗品
    if (route.name === "use-item" && method === "POST") {
      return withRoom(code, "找不到房間", (room) => {
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

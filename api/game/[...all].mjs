// api/game/[...all].mjs — 禁閉逃殺 Lockdown Survival 成績榜（純前端遊戲的「成績層」）
//
// ── 為什麼要另外開一個檔案（2026-11-03 實測）─────────────────────────────
// Vercel git build 上，api/ 目錄裡的 catch-all 檔只會被路由到「單一段」路徑：
//   /api/healthz                     → 200（api/[...catchall].mjs 有吃到）
//   /api/debug-all-200/extra         → Vercel 平台 404（catchall 沒吃到）
//   /api/games/leaderboard           → api/games/[...all].mjs 有吃到
//   /api/games/a/b/c/d/e             → Vercel 平台 404
//   /api/games/rooms/201             → 明確檔案路由 api/games/rooms/[code].mjs 有吃到
// 所以多段路徑要通，只能走「明確檔案路由」——這也是本 repo 2026-11-02 commit 7d152609
// 修 join／輪詢 NOT_FOUND 的同一套做法。這裡用同樣的寫法：
//   /api/game/score        (POST)
//   /api/game/leaderboard  (GET)
//
// ── 資料層 ────────────────────────────────────────────────────────────
// Neon HTTP SQL API（不需要 pg driver），跟 api/[...catchall].mjs 用同一個 DB。
// 邏輯與 catchall 裡的 gameScoreHandler / gameLeaderboardHandler 相同；
// 依本 repo 慣例（api/ 下的 function 檔案不跨檔 import），這裡各自獨立一份。
//
// 遊戲本體 100% 純前端、離線可玩；這個端點只是跨裝置排行榜。
// 前端上傳失敗會靜默降級到 localStorage，不影響遊玩。

// ── inline Neon HTTP SQL helper（與 catchall 同款）─────────────────────
const FALLBACK_DB_URL =
  "postgresql://neondb_owner:npg_ulB9zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const _UA = "Mozilla/5.0 (compatible; donttalk-games/1.0)";
function _dbUrl() { return process.env.DATABASE_URL || FALLBACK_DB_URL; }
function _endpoint(url) { const u = new URL(url); return `https://${u.hostname}/sql`; }
let _dbEndpoint = null, _dbSrc = null;
function _conn() { const url = _dbUrl(); if (url !== _dbSrc) { _dbSrc = url; _dbEndpoint = _endpoint(url); } return _dbEndpoint; }
async function dbq(sql, params = []) {
  const url = _dbUrl();
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6000);
  let res;
  try {
    res = await fetch(_conn(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": _UA, "Neon-Connection-String": url },
      body: JSON.stringify({ query: sql, params }),
      signal: ctrl.signal,
    });
  } catch (e) { clearTimeout(tid); throw new Error(`Neon fetch failed: ${e.name}: ${e.message}`); }
  clearTimeout(tid);
  const text = await res.text();
  if (!res.ok) throw new Error(`Neon HTTP ${res.status}: ${text.slice(0, 200)}`);
  let parsed; try { parsed = JSON.parse(text); } catch (e) { throw new Error(`Neon JSON parse: ${e.message}`); }
  if (parsed.error) throw new Error(parsed.error.message || "Neon error");
  return { rows: Array.isArray(parsed.rows) ? parsed.rows : [] };
}
async function q(sql, params = []) { return await dbq(sql, params); }

// ── helpers ───────────────────────────────────────────────────────────
const H_JSON = { "Content-Type": "application/json; charset=utf-8" };
function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { ...H_JSON, ...(init.headers || {}) },
  });
}

let _gameScoresReady = false;
let _gameScoreInserts = 0;

async function ensureGameScoresTable() {
  if (_gameScoresReady) return true;
  try {
    await q(`
      CREATE TABLE IF NOT EXISTS game_scores (
        id BIGSERIAL PRIMARY KEY,
        game VARCHAR(32) NOT NULL DEFAULT 'lockdown-survival',
        name VARCHAR(40) NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        hp INTEGER NOT NULL DEFAULT 0,
        rank INTEGER NOT NULL DEFAULT 0,
        players INTEGER NOT NULL DEFAULT 0,
        difficulty VARCHAR(16) NOT NULL DEFAULT 'normal',
        reason VARCHAR(32) NOT NULL DEFAULT '',
        achievements INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await q(`CREATE INDEX IF NOT EXISTS game_scores_score_idx ON game_scores (score DESC, created_at DESC)`);
    _gameScoresReady = true;
    return true;
  } catch (e) {
    console.error("game_scores table init failed:", String(e && e.message));
    return false;
  }
}

function _cleanName(v) {
  return String(v == null ? "" : v)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 24) || "玩家";
}
function _int(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
const GAME_DIFFICULTIES = new Set(["easy", "normal", "boss"]);
const GAME_REASONS = new Set(["last_survivor", "all_shadow", "six_rounds"]);

// ── handlers ──────────────────────────────────────────────────────────
async function gameScoreHandler(request) {
  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, { status: 405 });
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return json({ ok: false, error: "invalid body" }, { status: 400 });

  const name = _cleanName(body.name);
  const score = _int(body.score, 0, 100000);
  const hp = _int(body.hp, 0, 999);
  const rank = _int(body.rank, 0, 999);
  const players = _int(body.players, 1, 99);
  const achievements = _int(body.achievements, 0, 999);
  const difficulty = GAME_DIFFICULTIES.has(body.difficulty) ? body.difficulty : "normal";
  const reason = GAME_REASONS.has(body.reason) ? body.reason : "six_rounds";

  if (!(await ensureGameScoresTable())) {
    return json({ ok: false, error: "db unavailable" }, { status: 503 });
  }
  try {
    const res = await q(
      `INSERT INTO game_scores (game, name, score, hp, rank, players, difficulty, reason, achievements)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, created_at`,
      ["lockdown-survival", name, score, hp, rank, players, difficulty, reason, achievements],
    );
    const row = (res.rows && res.rows[0]) || {};

    // 表不要無限長：每 50 次插入清一次，只留前 500 名
    _gameScoreInserts += 1;
    if (_gameScoreInserts % 50 === 0) {
      try {
        await q(`DELETE FROM game_scores WHERE id NOT IN (
                  SELECT id FROM game_scores ORDER BY score DESC, created_at DESC LIMIT 500)`);
      } catch { /* 清理失敗不影響寫入 */ }
    }
    return json({ ok: true, id: row.id, createdAt: row.created_at });
  } catch (e) {
    console.error("game score insert failed:", String(e && e.message));
    return json({ ok: false, error: "insert failed" }, { status: 503 });
  }
}

async function gameLeaderboardHandler(request) {
  const u = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(u.searchParams.get("limit") || 20)));
  if (!(await ensureGameScoresTable())) {
    return json({ ok: false, rows: [], error: "db unavailable" }, { status: 503 });
  }
  try {
    const res = await q(
      `SELECT name, score, hp, rank, players, difficulty, reason, achievements, created_at
       FROM game_scores
       WHERE game = $1
       ORDER BY score DESC, created_at DESC
       LIMIT $2`,
      ["lockdown-survival", limit],
    );
    const rows = (res.rows || []).map((r) => ({
      name: r.name,
      score: Number(r.score) || 0,
      hp: Number(r.hp) || 0,
      rank: Number(r.rank) || 0,
      players: Number(r.players) || 0,
      difficulty: r.difficulty || "",
      reason: r.reason || "",
      achievements: Number(r.achievements) || 0,
      createdAt: r.created_at || null,
    }));
    return json({ ok: true, rows });
  } catch (e) {
    console.error("game leaderboard read failed:", String(e && e.message));
    return json({ ok: false, rows: [], error: "query failed" }, { status: 503 });
  }
}

// ── router ────────────────────────────────────────────────────────────
async function handleGameRequest(request) {
  try {
    const u = new URL(request.url);
    // /api/game/score 與 /api/game/leaderboard → 取最後一段
    const seg = (u.pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "") || "").split("/").pop() || "";
    if (seg === "score" && request.method === "POST") return await gameScoreHandler(request);
    if (seg === "leaderboard" && request.method === "GET") return await gameLeaderboardHandler(request);
    if (seg === "score") return json({ ok: false, error: "POST only" }, { status: 405 });
    if (seg === "leaderboard") return json({ ok: false, error: "GET only" }, { status: 405 });
    return json({ ok: false, error: "not found", path: u.pathname }, { status: 404 });
  } catch (e) {
    return json({ ok: false, error: (e && e.message) || "伺服器錯誤" }, { status: 500 });
  }
}

// ── Node runtime wrapper（Vercel Node runtime 要 (req, res) 寫法）──────
async function readNodeBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  const isNodeRes = res && typeof res.setHeader === "function" && typeof res.end === "function";
  if (!isNodeRes) {
    return handleGameRequest(req);
  }
  try {
    const host = (req.headers && req.headers.host) || "localhost";
    const proto = (req.headers && req.headers["x-forwarded-proto"]) || "https";
    const url = `${proto}://${host}${req.url || "/"}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers || {})) {
      if (v === undefined) continue;
      try { headers.set(k, Array.isArray(v) ? v.join(", ") : String(v)); } catch {}
    }
    let body;
    if (req.method && req.method !== "GET" && req.method !== "HEAD") {
      const buf = await readNodeBody(req);
      if (buf.length > 0) body = buf;
    }
    const webReq = new Request(url, { method: req.method || "GET", headers, body });
    const webRes = await handleGameRequest(webReq);
    res.statusCode = webRes.status;
    webRes.headers.forEach((value, key) => {
      try { res.setHeader(key, value); } catch {}
    });
    const text = await webRes.text();
    res.end(text);
  } catch (e) {
    try {
      if (!res.headersSent) res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: (e && e.message) || "伺服器錯誤" }));
    } catch {}
  }
}

export const config = { maxDuration: 60 };

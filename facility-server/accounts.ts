// 「封鎖設施求生」帳號服務（B 組）。
//
// 只用本站自有程式碼與 Neon 資料庫，不接任何外部遊戲服務。
// 設計要點：
//   - 帳號分「顯示名稱帳號」（密碼登入）與「訪客帳號」（免密碼建立，
//     兩種都是正式登入身分；未登入者前端只出登入面板，訪客即登入）。
//   - 恢復碼：建立時只回傳一次明文，伺服器只存「鹽＋SHA-256 雜湊」
//     （passwordHash／recoveryHash 皆為 `salt$hash` 格式），絕不存明文，
//     公開視圖也絕不輸出雜湊或 session token。
//   - session token：回傳給客戶端的明文只存雜湊（facility_sessions），
//     查 session 時以雜湊比對；登出即刪列。
//   - Google OAuth：不寫假憑證。需站長另外在 Google Cloud 建立憑證並
//     設定 GOOGLE_CLIENT_ID／GOOGLE_CLIENT_SECRET 後才接，目前程式只留
//     501 待接端點與 README 說明（見 handler 的 google 路由）。
//   - 信譽與冷卻數值（見下方常數，README 亦有表）：預設 100；
//     對局中棄權 −10；選留逾時累積到第 2 次改 AI 託管時 −5；
//     每房第一位棄權者冷卻 15 分鐘（冷卻中不能建房／加入新房間）。
//   - 房型門檻：娛樂 80、競技 90，未達門檻不能建／加入該房型。
//
// 資料表（皆 lazy 建表，見 withTable；與 facility_rooms 同一資料庫）：
//   facility_accounts(id, display_name, kind, password_hash, recovery_hash,
//                     reputation, cooldown_until, created_at)
//   facility_sessions(token_hash, account_id, created_at)
//   facility_records(account_id, games, wins, losses, best_final_hp, achievements)
// achievements 以 JSON 字串存（JSONB 欄位，查詢時以字串傳入）。

import { createHash, randomBytes } from "node:crypto";
import { neonQuery } from "./neon";

export const REPUTATION_DEFAULT = 100;
export const REPUTATION_CASUAL_MIN = 80;
export const REPUTATION_RANKED_MIN = 90;
export const QUIT_REPUTATION_PENALTY = -10;
export const TIMEOUT_REPUTATION_PENALTY = -5;
/** 每房第一位棄權者的冷卻（毫秒）。 */
export const QUIT_COOLDOWN_MS = 15 * 60 * 1000;
/** 選留逾時累積幾次後改 AI 託管（見 handler maybeResolveKeepTimeout）。 */
export const TIMEOUT_STRIKES_TO_HANDOVER = 2;

export type AccountKind = "named" | "guest";
export type RoomType = "casual" | "ranked";

export interface Account {
  id: string;
  displayName: string;
  kind: AccountKind;
  passwordHash: string | null;
  recoveryHash: string | null;
  reputation: number;
  cooldownUntil: number;
  createdAt: number;
}

export interface PublicAccount {
  id: string;
  displayName: string;
  kind: AccountKind;
  reputation: number;
  cooldownUntil: number;
  /** 冷卻剩餘毫秒（未冷卻為 0），前端直接顯示用。 */
  cooldownRemainingMs: number;
}

export interface GameRecord {
  accountId: string;
  games: number;
  wins: number;
  losses: number;
  bestFinalHp: number;
  achievements: string[];
}

export function publicAccount(a: Account): PublicAccount {
  return {
    id: a.id,
    displayName: a.displayName,
    kind: a.kind,
    reputation: a.reputation,
    cooldownUntil: a.cooldownUntil,
    cooldownRemainingMs: Math.max(0, a.cooldownUntil - Date.now()),
  };
}

export function defaultRecord(accountId: string): GameRecord {
  return { accountId, games: 0, wins: 0, losses: 0, bestFinalHp: 0, achievements: [] };
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(8).toString("hex")}`;
}

function hashValue(value: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

/** 存成 `salt$hash`；驗證時拆鹽重算比對。明文永遠不進資料庫。 */
function saltedHash(value: string): string {
  const salt = randomBytes(8).toString("hex");
  return `${salt}$${hashValue(value, salt)}`;
}

function verifySaltedHash(stored: string | null, value: string): boolean {
  if (!stored) return false;
  const idx = stored.indexOf("$");
  if (idx < 0) return false;
  const salt = stored.slice(0, idx);
  const hash = stored.slice(idx + 1);
  return hashValue(value, salt) === hash;
}

function sessionHash(token: string): string {
  // session token 本身是高熵隨機值，直接雜湊即可（不需鹽，鹽會讓查表無法比對）。
  return createHash("sha256").update(token).digest("hex");
}

function recoveryCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) out += "-";
    out += chars[Math.floor(Math.random() * chars.length)] as string;
  }
  return out;
}

function sessionToken(): string {
  return `acct_${randomBytes(24).toString("hex")}`;
}

// --- lazy 建表（與 store.ts 相同模式：relation 不存在就建表重試） ---
const CREATE_ACCOUNTS_SQL = `CREATE TABLE IF NOT EXISTS facility_accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  password_hash TEXT,
  recovery_hash TEXT,
  reputation INT NOT NULL DEFAULT 100,
  cooldown_until BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
)`;
const CREATE_SESSIONS_SQL = `CREATE TABLE IF NOT EXISTS facility_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at BIGINT NOT NULL
)`;
const CREATE_RECORDS_SQL = `CREATE TABLE IF NOT EXISTS facility_records (
  account_id TEXT PRIMARY KEY,
  games INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  best_final_hp INT NOT NULL DEFAULT 0,
  achievements JSONB NOT NULL DEFAULT '[]'
)`;

async function withTable<T>(table: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const msg = (e as Error).message || "";
    if (/does not exist/i.test(msg)) {
      const sql =
        table === "facility_accounts"
          ? CREATE_ACCOUNTS_SQL
          : table === "facility_sessions"
            ? CREATE_SESSIONS_SQL
            : CREATE_RECORDS_SQL;
      await neonQuery(sql);
      return await fn();
    }
    throw e;
  }
}

function parseAccount(row: Record<string, unknown>): Account {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    kind: (row.kind === "guest" ? "guest" : "named") as AccountKind,
    passwordHash: (row.password_hash as string | null) ?? null,
    recoveryHash: (row.recovery_hash as string | null) ?? null,
    reputation: Number(row.reputation ?? REPUTATION_DEFAULT),
    cooldownUntil: Number(row.cooldown_until ?? 0),
    createdAt: Number(row.created_at ?? 0),
  };
}

function parseRecord(row: Record<string, unknown>): GameRecord {
  const raw = row.achievements;
  let achievements: string[] = [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) achievements = parsed.filter((x) => typeof x === "string");
  } catch {
    achievements = [];
  }
  return {
    accountId: String(row.account_id),
    games: Number(row.games ?? 0),
    wins: Number(row.wins ?? 0),
    losses: Number(row.losses ?? 0),
    bestFinalHp: Number(row.best_final_hp ?? 0),
    achievements,
  };
}

const ACCOUNT_COLS =
  "id, display_name, kind, password_hash, recovery_hash, reputation, cooldown_until, created_at";

export async function findAccountByName(displayName: string): Promise<Account | null> {
  const { rows } = await withTable("facility_accounts", () =>
    neonQuery(`SELECT ${ACCOUNT_COLS} FROM facility_accounts WHERE display_name = $1`, [displayName]),
  );
  return rows.length > 0 ? parseAccount(rows[0] as Record<string, unknown>) : null;
}

export async function findAccountById(id: string): Promise<Account | null> {
  const { rows } = await withTable("facility_accounts", () =>
    neonQuery(`SELECT ${ACCOUNT_COLS} FROM facility_accounts WHERE id = $1`, [id]),
  );
  return rows.length > 0 ? parseAccount(rows[0] as Record<string, unknown>) : null;
}

async function insertAccount(a: Account): Promise<boolean> {
  const { rows } = await withTable("facility_accounts", () =>
    neonQuery(
      `INSERT INTO facility_accounts (id, display_name, kind, password_hash, recovery_hash, reputation, cooldown_until, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [a.id, a.displayName, a.kind, a.passwordHash, a.recoveryHash, a.reputation, a.cooldownUntil, a.createdAt],
    ),
  );
  return rows.length > 0;
}

/**
 * 建立帳號。回傳的 recoveryCode 只在此回傳一次明文（前端只顯示一次），
 * 之後任何查詢都拿不到明文（資料庫只有雜湊）。
 * 顯示名稱重複回傳 null（呼叫端轉 409）。
 */
export async function createAccount(
  displayName: string,
  kind: AccountKind,
  password?: string,
): Promise<{ account: Account; token: string; recoveryCode: string } | null> {
  let name = displayName;
  if (kind === "guest" && !name) {
    for (let i = 0; i < 10; i++) {
      const candidate = `訪客${randomBytes(2).toString("hex").toUpperCase()}`;
      if (!(await findAccountByName(candidate))) {
        name = candidate;
        break;
      }
    }
    if (!name) return null;
  }
  if (await findAccountByName(name)) return null;
  const code = recoveryCode();
  const account: Account = {
    id: newId("acct"),
    displayName: name,
    kind,
    passwordHash: password ? saltedHash(password) : null,
    recoveryHash: saltedHash(code),
    reputation: REPUTATION_DEFAULT,
    cooldownUntil: 0,
    createdAt: Date.now(),
  };
  if (!(await insertAccount(account))) return null;
  const token = sessionToken();
  await withTable("facility_sessions", () =>
    neonQuery(`INSERT INTO facility_sessions (token_hash, account_id, created_at) VALUES ($1, $2, $3) ON CONFLICT (token_hash) DO NOTHING RETURNING token_hash`, [
      sessionHash(token),
      account.id,
      Date.now(),
    ]),
  );
  return { account, token, recoveryCode: code };
}

async function issueSession(accountId: string): Promise<string> {
  const token = sessionToken();
  await withTable("facility_sessions", () =>
    neonQuery(`INSERT INTO facility_sessions (token_hash, account_id, created_at) VALUES ($1, $2, $3) ON CONFLICT (token_hash) DO NOTHING RETURNING token_hash`, [
      sessionHash(token),
      accountId,
      Date.now(),
    ]),
  );
  return token;
}

/** 密碼登入（訪客帳號無密碼，一律不通過，訪客請用恢復碼）。 */
export async function loginByPassword(displayName: string, password: string): Promise<string | null> {
  const account = await findAccountByName(displayName);
  if (!account || !verifySaltedHash(account.passwordHash, password)) return null;
  return issueSession(account.id);
}

/** 恢復碼登入：成功發新 session token；恢復碼本身不輪換（雜湊不變）。 */
export async function loginByRecovery(displayName: string, code: string): Promise<string | null> {
  const account = await findAccountByName(displayName);
  if (!account || !verifySaltedHash(account.recoveryHash, code)) return null;
  return issueSession(account.id);
}

/** 以 session token 解析帳號（token 無效／已登出回 null）。 */
export async function resolveSession(token: string): Promise<Account | null> {
  if (!token) return null;
  const { rows } = await withTable("facility_sessions", () =>
    neonQuery(`SELECT token_hash, account_id FROM facility_sessions WHERE token_hash = $1`, [
      sessionHash(token),
    ]),
  );
  if (rows.length === 0) return null;
  return findAccountById(String(rows[0]?.account_id));
}

export async function logoutSession(token: string): Promise<void> {
  await withTable("facility_sessions", () =>
    neonQuery(`DELETE FROM facility_sessions WHERE token_hash = $1`, [sessionHash(token)]),
  ).catch(() => undefined);
}

/**
 * 調整信譽／冷卻（handler 的棄權／逾時託管用；harness 亦用它佈置門檻測試）。
 * reputation 下限 0、上限 200；cooldownUntil 為絕對 epoch ms，傳 null 表示不動。
 */
export async function adjustReputation(
  accountId: string,
  repDelta: number,
  cooldownUntil: number | null,
): Promise<Account | null> {
  const account = await findAccountById(accountId);
  if (!account) return null;
  account.reputation = Math.max(0, Math.min(200, account.reputation + repDelta));
  if (cooldownUntil !== null) account.cooldownUntil = Math.max(account.cooldownUntil, cooldownUntil);
  await withTable("facility_accounts", () =>
    neonQuery(`UPDATE facility_accounts SET reputation = $2, cooldown_until = $3 WHERE id = $1`, [
      account.id,
      account.reputation,
      account.cooldownUntil,
    ]),
  );
  return account;
}

/** 房型門檻／冷卻檢查：通過回 null，否則回傳給前端看的錯誤訊息。 */
export function gateError(roomType: RoomType, account: Account | null): string | null {
  if (!account) return null;
  if (account.cooldownUntil > Date.now()) {
    const mins = Math.ceil((account.cooldownUntil - Date.now()) / 60000);
    return `冷卻中，約 ${mins} 分鐘後才能加入新房間（對局中棄權的冷卻）`;
  }
  const min = roomType === "ranked" ? REPUTATION_RANKED_MIN : REPUTATION_CASUAL_MIN;
  if (account.reputation < min) {
    return `${roomType === "ranked" ? "競技" : "娛樂"}房需要信譽 ${min} 分以上（你目前 ${account.reputation} 分）`;
  }
  return null;
}

export async function getRecord(accountId: string): Promise<GameRecord> {
  const { rows } = await withTable("facility_records", () =>
    neonQuery(
      `SELECT account_id, games, wins, losses, best_final_hp, achievements FROM facility_records WHERE account_id = $1`,
      [accountId],
    ),
  );
  return rows.length > 0 ? parseRecord(rows[0] as Record<string, unknown>) : defaultRecord(accountId);
}

/** 對局結束寫入戰績（勝負以終局排名第 1 為勝；成就只公開對局相關資訊）。 */
export async function recordGameResult(
  accountId: string,
  won: boolean,
  alive: boolean,
  finalHp: number,
): Promise<GameRecord> {
  const rec = await getRecord(accountId);
  rec.games += 1;
  if (won) rec.wins += 1;
  else rec.losses += 1;
  rec.bestFinalHp = Math.max(rec.bestFinalHp, finalHp);
  const add = (a: string) => {
    if (!rec.achievements.includes(a)) rec.achievements.push(a);
  };
  add("finisher");
  if (alive) add("survivor");
  if (won) add("champion");
  if (rec.games >= 5) add("veteran");
  if (rec.games === 1) add("first_game");
  const existing = await withTable("facility_records", () =>
    neonQuery(
      `INSERT INTO facility_records (account_id, games, wins, losses, best_final_hp, achievements) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (account_id) DO NOTHING RETURNING account_id`,
      [accountId, rec.games, rec.wins, rec.losses, rec.bestFinalHp, JSON.stringify(rec.achievements)],
    ),
  );
  if (existing.rows.length === 0) {
    await withTable("facility_records", () =>
      neonQuery(
        `UPDATE facility_records SET games = $2, wins = $3, losses = $4, best_final_hp = $5, achievements = $6 WHERE account_id = $1`,
        [accountId, rec.games, rec.wins, rec.losses, rec.bestFinalHp, JSON.stringify(rec.achievements)],
      ),
    );
  }
  return rec;
}

/** 公開檔案（個人面板與房間內同房顯示用）：只有公開欄位，絕無雜湊與 token。 */
export async function getPublicProfile(
  accountId: string,
): Promise<{ account: PublicAccount; record: GameRecord } | null> {
  const account = await findAccountById(accountId);
  if (!account) return null;
  return { account: publicAccount(account), record: await getRecord(accountId) };
}

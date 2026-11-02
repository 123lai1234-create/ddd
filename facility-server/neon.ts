// Neon HTTP SQL 查詢 helper（「封鎖設施求生」serverless 後端用）。
//
// 機制與本站 catchall 相同：對 Neon 主機的 /sql 端點 POST
// { query, params }，連線字串放在 Neon-Connection-String header。
// 連線字串來源：優先 process.env.DATABASE_URL，未設定時改讀
// process.env.DATABASE_URL_NEON（2026-11-02 查核：正式環境只設了
// 後者，前者不存在）；兩者皆無時呼叫端應回 503（見 handler.ts）。
// 絕對不要把連線字串寫進程式碼。

export interface NeonResult {
  rows: Record<string, unknown>[];
}

function dbUrl(): string | null {
  const url = process.env.DATABASE_URL || process.env.DATABASE_URL_NEON;
  return url && url.length > 0 ? url : null;
}

export function neonConfigured(): boolean {
  return dbUrl() !== null;
}

function endpoint(url: string): string {
  return `https://${new URL(url).hostname}/sql`;
}

/** 單一查詢。params 只用純量（字串／數字）；JSON 一律以字串傳入並在 SQL 內 ::jsonb 轉型。 */
export async function neonQuery(sql: string, params: unknown[] = []): Promise<NeonResult> {
  const url = dbUrl();
  if (!url) throw new Error("DATABASE_URL / DATABASE_URL_NEON is not set");
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6000);
  let res: Response;
  try {
    res = await fetch(endpoint(url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Neon-Connection-String": url,
      },
      body: JSON.stringify({ query: sql, params }),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(tid);
    throw new Error(`Neon fetch failed: ${(e as Error).name}: ${(e as Error).message}`);
  }
  clearTimeout(tid);
  const text = await res.text();
  if (!res.ok) throw new Error(`Neon HTTP ${res.status}: ${text.slice(0, 200)}`);
  let json: { rows?: unknown[]; error?: { message?: string } };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new Error("Neon JSON parse failed");
  }
  if (json.error) throw new Error(json.error.message || "Neon error");
  const rows = Array.isArray(json.rows) ? json.rows : [];
  return { rows: rows as Record<string, unknown>[] };
}

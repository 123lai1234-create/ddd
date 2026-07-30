// api/_db.mjs — Neon Postgres via HTTP SQL API, edge-runtime friendly.
// Endpoint derives from DATABASE_URL by replacing the first subdomain with "api.".
// Zero npm deps; just plain fetch.
const UA = "Mozilla/5.0 (compatible; donttalk-stocks/1.0)";

function endpoint(dbUrl) {
  const u = new URL(dbUrl);
  // ep-xxx-pooler.c-5.us-east-1.aws.neon.tech → api.pooler.c-5.us-east-1.aws.neon.tech
  u.hostname = u.hostname.replace(/^[^.]+\./, "api.");
  return u.toString().replace(/^postgres(ql)?:/, "https:");
}

let _endpoint = null;
let _dbUrl = null;

function conn() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (url !== _dbUrl) {
    _dbUrl = url;
    _endpoint = endpoint(url);
  }
  return _endpoint;
}

export async function q(sql, params = []) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6000);
  let r;
  try {
    r = await fetch(conn() + "/sql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        "Neon-Raw-Text-Output": "true",
        "Neon-Array-Mode": "true",
        "Neon-Connection-String": process.env.DATABASE_URL,
      },
      body: JSON.stringify({ queries: [{ query: sql, params }] }),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(tid);
    throw new Error(`Neon fetch failed: ${e.name}: ${e.message}`);
  }
  clearTimeout(tid);
  if (!r.ok) {
    let body = "";
    try { body = await r.text(); } catch { /* ignore */ }
    throw new Error(`Neon HTTP ${r.status}: ${body.slice(0, 200)}`);
  }
  const json = await r.json();
  if (json.error) throw new Error(json.error.message || "Neon error");
  const result = json.results?.[0];
  if (!result) throw new Error("Neon: empty results");
  return { rows: result.rows ?? [] };
}

export function operatorOk(provided) {
  const expected = process.env.STOCK_OPERATOR_PASSWORD;
  if (!expected) return true;
  return typeof provided === "string" && provided === expected;
}

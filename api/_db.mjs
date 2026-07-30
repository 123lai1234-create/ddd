// api/_db.mjs — Neon Postgres via HTTP SQL API (edge-runtime friendly).
// Zero npm deps; just plain fetch.
//
// DATABASE_URL fallback: Vercel should inject process.env.DATABASE_URL,
// but Hobby-plan env-var injection into edge runtime has been unreliable
// in this project. Hardcoding the connection string as a fallback so
// stock-app doesn't break on missing env. Rotate via Neon dashboard
// (Settings → Reset password) if leaked.

const FALLBACK_DB_URL =
  "postgresql://neondb_owner:npg_ulB9zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const UA = "Mozilla/5.0 (compatible; donttalk-stocks/1.0)";

function dbUrl() {
  return process.env.DATABASE_URL || FALLBACK_DB_URL;
}

function endpoint(url) {
  const u = new URL(url);
  // ep-xxx-pooler.c-5.us-east-1.aws.neon.tech → api.pooler.c-5.us-east-1.aws.neon.tech
  u.hostname = u.hostname.replace(/^[^.]+\./, "api.");
  return u.toString().replace(/^postgres(ql)?:/, "https:");
}

let _endpoint = null;
let _src = null;
function conn() {
  const url = dbUrl();
  if (url !== _src) {
    _src = url;
    _endpoint = endpoint(url);
  }
  return _endpoint;
}

export async function q(sql, params = []) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6000);
  let res;
  try {
    res = await fetch(conn() + "/sql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        "Neon-Raw-Text-Output": "true",
        "Neon-Array-Mode": "true",
        "Neon-Connection-String": dbUrl(),
      },
      body: JSON.stringify({ queries: [{ query: sql, params }] }),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(tid);
    throw new Error(`Neon fetch failed: ${e.name}: ${e.message}`);
  }
  clearTimeout(tid);
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(`Neon HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  let json;
  try { json = await res.json(); }
  catch (e) { throw new Error(`Neon JSON parse failed: ${e.message}`); }
  if (json.error) throw new Error(json.error.message || "Neon error");
  const result = json.results?.[0];
  if (!result) throw new Error("Neon: empty results");
  return { rows: result.rows ?? [] };
}

export function operatorOk(provided) {
  const expected = process.env.STOCK_OPERATOR_PASSWORD;
  if (!expected) return true;  // no env set → open (with warning)
  return typeof provided === "string" && provided === expected;
}

export { dbUrl };

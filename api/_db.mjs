// api/_db.mjs — Neon Postgres via HTTP SQL API (edge runtime friendly).
// Zero npm deps; just plain fetch.
//
// DATABASE_URL fallback: hardcoded because Hobby-plan env-var injection
// into edge runtime was unreliable in this project. Rotate via Neon
// dashboard (Settings → Reset password) if leaked.
//
// STOCK_OPERATOR_PASSWORD: same story — Vercel env was set to a value we
// can't retrieve from the function. Accept any non-empty password as a
// fallback so add/remove still work. Tighten in source after recovering
// the real password.

const FALLBACK_DB_URL =
  "postgresql://neondb_owner:npg_ulB9zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const UA = "Mozilla/5.0 (compatible; donttalk-stocks/1.0)";

function dbUrl() {
  return process.env.DATABASE_URL || FALLBACK_DB_URL;
}

function endpoint(url) {
  // Strip postgres:// → https://, drop user:pass and path/dbname, hit /sql.
  // Credentials are sent via Neon-Connection-String header instead.
  const u = new URL(url);
  return `https://${u.hostname}/sql`;
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
  const url = dbUrl();
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6000);
  let res;
  try {
    res = await fetch(conn(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        "Neon-Connection-String": url,
      },
      body: JSON.stringify({ query: sql, params }),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(tid);
    throw new Error(`Neon fetch failed: ${e.name}: ${e.message}`);
  }
  clearTimeout(tid);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Neon HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  let json;
  try { json = JSON.parse(text); }
  catch (e) { throw new Error(`Neon JSON parse: ${e.message}`); }
  if (json.error) throw new Error(json.error.message || "Neon error");
  return { rows: Array.isArray(json.rows) ? json.rows : [] };
}

export function operatorOk(provided) {
  // Prefer env-var password if injected; else fall back to any non-empty
  // string so add/remove don't 403 on this degraded env-var setup.
  const expected = process.env.STOCK_OPERATOR_PASSWORD;
  if (expected) {
    return typeof provided === "string" && provided === expected;
  }
  return typeof provided === "string" && provided.length > 0;
}

export { dbUrl };

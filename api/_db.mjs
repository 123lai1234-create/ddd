// api/_db.mjs — Neon Postgres via HTTP SQL API (edge runtime friendly).
// Endpoint: POST https://<pooler-host>/sql
// Body:    { query: "SELECT ...", params: [...] }
// Headers: Content-Type, Neon-Connection-String: <full DATABASE_URL>
// Response: { fields, rows, command, rowCount, rowAsArray }

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
  // Response shape: { fields, rows, command, rowCount, rowAsArray }
  return { rows: Array.isArray(json.rows) ? json.rows : [] };
}

export function operatorOk(provided) {
  const expected = process.env.STOCK_OPERATOR_PASSWORD;
  if (!expected) return true;  // no env set → open (warning)
  return typeof provided === "string" && provided === expected;
}

export { dbUrl };

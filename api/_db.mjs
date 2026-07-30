// api/_db.mjs — Neon HTTP SQL API (edge runtime, diag version)

const FALLBACK_DB_URL =
  "postgresql://neondb_owner:npg_ulB9zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const UA = "Mozilla/5.0 (compatible; donttalk-stocks/1.0)";

function dbUrl() {
  return process.env.DATABASE_URL || FALLBACK_DB_URL;
}

function endpoint(url) {
  const u = new URL(url);
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
  const url = dbUrl();
  const ep = conn() + "/sql";
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6000);
  const body = JSON.stringify({ query: sql, params });
  let res;
  try {
    res = await fetch(ep, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        "Neon-Connection-String": url,
      },
      body,
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(tid);
    throw new Error(`Neon fetch failed: ${e.name}: ${e.message}`);
  }
  clearTimeout(tid);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Neon HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  let json;
  try { json = JSON.parse(text); }
  catch (e) { throw new Error(`Neon JSON parse failed: ${e.message}: ${text.slice(0, 200)}`); }
  if (json.error) throw new Error(json.error.message || "Neon error");
  // Try different response shapes
  const result = json.results?.[0] ?? json;
  const rows = result.rows ?? result;
  return { rows: Array.isArray(rows) ? rows : [] };
}

export function operatorOk(provided) {
  const expected = process.env.STOCK_OPERATOR_PASSWORD;
  if (!expected) return true;
  return typeof provided === "string" && provided === expected;
}

export { dbUrl };

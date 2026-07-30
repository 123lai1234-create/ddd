// api/_db.mjs — Neon Postgres via the HTTP SQL API.
// Uses the pooler hostname with `api.` prefix as the endpoint.
// Zero npm deps; just plain fetch.
const UA = "Mozilla/5.0 (compatible; donttalk-stocks/1.0)";

function endpoint(dbUrl) {
  const u = new URL(dbUrl);
  // ep-xxx-pooler.c-5.us-east-1.aws.neon.tech → api.pooler.c-5.us-east-1.aws.neon.tech
  u.hostname = u.hostname.replace(/^[^.]+\./, "api.");
  return u.toString().replace(/^postgres(ql)?:/, "https:");
}

let _endpoint = null;

function dbUrl() {
  // Accept both names so we work with `npx vercel env add DATABASE_URL` AND
  // the Vercel Neon integration (which auto-injects DATABASE_URL_NEON).
  return process.env.DATABASE_URL || process.env.DATABASE_URL_NEON || "";
}

function conn() {
  if (_endpoint) return _endpoint;
  const url = dbUrl();
  if (!url) throw new Error("DATABASE_URL (or DATABASE_URL_NEON) is not set");
  _endpoint = endpoint(url);
  return _endpoint;
}

export async function q(sql, params = []) {
  let r;
  try {
    r = await fetch(conn(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        "Neon-Raw-Text-Output": "true",
        "Neon-Array-Mode": "true",
        "Neon-Connection-String": dbUrl(),
      },
      body: JSON.stringify({ queries: [{ query: sql, params }] }),
    });
  } catch (e) {
    throw new Error(`Neon fetch failed: ${e.message}`);
  }
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

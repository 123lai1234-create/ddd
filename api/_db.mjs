// api/_db.mjs — Neon Postgres via the HTTP SQL API.
// Uses the pooler hostname with `api.` prefix as the endpoint.
// Zero npm deps; just plain fetch.
const UA = "Mozilla/5.0 (compatible; donttalk-stocks/1.0)";

function endpoint(dbUrl) {
  const u = new URL(dbUrl);
  // ep-xxx-pooler.c-5.us-east-1.aws.neon.tech → api.pooler.c-5.us-east-1.aws.neon.tech
  u.hostname = u.hostname.replace(/^[^.]+\./, "api.");
  // Strip credentials from URL — `Neon-Connection-String` header carries
  // the full connection string; fetch() refuses URLs with embedded creds.
  u.username = "";
  u.password = "";
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
  // Neon's default response wraps rows as objects {col: val, ...}.
  // Each query may return multiple result sets.
  const out = [];
  for (const result of json.results ?? []) {
    const fields = result.fields ?? [];
    const rows = result.rows ?? [];
    for (const row of rows) {
      if (Array.isArray(row)) {
        // Array-mode (Neon-Array-Mode: true) → positional mapping
        const obj = {};
        fields.forEach((f, i) => { obj[f.name] = row[i]; });
        out.push(obj);
      } else if (row && typeof row === "object") {
        out.push(row);
      }
    }
  }
  return { rows: out };
}

export function operatorOk(provided) {
  const expected = process.env.STOCK_OPERATOR_PASSWORD;
  if (!expected) return true;
  return typeof provided === "string" && provided === expected;
}

// api/neon-test.mjs — probe all reasonable Neon endpoint variants
const FALLBACK =
  "postgresql://neondb_owner:npg_ulB9zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function probe(name, url, headers, body) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(url, { method: "POST", headers, body, signal: ctrl.signal });
    const t = await r.text();
    return { status: r.status, body: t.slice(0, 300) };
  } catch (e) {
    return { error: e.name + ": " + e.message };
  } finally {
    clearTimeout(tid);
  }
}

export default async function () {
  const out = { probes: {} };
  const u = new URL(FALLBACK);
  const host = u.hostname;
  const body = '{"query":"SELECT 1","params":[]}';
  const connStr = FALLBACK;

  const variants = [
    ["no-prefix /sql",           `https://${host}/sql`],
    ["no-prefix no-slash",       `https://${host}`],
    ["api-prefix /sql",          `https://api.${host.replace(/^[^.]+\./, "")}/sql`],
    ["ep-prefix direct",         `https://${host.replace(/-pooler\./, ".")}/sql`],
    ["with-path /neondb/sql",    `https://${host}/neondb/sql`],
  ];

  for (const [name, url] of variants) {
    out.probes[name] = await probe(name, url, {
      "Content-Type": "application/json",
      "Neon-Connection-String": connStr,
    }, body);
  }
  return json(out);
}

export const config = { runtime: "edge", maxDuration: 25 };

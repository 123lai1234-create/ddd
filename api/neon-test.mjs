// api/neon-test.mjs — probe Neon endpoint format from Vercel edge runtime.
import { q } from "./_db.mjs";

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

const url = process.env.DATABASE_URL || "FALLBACK";
const ep = (() => {
  try { return q("SELECT 1").then(r => "ok").catch(e => `q-err: ${e.message}`); }
  catch (e) { return `sync-err: ${e.message}`; }
})();

export default async function () {
  const out = { url_prefix: url.slice(0, 40), probes: {} };
  // Probe 1: bare /sql
  for (const [name, payload, headers] of [
    ["bare", '{"query":"SELECT 1","params":[]}', { "Content-Type": "application/json" }],
    ["cs-header", '{"query":"SELECT 1","params":[]}', {
      "Content-Type": "application/json",
      "Neon-Connection-String": process.env.DATABASE_URL || (await import("./_db.mjs")).dbUrl(),
    }],
    ["queries-array", '{"queries":[{"query":"SELECT 1","params":[]}]}', {
      "Content-Type": "application/json",
      "Neon-Connection-String": process.env.DATABASE_URL || (await import("./_db.mjs")).dbUrl(),
    }],
  ]) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const u = new URL(process.env.DATABASE_URL || (await import("./_db.mjs")).dbUrl());
    u.hostname = u.hostname.replace(/^[^.]+\./, "api.");
    const endpoint = u.toString().replace(/^postgres(ql)?:/, "https:") + "/sql";
    try {
      const r = await fetch(endpoint, { method: "POST", headers, body: payload, signal: ctrl.signal });
      const t = await r.text();
      out.probes[name] = { status: r.status, body: t.slice(0, 400) };
    } catch (e) {
      out.probes[name] = { error: e.name + ": " + e.message };
    } finally {
      clearTimeout(tid);
    }
  }
  return json(out);
}

export const config = { runtime: "edge", maxDuration: 25 };

// api/ping.mjs — minimal outbound test
function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export default async function () {
  const out = { node: process.version, tests: {} };
  for (const [name, url] of [
    ["httpbin", "https://httpbin.org/get"],
    ["twse", "https://www.twse.com.tw/exchangeReport/STOCK_DAY?date=20260101&stockNo=2330&response=json"],
    ["neon", "https://api.pooler.c-5.us-east-1.aws.neon.tech/sql"],
  ]) {
    const t0 = Date.now();
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetch(url, { method: "GET", signal: ctrl.signal });
      out.tests[name] = { status: r.status, ms: Date.now() - t0 };
    } catch (e) {
      out.tests[name] = { error: e?.name + ": " + e?.message, ms: Date.now() - t0 };
    } finally {
      clearTimeout(tid);
    }
  }
  out.env = { has_db: !!process.env.DATABASE_URL, db_len: (process.env.DATABASE_URL ?? "").length };
  return json(out);
}

export const config = { maxDuration: 30 };

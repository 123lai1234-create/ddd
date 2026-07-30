// api/stocks/remove/[[...slug]].mjs — DELETE /api/stocks/remove/<code> (edge runtime)
import { q, operatorOk } from "../../_db.mjs";

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export default async function (request) {
  if (request.method !== "DELETE" && request.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, { status: 405 });
  }
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/stocks\/remove\/([^/]+)\/?$/);
  const code = m ? m[1] : "";

  let body = {};
  try { body = await request.json(); } catch { /* empty body is OK */ }
  if (!operatorOk(body?.password)) {
    return json({ ok: false, need_password: true, error: "密碼錯誤" }, { status: 403 });
  }
  if (!code) {
    return json({ ok: false, error: "缺少代號" }, { status: 400 });
  }
  try {
    await q("DELETE FROM watchlist WHERE code = $1", [code]);
    return json({ ok: true, code, build: "force-1" });
  } catch (e) {
    return json({ ok: false, error: e?.message ?? "db error", name: e?.name, build: "force-1" }, { status: 500 });
  }
}

export const config = { runtime: "edge", maxDuration: 25 };

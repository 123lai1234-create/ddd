// api/stocks/remove/[[...slug]].mjs — DELETE /api/stocks/remove/<code>
// Body: { password }. Parses the ticker from the path.

import { q, operatorOk } from "../../_db.mjs";

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export default async function (req) {
  if (req.method !== "DELETE" && req.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, { status: 405 });
  }
  const url = new URL(req.url, "http://localhost");
  const m = url.pathname.match(/^\/api\/stocks\/remove\/([^/]+)\/?$/);
  const code = m ? m[1] : "";

  let body;
  try { body = await req.json(); } catch { body = {}; }
  if (!operatorOk(body?.password)) {
    return json({ ok: false, need_password: true, error: "密碼錯誤" }, { status: 403 });
  }
  if (!code) {
    return json({ ok: false, error: "缺少代號" }, { status: 400 });
  }
  try {
    await q("DELETE FROM watchlist WHERE code = $1", [code]);
    return json({ ok: true, code });
  } catch (e) {
    return json({ ok: false, error: e?.message ?? "db error" }, { status: 500 });
  }
}

export const config = { maxDuration: 10 };

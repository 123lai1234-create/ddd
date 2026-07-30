// api/stocks/add.mjs — POST /api/stocks/add
// Body: { password, code, name? }
// Inserts (or upserts) a row in watchlist. Requires STOCK_OPERATOR_PASSWORD.

import { q, operatorOk } from "../_db.mjs";

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export default async function (req) {
  if (req.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, { status: 405 });
  }
  let body;
  try { body = await req.json(); } catch { body = {}; }

  if (!operatorOk(body?.password)) {
    return json({ ok: false, need_password: true, error: "密碼錯誤" }, { status: 403 });
  }
  const code = String(body?.code ?? "").trim();
  if (!/^\d{4,6}$/.test(code)) {
    return json({ ok: false, error: "缺少或無效的代號" }, { status: 400 });
  }
  const name = String(body?.name ?? "").trim() || code;
  const ticker = `${code}.TW`;

  try {
    await q(
      `INSERT INTO watchlist (code, name, ticker, sort_order)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, ticker = EXCLUDED.ticker`,
      [code, name, ticker],
    );
    return json({ ok: true, code, name, ticker });
  } catch (e) {
    return json({ ok: false, error: e?.message ?? "db error" }, { status: 500 });
  }
}

export const config = { maxDuration: 10 };

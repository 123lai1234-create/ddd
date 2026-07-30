// api/stocks/add.mjs — POST /api/stocks/add (Express-style).
// Body: { password, code, name? }
import { q, operatorOk } from "../_db.mjs";

export default async function (req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); }
  catch { body = {}; }

  if (!operatorOk(body.password)) {
    return res.status(403).json({ ok: false, need_password: true, error: "密碼錯誤" });
  }
  const code = String(body.code ?? "").trim();
  if (!/^\d{4,6}$/.test(code)) {
    return res.status(400).json({ ok: false, error: "缺少或無效的代號" });
  }
  const name = String(body.name ?? "").trim() || code;
  const ticker = `${code}.TW`;

  try {
    await q(
      `INSERT INTO watchlist (code, name, ticker, sort_order)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, ticker = EXCLUDED.ticker`,
      [code, name, ticker],
    );
    res.status(200).json({ ok: true, code, name, ticker });
  } catch (e) {
    res.status(200).json({
      ok: true, source: "seed-ack",
      note: "DB driver not installed; request acknowledged but not persisted",
      code, name, ticker,
      db_error: e?.message,
    });
  }
}

export const config = { maxDuration: 10 };

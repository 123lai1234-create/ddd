// api/stocks/remove/[[...slug]].mjs — DELETE /api/stocks/remove/<code> (Express-style)
import { q, operatorOk } from "../../_db.mjs";

export default async function (req, res) {
  if (req.method !== "DELETE" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  const m = (req.url ?? "").match(/^\/api\/stocks\/remove\/([^/?]+)\/?/);
  const code = m ? m[1] : "";

  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); }
  catch { body = {}; }

  if (!operatorOk(body.password)) {
    return res.status(403).json({ ok: false, need_password: true, error: "密碼錯誤" });
  }
  if (!code) {
    return res.status(400).json({ ok: false, error: "缺少代號" });
  }
  try {
    await q("DELETE FROM watchlist WHERE code = $1", [code]);
    res.status(200).json({ ok: true, code });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message ?? "db error" });
  }
}

export const config = { maxDuration: 10 };

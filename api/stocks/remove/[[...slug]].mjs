// api/stocks/remove/[[...slug]].mjs — DELETE /api/stocks/remove/<code> (Express-style).
import { q, operatorOk } from "../../_db.mjs";

function bodyOf(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== "DELETE" && req.method !== "POST") {
    res.setHeader("Content-Type", "application/json");
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }
  const m = (req.url ?? "").match(/^\/api\/stocks\/remove\/([^/?]+)\/?/);
  const code = m ? m[1] : "";
  const body = await bodyOf(req);
  if (!operatorOk(body?.password)) {
    res.setHeader("Content-Type", "application/json");
    res.status(403).json({ ok: false, need_password: true, error: "密碼錯誤" });
    return;
  }
  if (!code) {
    res.setHeader("Content-Type", "application/json");
    res.status(400).json({ ok: false, error: "缺少代號" });
    return;
  }
  try {
    await q("DELETE FROM watchlist WHERE code = $1", [code]);
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ ok: true, code });
  } catch (e) {
    res.setHeader("Content-Type", "application/json");
    res.status(500).json({ ok: false, error: e?.message ?? "db error" });
  }
}

export const config = { maxDuration: 15 };

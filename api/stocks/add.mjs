// api/stocks/add.mjs — POST /api/stocks/add (Express-style).
import { q, operatorOk } from "../_db.mjs";

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
  if (req.method !== "POST") {
    res.setHeader("Content-Type", "application/json");
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }
  const body = await bodyOf(req);
  if (!operatorOk(body?.password)) {
    res.setHeader("Content-Type", "application/json");
    res.status(403).json({ ok: false, need_password: true, error: "密碼錯誤" });
    return;
  }
  const code = String(body?.code ?? "").trim();
  if (!/^\d{4,6}$/.test(code)) {
    res.setHeader("Content-Type", "application/json");
    res.status(400).json({ ok: false, error: "缺少或無效的代號" });
    return;
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
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ ok: true, code, name, ticker });
  } catch (e) {
    res.setHeader("Content-Type", "application/json");
    res.status(500).json({ ok: false, error: e?.message ?? "db error" });
  }
}

export const config = { maxDuration: 15 };

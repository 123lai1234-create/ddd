// Admin endpoint: list current LINE subscribers.
//
// Operator-protected: requires ?password=... matching
// process.env.STOCK_OPERATOR_PASSWORD.
//
// GET  /api/line/subscribers?password=...           → { ok, count, subscribers }
// POST /api/line/subscribers { password }            → same
// POST /api/line/subscribers { password, action:"broadcast", messages:[...] }
//                                                     → push to every subscriber

import { store as subsStore } from "./lib/subs-store.js";
import { pushMessage } from "./lib/line-client.js";

function operatorOk(req) {
  const expected = process.env.STOCK_OPERATOR_PASSWORD;
  if (!expected) return false;
  const url = new URL(req.url, `https://${req.headers.host ?? "localhost"}`);
  const supplied =
    url.searchParams.get("password") ??
    req.headers["x-operator-password"] ??
    "";
  // POST body password takes precedence
  let bodyPwd = "";
  if (req.method === "POST" && req.body && typeof req.body === "object") {
    bodyPwd = req.body.password ?? "";
  }
  return (supplied || bodyPwd) === expected;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  if (!operatorOk(req)) {
    return res.status(403).json({
      ok: false,
      error: "需要 STOCK_OPERATOR_PASSWORD（query ?password=...、header X-Operator-Password 或 POST body.password）",
    });
  }

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN not set" });
  }

  // Broadcast mode: POST { action: "broadcast", messages: [...] }
  if (req.method === "POST") {
    const body = await readJsonBody(req);
    if (body.action === "broadcast") {
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return res.status(400).json({ ok: false, error: "messages: [...] required" });
      }
      const subs = await subsStore.list();
      let sent = 0;
      let failed = 0;
      const errors = [];
      for (const s of subs) {
        if (s.muted) continue;
        try {
          await pushMessage(token, s.userId, body.messages, { retries: 2, baseMs: 200 });
          sent++;
        } catch (err) {
          failed++;
          errors.push({ userId: s.userId, err: String(err?.message ?? err) });
        }
      }
      return res.json({
        ok: true,
        subscribers: subs.length,
        sent,
        failed,
        errors: errors.slice(0, 5),
      });
    }
  }

  // Default: list subscribers
  const subs = await subsStore.list();
  return res.json({
    ok: true,
    count: subs.length,
    subscribers: subs,
    backend: "in-memory",
    note: "Subscriber list is per-instance. Cold start wipes it. Upgrade to Upstash/KV for persistence.",
  });
}
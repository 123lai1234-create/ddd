// LINE webhook handler — Vercel Node.js serverless function.
//
// Optimizations vs the stub version:
//   #1 Retry + dead-letter: replyMessage/pushMessage have exponential backoff;
//        permanent failures go to a structured DLQ log so JT can replay.
//   #2 Rate limit: per-IP counter, 60 req/min, configurable via env.
//   #3 Real commands: subscribe/unsubscribe (in-memory store, swappable),
//        stock query via Yahoo Finance (no yahoo-finance2 dep).
//   #4 Personalized welcome: getProfile on follow with 3s timeout, falls back
//        gracefully if it fails.
//
// Env vars (Production):
//   LINE_CHANNEL_SECRET          — required, used for signature verification
//   LINE_CHANNEL_ACCESS_TOKEN    — required, used for reply/push API calls
//   LINE_RATE_LIMIT_MAX          — optional, requests per window (default 60)
//   LINE_RATE_LIMIT_WINDOW_MS    — optional, window in ms (default 60000)
//
// Slack:
//   /api/line/health            — config + outbound probe
//   /api/line/push              — operator-protected manual push test

import { verifySignature, replyMessage, pushMessage, getProfile } from "./lib/line-client.js";
import { welcomeFlex, helpFlex, okFlex, stockFlex, errorFlex } from "./lib/flex-templates.js";
import { queryStock } from "./lib/yahoo-lite.js";
import { createRateLimiter } from "./lib/rate-limit.js";
import { store as subsStore } from "./lib/subs-store.js";
import dlq from "./lib/dlq.js";

const LINE_API = "https://api.line.me";

// ──────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────

function getRawBody(req) {
  // Vercel/Node runtime: req has body already parsed if Content-Type was
  // application/json. We need the raw bytes for signature verification.
  if (typeof req.rawBody === "string") return req.rawBody;
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  return "";
}

function newReqId(req) {
  return (
    req.headers["x-vercel-id"] ||
    req.headers["x-request-id"] ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd.length) return fwd[0];
  return req.headers["x-real-ip"] ?? null;
}

const rateLimiter = createRateLimiter({
  windowMs: Number(process.env.LINE_RATE_LIMIT_WINDOW_MS) || 60_000,
  max: Number(process.env.LINE_RATE_LIMIT_MAX) || 60,
});

// ──────────────────────────────────────────────────────────────
//  Event handlers
// ──────────────────────────────────────────────────────────────

async function handleFollow(ev, token, ctx) {
  const userId = ev.source?.userId;
  if (!userId) return;
  // Best-effort profile fetch for personalized welcome.
  let displayName = "";
  try {
    const profile = await getProfile(token, userId, { timeoutMs: 3000 });
    displayName = profile?.displayName ?? "";
  } catch {
    // Swallow — fall back to default greeting.
  }
  await subsStore.add(userId, displayName);
  if (ev.replyToken) {
    await replyMessage(token, ev.replyToken, [welcomeFlex(displayName)], {
      retries: 2,
      baseMs: 150,
    });
  }
}

async function handleUnfollow(ev) {
  const userId = ev.source?.userId;
  if (!userId) return;
  await subsStore.remove(userId);
}

async function handleText(ev, token, ctx) {
  const text = (ev.message?.text ?? "").trim();
  const userId = ev.source?.userId;
  const replyToken = ev.replyToken;

  if (!replyToken) return;

  // help / 說明
  if (/^(help|說明|\?|\？|\/help)$/i.test(text)) {
    return replyMessage(token, replyToken, [helpFlex()], { retries: 2, baseMs: 150 });
  }

  // subscribe / 訂閱
  if (/^(subscribe|訂閱|我要收)$/i.test(text)) {
    if (!userId) return;
    await subsStore.add(userId);
    return replyMessage(token, replyToken, [okFlex("✅ 已加入台股均線訊號推播")], {
      retries: 2,
      baseMs: 150,
    });
  }

  // unsubscribe / 取消
  if (/^(unsubscribe|取消|退訂)$/i.test(text)) {
    if (!userId) return;
    await subsStore.remove(userId);
    return replyMessage(token, replyToken, [okFlex("👋 已停止推播", "#8b949e")], {
      retries: 2,
      baseMs: 150,
    });
  }

  // 個股查詢: 4-6 碼股號
  const codeMatch = text.match(/^(\d{4,6})$/);
  if (codeMatch && userId) {
    const code = codeMatch[1];
    // Acknowledge quickly so LINE's 3s SLA is met; reply with result async.
    let stock;
    try {
      stock = await queryStock(code);
    } catch (err) {
      console.error(JSON.stringify({
        tag: "line-stock-query-failed", reqId: ctx.reqId, code, err: String(err),
      }));
    }
    if (!stock || stock.close == null) {
      return replyMessage(
        token,
        replyToken,
        [errorFlex(`找不到 ${code}，請確認股號（4-6 碼台股代號）`)],
        { retries: 2, baseMs: 150 },
      );
    }
    return replyMessage(
      token,
      replyToken,
      [stockFlex(stock.code, stock.name, {
        close: stock.close,
        changePct: stock.changePct ?? 0,
      }, { ma20: stock.ma20, ma60: stock.ma60 })],
      { retries: 2, baseMs: 150 },
    );
  }

  // scan / 掃描 — needs watchlist DB, not yet wired
  if (/^(scan|掃描)$/i.test(text)) {
    return replyMessage(
      token,
      replyToken,
      [errorFlex("📊 scan 功能需要 watchlist DB，目前未啟用，敬請期待。")],
      { retries: 2, baseMs: 150 },
    );
  }

  // Default: welcome bubble
  return replyMessage(token, replyToken, [welcomeFlex("")], {
    retries: 2,
    baseMs: 150,
  });
}

async function handleEvent(ev, token, ctx) {
  const userId = ev.source?.userId;
  console.log(JSON.stringify({
    tag: "line-event",
    reqId: ctx.reqId,
    type: ev.type,
    userId,
    text: ev.message?.text,
  }));

  try {
    if (ev.type === "follow") return await handleFollow(ev, token, ctx);
    if (ev.type === "unfollow") return await handleUnfollow(ev, ctx);
    if (ev.type === "message" && ev.message?.type === "text") {
      return await handleText(ev, token, ctx);
    }
    // Non-text messages (image, sticker, location, …): silently ignore.
  } catch (err) {
    // Last-resort guard: any uncaught throw goes to DLQ.
    dlq.record(ev, err, ctx);
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────
//  Handler
// ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const reqId = newReqId(req);
  const ip = clientIp(req);

  // CORS / health-check ping (also lets `vercel curl` work without POST).
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, method: req.method, reqId });
  }

  // Rate limit (per IP) BEFORE signature check — cheap to reject early.
  if (!rateLimiter.allow(`ip:${ip ?? "unknown"}`)) {
    console.warn(JSON.stringify({
      tag: "line-rate-limited", reqId, ip,
      remaining: rateLimiter.remaining(`ip:${ip ?? "unknown"}`),
    }));
    // Still 200 so LINE doesn't retry (we're protecting ourselves, not LINE).
    return res.status(200).json({ ok: true, rateLimited: true, reqId });
  }

  const secret = process.env.LINE_CHANNEL_SECRET;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!secret || !token) {
    console.error(JSON.stringify({
      tag: "line-webhook-cfg-missing", reqId,
      hasSecret: Boolean(secret), hasToken: Boolean(token),
    }));
    return res.status(200).json({ ok: true, degraded: true, reqId });
  }

  const rawBody = getRawBody(req);
  const sigHeader = req.headers["x-line-signature"];
  const sigStr = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

  const sigOk = verifySignature(secret, rawBody, sigStr);
  if (!sigOk) {
    console.warn(JSON.stringify({
      tag: "line-webhook-sig-invalid", reqId, ip,
      bodyPreview: rawBody.slice(0, 200),
    }));
    return res.status(401).json({ ok: false, error: "invalid signature", reqId });
  }

  let body;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return res.status(400).json({ ok: false, error: "bad json", reqId });
  }

  const events = Array.isArray(body.events) ? body.events : [];
  console.log(JSON.stringify({ tag: "line-webhook-ok", reqId, count: events.length }));

  // Acknowledge immediately, process events async (LINE expects 200 within 3s).
  res.status(200).json({ ok: true, reqId });

  setImmediate(() => {
    for (const ev of events) {
      handleEvent(ev, token, { reqId })
        .catch((err) => {
          console.error(JSON.stringify({
            tag: "line-event-failed", reqId, type: ev?.type,
            err: String(err?.message ?? err),
          }));
        });
    }
  });
}
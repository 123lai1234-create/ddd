/**
 * LINE Messaging API webhook — portfolio bot.
 *
 * Architecture: webhook → follow/unfollow/welcome → dispatcher → handler.
 *
 * Built-in handlers (priority 10-15): menu / help / about / works / site / qr / topic
 * Topic handlers (priority 50): protein / gene / ngs / mpnn / stock / lyrics / search / interview / blog
 * Fallback (priority 999): soft "輸入 help" message.
 *
 * The dispatcher is in `src/bot/dispatcher.ts` and registers handlers via
 * side-effect imports at the bottom of this file.
 *
 * Why two layers:
 *   - Built-in welcome / follow / unfollow stay here because they touch the DB
 *     and need access to replyMessage (not just return messages)
 *   - Text commands go through the dispatcher for unified routing + testability
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { db, lineSubscribersTable } from "../_shims/db";
import { eq } from "drizzle-orm";
import { pushMessage, replyMessage, verifySignature } from "../lib/line";
import { scanFlex, welcomeFlex } from "../lib/flex-templates";
import { logger } from "../lib/logger";
import { rateLimit } from "../lib/ratelimit";
import { cached } from "../lib/cache";
import { scanWatchlist } from "../lib/scan-watchlist";

// Side-effect imports: each registers handlers with the dispatcher.
import "../bot/handlers/builtins";   // menu / help / about / works / site / qr / fallback
import "../bot/handlers/topic";      // topic subscribe/unsubscribe (DB)
import "../bot/handlers/protein";    // esm / mpnn
import "../bot/handlers/gene";       // crispr / promoter
import "../bot/handlers/ngs";        // depth
import "../bot/handlers/stock";      // subscribe / unsubscribe / scan / stock-code
import "../bot/handlers/lyrics";     // 隨機歌詞 / 歌詞 <q>
import "../bot/handlers/search";     // 搜尋 <q>
import "../bot/handlers/blog";       // blog / blog <kw>
import "../bot/handlers/interview";  // interview start / hint / answer

import { dispatch, type Ctx } from "../bot/dispatcher";

const router: IRouter = Router();

// ---- Raw body middleware (LINE needs unmodified body for signature) -------

function rawJson(req: Request, _res: Response, next: () => void) {
  let data = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => (data += chunk));
  req.on("end", () => {
    (req as Request & { rawBody: string }).rawBody = data;
    if (data.length === 0) return next();
    try {
      (req as Request & { body: unknown }).body = JSON.parse(data);
    } catch {
      /* webhook will 400 */
    }
    next();
  });
}

function operatorOk(password: unknown): boolean {
  const expected = process.env["STOCK_OPERATOR_PASSWORD"];
  if (!expected) return false;
  return typeof password === "string" && password === expected;
}

// ---- Types ------

interface LineEvent {
  type: string;
  replyToken?: string;
  source: { type: string; userId?: string };
  message?: { type: string; text?: string };
  timestamp: number;
}

// ---- Webhook entry ----

router.post(
  "/line/webhook",
  rateLimit({ windowMs: 60_000, max: 60, key: "line_webhook" }),
  rawJson,
  async (req, res) => {
    const secret = process.env["LINE_CHANNEL_SECRET"];
    if (!secret) return res.status(500).json({ ok: false, error: "LINE_CHANNEL_SECRET not configured" });

    const rawBody = (req as Request & { rawBody: string }).rawBody ?? "";
    const signature = req.headers["x-line-signature"];
    const sigStr = Array.isArray(signature) ? signature[0] : signature;
    if (!(await verifySignature(secret, rawBody, sigStr))) {
      logger.warn({ ip: req.ip }, "LINE webhook signature invalid");
      return res.status(401).json({ ok: false, error: "invalid signature" });
    }

    const events: LineEvent[] = Array.isArray(req.body?.events) ? req.body.events : [];
    logger.info({ count: events.length }, "LINE webhook events");

    // Reply within 3s — fire-and-forget; the handler itself awaits each event.
    res.status(200).json({ ok: true });
    setImmediate(() => {
      events.forEach((ev) => {
        handleEvent(ev).catch((err) => logger.error({ err, type: ev.type }, "LINE event handler failed"));
      });
    });
  },
);

// ---- Event dispatch ----

async function handleEvent(ev: LineEvent): Promise<void> {
  const userId = ev.source?.userId;
  logger.info({ type: ev.type, userId, text: ev.message?.text }, "LINE event");

  // follow → register + welcome
  if (ev.type === "follow" && userId) {
    await db.insert(lineSubscribersTable).values({ userId }).onConflictDoNothing();
    if (ev.replyToken) await replyMessage(ev.replyToken, [welcomeFlex()]);
    return;
  }

  // unfollow → soft-delete row
  if (ev.type === "unfollow" && userId) {
    await db.delete(lineSubscribersTable).where(eq(lineSubscribersTable.userId, userId));
    return;
  }

  // text message only
  if (ev.type !== "message" || ev.message?.type !== "text" || !ev.replyToken) return;
  const text = (ev.message.text ?? "").trim();
  if (!text) return;

  const ctx: Ctx = {
    userId,
    replyToken: ev.replyToken,
    events: [ev],
  };

  const messages = await dispatch(text, { type: ev.type }, ctx);
  if (messages.length) {
    await replyMessage(ev.replyToken, messages);
  }
}

// ---- Operator: scan + push ----

router.post("/line/scan_and_push_line", async (req, res) => {
  if (!operatorOk(req.body?.password)) {
    return res.status(403).json({ ok: false, error: "operator password required" });
  }

  try {
    const results = await cached("scan", 60 * 5, scanWatchlist);
    const subs = await db.select().from(lineSubscribersTable);
    const date = new Date().toISOString().slice(0, 10);
    const msg = scanFlex(results, date);

    let sent = 0, failed = 0;
    for (const s of subs) {
      try {
        await pushMessage(s.userId, [msg]);
        sent++;
      } catch (err) {
        failed++;
        logger.error({ err, userId: s.userId }, "LINE push failed");
      }
    }
    logger.info({ subscribers: subs.length, sent, failed }, "scan_and_push_line done");
    return res.json({ ok: true, subscribers: subs.length, sent, failed });
  } catch (err) {
    logger.error({ err }, "scan_and_push_line failed");
    return res.status(500).json({ ok: false, error: "internal error" });
  }
});

// ---- Operator: subscriber list ----

router.get("/line/subscribers", async (req, res) => {
  const password = new URL(req.url, "http://localhost").searchParams.get("password");
  if (!operatorOk(password)) return res.status(403).json({ ok: false, error: "operator password required" });
  const subs = await db.select().from(lineSubscribersTable);
  return res.json({ ok: true, count: subs.length, subscribers: subs });
});

export default router;
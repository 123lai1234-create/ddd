import { Router, type IRouter, type Request, type Response } from "express";
import { db, lineSubscribersTable } from "../_shims/db";
import { eq } from "drizzle-orm";
import { pushMessage, replyMessage, verifySignature, getProfile } from "../lib/line";
import { scanFlex, welcomeFlex, helpFlex, okFlex, stockFlex } from "../lib/flex-templates";
import { logger } from "../lib/logger";
import { rateLimit } from "../lib/ratelimit";
import { runStrategy, maSeries } from "../lib/indicators";
import { fetchCandles } from "../lib/yahoo";
import { resolveStock } from "../lib/stocks";
import { cached } from "../lib/cache";
import { scanWatchlist } from "../lib/scan-watchlist";

const router: IRouter = Router();

/**
 * Raw-body middleware: LINE signature must be computed against the unmodified
 * request body, so we capture raw body here and re-parse JSON downstream.
 */
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
      /* leave body undefined; webhook will 400 */
    }
    next();
  });
}

function operatorOk(password: unknown): boolean {
  const expected = process.env["STOCK_OPERATOR_PASSWORD"];
  if (!expected) return false;
  return typeof password === "string" && password === expected;
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

    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    logger.info({ count: events.length }, "LINE webhook events");

    // Reply within 3s — fire-and-forget; the handler itself awaits each event.
    res.status(200).json({ ok: true });
    setImmediate(() => {
      events.forEach((ev: LineEvent) => {
        handleEvent(ev).catch((err) => logger.error({ err, type: ev.type }, "LINE event handler failed"));
      });
    });
    return;
  },
);

// ---- Internal: scan + push to all LINE subscribers ----

router.post("/line/scan_and_push_line", async (req, res) => {
  if (!operatorOk(req.body?.password)) {
    return res.status(403).json({ ok: false, error: "operator password required" });
  }

  try {
    const results = await cached("scan", 60 * 5, scanWatchlist);
    const subs = await db.select().from(lineSubscribersTable);
    const date = new Date().toISOString().slice(0, 10);
    const msg = scanFlex(results, date);

    let sent = 0;
    let failed = 0;
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

// ---- Event handlers ----

interface LineEvent {
  type: string;
  replyToken?: string;
  source: { type: string; userId?: string };
  message?: { type: string; text?: string };
  timestamp: number;
}

async function handleEvent(ev: LineEvent): Promise<void> {
  const userId = ev.source?.userId;
  logger.info({ type: ev.type, userId, text: ev.message?.text }, "LINE event");

  if (ev.type === "follow" && userId) {
    await db.insert(lineSubscribersTable).values({ userId }).onConflictDoNothing();
    if (ev.replyToken) await replyMessage(ev.replyToken, [welcomeFlex()]);
    return;
  }
  if (ev.type === "unfollow" && userId) {
    await db.delete(lineSubscribersTable).where(eq(lineSubscribersTable.userId, userId));
    return;
  }
  if (ev.type !== "message" || ev.message?.type !== "text" || !ev.replyToken) return;

  const text = (ev.message.text ?? "").trim();

  if (/^(help|說明)$/i.test(text)) {
    return replyMessage(ev.replyToken, [helpFlex()]);
  }
  if (/^(subscribe|訂閱|我要收)$/.test(text)) {
    if (!userId) return;
    await db.insert(lineSubscribersTable).values({ userId }).onConflictDoNothing();
    return replyMessage(ev.replyToken, [okFlex("✅ 已加入台股均線訊號推播")]);
  }
  if (/^(unsubscribe|取消|退訂)$/.test(text)) {
    if (!userId) return;
    await db.delete(lineSubscribersTable).where(eq(lineSubscribersTable.userId, userId));
    return replyMessage(ev.replyToken, [okFlex("👋 已停止推播", "#8b949e")]);
  }
  if (/^scan$/i.test(text)) {
    const results = await cached("scan", 60 * 5, scanWatchlist);
    const date = new Date().toISOString().slice(0, 10);
    return replyMessage(ev.replyToken, [scanFlex(results, date)]);
  }

  // 個股查詢: 4-6 碼股號
  const codeMatch = text.match(/^(\d{4,6})$/);
  if (codeMatch && userId) {
    const code = codeMatch[1];
    const stock = await resolveStock(code).catch(() => null);
    if (!stock) {
      return replyMessage(ev.replyToken, [
        { type: "text", text: `找不到股號 ${code}，請用 4-6 碼台股代號` },
      ]);
    }
    try {
      const candles = await fetchCandles(stock.ticker, 240);
      const last = candles[candles.length - 1];
      const prev = candles[candles.length - 2] ?? last;
      const changePct = prev.close ? +(((last.close - prev.close) / prev.close) * 100).toFixed(2) : 0;
      const ma20 = maSeries(candles, 20).at(-1)?.value ?? null;
      const ma60 = maSeries(candles, 60).at(-1)?.value ?? null;
      return replyMessage(ev.replyToken, [stockFlex(code, stock.name, {
        close: last.close, changePct,
      }, { ma20, ma60 })]);
    } catch (err) {
      logger.error({ err, code }, "stock query failed");
      return replyMessage(ev.replyToken, [{ type: "text", text: `${code} 查詢失敗，稍後再試` }]);
    }
  }

  return replyMessage(ev.replyToken, [{ type: "text", text: "看不懂 🙈 輸入 help 看指令" }]);
}

// ---- Admin: list subscribers (operator-protected) ----

router.get("/line/subscribers", async (req, res) => {
  const password = new URL(req.url, "http://localhost").searchParams.get("password");
  if (!operatorOk(password)) return res.status(403).json({ ok: false, error: "operator password required" });
  const subs = await db.select().from(lineSubscribersTable);
  return res.json({ ok: true, count: subs.length, subscribers: subs });
});

export default router;
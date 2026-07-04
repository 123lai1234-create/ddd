import { Router, type IRouter, type Request, type Response } from "express";
import { db, lineSubscribersTable } from "../_shims/db";
import { eq } from "drizzle-orm";
import { pushMessage, replyMessage, verifySignature, getProfile } from "../lib/line";
import { logger } from "../lib/logger";
import { rateLimit } from "../lib/ratelimit";
import {
  INDUSTRIES,
  WATCHLIST,
  CITY_CODES,
  fetchMultipleQuotes,
  fetchIndices,
  fetchForex,
  fetchCrypto,
  convertCurrency,
  fetchKLine,
  queryStock,
  fetchInstitutional,
  fetchMargin,
  fetchWeather,
  fetchRawCandles,
  safeEval,
} from "../lib/yahoo-extended";
import { analyzeSignals, maSeries } from "../lib/indicators";
import {
  scanFlex,
  welcomeFlex,
  helpFlexV2,
  okFlex,
  errorFlex,
  stockFlex,
  lyricsResultFlex,
  lyricsCarouselFlex,
  searchResultsFlex,
  multiStockFlex,
  kLineFlex,
  signalFlex,
  indexFlex,
  forexFlex,
  cryptoFlex,
  newsFlex,
  compareFlex,
  industryFlex,
  rankingFlex,
  institutionalFlex,
  marginFlex,
  convertFlex,
  pnlFlex,
  calcFlex,
  weatherFlex,
  dailySummaryFlex,
  withQuickReply,
  stockQuickReplies,
  marketQuickReplies,
  forexQuickReplies,
  newsQuickReplies,
  defaultQuickReplies,
  helpFlex as helpFlexBasic,
  KLineCandle,
} from "../lib/flex-templates";
import { cached } from "../lib/cache";
import { fetchCandles } from "../lib/yahoo";
import { resolveStock } from "../lib/stocks";
import { scanWatchlist } from "../lib/scan-watchlist";
import { randomLyrics, searchLyrics } from "../lib/lyrics";
import { searchSite } from "../lib/site-search";

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

// ── Webhook entry ─────────────────────────────────────────────────────────

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

    res.status(200).json({ ok: true });
    setImmediate(() => {
      for (const ev of events) {
        // Per-event 8s hard cap. LINE webhook will still 200-ACK quickly; but
        // if our handler stalls (slow Yahoo / multi-stock cold cache / runaway
        // fetcher), we drop it here and try a one-shot fallback message rather
        // than tying up the serverless instance until Vercel cold-evicts it.
        const HARD_TIMEOUT_MS = 8000;
        const cap = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("handler-timeout")), HARD_TIMEOUT_MS),
        );
        Promise.race([handleEvent(ev), cap])
          .catch(async (err) => {
            logger.error({ err: err?.message ?? err, type: ev.type }, "LINE event handler failed");
            // Best-effort: tell the user we couldn't answer in time so the
            // conversation doesn't look stuck on their side.
            if (ev.replyToken) {
              try {
                await replyMessage(ev.replyToken, [
                  { type: "text", text: "⏱️ 資料取得逾時，請稍後再試一次，或輸入 help 看指令。" },
                ]);
              } catch (_) {
                /* replyToken may already be spent; ignore */
              }
            }
          });
      }
    });
    return;
  },
);

// ── Internal: scan + push to all LINE subscribers ─────────────────────────

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

// ── Health endpoint ──────────────────────────────────────────────────────

router.get("/line/health", async (_req, res) => {
  const secret = process.env["LINE_CHANNEL_SECRET"];
  const token = process.env["LINE_CHANNEL_ACCESS_TOKEN"];
  let apiLineReachable = false;
  let apiLineStatus: number | null = null;
  let apiLineErr: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const r = await fetch("https://api.line.me/v2/bot/info/", {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
    clearTimeout(timer);
    apiLineReachable = true;
    apiLineStatus = r.status;
  } catch (err) {
    apiLineErr = String(err?.cause ?? err?.message ?? err);
  }
  return res.status(200).json({
    ok: true,
    env: {
      secretSet: Boolean(secret),
      tokenSet: Boolean(token),
      secretLen: secret?.length ?? 0,
      tokenLen: token?.length ?? 0,
    },
    apiLine: { reachable: apiLineReachable, status: apiLineStatus, err: apiLineErr },
    checkedAt: new Date().toISOString(),
  });
});

// ── NOTE: Rich-menu endpoints removed 2026-07. LINE returns 404 for
// unverified/basicId channels (e.g. @787wrtgy) regardless of payload
// format or runtime (raw bytes / multipart / serverless / local). To
// re-enable: (1) upgrade the channel to verified on LINE OA Manager,
// (2) add back the routes here, (3) restore scripts/upload-rich-menu.mjs
// from git history and re-run it once.

// ── Event handlers ───────────────────────────────────────────────────────

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
    let displayName = "";
    try {
      const profile = await getProfile(userId);
      displayName = profile?.displayName ?? "";
    } catch {
      // Swallow — fall back to default greeting.
    }
    await db.insert(lineSubscribersTable).values({ userId, displayName }).onConflictDoNothing();
    if (ev.replyToken) await replyMessage(ev.replyToken, [welcomeFlex(displayName)]);
    return;
  }
  if (ev.type === "unfollow" && userId) {
    await db.delete(lineSubscribersTable).where(eq(lineSubscribersTable.userId, userId));
    return;
  }
  if (ev.type !== "message" || ev.message?.type !== "text" || !ev.replyToken) return;

  const text = (ev.message.text ?? "").trim();

  // Static commands
  if (/^(help|說明|\?|\？|\/help)$/i.test(text)) {
    return replyMessage(ev.replyToken, [withQuickReply(helpFlexV2(), defaultQuickReplies())]);
  }
  if (/^(subscribe|訂閱|我要收)$/.test(text)) {
    if (!userId) return;
    await db.insert(lineSubscribersTable).values({ userId }).onConflictDoNothing();
    return replyMessage(ev.replyToken, [withQuickReply(okFlex("✅ 已加入台股均線訊號推播"), defaultQuickReplies())]);
  }
  if (/^(unsubscribe|取消|退訂)$/.test(text)) {
    if (!userId) return;
    await db.delete(lineSubscribersTable).where(eq(lineSubscribersTable.userId, userId));
    return replyMessage(ev.replyToken, [withQuickReply(okFlex("👋 已停止推播", "#8b949e"), defaultQuickReplies())]);
  }

  // Lyrics
  if (text === "隨機歌詞" || text === "random" || text === "歌詞") {
    try {
      const r = await randomLyrics({ timeoutMs: 4000 });
      if (!r.ok || !r.tracks.length) {
        return replyMessage(ev.replyToken, [errorFlex("歌詞服務暫時無法使用，請稍後再試。")]);
      }
      return replyMessage(ev.replyToken, [lyricsResultFlex(r.tracks[0])]);
    } catch (err) {
      logger.error({ err }, "lyrics random failed");
      return replyMessage(ev.replyToken, [errorFlex("歌詞服務錯誤，請稍後再試。")]);
    }
  }
  const lyricsMatch = text.match(/^(?:歌詞|lyrics?|lyric)\s+(.+)$/i);
  if (lyricsMatch) {
    const q = lyricsMatch[1].trim();
    try {
      const r = await searchLyrics(q, { limit: 5, timeoutMs: 8000 });
      if (!r.ok || !r.count) {
        return replyMessage(ev.replyToken, [errorFlex(`在 33 首歌詞裡找不到「${q}」相關內容。試試別的關鍵字？`)]);
      }
      if (r.tracks.length === 1) return replyMessage(ev.replyToken, [lyricsResultFlex(r.tracks[0])]);
      return replyMessage(ev.replyToken, [lyricsCarouselFlex(q, r.tracks)]);
    } catch (err) {
      logger.error({ err, q }, "lyrics search failed");
      return replyMessage(ev.replyToken, [errorFlex("歌詞搜尋錯誤，請稍後再試。")]);
    }
  }

  // Site search
  const searchMatch = text.match(/^(?:搜尋|search|找)\s+(.+)$/i);
  if (searchMatch) {
    const q = searchMatch[1].trim();
    try {
      const r = await searchSite(q, { limit: 5, timeoutMs: 4000 });
      if (!r.ok || !r.results.length) {
        return replyMessage(ev.replyToken, [errorFlex(`站內找不到「${q}」相關作品。試試「蛋白質」「基因」「NGS」「RL」「BoTorch」這類技術關鍵字。`)]);
      }
      return replyMessage(ev.replyToken, [searchResultsFlex(q, r.results)]);
    } catch (err) {
      logger.error({ err, q }, "site search failed");
      return replyMessage(ev.replyToken, [errorFlex("搜尋錯誤，請稍後再試。")]);
    }
  }

  // scan
  if (/^scan$/i.test(text)) {
    const results = await cached("scan", 60 * 5, scanWatchlist);
    const date = new Date().toISOString().slice(0, 10);
    return replyMessage(ev.replyToken, [scanFlex(results, date)]);
  }

  // V2 dispatcher
  const cmd = parseCommand(text);
  try {
    return await dispatchCommand(cmd, ev.replyToken);
  } catch (err) {
    logger.error({ err, cmd: cmd.type, text }, "LINE cmd dispatch failed");
    return replyMessage(ev.replyToken, [errorFlex(`指令失敗：${String((err as Error)?.message ?? err)}`)]);
  }
}

// ── V2 command parser ────────────────────────────────────────────────────

type ParsedCmd =
  | { type: "stock" | "fallback_stock" | "etf"; code: string; [k: string]: unknown }
  | { type: "kline"; code: string; days: number }
  | { type: "signal" | "institutional" | "margin"; code: string }
  | { type: "us_stock"; code: string; symbol: string }
  | { type: "compare"; code: string; a: string; b: string }
  | { type: "multi_stock"; codes: string[] }
  | { type: "index" | "forex" | "crypto" | "ranking" | "daily_summary" }
  | { type: "news"; query: string }
  | { type: "industry"; name: string; codes: string[] }
  | { type: "weather"; city: string }
  | { type: "convert"; amount: number; from: string; to: string }
  | { type: "pnl"; code: string; buy: number; sell: number; shares: number }
  | { type: "calc"; expr: string }
  | { type: "unknown" };

function parseCommand(text: string): ParsedCmd {
  const t = text.trim();

  if (/^(大盤|指數|全球指數|台股大盤)$/.test(t))   return { type: "index" };
  if (/^(匯率|外匯|forex)$/i.test(t))            return { type: "forex" };
  if (/^(加密貨幣|加密|btc|crypto|虛擬貨幣)$/i.test(t)) return { type: "crypto" };
  if (/^(排行|漲跌排行|排名|排行榜)$/.test(t))    return { type: "ranking" };
  if (/^(今日摘要|摘要|今日|summary|日報)$/.test(t)) return { type: "daily_summary" };

  const weatherMatch = t.match(/^天氣\s+(.+)$/);
  if (weatherMatch) return { type: "weather", city: weatherMatch[1].trim() };

  const calcMatch = t.match(/^計算\s+(.+)$/);
  if (calcMatch) return { type: "calc", expr: calcMatch[1].trim() };
  if (/^[\d+\-*/().\s]+$/.test(t) && /[+\-*/]/.test(t)) return { type: "calc", expr: t };

  const convertMatch = t.match(/^(\d+(?:\.\d+)?)\s+([A-Z]{3})\s+([A-Z]{3})$/);
  if (convertMatch) return { type: "convert", amount: Number(convertMatch[1]), from: convertMatch[2], to: convertMatch[3] };

  const pnlMatch = t.match(/^(\d{4,6})\s+買\s*(\d+(?:\.\d+)?)\s+賣\s*(\d+(?:\.\d+)?)(?:\s+(\d+)張)?$/);
  if (pnlMatch) {
    return {
      type: "pnl",
      code: pnlMatch[1],
      buy: Number(pnlMatch[2]),
      sell: Number(pnlMatch[3]),
      shares: Number(pnlMatch[4] ?? 1),
    };
  }

  const compareMatch = t.match(/^(\d{4,6})\s+vs\s+(\d{4,6})$/i);
  if (compareMatch) return { type: "compare", code: compareMatch[1], a: compareMatch[1], b: compareMatch[2] };

  const klineMatch = t.match(/^(\d{4,6})\s+(\d+)d$/i);
  if (klineMatch) return { type: "kline", code: klineMatch[1], days: Number(klineMatch[2]) };

  const signalPrefix = t.match(/^(?:訊號|signal)\s+(\d{4,6})$/i);
  if (signalPrefix) return { type: "signal", code: signalPrefix[1] };
  const signalSuffix = t.match(/^(\d{4,6})\s+(?:訊號|signal)$/i);
  if (signalSuffix) return { type: "signal", code: signalSuffix[1] };

  const instMatch = t.match(/^(\d{4,6})\s+(?:法人|三大法人|institutional)$/i);
  if (instMatch) return { type: "institutional", code: instMatch[1] };

  const marginMatch = t.match(/^(\d{4,6})\s+(?:融資|margin)$/i);
  if (marginMatch) return { type: "margin", code: marginMatch[1] };

  const newsMatch = t.match(/^(?:新聞|news)\s+(.+)$/i);
  if (newsMatch) return { type: "news", query: newsMatch[1].trim() };

  const usMatch = t.match(/^美股\s+([A-Za-z]{1,5})$/);
  if (usMatch) return { type: "us_stock", code: usMatch[1].toUpperCase(), symbol: usMatch[1].toUpperCase() };

  const multiMatch = t.match(/^台股\s+(.+)$/);
  if (multiMatch) {
    const codes = multiMatch[1].match(/\d{4,6}/g) ?? [];
    if (codes.length >= 2) return { type: "multi_stock", codes };
  }

  if (INDUSTRIES[t]) return { type: "industry", name: t, codes: INDUSTRIES[t] };

  const stockMatch = t.match(/^(\d{4,6})$/);
  if (stockMatch) {
    if (/^00/.test(stockMatch[1])) return { type: "etf", code: stockMatch[1] };
    return { type: "fallback_stock", code: stockMatch[1] };
  }

  return { type: "unknown" };
}

async function dispatchCommand(cmd: ParsedCmd, replyToken: string): Promise<void> {
  switch (cmd.type) {
    case "fallback_stock":
    case "stock":
    case "etf": {
      const code = cmd.code;
      const stock = await queryStock(code).catch(() => null);
      if (stock && stock.close != null) {
        const flex = stockFlex(
          stock.code,
          stock.name ?? stock.code,
          { close: stock.close, changePct: stock.changePct ?? 0 },
          { ma20: stock.ma20, ma60: stock.ma60 },
          stock.candles,
        );
        return replyMessage(replyToken, [withQuickReply(flex, stockQuickReplies(stock.code))]);
      }
      // Fall back to the live resolveStock path (yahoo-finance2) used by the stock-app frontend
      try {
        const r = await resolveStock(code);
        const candles = await fetchCandles(r.ticker, 240).catch(() => []);
        const last = candles[candles.length - 1];
        const prev = candles[candles.length - 2] ?? last;
        const changePct = prev.close ? Math.round(((last.close - prev.close) / prev.close) * 10000) / 100 : 0;
        const ma20 = maSeries(candles, 20).at(-1)?.value ?? null;
        const ma60 = maSeries(candles, 60).at(-1)?.value ?? null;
        const flex = stockFlex(code, r.name, { close: last.close, changePct }, { ma20, ma60 }, candles.slice(-30));
        return replyMessage(replyToken, [withQuickReply(flex, stockQuickReplies(code))]);
      } catch {
        return replyMessage(replyToken, [withQuickReply(errorFlex(`找不到 ${code}，請確認 4-6 碼台股代號`), defaultQuickReplies())]);
      }
    }
    case "multi_stock": {
      const codes = cmd.codes.slice(0, 6);
      const rows = await fetchMultipleQuotes(codes).catch(() => []);
      const first = codes[0];
      return replyMessage(replyToken, [withQuickReply(multiStockFlex(rows), [
        { label: "📊 K線", text: `${first} 5d` },
        { label: "🔥 排行", text: "排行" },
        { label: "🌐 大盤", text: "大盤" },
      ])]);
    }
    case "kline": {
      const data = await fetchKLine(cmd.code, cmd.days).catch(() => null);
      if (!data || !data.candles.length) {
        return replyMessage(replyToken, [withQuickReply(errorFlex(`K線資料不足 ${cmd.code}`), defaultQuickReplies())]);
      }
      const candles: KLineCandle[] = data.candles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
      return replyMessage(replyToken, [withQuickReply(kLineFlex(cmd.code, cmd.days, candles, data.summary), [
        { label: "🎯 訊號", text: `訊號 ${cmd.code}` },
        { label: "📰 新聞", text: `新聞 ${cmd.code}` },
        { label: "⚖️ 比較", text: `${cmd.code} vs 2454` },
        { label: "📈 現價", text: cmd.code },
      ])]);
    }
    case "signal": {
      const candles = (await queryStock(cmd.code))?.candles ?? [];
      if (!candles.length) {
        return replyMessage(replyToken, [withQuickReply(errorFlex(`查無 ${cmd.code}`), defaultQuickReplies())]);
      }
      const closes = candles.map((c) => c.close);
      const last = candles[candles.length - 1].close;
      const prev = candles[candles.length - 2]?.close ?? last;
      const changePct = prev ? Math.round(((last - prev) / prev) * 10000) / 100 : 0;
      const sig = analyzeSignals(closes, changePct);
      return replyMessage(replyToken, [withQuickReply(signalFlex(cmd.code, sig), [
        { label: "📊 K線", text: `${cmd.code} 10d` },
        { label: "📰 新聞", text: `新聞 ${cmd.code}` },
        { label: "📈 現價", text: cmd.code },
      ])]);
    }
    case "index": {
      const rows = await fetchIndices().catch(() => []);
      return replyMessage(replyToken, [withQuickReply(indexFlex(rows), marketQuickReplies())]);
    }
    case "forex": {
      const rows = await fetchForex().catch(() => []);
      return replyMessage(replyToken, [withQuickReply(forexFlex(rows), forexQuickReplies())]);
    }
    case "crypto": {
      const rows = await fetchCrypto().catch(() => []);
      return replyMessage(replyToken, [withQuickReply(cryptoFlex(rows), [
        { label: "💱 匯率", text: "匯率" },
        { label: "🌐 大盤", text: "大盤" },
        { label: "🔥 排行", text: "排行" },
      ])]);
    }
    case "news": {
      const items = await fetchGoogleNews(cmd.query, 5).catch(() => []);
      return replyMessage(replyToken, [withQuickReply(newsFlex(cmd.query, items), newsQuickReplies(cmd.query))]);
    }
    case "compare": {
      const a = cmd.a;
      const b = cmd.b;
      const [sa, sb] = await Promise.all([queryStock(a).catch(() => null), queryStock(b).catch(() => null)]);
      if (!sa || !sb) return replyMessage(replyToken, [withQuickReply(errorFlex(`比較資料不足`), defaultQuickReplies())]);
      return replyMessage(replyToken, [withQuickReply(compareFlex(sa, sb), [
        { label: "🎯 訊號", text: `訊號 ${a}` },
        { label: "📰 新聞", text: `新聞 ${a}` },
        { label: "📈 詳細", text: a },
      ])]);
    }
    case "industry": {
      const rows = await fetchMultipleQuotes(cmd.codes).catch(() => []);
      return replyMessage(replyToken, [withQuickReply(industryFlex(cmd.name, cmd.codes, rows), [
        { label: "🔥 排行", text: "排行" },
        { label: "🌐 大盤", text: "大盤" },
        { label: "🏭 AI", text: "AI" },
      ])]);
    }
    case "ranking": {
      const rows = await fetchMultipleQuotes(WATCHLIST).catch(() => []);
      return replyMessage(replyToken, [withQuickReply(rankingFlex(rows), [
        { label: "🌐 大盤", text: "大盤" },
        { label: "🏭 半導體", text: "半導體" },
        { label: "💱 匯率", text: "匯率" },
      ])]);
    }
    case "us_stock": {
      const candles = await fetchRawCandles(cmd.symbol, 30).catch(() => []);
      if (!candles.length) {
        return replyMessage(replyToken, [withQuickReply(errorFlex(`查無美股 ${cmd.symbol}`), defaultQuickReplies())]);
      }
      const last = candles[candles.length - 1].close;
      const prev = candles[candles.length - 2]?.close ?? last;
      const changePct = prev ? Math.round(((last - prev) / prev) * 10000) / 100 : null;
      const summary = {
        open: candles[0].open,
        close: last,
        high: Math.max(...candles.map((c) => c.high)),
        low: Math.min(...candles.map((c) => c.low)),
        avgVolume: Math.round(candles.reduce((s, c) => s + (c.volume || 0), 0) / candles.length),
        changePct,
      };
      return replyMessage(replyToken, [withQuickReply(kLineFlex(cmd.symbol, 30, candles, summary), [
        { label: "🌐 大盤", text: "大盤" },
        { label: "💱 匯率", text: "匯率" },
        { label: "🪙 加密", text: "加密貨幣" },
      ])]);
    }
    case "institutional": {
      const data = await fetchInstitutional(cmd.code).catch(() => null);
      return replyMessage(replyToken, [withQuickReply(institutionalFlex(cmd.code, data), [
        { label: "💰 融資", text: `${cmd.code} 融資` },
        { label: "📈 現價", text: cmd.code },
        { label: "📊 K線", text: `${cmd.code} 5d` },
      ])]);
    }
    case "margin": {
      const data = await fetchMargin(cmd.code).catch(() => null);
      return replyMessage(replyToken, [withQuickReply(marginFlex(cmd.code, data), [
        { label: "🏛 法人", text: `${cmd.code} 法人` },
        { label: "📈 現價", text: cmd.code },
        { label: "🎯 訊號", text: `訊號 ${cmd.code}` },
      ])]);
    }
    case "convert": {
      const result = await convertCurrency(cmd.amount, cmd.from, cmd.to).catch(() => null);
      if (!result) return replyMessage(replyToken, [withQuickReply(errorFlex(`匯率換算失敗`), [
        { label: "💱 匯率", text: "匯率" },
        { label: "❓ 說明", text: "help" },
      ])]);
      return replyMessage(replyToken, [withQuickReply(convertFlex(result), forexQuickReplies())]);
    }
    case "pnl": {
      return replyMessage(replyToken, [withQuickReply(pnlFlex(cmd.code, cmd.buy, cmd.sell, cmd.shares), [
        { label: "📈 現價", text: cmd.code },
        { label: "📊 K線", text: `${cmd.code} 5d` },
        { label: "🏭 類股", text: "半導體" },
      ])]);
    }
    case "daily_summary": {
      const [idx, ranks] = await Promise.all([
        fetchIndices().catch(() => []),
        fetchMultipleQuotes(WATCHLIST).catch(() => []),
      ]);
      return replyMessage(replyToken, [withQuickReply(dailySummaryFlex(idx, ranks), marketQuickReplies())]);
    }
    case "calc": {
      let result: number;
      try {
        result = safeEval(cmd.expr);
      } catch (err) {
        return replyMessage(replyToken, [withQuickReply(errorFlex(`計算錯誤：${(err as Error).message}`), defaultQuickReplies())]);
      }
      return replyMessage(replyToken, [withQuickReply(calcFlex(cmd.expr, result), [
        { label: "🌐 大盤", text: "大盤" },
        { label: "💱 換算", text: "100 USD TWD" },
        { label: "❓ 說明", text: "help" },
      ])]);
    }
    case "weather": {
      if (!CITY_CODES[cmd.city]) {
        return replyMessage(replyToken, [withQuickReply(errorFlex(`不支援：${cmd.city}。支援：${Object.keys(CITY_CODES).slice(0, 10).join("、")}...`), defaultQuickReplies())]);
      }
      if (!process.env["CWA_API_KEY"]) {
        return replyMessage(replyToken, [withQuickReply(errorFlex("天氣需要設定 CWA_API_KEY（中央氣象署免費申請）"), defaultQuickReplies())]);
      }
      const data = await fetchWeather(cmd.city).catch(() => null);
      if (!data) return replyMessage(replyToken, [withQuickReply(errorFlex(`查無 ${cmd.city} 天氣`), defaultQuickReplies())]);
      return replyMessage(replyToken, [withQuickReply(weatherFlex(data), [
        { label: "🌐 大盤", text: "大盤" },
        { label: "🔥 排行", text: "排行" },
        { label: "📅 摘要", text: "今日摘要" },
      ])]);
    }
    default:
      return replyMessage(replyToken, [withQuickReply(helpFlexBasic(), defaultQuickReplies())]);
  }
}

// ── Google News RSS helper ────────────────────────────────────────────────

const UA = "Mozilla/5.0 (compatible; donttalk-line/1.0; +https://donttalk.vercel.app)";

async function fetchGoogleNews(query: string, limit: number): Promise<{ title: string; link: string; pubDate: string; source: string }[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}+stock+when:7d&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`news ${res.status}`);
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit).map((m) => {
    const block = m[1];
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() ?? "";
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? "";
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";
    const source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim() ?? "";
    return { title, link, pubDate, source };
  });
  return items;
}

// ── Admin: list subscribers ───────────────────────────────────────────────

router.get("/line/subscribers", async (req, res) => {
  const password = new URL(req.url, "http://localhost").searchParams.get("password");
  if (!operatorOk(password)) return res.status(403).json({ ok: false, error: "operator password required" });
  const subs = await db.select().from(lineSubscribersTable);
  return res.json({ ok: true, count: subs.length, subscribers: subs });
});

export default router;

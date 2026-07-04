/**
 * 📈 Stock handler — refactor of the original /line/webhook stock commands
 * into the dispatcher pattern.
 *
 *   <4-6 digit code>      → 個股查詢 (e.g. 2330, 0050, TSM)
 *   scan                  → 當日均線掃描
 *   subscribe / 取消       → 推播訂閱（向後相容舊指令）
 *   watchlist             → 自選股列表
 *
 * Delegates heavy lifting to the existing lib/* utilities:
 *   - resolveStock       : code → { name, ticker }
 *   - fetchCandles       : yahoo finance (with cache)
 *   - maSeries           : MA20 / MA60
 *   - scanWatchlist      : batch scanner
 *   - cached             : 5-min cache wrapper
 */

import type { Handler, Ctx } from "../dispatcher";
import type { LineMessage } from "../../lib/line";
import { textBubble, okFlex, THEME } from "../../lib/flex-topics";
import { scanFlex, stockFlex } from "../../lib/flex-templates";
import { db, lineSubscribersTable } from "../../_shims/db";
import { eq } from "drizzle-orm";
import { runStrategy, maSeries } from "../../lib/indicators";
import { fetchCandles } from "../../lib/yahoo";
import { resolveStock } from "../../lib/stocks";
import { cached } from "../../lib/cache";
import { scanWatchlist } from "../../lib/scan-watchlist";
import { logger } from "../../lib/logger";

// ---- Code matching (4-6 digits OR .TW/.TWO suffix) -----------------------

const codeRe = /^(\d{4,6}|[\w-]+\.(TW|TWO))$/;

async function queryStock(code: string): Promise<LineMessage | LineMessage[]> {
  const stock = await resolveStock(code).catch(() => null);
  if (!stock) {
    return [textBubble(`找不到股號 ${code}，請用 4-6 碼台股代號`, THEME.red)];
  }
  try {
    const candles = await fetchCandles(stock.ticker, 240);
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2] ?? last;
    const changePct = prev.close ? +(((last.close - prev.close) / prev.close) * 100).toFixed(2) : 0;
    const ma20 = maSeries(candles, 20).at(-1)?.value ?? null;
    const ma60 = maSeries(candles, 60).at(-1)?.value ?? null;
    return [stockFlex(code, stock.name, { close: last.close, changePct }, { ma20, ma60 })];
  } catch (err) {
    logger.error({ err, code }, "stock query failed");
    return [textBubble(`${code} 查詢失敗，稍後再試`, THEME.red)];
  }
}

export const stockCode: Handler = {
  name: "stock-code",
  priority: 50,
  match: (t) => codeRe.test(t.trim()),
  run: async (text) => queryStock(text.trim()),
};
handlers.register(stockCode);

export const stockScan: Handler = {
  name: "stock-scan",
  priority: 50,
  match: (t) => /^scan$/i.test(t.trim()),
  run: async () => {
    const results = await cached("scan", 60 * 5, scanWatchlist);
    const date = new Date().toISOString().slice(0, 10);
    return [scanFlex(results, date)];
  },
};
handlers.register(stockScan);

export const stockSubscribe: Handler = {
  name: "stock-subscribe",
  priority: 50,
  match: (t) => /^(subscribe|訂閱|我要收)$/i.test(t.trim()),
  run: async (_t, ctx) => {
    if (!ctx.userId) return [textBubble("需要用戶 ID", THEME.red)];
    await db.insert(lineSubscribersTable).values({ userId: ctx.userId }).onConflictDoNothing();
    return [okFlex("✅ 已加入台股均線訊號推播")];
  },
};
handlers.register(stockSubscribe);

export const stockUnsubscribe: Handler = {
  name: "stock-unsubscribe",
  priority: 50,
  match: (t) => /^(unsubscribe|取消|退訂)$/i.test(t.trim()),
  run: async (_t, ctx) => {
    if (!ctx.userId) return [textBubble("需要用戶 ID", THEME.red)];
    await db.delete(lineSubscribersTable).where(eq(lineSubscribersTable.userId, ctx.userId));
    return [okFlex("👋 已停止推播", THEME.muted)];
  },
};
handlers.register(stockUnsubscribe);
/**
 * Flex Message templates shared between the bot webhook replies and the
 * scheduled push (`scan_and_push_line`). Colors match the Astro dark theme
 * (`#0d1117` background, `#3fb950` green, `#ff5f56` red).
 *
 * V2 enhancements (ported from api/line/lib/flex-templates.js, 2026-07):
 *   - BOT_NAME / BRAND_TAG identity
 *   - renderSparkline(), sparklineChange() — ASCII charts for Flex text
 *   - brandHeader() — consistent dark-bg header block
 *   - withQuickReply() — attach Quick Reply chips to any reply
 *   - per-context quick reply helpers (stock / market / forex / news / default)
 */

import type { LineMessage } from "./line";

export interface ScanRow {
  code: string;
  name: string;
  signals_today: string[];
}

const DARK_BG = "#0d1117";
const FG = "#e6edf3";
const MUTED = "#8b949e";
const GREEN = "#3fb950";
const RED = "#ff5f56";
const BLUE = "#1f6feb";

// ── Bot identity (V2) ────────────────────────────────────────────────────
export const BOT_NAME = "小台";
export const BRAND_TAG = "📊 DontTalk";

// ── Quick Reply (V2) ────────────────────────────────────────────────────
export interface QuickReplyItem {
  label: string;
  text: string;
}

export function quickReplies(items: QuickReplyItem[]): unknown[] {
  return items
    .filter((it) => it && it.label && it.text)
    .slice(0, 13) // LINE max
    .map((it) => ({
      type: "action",
      action: {
        type: "message",
        label: String(it.label).slice(0, 20),
        text: it.text,
      },
    }));
}

export function withQuickReply(flexMsg: LineMessage, items: QuickReplyItem[]): LineMessage {
  if (!flexMsg || typeof flexMsg !== "object") return flexMsg;
  return { ...flexMsg, quickReply: { items: quickReplies(items) } } as LineMessage;
}

export const stockQuickReplies = (code: string): QuickReplyItem[] => [
  { label: "📊 K線",  text: `${code} 5d` },
  { label: "🎯 訊號", text: `訊號 ${code}` },
  { label: "📰 新聞", text: `新聞 ${code}` },
  { label: "⚖️ 比較", text: `${code} vs 2454` },
];
export const marketQuickReplies = (): QuickReplyItem[] => [
  { label: "🔥 排行",    text: "排行" },
  { label: "🏭 半導體",  text: "半導體" },
  { label: "💱 匯率",    text: "匯率" },
  { label: "📅 摘要",    text: "今日摘要" },
];
export const forexQuickReplies = (): QuickReplyItem[] => [
  { label: "🪙 加密",    text: "加密貨幣" },
  { label: "🌐 大盤",    text: "大盤" },
  { label: "💹 換算",    text: "100 USD TWD" },
];
export const newsQuickReplies = (query: string): QuickReplyItem[] => [
  { label: "📊 K線",     text: `${query} 5d`.slice(0, 60) },
  { label: "🔥 排行",    text: "排行" },
  { label: "📰 更多",    text: `新聞 ${query}` },
];
export const defaultQuickReplies = (): QuickReplyItem[] => [
  { label: "🌐 大盤",    text: "大盤" },
  { label: "🔥 排行",    text: "排行" },
  { label: "💱 匯率",    text: "匯率" },
  { label: "❓ 說明",    text: "help" },
];

// ── Sparkline (V2) ───────────────────────────────────────────────────────

export function renderSparkline<T extends { close: number }>(
  candles: T[],
  width = 12,
): string {
  if (!candles || candles.length < 2) return "";
  const closes = candles.map((c) => c.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const recent = closes.slice(-width);
  const BAR = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  return recent
    .map((v) => {
      const idx = Math.min(BAR.length - 1, Math.floor(((v - min) / range) * (BAR.length - 1)));
      return BAR[idx];
    })
    .join("");
}

export function sparklineChange<T extends { close: number }>(
  candles: T[],
): number | null {
  if (!candles || candles.length < 2) return null;
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  if (!first) return null;
  return Math.round(((last - first) / first) * 10000) / 100;
}

export function brandHeader(
  title: string,
  subtitle = "",
  rightTag = BRAND_TAG,
): unknown {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: DARK_BG,
    paddingAll: "lg",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        margin: "none",
        contents: [
          {
            type: "text",
            text: title,
            weight: "bold",
            size: "lg",
            color: "#ffffff",
            flex: 4,
            wrap: true,
          },
          {
            type: "text",
            text: rightTag,
            size: "xxs",
            color: MUTED,
            align: "end",
            flex: 2,
          },
        ],
      },
      subtitle
        ? {
            type: "text",
            text: subtitle,
            size: "xs",
            color: MUTED,
            margin: "sm",
          }
        : { type: "text", text: " ", size: "xs" },
    ],
  };
}

export function scanFlex(rows: ScanRow[], date: string): LineMessage {
  const altText = rows.length
    ? `${date} 台股均線訊號 ${rows.length} 檔`
    : `${date} 今日無訊號`;

  const bodyContents = rows.length
    ? rows.slice(0, 12).map((r) => ({
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: r.code, size: "sm", color: FG, flex: 2, weight: "bold" },
          { type: "text", text: r.name, size: "sm", color: FG, flex: 3 },
          {
            type: "text",
            text: r.signals_today.join(" · "),
            size: "xs",
            color: r.signals_today.some((s) => s.includes("SELL")) ? RED : GREEN,
            flex: 4,
            wrap: true,
            align: "end",
          },
        ],
      }))
    : [{ type: "text", text: "今日無均線訊號", size: "sm", color: MUTED }];

  return {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: DARK_BG,
        contents: [
          { type: "text", text: "📊 台股均線訊號", weight: "bold", size: "lg", color: "#ffffff" },
          { type: "text", text: date, size: "xs", color: MUTED },
        ],
      },
      body: { type: "box", layout: "vertical", spacing: "sm", contents: bodyContents },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: BLUE,
            action: { type: "uri", label: "開啟看盤", uri: "https://donttalk.vercel.app/stock/" },
          },
        ],
      },
    },
  };
}

export function welcomeFlex(displayName = ""): LineMessage {
  const greeting = displayName ? `嗨 ${displayName} 👋` : `嗨 👋 我是 ${BOT_NAME}`;
  return {
    type: "flex",
    altText: `歡迎使用 ${BOT_NAME}`,
    contents: {
      type: "bubble",
      hero: {
        type: "image",
        url: "https://donttalk.vercel.app/favicon.svg",
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover",
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: greeting, weight: "bold", size: "lg", wrap: true },
          {
            type: "text",
            text: `我是 ${BRAND_TAG} 的投資小幫手 ${BOT_NAME}。\n會看 K 線、給訊號、抓新聞、換算匯率，連天氣都會報 🤓`,
            size: "sm",
            color: MUTED,
            wrap: true,
          },
          { type: "separator" },
          { type: "text", text: "🚀 試試這些：", size: "xs", color: GREEN, weight: "bold" },
          {
            type: "text",
            text: "• 2330 — 看台積電\n• 大盤 — 全球指數\n• 半導體 — 類股\n• 計算 100+200*3 — 算數",
            size: "sm",
            wrap: true,
          },
          { type: "text", text: "輸入「help」看完整指令", size: "xs", color: MUTED, align: "end" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            action: {
              type: "uri",
              label: "🌐 打開 DontTalk",
              uri: "https://donttalk.vercel.app/",
            },
            style: "primary",
            color: BLUE,
          },
        ],
      },
    },
  };
}

/** Backwards-compat alias (older callers). Use helpFlexV2() directly for new code. */
export function helpFlex(): LineMessage {
  return helpFlexV2();
}

export function okFlex(text: string, color = GREEN): LineMessage {
  return {
    type: "flex",
    altText: text,
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical",
        contents: [{ type: "text", text, weight: "bold", size: "md", color, wrap: true }],
      },
    },
  };
}

export function stockFlex(
  code: string,
  name: string,
  last: { close: number; changePct: number },
  ma: { ma20?: number | null; ma60?: number | null },
  candles?: Array<{ close: number }>,
): LineMessage {
  const up = (last.changePct ?? 0) >= 0;
  const spark = candles && candles.length >= 2 ? renderSparkline(candles, 12) : "";
  const spkChange = candles && candles.length >= 2 ? sparklineChange(candles) : null;
  return {
    type: "flex",
    altText: `${code} ${name}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: DARK_BG,
        paddingAll: "lg",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: `${code}`, weight: "bold", size: "xl", color: "#ffffff", flex: 2 },
              { type: "text", text: name ?? "", size: "sm", color: MUTED, align: "end", flex: 3, wrap: true },
            ],
          },
          {
            type: "text",
            text: `${last.close ?? "-"}  ${up ? "+" : ""}${(last.changePct ?? 0).toFixed(2)}%`,
            size: "xl",
            color: up ? GREEN : RED,
            weight: "bold",
            margin: "sm",
          },
          spark
            ? {
                type: "text",
                text: `${spark}  ${spkChange != null ? pctStr(spkChange) : ""}`,
                size: "sm",
                color: spkChange != null ? (spkChange >= 0 ? GREEN : RED) : FG,
                margin: "sm",
              }
            : { type: "text", text: " ", size: "xxs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "MA20", size: "xs", color: MUTED, flex: 1 },
              { type: "text", text: `${ma.ma20 ?? "-"}`, size: "sm", color: FG, flex: 2, align: "end" },
              { type: "text", text: "MA60", size: "xs", color: MUTED, flex: 1, align: "end" },
              { type: "text", text: `${ma.ma60 ?? "-"}`, size: "sm", color: FG, flex: 2, align: "end" },
            ],
          },
          { type: "separator", margin: "md" },
          { type: "text", text: "📰 新聞 / 🎯 訊號 / ⚖️ 比較 / 📊 K線", size: "xxs", color: MUTED, align: "center" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: BLUE,
            action: {
              type: "uri",
              label: "📈 看詳細K線",
              uri: `https://donttalk.vercel.app/stock-app/index.html?stock=${code}`,
            },
          },
        ],
      },
    },
  };
}

// ── V2: per-feature Flex templates (ported 2026-07) ─────────────────────

/** Plain-text error message used by all 20-feature handlers. */
export function errorFlex(text: string): LineMessage {
  return { type: "text", text };
}

function pctStr(pct: number | null | undefined): string {
  if (pct == null) return "-";
  const up = pct >= 0;
  return `${up ? "▲" : "▼"} ${up ? "+" : ""}${pct.toFixed(2)}%`;
}

function colorByPct(pct: number | null | undefined): string {
  if (pct == null) return FG;
  return pct >= 0 ? GREEN : RED;
}

/** Multi-stock Flex — show up to 6 stocks in a table. */
export function multiStockFlex(
  rows: Array<{ code: string; name?: string; close: number | null; changePct: number | null }>,
): LineMessage {
  return {
    type: "flex",
    altText: `${rows.length} 檔台股報價`,
    contents: {
      type: "bubble",
      header: brandHeader(`📈 台股 ${rows.length} 檔`) as Record<string, unknown>,
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: rows.slice(0, 6).map((r) => ({
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: `${r.code}`, size: "sm", color: FG, flex: 2 },
            { type: "text", text: `${r.name ?? r.code}`, size: "xs", color: MUTED, flex: 4, wrap: true },
            { type: "text", text: `${r.close ?? "-"}`, size: "sm", color: FG, flex: 2, align: "end" },
            { type: "text", text: pctStr(r.changePct), size: "sm", color: colorByPct(r.changePct), flex: 3, align: "end" },
          ],
        })),
      },
    },
  };
}

/** K-line summary Flex — recent N days high/low/close + change + sparkline. */
export interface KLineCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function kLineFlex(
  code: string,
  days: number,
  candles: KLineCandle[],
  summary: { close: number | null; high: number | null; low: number | null; avgVolume: number | null; changePct: number | null } | null,
): LineMessage {
  const last5 = candles.slice(-Math.min(days, 5)).reverse();
  const spark = renderSparkline(candles, 12);
  const spkChange = sparklineChange(candles);
  return {
    type: "flex",
    altText: `${code} ${days}日K線`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: DARK_BG,
        paddingAll: "lg",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: `📊 ${code}`, weight: "bold", size: "lg", color: "#ffffff", flex: 3 },
              { type: "text", text: BRAND_TAG, size: "xxs", color: MUTED, align: "end", flex: 2 },
            ],
          },
          summary?.close != null
            ? {
                type: "text",
                text: `收盤 ${summary.close}  ${pctStr(summary.changePct)}`,
                size: "sm",
                color: colorByPct(summary.changePct),
                margin: "sm",
              }
            : { type: "text", text: "資料不足", size: "xs", color: MUTED, margin: "sm" },
          spark
            ? {
                type: "text",
                text: `${spark}  ${spkChange != null ? pctStr(spkChange) : ""}`,
                size: "sm",
                color: colorByPct(spkChange),
                margin: "sm",
                weight: "bold",
              }
            : { type: "text", text: " ", size: "xxs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: [
          {
            type: "text",
            text: `${days}日區間  高 ${summary?.high ?? "-"} / 低 ${summary?.low ?? "-"} / 均量 ${
              summary?.avgVolume ? String(Math.round(summary.avgVolume / 1000)) + "k" : "-"
            }`,
            size: "xxs",
            color: MUTED,
          },
          { type: "separator" },
          ...last5.map((c) => ({
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: c.time.slice(5), size: "xs", color: MUTED, flex: 2 },
              { type: "text", text: `開${c.open}`, size: "xs", color: FG, flex: 2 },
              { type: "text", text: `收${c.close}`, size: "xs", color: c.close >= c.open ? GREEN : RED, flex: 2 },
              { type: "text", text: `量${Math.round((c.volume || 0) / 1000)}k`, size: "xs", color: MUTED, flex: 3, align: "end" },
            ],
          })),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: BLUE,
            action: {
              type: "uri",
              label: "📈 看詳細K線",
              uri: `https://donttalk.vercel.app/stock-app/index.html?stock=${code}`,
            },
          },
        ],
      },
    },
  };
}

/** Technical-signals Flex. */
export function signalFlex(
  code: string,
  sig: { ma5: number | null; ma20: number | null; ma60: number | null; signals: string[] },
): LineMessage {
  return {
    type: "flex",
    altText: `${code} 技術訊號`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: DARK_BG,
        contents: [
          { type: "text", text: `🎯 ${code} 技術訊號`, weight: "bold", size: "md", color: "#ffffff" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: [
          { type: "text", text: `MA5  ${sig.ma5 ?? "-"}`, size: "sm", color: FG },
          { type: "text", text: `MA20 ${sig.ma20 ?? "-"}`, size: "sm", color: FG },
          { type: "text", text: `MA60 ${sig.ma60 ?? "-"}`, size: "sm", color: FG },
          { type: "separator" },
          ...(sig.signals.length
            ? sig.signals.map((s) => ({ type: "text", text: `• ${s}`, size: "sm", color: FG, wrap: true }))
            : [{ type: "text", text: "（無明顯訊號）", size: "sm", color: MUTED }]),
        ],
      },
    },
  };
}

/** Major indices Flex. */
export function indexFlex(
  rows: Array<{ key?: string; symbol?: string; name?: string; close: number | null; changePct: number | null }>,
): LineMessage {
  return {
    type: "flex",
    altText: "全球指數",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: DARK_BG,
        contents: [{ type: "text", text: "🌐 全球指數", weight: "bold", size: "md", color: "#ffffff" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: rows.map((r) => ({
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: r.key ?? r.symbol ?? "?", size: "sm", color: FG, flex: 2 },
            { type: "text", text: r.name ?? "", size: "xs", color: MUTED, flex: 4, wrap: true },
            { type: "text", text: r.close != null ? r.close.toFixed(2) : "-", size: "sm", color: FG, flex: 2, align: "end" },
            { type: "text", text: pctStr(r.changePct), size: "sm", color: colorByPct(r.changePct), flex: 3, align: "end" },
          ],
        })),
      },
    },
  };
}

/** Forex pairs Flex. */
export function forexFlex(
  rows: Array<{ pair: string; rate: number | null; changePct: number | null }>,
): LineMessage {
  return {
    type: "flex",
    altText: "主要匯率",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: DARK_BG,
        contents: [{ type: "text", text: "💱 主要匯率", weight: "bold", size: "md", color: "#ffffff" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: rows.map((r) => ({
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: r.pair, size: "sm", color: FG, flex: 3 },
            { type: "text", text: r.rate != null ? r.rate.toFixed(4) : "-", size: "sm", color: FG, flex: 4, align: "end" },
            { type: "text", text: pctStr(r.changePct), size: "sm", color: colorByPct(r.changePct), flex: 3, align: "end" },
          ],
        })),
      },
    },
  };
}

/** Crypto Flex. */
export function cryptoFlex(
  rows: Array<{ symbol: string; name?: string; close: number | null; changePct: number | null }>,
): LineMessage {
  return {
    type: "flex",
    altText: "加密貨幣",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: DARK_BG,
        contents: [{ type: "text", text: "🪙 加密貨幣", weight: "bold", size: "md", color: "#ffffff" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: rows.map((r) => ({
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: r.symbol, size: "sm", color: FG, flex: 3 },
            { type: "text", text: r.name ?? "", size: "xs", color: MUTED, flex: 4, wrap: true },
            { type: "text", text: `$${r.close != null ? r.close.toFixed(2) : "-"}`, size: "sm", color: FG, flex: 3, align: "end" },
            { type: "text", text: pctStr(r.changePct), size: "sm", color: colorByPct(r.changePct), flex: 3, align: "end" },
          ],
        })),
      },
    },
  };
}

/** News Flex (Google News RSS results). */
export interface NewsItemFlex {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

export function newsFlex(query: string, items: NewsItemFlex[]): LineMessage {
  return {
    type: "flex",
    altText: `${query} 相關新聞`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: DARK_BG,
        contents: [
          { type: "text", text: `📰 ${query} 新聞`, weight: "bold", size: "md", color: "#ffffff" },
          { type: "text", text: "近 7 天 · Google News", size: "xs", color: MUTED },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: items.length
          ? items.slice(0, 5).map((it) => ({
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: it.title,
                  size: "sm",
                  color: FG,
                  wrap: true,
                  weight: "bold",
                  action: { type: "uri", label: "開啟", uri: it.link },
                },
                { type: "text", text: `${it.source} · ${it.pubDate.slice(0, 16)}`, size: "xxs", color: MUTED },
              ],
            }))
          : [{ type: "text", text: "查無相關新聞", size: "sm", color: MUTED }],
      },
    },
  };
}

/** Compare two stocks side-by-side. */
export function compareFlex(
  a: { code: string; name?: string; close: number | null; changePct: number | null; ma20?: number | null; ma60?: number | null },
  b: { code: string; name?: string; close: number | null; changePct: number | null; ma20?: number | null; ma60?: number | null },
): LineMessage {
  const cells = (s: typeof a) => [
    { type: "text", text: `${s.code} ${s.name ?? ""}`, size: "sm", color: FG, weight: "bold" },
    { type: "text", text: `現價 ${s.close ?? "-"} (${pctStr(s.changePct)})`, size: "xs", color: colorByPct(s.changePct) },
    { type: "text", text: `MA20 ${s.ma20 ?? "-"} · MA60 ${s.ma60 ?? "-"}`, size: "xs", color: MUTED },
  ];
  return {
    type: "flex",
    altText: `${a.code} vs ${b.code}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: DARK_BG,
        contents: [{ type: "text", text: `⚖️ ${a.code} vs ${b.code}`, weight: "bold", size: "md", color: "#ffffff" }],
      },
      body: {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        contents: [
          { type: "box", layout: "vertical", flex: 1, spacing: "xs", contents: cells(a) },
          { type: "separator" },
          { type: "box", layout: "vertical", flex: 1, spacing: "xs", contents: cells(b) },
        ],
      },
    },
  };
}

/** Industry Flex — show all stocks in an industry. */
export function industryFlex(
  name: string,
  codes: string[],
  rows: Array<{ code: string; close: number | null; changePct: number | null }>,
): LineMessage {
  return {
    type: "flex",
    altText: `${name} 類股`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: DARK_BG,
        contents: [
          { type: "text", text: `🏭 ${name} (${codes.length}檔)`, weight: "bold", size: "md", color: "#ffffff" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: rows.map((r) => ({
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: r.code, size: "sm", color: FG, flex: 2 },
            { type: "text", text: `${r.close ?? "-"}`, size: "sm", color: FG, flex: 2, align: "end" },
            { type: "text", text: pctStr(r.changePct), size: "sm", color: colorByPct(r.changePct), flex: 3, align: "end" },
          ],
        })),
      },
    },
  };
}

/** Ranking Flex — sort by changePct. */
export function rankingFlex(
  rows: Array<{ code: string; close?: number | null; changePct: number | null }>,
): LineMessage {
  const sorted = [...rows]
    .filter((r) => r.changePct != null)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  const up = sorted.slice(0, 5);
  const down = sorted.slice(-5).reverse();
  return {
    type: "flex",
    altText: "台股排行",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: DARK_BG,
        contents: [{ type: "text", text: "🔥 台股漲跌排行", weight: "bold", size: "md", color: "#ffffff" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: "▲ 漲幅前 5", size: "xs", color: GREEN, weight: "bold" },
          ...up.map((r) => ({
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: r.code, size: "xs", color: FG, flex: 2 },
              { type: "text", text: pctStr(r.changePct), size: "xs", color: GREEN, flex: 3, align: "end" },
            ],
          })),
          { type: "separator" },
          { type: "text", text: "▼ 跌幅前 5", size: "xs", color: RED, weight: "bold" },
          ...down.map((r) => ({
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: r.code, size: "xs", color: FG, flex: 2 },
              { type: "text", text: pctStr(r.changePct), size: "xs", color: RED, flex: 3, align: "end" },
            ],
          })),
        ],
      },
    },
  };
}

/** Institutional net buy/sell Flex. */
function row(label: string, val: number, bold = false): unknown {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: label, size: "sm", color: FG, weight: bold ? "bold" : "regular", flex: 2 },
      {
        type: "text",
        text: `${val >= 0 ? "+" : ""}${val.toLocaleString()}`,
        size: "sm",
        color: val >= 0 ? RED : GREEN,
        flex: 5,
        align: "end",
        weight: bold ? "bold" : "regular",
      },
    ],
  };
}

export function institutionalFlex(
  code: string,
  data: { date: string; foreign: number; trust: number; dealer: number; total: number } | null,
): LineMessage {
  if (!data) return errorFlex(`查無 ${code} 法人資料（可能非交易日）`);
  return {
    type: "flex",
    altText: `${code} 法人買賣超`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: DARK_BG,
        contents: [
          {
            type: "text",
            text: `🏛 ${code} 三大法人 ${data.date.slice(0, 4)}/${data.date.slice(4, 6)}/${data.date.slice(6, 8)}`,
            weight: "bold",
            size: "md",
            color: "#ffffff",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: [
          row("外資", data.foreign),
          row("投信", data.trust),
          row("自營", data.dealer),
          { type: "separator" },
          row("合計", data.total, true),
        ],
      },
    },
  };
}

/** Margin balance Flex. */
export function marginFlex(
  code: string,
  data: { date: string; marginBalance: number; marginChange: number; shortBalance: number } | null,
): LineMessage {
  if (!data) return errorFlex(`查無 ${code} 融資資料（可能非交易日）`);
  return {
    type: "flex",
    altText: `${code} 融資融券`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: DARK_BG,
        contents: [
          {
            type: "text",
            text: `💰 ${code} 融資融券 ${data.date.slice(0, 4)}/${data.date.slice(4, 6)}/${data.date.slice(6, 8)}`,
            weight: "bold",
            size: "md",
            color: "#ffffff",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: [
          { type: "text", text: `融資餘額 ${data.marginBalance.toLocaleString()}`, size: "sm", color: FG },
          {
            type: "text",
            text: `融資增減 ${data.marginChange >= 0 ? "+" : ""}${data.marginChange.toLocaleString()}`,
            size: "xs",
            color: data.marginChange >= 0 ? RED : GREEN,
          },
          { type: "text", text: `融券餘額 ${data.shortBalance.toLocaleString()}`, size: "sm", color: FG },
        ],
      },
    },
  };
}

/** Currency conversion result Flex. */
export function convertFlex(result: {
  from: string;
  to: string;
  amount: number;
  rate: number;
  converted: number;
}): LineMessage {
  return {
    type: "flex",
    altText: `匯率換算 ${result.from} → ${result.to}`,
    contents: {
      type: "bubble",
      header: brandHeader(`💱 ${result.from} → ${result.to}`) as Record<string, unknown>,
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: `${result.amount} ${result.from}`, size: "md", color: MUTED, align: "center" },
          { type: "text", text: "↓", size: "md", color: MUTED, align: "center" },
          { type: "text", text: `${result.converted.toFixed(2)} ${result.to}`, size: "xl", color: FG, weight: "bold", align: "center" },
          { type: "text", text: `匯率 1 ${result.from} = ${result.rate.toFixed(4)} ${result.to}`, size: "xs", color: MUTED, align: "center" },
        ],
      },
    },
  };
}

/** P&L calculator result Flex. */
export function pnlFlex(code: string, buy: number, sell: number, shares = 1): LineMessage {
  const diff = sell - buy;
  const pct = (diff / buy) * 100;
  const profit = diff * shares;
  return {
    type: "flex",
    altText: `${code} 損益試算`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: DARK_BG,
        contents: [{ type: "text", text: `💹 ${code} 損益試算`, weight: "bold", size: "md", color: "#ffffff" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: `買 ${buy} / 賣 ${sell} (${shares}張)`, size: "sm", color: FG },
          { type: "separator" },
          { type: "text", text: `每股 ${diff >= 0 ? "+" : ""}${diff.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`, size: "md", color: diff >= 0 ? GREEN : RED, weight: "bold" },
          { type: "text", text: `${shares >= 1000 ? "總損益" : "每張損益"} ${profit >= 0 ? "+" : ""}${profit.toFixed(0)}`, size: "md", color: diff >= 0 ? GREEN : RED, weight: "bold" },
        ],
      },
    },
  };
}

/** Calculator result Flex. */
export function calcFlex(expr: string, result: number): LineMessage {
  return {
    type: "flex",
    altText: `計算 ${expr} = ${result}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: `🧮 計算`, size: "sm", color: MUTED },
          { type: "text", text: expr, size: "md", color: FG, wrap: true },
          { type: "text", text: "=", size: "md", color: MUTED },
          { type: "text", text: String(result), size: "xl", color: GREEN, weight: "bold" },
        ],
      },
    },
  };
}

/** Weather Flex. */
export function weatherFlex(data: {
  city: string;
  location: string;
  forecast: Array<{ from: string; to: string; desc: string }>;
  maxT: string | null;
  minT: string | null;
}): LineMessage {
  return {
    type: "flex",
    altText: `${data.city} 天氣`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: DARK_BG,
        contents: [
          { type: "text", text: `🌤 ${data.city} 天氣`, weight: "bold", size: "md", color: "#ffffff" },
          { type: "text", text: data.location ?? "", size: "xs", color: MUTED },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          data.maxT && data.minT
            ? {
                type: "text",
                text: `溫度 ${data.minT}° ~ ${data.maxT}°C`,
                size: "md",
                color: FG,
                weight: "bold",
              }
            : { type: "text", text: "", size: "xs" },
          { type: "separator" },
          ...data.forecast.map((f) => ({
            type: "box",
            layout: "vertical",
            contents: [
              { type: "text", text: `${f.from.slice(5, 16)} ~ ${f.to.slice(11, 16)}`, size: "xxs", color: MUTED },
              { type: "text", text: f.desc, size: "sm", color: FG, wrap: true },
            ],
          })),
        ],
      },
    },
  };
}

/** Help v2 — full 20-feature command list with brand header. */
export const HELP_LINES: string[] = [
  "查個股：輸入 4-6 碼股號（2330）",
  "台股多檔：台股 2330 2454 2317",
  "K線：2330 5d 或 2330 10d",
  "訊號：訊號 2330 或 2330 訊號",
  "大盤：輸入「大盤」",
  "匯率：輸入「匯率」",
  "新聞：新聞 台積電 / 新聞 2330",
  "比較：2330 vs 2454",
  "產業：半導體 / 金融 / AI / 電子",
  "排行：輸入「排行」",
  "美股：美股 AAPL / 美股 TSLA",
  "ETF：0050 / 0056",
  "法人：2330 法人",
  "融資：2330 融資",
  "匯率換算：100 USD TWD",
  "損益：2330 買600 賣720",
  "今日摘要：輸入「今日摘要」",
  "計算：100+200*3 或 計算 100/3",
  "天氣：天氣 臺北 / 天氣 高雄",
];

export function helpFlexV2(): LineMessage {
  return {
    type: "flex",
    altText: "指令說明",
    contents: {
      type: "bubble",
      header: brandHeader("📊 DontTalk 指令清單", "20 種功能，輸入文字即可使用") as Record<string, unknown>,
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: HELP_LINES.map((l) => ({
          type: "text",
          text: `• ${l}`,
          size: "sm",
          color: FG,
          wrap: true,
        })),
      },
    },
  };
}

/** Daily-summary Flex (combo: index + ranking). */
export function dailySummaryFlex(
  indices: Array<{ key?: string; symbol?: string; close: number | null; changePct: number | null }>,
  rankings: Array<{ code: string; name?: string; changePct: number | null }>,
): LineMessage {
  const top = [...rankings]
    .filter((r) => r.changePct != null)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
    .slice(0, 3);
  return {
    type: "flex",
    altText: "今日摘要",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: DARK_BG,
        paddingAll: "lg",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "📅 今日摘要", weight: "bold", size: "lg", color: "#ffffff", flex: 4 },
              { type: "text", text: BRAND_TAG, size: "xxs", color: MUTED, align: "end", flex: 2 },
            ],
          },
          {
            type: "text",
            text: top.length
              ? `🔥 最強 ${top[0].code} +${(top[0].changePct ?? 0).toFixed(2)}%`
              : "🔥 最強 無資料",
            size: "xs",
            color: GREEN,
            margin: "sm",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: "🌐 全球指數", size: "xs", color: GREEN, weight: "bold" },
          ...indices.slice(0, 5).map((r) => ({
            type: "text",
            text: `${(r.key ?? r.symbol ?? "?").padEnd(5)}  ${(r.close ?? 0).toFixed(2)}  (${(r.changePct ?? 0) >= 0 ? "+" : ""}${(r.changePct ?? 0).toFixed(2)}%)`,
            size: "xs",
            color: (r.changePct ?? 0) >= 0 ? GREEN : RED,
          })),
          { type: "separator" },
          { type: "text", text: "🔥 漲幅前 3", size: "xs", color: GREEN, weight: "bold" },
          ...top.map((r) => ({
            type: "text",
            text: `${r.code} ${r.name ?? ""}  +${(r.changePct ?? 0).toFixed(2)}%`,
            size: "xs",
            color: FG,
          })),
        ],
      },
    },
  };
}

// ── Lyrics ─────────────────────────────────────────────────────────

export interface LyricsTrack {
  id: number;
  title?: string;
  artist?: string;
  preview: string;
  score?: number;
}

/**
 * Single-result lyrics bubble. Used by 隨機歌詞 and 歌詞 <q> when only one match.
 */
export function lyricsResultFlex(track: LyricsTrack): LineMessage {
  const preview = (track.preview ?? "").slice(0, 220);
  const title = track.title || `第 ${track.id} 首`;
  const subtitle = [title, track.artist ? `· ${track.artist}` : ""].join(" ").trim();
  return {
    type: "flex",
    altText: `🎵 ${subtitle}`,
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: DARK_BG,
        contents: [
          { type: "text", text: "🎵 歌詞片段", weight: "bold", size: "md", color: "#ffffff" },
          { type: "text", text: subtitle, size: "sm", color: MUTED, wrap: true },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [{ type: "text", text: preview, size: "sm", color: FG, wrap: true }],
      },
      footer: {
        type: "box", layout: "vertical",
        contents: [{
          type: "button", style: "primary", color: BLUE,
          action: { type: "uri", label: "完整歌詞",
            uri: `https://donttalk.vercel.app/music/?song=${track.id}` },
        }],
      },
    },
  };
}

/**
 * Carousel for multi-track lyrics search. LINE carousel caps at 10 bubbles.
 */
export function lyricsCarouselFlex(query: string, tracks: LyricsTrack[]): LineMessage {
  const list = (tracks ?? []).slice(0, 10);
  const bubbles = list.map((t) => {
    const subtitle = [t.title || `第 ${t.id} 首`, t.artist ? `· ${t.artist}` : ""].join(" ").trim();
    const preview = (t.preview ?? "").slice(0, 160);
    return {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box", layout: "vertical", backgroundColor: DARK_BG,
        contents: [
          { type: "text", text: subtitle, weight: "bold", size: "sm", color: "#ffffff", wrap: true },
          { type: "text", text: `score ${t.score ?? 0}`, size: "xs", color: MUTED },
        ],
      },
      body: {
        type: "box", layout: "vertical",
        contents: [{ type: "text", text: preview, size: "sm", color: FG, wrap: true }],
      },
      footer: {
        type: "box", layout: "vertical",
        contents: [{
          type: "button", style: "primary", color: BLUE,
          action: { type: "uri", label: "完整歌詞",
            uri: `https://donttalk.vercel.app/music/?song=${t.id}` },
        }],
      },
    };
  });
  return {
    type: "flex",
    altText: `歌詞搜尋：${query}（${list.length} 首）`,
    contents: { type: "carousel", contents: bubbles },
  };
}

// ── Site search ────────────────────────────────────────────────────

export interface SiteSearchHit {
  title: string;
  url: string;
  excerpt: string;
  score: number;
}

export function searchResultsFlex(query: string, results: SiteSearchHit[]): LineMessage {
  const list = (results ?? []).slice(0, 10);
  const bubbles = list.map((r) => ({
    type: "bubble",
    size: "kilo",
    header: {
      type: "box", layout: "vertical", backgroundColor: DARK_BG,
      contents: [
        { type: "text", text: r.title, weight: "bold", size: "sm", color: "#ffffff", wrap: true },
        { type: "text", text: `score ${r.score}`, size: "xs", color: MUTED },
      ],
    },
    body: {
      type: "box", layout: "vertical",
      contents: [{ type: "text", text: r.excerpt ?? "", size: "sm", color: FG, wrap: true }],
    },
    footer: {
      type: "box", layout: "vertical",
      contents: [{
        type: "button", style: "primary", color: BLUE,
        action: { type: "uri", label: "開啟頁面", uri: r.url },
      }],
    },
  }));
  return {
    type: "flex",
    altText: `站內搜尋：${query}（${list.length} 筆）`,
    contents: { type: "carousel", contents: bubbles },
  };
}
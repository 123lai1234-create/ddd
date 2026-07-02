/**
 * Flex Message templates shared between the bot webhook replies and the
 * scheduled push (`scan_and_push_line`). Colors match the Astro dark theme
 * (`#0d1117` background, `#3fb950` green, `#ff5f56` red).
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

export function welcomeFlex(): LineMessage {
  return {
    type: "flex",
    altText: "歡迎加入 dontalk-stock",
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: DARK_BG,
        contents: [{ type: "text", text: "👋 歡迎加入 dontalk-stock", weight: "bold", size: "lg", color: "#ffffff" }],
      },
      body: {
        type: "box", layout: "vertical", spacing: "md",
        contents: [
          { type: "text", text: "可用指令：", weight: "bold", size: "sm", color: FG },
          { type: "text", text: "• 2330 / 台積電 → 個股查詢", size: "sm", color: FG, wrap: true },
          { type: "text", text: "• scan → 當日均線訊號", size: "sm", color: FG, wrap: true },
          { type: "text", text: "• subscribe / 取消 → 訂閱盤後推播", size: "sm", color: FG, wrap: true },
          { type: "text", text: "• help → 指令清單", size: "sm", color: FG, wrap: true },
        ],
      },
    },
  };
}

export function helpFlex(): LineMessage {
  return {
    type: "flex",
    altText: "指令說明",
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "text", text: "📖 指令", weight: "bold", size: "md", color: FG },
          { type: "text", text: "個股：4-6 碼股號 (2330)", size: "sm", color: FG, wrap: true },
          { type: "text", text: "掃描：scan", size: "sm", color: FG, wrap: true },
          { type: "text", text: "訂閱：subscribe / 取消", size: "sm", color: FG, wrap: true },
          { type: "text", text: "說明：help", size: "sm", color: FG, wrap: true },
        ],
      },
    },
  };
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

export function stockFlex(code: string, name: string, last: {
  close: number; changePct: number;
}, ma: { ma20?: number | null; ma60?: number | null }): LineMessage {
  const up = (last.changePct ?? 0) >= 0;
  return {
    type: "flex",
    altText: `${code} ${name}`,
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: DARK_BG,
        contents: [
          { type: "text", text: `${code} ${name}`, weight: "bold", size: "lg", color: "#ffffff" },
          { type: "text", text: `收盤 ${last.close}  (${up ? "+" : ""}${last.changePct}%)`, size: "sm",
            color: up ? GREEN : RED },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "text", text: `MA20 ${ma.ma20 ?? "-"}`, size: "sm", color: FG },
          { type: "text", text: `MA60 ${ma.ma60 ?? "-"}`, size: "sm", color: FG },
        ],
      },
      footer: {
        type: "box", layout: "vertical",
        contents: [{
          type: "button", style: "primary", color: BLUE,
          action: { type: "uri", label: "看 K 線",
            uri: `https://donttalk.vercel.app/stock-app/index.html?stock=${code}` },
        }],
      },
    },
  };
}
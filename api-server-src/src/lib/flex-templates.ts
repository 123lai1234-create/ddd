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
          { type: "text", text: "• 隨機歌詞 / 歌詞 <關鍵字>", size: "sm", color: FG, wrap: true },
          { type: "text", text: "• 搜尋 <關鍵字> → 站內內容", size: "sm", color: FG, wrap: true },
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
          { type: "text", text: "歌詞：隨機歌詞 / 歌詞 <關鍵字>", size: "sm", color: FG, wrap: true },
          { type: "text", text: "搜尋：搜尋 <關鍵字>", size: "sm", color: FG, wrap: true },
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
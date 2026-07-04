/**
 * Flex Message templates for the portfolio LINE bot.
 * Organized per-topic so the bot can dispatch the right card to the right handler.
 *
 * Style matches the Astro dark theme:
 *   bg:    #0d1117
 *   fg:    #e6edf3
 *   muted: #8b949e
 *   green: #3fb950   red: #ff5f56   blue: #1f6feb   gold: #d29922
 */

import type { LineMessage } from "./line";

export const THEME = {
  bg: "#0d1117",
  fg: "#e6edf3",
  muted: "#8b949e",
  green: "#3fb950",
  red: "#ff5f56",
  blue: "#1f6feb",
  gold: "#d29922",
} as const;

export const SITE_BASE = "https://donttalk.vercel.app";

// ---- Generic helpers -------------------------------------------------------

export function textBubble(text: string, color = THEME.fg): LineMessage {
  return {
    type: "flex",
    altText: text.slice(0, 40),
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical",
        contents: [{ type: "text", text, weight: "bold", size: "md", color, wrap: true }],
      },
    },
  };
}

export function okFlex(text: string, color = THEME.green): LineMessage {
  return textBubble(text, color);
}

function headerBox(title: string, subtitle?: string): unknown {
  return {
    type: "box", layout: "vertical", backgroundColor: THEME.bg,
    contents: [
      { type: "text", text: title, weight: "bold", size: "lg", color: "#ffffff" },
      ...(subtitle ? [{ type: "text", text: subtitle, size: "xs", color: THEME.muted }] : []),
    ],
  };
}

// ---- Topic definitions ------------------------------------------------------

export type TopicId = "protein" | "gene" | "ngs" | "stock" | "mpnn" | "blog" | "interview";

export interface Topic {
  id: TopicId;
  emoji: string;
  title: string;
  blurb: string;
  url: string;
  hint: string;
  color: string;
}

export const TOPICS: readonly Topic[] = [
  {
    id: "protein",
    emoji: "🧬",
    title: "蛋白質 AI 設計",
    blurb: "ESM-2 嵌入 + Bayesian Optimization + ProteinMPNN 序列設計 + REINFORCE 微調。",
    url: `${SITE_BASE}/report`,
    hint: "輸入 `esm MKTIIALSY vs MRIIALSY` 試 ESM-2 相似度",
    color: THEME.blue,
  },
  {
    id: "gene",
    emoji: "🔬",
    title: "基因 AI 平台",
    blurb: "序列資料庫、RAG 文件搜尋、啟動子設計、CRISPR 導引排序、變異效應評估。",
    url: `${SITE_BASE}/gene-ai`,
    hint: "輸入 `crispr GGCACTGCGGCTGGAGAGGG` 試 guide 評分",
    color: THEME.green,
  },
  {
    id: "ngs",
    emoji: "📊",
    title: "NGS 次世代定序",
    blurb: "實驗設計計算器、定序深度估算、QC 到功能分析的完整結果圖表集。",
    url: `${SITE_BASE}/ngs`,
    hint: "輸入 `depth 30 100` 算讀序數",
    color: THEME.gold,
  },
  {
    id: "stock",
    emoji: "📈",
    title: "台股均線訊號",
    blurb: "MA20/MA60 即時、訂閱推播、全市場掃描。",
    url: `${SITE_BASE}/stock`,
    hint: "輸入 4-6 碼股號 (2330) 或 `scan`",
    color: THEME.red,
  },
  {
    id: "mpnn",
    emoji: "🧪",
    title: "ProteinMPNN 互動",
    blurb: "獨立工作台：序列設計、3D 結構預覽、突變著色、Rosetta 簡化評分。",
    url: `${SITE_BASE}/protein-mpnn`,
    hint: "輸入 `mpnn demo 1ubq` 看示範",
    color: "#a371f7",
  },
  {
    id: "blog",
    emoji: "📖",
    title: "論文 / 部落格",
    blurb: "蛋白質 AI / NGS / 量化交易等研究筆記。",
    url: `${SITE_BASE}/blog`,
    hint: "輸入 `blog` 看最新 3 篇",
    color: THEME.muted,
  },
  {
    id: "interview",
    emoji: "💼",
    title: "面試準備手冊",
    blurb: "模擬面試問答、數學推導筆記、Mini Project 完整程式碼、六週衝刺計劃。",
    url: `${SITE_BASE}/interview`,
    hint: "輸入 `interview start` 隨機出 1 題",
    color: THEME.blue,
  },
];

// ---- Main menu (carousel) ---------------------------------------------------

export function menuCarousel(topics: readonly Topic[] = TOPICS): LineMessage {
  const bubbles = topics.map((t) => ({
    type: "bubble",
    size: "micro",
    header: headerBox(`${t.emoji} ${t.title}`),
    body: {
      type: "box", layout: "vertical", spacing: "sm",
      contents: [
        { type: "text", text: t.blurb, size: "xs", color: THEME.fg, wrap: true },
        { type: "text", text: `💡 ${t.hint}`, size: "xxs", color: THEME.muted, wrap: true },
      ],
    },
    footer: {
      type: "box", layout: "vertical",
      contents: [{
        type: "button", style: "primary", color: t.color,
        action: { type: "uri", label: "完整版 →", uri: t.url },
      }],
    },
  }));

  return {
    type: "flex",
    altText: "dontalk 作品集 — 7 大主題",
    contents: { type: "carousel", contents: bubbles },
  };
}

export function welcomeFlex(): LineMessage {
  return {
    type: "flex",
    altText: "歡迎加入 dontalk 作品集",
    contents: {
      type: "bubble",
      header: headerBox("👋 歡迎加入 dontalk", "工程 × 生醫 × AI 平台作品集"),
      body: {
        type: "box", layout: "vertical", spacing: "md",
        contents: [
          { type: "text", text: "我是 JT 的作品集入口。", size: "sm", color: THEME.fg, wrap: true },
          { type: "text", text: "7 大主題任你點，每個都有 demo 指令。", size: "sm", color: THEME.fg, wrap: true },
          { type: "text", text: "輸入 `menu` 看主選單，`help` 看所有指令。", size: "sm", color: THEME.muted, wrap: true },
        ],
      },
      footer: {
        type: "box", layout: "vertical",
        contents: [
          { type: "button", style: "primary", color: THEME.blue,
            action: { type: "message", label: "🎯 主選單", text: "menu" } },
          { type: "button", style: "link", color: THEME.muted,
            action: { type: "uri", label: "完整網站", uri: SITE_BASE } },
        ],
      },
    },
  };
}

// ---- Help (full command reference) -----------------------------------------

interface CmdRow { cmd: string; desc: string; }

const HELP_SECTIONS: { title: string; cmds: CmdRow[] }[] = [
  {
    title: "🌐 全域",
    cmds: [
      { cmd: "menu / 選單", desc: "回主選單 (7 主題)" },
      { cmd: "help / 說明", desc: "這份指令清單" },
      { cmd: "about / 關於", desc: "開發者簡介" },
      { cmd: "works / 作品", desc: "作品總覽連結" },
      { cmd: "interview / 面試", desc: "模擬面試入口" },
      { cmd: "site", desc: "網站地圖" },
      { cmd: "qr", desc: "網站 QR Code" },
      { cmd: "topic <主題>", desc: "開關推播 (protein/gene/...)" },
    ],
  },
  {
    title: "🧬 蛋白質 AI",
    cmds: [
      { cmd: "protein", desc: "主題摘要 + 連結" },
      { cmd: "esm <seqA> vs <seqB>", desc: "ESM-2 相似度" },
      { cmd: "mpnn <pdb_id>", desc: "ProteinMPNN 設計序列" },
    ],
  },
  {
    title: "🔬 基因 AI",
    cmds: [
      { cmd: "gene", desc: "主題摘要 + 連結" },
      { cmd: "crispr <guide_seq>", desc: "CRISPR off-target 評分" },
      { cmd: "promoter <seq>", desc: "啟動子強度預測" },
    ],
  },
  {
    title: "📊 NGS",
    cmds: [
      { cmd: "ngs", desc: "主題摘要 + 連結" },
      { cmd: "depth <samples> <cov>", desc: "算讀序數 + 成本估算" },
    ],
  },
  {
    title: "📈 台股",
    cmds: [
      { cmd: "2330", desc: "個股查詢 (4-6 碼股號)" },
      { cmd: "scan", desc: "當日均線掃描" },
      { cmd: "subscribe / 取消", desc: "推播訂閱" },
      { cmd: "watchlist", desc: "自選股" },
    ],
  },
  {
    title: "🧪 ProteinMPNN / 📖 部落格 / 💼 面試",
    cmds: [
      { cmd: "mpnn demo <pdb>", desc: "互動 demo 連結" },
      { cmd: "blog", desc: "最新 3 篇" },
      { cmd: "blog <關鍵字>", desc: "搜尋文章" },
      { cmd: "interview start", desc: "隨機出 1 題" },
      { cmd: "interview hint", desc: "提示" },
      { cmd: "interview answer", desc: "參考答案" },
    ],
  },
];

export function helpFlex(): LineMessage {
  const sections = HELP_SECTIONS.map((s) => ({
    type: "box", layout: "vertical", spacing: "xs",
    contents: [
      { type: "text", text: s.title, weight: "bold", size: "sm", color: THEME.fg },
      ...s.cmds.map((c) => ({
        type: "box", layout: "horizontal",
        contents: [
          { type: "text", text: c.cmd, size: "xs", color: THEME.blue, flex: 3, wrap: true },
          { type: "text", text: c.desc, size: "xs", color: THEME.muted, flex: 4, wrap: true },
        ],
      })),
    ],
  }));

  return {
    type: "flex",
    altText: "指令說明",
    contents: {
      type: "bubble", size: "mega",
      header: headerBox("📖 指令說明"),
      body: { type: "box", layout: "vertical", spacing: "md", contents: sections },
      footer: {
        type: "box", layout: "vertical",
        contents: [
          { type: "button", style: "primary", color: THEME.blue,
            action: { type: "message", label: "🎯 主選單", text: "menu" } },
        ],
      },
    },
  };
}

// ---- Topic-specific cards ---------------------------------------------------

export function topicCard(
  t: Topic,
  body: string,
  extra?: { headerSubtitle?: string; buttons?: { label: string; uri?: string; text?: string; color?: string }[] },
): LineMessage {
  return {
    type: "flex",
    altText: `${t.title} — ${body.slice(0, 40)}`,
    contents: {
      type: "bubble",
      header: headerBox(`${t.emoji} ${t.title}`, extra?.headerSubtitle),
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [{ type: "text", text: body, size: "sm", color: THEME.fg, wrap: true }],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: (extra?.buttons ?? [
          { label: "完整版 →", uri: t.url, color: t.color },
        ]).map((b) => ({
          type: "button",
          style: "primary",
          color: b.color ?? t.color,
          action: b.uri
            ? { type: "uri", label: b.label, uri: b.uri }
            : { type: "message", label: b.label, text: b.text ?? b.label },
        })),
      },
    },
  };
}

// ---- Re-exports for backward compat with existing callers -----------------

export type { LineMessage } from "./line";
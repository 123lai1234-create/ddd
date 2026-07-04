/**
 * Built-in handlers: menu / help / about / works / site / qr / topic / fallback.
 * Priority 10 — runs before topic handlers (priority 50).
 */

import type { Handler, Ctx } from "./dispatcher";
import type { LineMessage } from "../lib/line";
import {
  menuCarousel, welcomeFlex, helpFlex, textBubble, okFlex,
  THEME, SITE_BASE, TOPICS, type Topic,
} from "../lib/flex-topics";
import { logger } from "../lib/logger";

// ---- Menu -----------------------------------------------------------------

const menu: Handler = {
  name: "menu",
  priority: 10,
  match: (t) => /^(menu|選單|主選單)$/i.test(t.trim()),
  run: async () => menuCarousel(),
};
handlers.register(menu);

// ---- Help -----------------------------------------------------------------

const help: Handler = {
  name: "help",
  priority: 10,
  match: (t) => /^(help|說明|幫助|指令|\?)$/i.test(t.trim()),
  run: async () => helpFlex(),
};
handlers.register(help);

// ---- About / Works / Site --------------------------------------------------

function linkCard(title: string, blurb: string, url: string): LineMessage {
  return {
    type: "flex",
    altText: title,
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: THEME.bg,
        contents: [{ type: "text", text: title, weight: "bold", size: "lg", color: "#ffffff" }],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [{ type: "text", text: blurb, size: "sm", color: THEME.fg, wrap: true }],
      },
      footer: {
        type: "box", layout: "vertical",
        contents: [{
          type: "button", style: "primary", color: THEME.blue,
          action: { type: "uri", label: "前往 →", uri: url },
        }],
      },
    },
  };
}

const about: Handler = {
  name: "about",
  priority: 10,
  match: (t) => /^(about|關於|自我介紹)$/i.test(t.trim()),
  run: async () => linkCard(
    "👤 JT — 雙碩士跨域工程師",
    "電資工程 + 生醫研究，蛋白質 AI / 基因 AI / NGS / 全端互動平台。台北，歡迎合作。",
    `${SITE_BASE}/about`,
  ),
};
handlers.register(about);

const works: Handler = {
  name: "works",
  priority: 10,
  match: (t) => /^(works?|作品|portfolio)$/i.test(t.trim()),
  run: async () => linkCard(
    "💼 作品總覽",
    "7 大主題（蛋白質 / 基因 / NGS / 台股 / MPNN / 論文 / 面試）+ 多個 mini project。",
    `${SITE_BASE}/works`,
  ),
};
handlers.register(works);

const site: Handler = {
  name: "site",
  priority: 10,
  match: (t) => /^(site|website|網站|地圖|sitemap)$/i.test(t.trim()),
  run: async () => linkCard(
    "🗺️ 網站地圖",
    "主站 + 7 個主題頁 + 部落格 + 面試手冊。",
    SITE_BASE,
  ),
};
handlers.register(site);

// ---- QR Code (interview加分項) --------------------------------------------
//
// Generates a tiny QR code SVG-as-PNG via Google Chart API (still works for
// demos, public CDN, no auth, no quota issue). 1-line implementation, perfect
// for the "scan with phone" demo moment.

const qr: Handler = {
  name: "qr",
  priority: 10,
  match: (t) => /^(qr|qrcode|qr碼|掃我)$/i.test(t.trim()),
  run: async (_t, ctx) => {
    const url = `${SITE_BASE}/`;
    const qrImg = `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encodeURIComponent(url)}&choe=UTF-8`;
    return [{
      type: "flex",
      altText: "網站 QR Code",
      contents: {
        type: "bubble",
        header: {
          type: "box", layout: "vertical", backgroundColor: THEME.bg,
          contents: [{ type: "text", text: "📱 掃我開啟作品集", weight: "bold", size: "lg", color: "#ffffff" }],
        },
        hero: {
          type: "image", url: qrImg, size: "full", aspectRatio: "1:1", aspectMode: "fit",
          backgroundColor: "#ffffff",
        },
        body: {
          type: "box", layout: "vertical",
          contents: [{ type: "text", text: url, size: "xs", color: THEME.muted, wrap: true }],
        },
      },
    } satisfies LineMessage];
  },
};
handlers.register(qr);

// ---- Topic subscribe toggle -----------------------------------------------
//
// `topic stock`       → 訂閱台股推播
// `topic -stock`      → 取消訂閱台股推播
// `topic`             → 看目前訂閱狀態
//
// Implementation lives in handlers/topic.ts (DB-dependent). This stub matches
// and delegates.

const topic: Handler = {
  name: "topic",
  priority: 15,
  match: (t) => /^topic(\s|$|[-+])/i.test(t.trim()),
  run: async (text, ctx) => {
    // Lazy import to avoid circular deps with the registry in topic.ts
    const mod = await import("./topic");
    return mod.runTopic(text, ctx);
  },
};
handlers.register(topic);

// ---- Fallback (last resort, priority 999) ----------------------------------

const fallback: Handler = {
  name: "fallback",
  priority: 999,
  match: () => true,
  run: async () => textBubble("看不懂 🙈 輸入 `help` 看指令，或 `menu` 看主選單"),
};
handlers.register(fallback);

// ---- Re-exports for the route file -----------------------------------------

export { welcomeFlex, okFlex, linkCard, TOPICS, type Topic };

logger.info({ count: handlers.list().length }, "built-in handlers registered");
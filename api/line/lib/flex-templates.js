// Flex Message templates. Colors match the Astro dark theme.
// (Originally ported from api-server-src/src/lib/flex-templates.ts)

const DARK_BG = "#0d1117";
const FG = "#e6edf3";
const MUTED = "#8b949e";
const GREEN = "#3fb950";
const RED = "#ff5f56";
const BLUE = "#1f6feb";

export function welcomeFlex(displayName = "") {
  const greeting = displayName ? `嗨 ${displayName} 👋` : "嗨 👋 我是 DontTalk";
  return {
    type: "flex",
    altText: "歡迎使用 DontTalk 投資小幫手",
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
            text: "可用指令：",
            size: "sm",
            color: "#6b7280",
            wrap: true,
          },
          { type: "separator" },
          {
            type: "text",
            text:
              "• help / 說明 — 指令清單\n" +
              "• 4-6 碼股號（2330）— 查個股\n" +
              "• subscribe / 訂閱 — 收均線訊號\n" +
              "• unsubscribe / 取消 — 停止推播",
            size: "sm",
            wrap: true,
          },
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
              label: "打開 DontTalk",
              uri: "https://donttalk.vercel.app/",
            },
            style: "primary",
          },
        ],
      },
    },
  };
}

export function helpFlex() {
  return {
    type: "flex",
    altText: "指令說明",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "指令清單", weight: "bold", size: "lg" },
          { type: "separator" },
          {
            type: "text",
            size: "sm",
            wrap: true,
            text:
              "• 4-6 碼股號（2330）— 查個股現價\n" +
              "• scan — 當日均線訊號（待上線）\n" +
              "• subscribe / 訂閱 — 加入推播\n" +
              "• unsubscribe / 取消 — 停止推播\n" +
              "• help / 說明 — 這個畫面",
          },
        ],
      },
    },
  };
}

export function okFlex(text, color = GREEN) {
  return {
    type: "flex",
    altText: text,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [{ type: "text", text, weight: "bold", size: "md", color, wrap: true }],
      },
    },
  };
}

export function stockFlex(code, name, last, ma) {
  const up = (last.changePct ?? 0) >= 0;
  const sign = up ? "+" : "";
  return {
    type: "flex",
    altText: `${code} ${name}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: DARK_BG,
        contents: [
          { type: "text", text: `${code} ${name}`, weight: "bold", size: "lg", color: "#ffffff" },
          {
            type: "text",
            text: `收盤 ${last.close}  (${sign}${last.changePct}%)`,
            size: "sm",
            color: up ? GREEN : RED,
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: `MA20 ${ma.ma20 ?? "-"}`, size: "sm", color: FG },
          { type: "text", text: `MA60 ${ma.ma60 ?? "-"}`, size: "sm", color: FG },
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
              label: "看 K 線",
              uri: `https://donttalk.vercel.app/stock-app/index.html?stock=${code}`,
            },
          },
        ],
      },
    },
  };
}

export function errorFlex(text) {
  return {
    type: "text",
    text,
  };
}
// LINE webhook handler — verifies X-Line-Signature and replies with a simple
// welcome Flex bubble. Designed to run as a Vercel Node.js serverless function
// in the sin1 region so the outbound HTTPS call to api.line.me succeeds.
//
// Env vars (Production):
//   LINE_CHANNEL_SECRET        — required, used for signature verification
//   LINE_CHANNEL_ACCESS_TOKEN  — required, used for reply/push API calls

import { createHmac } from "node:crypto";

const LINE_API = "https://api.line.me";

function getRawBody(req) {
  // Vercel/Node runtime: req has body already parsed if Content-Type was
  // application/json. We need the raw bytes for signature verification.
  if (typeof req.rawBody === "string") return req.rawBody;
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  return "";
}

function verifySignature(secret, body, signature) {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("base64");
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

function welcomeFlex() {
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
          {
            type: "text",
            text: "嗨 👋 我是 DontTalk",
            weight: "bold",
            size: "lg",
            wrap: true,
          },
          {
            type: "text",
            text: "目前支援的指令：",
            size: "sm",
            color: "#6b7280",
            wrap: true,
          },
          { type: "separator" },
          {
            type: "text",
            text: "• help / 說明 — 指令清單\n• subscribe / 訂閱 — 收均線訊號\n• unsubscribe / 取消 — 停止推播\n• 4-6 碼股號 — 查個股現價",
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

function helpFlex() {
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
            text: "• hi / 任何訊息 — 顯示歡迎卡片\n• help / 說明 — 這個畫面\n• subscribe / 訂閱 — 收台股均線訊號推播\n• unsubscribe / 取消 — 停止推播\n• 4-6 碼股號（例如 2330）— 查個股",
          },
          {
            type: "text",
            size: "xs",
            color: "#9ca3af",
            wrap: true,
            text: "※ 個股查詢需後端 API 上線，目前為 stub。",
          },
        ],
      },
    },
  };
}

function stockStubFlex(code) {
  return {
    type: "flex",
    altText: `個股查詢 ${code}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: `📊 ${code}`, weight: "bold", size: "lg" },
          {
            type: "text",
            size: "sm",
            color: "#9ca3af",
            wrap: true,
            text: "個股查詢功能需要後端 API 上線，目前為 stub。\n後端救起來之後會在這裡顯示即時報價 + MA20 / MA60。",
          },
        ],
      },
    },
  };
}

async function replyMessage(replyToken, token, messages) {
  const res = await fetch(`${LINE_API}/v2/bot/message/reply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`reply ${res.status}: ${text}`);
  }
  return res;
}

function logEvent(event) {
  const summary = {
    tag: "line-event",
    type: event.type,
    userId: event.source?.userId,
    text: event.message?.text,
  };
  console.log(JSON.stringify(summary));
}

async function handleEvent(event, token) {
  logEvent(event);

  if (event.type === "follow") {
    if (event.replyToken) {
      await replyMessage(event.replyToken, token, [welcomeFlex()]);
    }
    return;
  }
  if (event.type !== "message" || event.message?.type !== "text" || !event.replyToken) {
    return;
  }

  const text = (event.message.text ?? "").trim();
  if (/^(help|說明|\?|\？)$/i.test(text)) {
    return replyMessage(event.replyToken, token, [helpFlex()]);
  }
  const codeMatch = text.match(/^(\d{4,6})$/);
  if (codeMatch) {
    return replyMessage(event.replyToken, token, [stockStubFlex(codeMatch[1])]);
  }
  // Default: welcome bubble
  return replyMessage(event.replyToken, token, [welcomeFlex()]);
}

export default async function handler(req, res) {
  // Verbose debug log — every line carries the request id, method, IP, and a
  // signature-preview so we can see exactly what Vercel saw in the function log
  // without needing JT to share his token with us.
  const reqId =
    req.headers["x-vercel-id"] ||
    req.headers["x-request-id"] ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ip = req.headers["x-forwarded-for"] ?? req.headers["x-real-ip"] ?? null;
  const sigHeader = req.headers["x-line-signature"];
  const sigPreview = sigHeader
    ? `${String(sigHeader).slice(0, 8)}...(${String(sigHeader).length})`
    : null;

  console.log(
    JSON.stringify({
      tag: "line-webhook-hit",
      reqId,
      method: req.method,
      ip,
      sig: sigPreview,
      ua: req.headers["user-agent"] ?? null,
    }),
  );

  // CORS / health-check ping
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, method: req.method, reqId });
  }

  const secret = process.env.LINE_CHANNEL_SECRET;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!secret || !token) {
    console.error(
      JSON.stringify({
        tag: "line-webhook-cfg-missing",
        reqId,
        hasSecret: Boolean(secret),
        secretLen: secret?.length ?? 0,
        hasToken: Boolean(token),
        tokenLen: token?.length ?? 0,
      }),
    );
    // Still 200 so LINE doesn't retry forever
    return res.status(200).json({ ok: true, degraded: true, reqId });
  }

  const rawBody = getRawBody(req);
  const sigStr = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

  const sigOk = verifySignature(secret, rawBody, sigStr);
  console.log(
    JSON.stringify({
      tag: "line-webhook-sig",
      reqId,
      sigOk,
      bodyLen: rawBody.length,
      bodyPreview: rawBody.slice(0, 80),
    }),
  );
  if (!sigOk) {
    console.warn(
      JSON.stringify({
        tag: "line-webhook-sig-invalid",
        reqId,
        ip,
        bodyPreview: rawBody.slice(0, 200),
      }),
    );
    return res.status(401).json({ ok: false, error: "invalid signature", reqId });
  }

  let body;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return res.status(400).json({ ok: false, error: "bad json", reqId });
  }
  const events = Array.isArray(body.events) ? body.events : [];
  console.log(JSON.stringify({ tag: "line-webhook-ok", reqId, count: events.length }));

  // Acknowledge immediately, process events async (LINE expects 200 within 3s)
  res.status(200).json({ ok: true, reqId });

  setImmediate(() => {
    Promise.all(
      events.map((ev) =>
        handleEvent(ev, token).catch((err) => {
          console.error(
            JSON.stringify({
              tag: "line-event-failed",
              reqId,
              err: String(err),
              type: ev.type,
            }),
          );
        }),
      ),
    ).catch(() => {});
  });
}
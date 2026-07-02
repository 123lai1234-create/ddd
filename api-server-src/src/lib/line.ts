import { logger } from "./logger";

/**
 * Minimal LINE Messaging API client — uses fetch so we don't pull in the full
 * `@line/bot-sdk` package (which adds ~2MB). Just push + reply + get profile.
 *
 * Env vars required:
 *   LINE_CHANNEL_ACCESS_TOKEN  — long-lived channel access token from LINE OA console
 *   LINE_CHANNEL_SECRET        — channel secret used to verify webhook signatures
 */

const LINE_API = "https://api.line.me";

function token(): string {
  const t = process.env["LINE_CHANNEL_ACCESS_TOKEN"];
  if (!t) throw new Error("LINE_CHANNEL_ACCESS_TOKEN not configured");
  return t;
}

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const r = await fetch(`${LINE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`LINE ${path} → ${r.status}: ${text}`);
  }
  return r.status === 204 ? null : r.json();
}

export interface FlexMessage {
  type: "flex";
  altText: string;
  contents: unknown;
}

export interface TextMessage {
  type: "text";
  text: string;
}

export type LineMessage = FlexMessage | TextMessage;

export async function pushMessage(userId: string, messages: LineMessage[]): Promise<void> {
  await call("/v2/bot/message/push", {
    method: "POST",
    body: JSON.stringify({ to: userId, messages }),
  });
  logger.info({ userId, count: messages.length }, "LINE pushMessage sent");
}

export async function replyMessage(replyToken: string, messages: LineMessage[]): Promise<void> {
  await call("/v2/bot/message/reply", {
    method: "POST",
    body: JSON.stringify({ replyToken, messages }),
  });
}

export async function getProfile(userId: string): Promise<{ displayName: string; userId: string }> {
  return (await call(`/v2/bot/profile/${userId}`)) as { displayName: string; userId: string };
}

/**
 * Verify X-Line-Signature header. LINE sends `base64(HMAC-SHA256(channelSecret, body))`.
 * Node's `crypto` works in this runtime; uses stdlib so no extra deps.
 */
export async function verifySignature(
  channelSecret: string,
  body: string,
  signature: string | null | undefined,
): Promise<boolean> {
  if (!signature) return false;
  const { createHmac } = await import("node:crypto");
  const expected = createHmac("sha256", channelSecret).update(body).digest("base64");
  // Constant-time compare to avoid timing leakage.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
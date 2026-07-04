// LINE Messaging API client — uses fetch, no @line/bot-sdk.
//
// Functions:
//   verifySignature(secret, body, sig) — constant-time HMAC-SHA256 check
//   replyMessage(token, replyToken, messages, opts) — POST /v2/bot/message/reply
//   pushMessage(token, to, messages, opts)         — POST /v2/bot/message/push
//   getProfile(token, userId, opts)                — GET  /v2/bot/profile/:id
//
// All send-side functions accept an `{ retries, baseMs, timeoutMs }` opts and
// retry on transient failures (network error / 5xx) with exponential backoff.
// A final failure throws — caller decides whether to log + DLQ or surface.

import { createHmac } from "node:crypto";

const LINE_API = "https://api.line.me";

/**
 * Verify X-Line-Signature. Constant-time compare to avoid timing leak.
 * Returns false on missing/empty signature.
 */
export function verifySignature(channelSecret, body, signature) {
  if (!signature) return false;
  const expected = createHmac("sha256", channelSecret).update(body).digest("base64");
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Internal: POST with retry/backoff for transient errors.
 *   - Network error → retry
 *   - 5xx → retry
 *   - 429 → retry with backoff
 *   - 4xx (except 429) → throw immediately (caller bug)
 *   - 2xx → return parsed JSON or null on 204
 *
 * opts:
 *   retries:      max retries (default 3)
 *   baseMs:       initial backoff (default 200ms)
 *   timeoutMs:    per-attempt timeout (default 8000ms)
 */
async function postWithRetry(path, token, body, opts = {}) {
  const { retries = 3, baseMs = 200, timeoutMs = 8000 } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${LINE_API}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        return res.status === 204 ? null : res.json();
      }
      // 4xx other than 429 = client bug, don't retry
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        const text = await res.text();
        const err = new Error(`LINE ${path} ${res.status}: ${text}`);
        err.status = res.status;
        err.permanent = true;
        throw err;
      }
      // 5xx or 429 = retryable
      lastErr = new Error(`LINE ${path} ${res.status}: ${await res.text()}`);
      lastErr.status = res.status;
    } catch (err) {
      clearTimeout(timer);
      // Permanent client errors → don't retry
      if (err && err.permanent) throw err;
      // AbortError (timeout) → retry
      // Network errors → retry
      lastErr = err;
    }
    if (attempt < retries) {
      const backoff = baseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 80);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

export function replyMessage(token, replyToken, messages, opts) {
  return postWithRetry("/v2/bot/message/reply", token, { replyToken, messages }, opts);
}

export function pushMessage(token, to, messages, opts) {
  return postWithRetry("/v2/bot/message/push", token, { to, messages }, opts);
}

/**
 * GET profile — used to personalize welcome messages.
 * Has its own shorter timeout (3s) since it's UX, not critical path.
 * Throws on failure; caller should fallback.
 */
export async function getProfile(token, userId, opts = {}) {
  const { timeoutMs = 3000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${LINE_API}/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`getProfile ${res.status}: ${text}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
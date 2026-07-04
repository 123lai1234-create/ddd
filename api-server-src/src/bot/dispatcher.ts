/**
 * LINE bot command dispatcher.
 *
 * Pattern: every handler implements `Handler` with:
 *   match(text, ev)  → returns true if this handler should run
 *   run(text, ctx)   → returns FlexMessage | TextMessage | array thereof
 *
 * Dispatcher iterates handlers in priority order; first match wins.
 * Built-in /help /menu/etc. are themselves handlers.
 *
 * Why this shape:
 *   - Per-topic isolation (one file, one handler) — keeps the main route file
 *     free of business logic
 *   - Handlers are pure: same text in → same messages out (for the same ctx)
 *   - ctx.userId / ctx.replyToken / ctx.events are passed explicitly, no globals
 *   - Easy to unit-test: feed in text, assert on returned messages
 */

import type { LineMessage } from "../lib/line";

// ---- Types -----------------------------------------------------------------

export interface Ctx {
  userId?: string;
  replyToken: string;
  events: ReadonlyArray<unknown>;
}

export interface Handler {
  /** Stable identifier; surfaced in logs. */
  name: string;
  /** Priority: lower numbers run first. Built-ins use 10, topic handlers use 50. */
  priority: number;
  /** Return true to claim the message (and stop dispatch). */
  match(text: string, ev: { type: string }): boolean;
  /** Produce the reply messages. May be async. */
  run(text: string, ctx: Ctx): Promise<LineMessage | LineMessage[]>;
}

// ---- Registry --------------------------------------------------------------

class Registry {
  private handlers: Handler[] = [];

  register(h: Handler): void {
    this.handlers.push(h);
    this.handlers.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  }

  list(): readonly Handler[] {
    return this.handlers;
  }
}

export const handlers = new Registry();

// ---- Dispatch --------------------------------------------------------------

export async function dispatch(
  text: string,
  ev: { type: string },
  ctx: Ctx,
): Promise<LineMessage[]> {
  for (const h of handlers.list()) {
    if (h.match(text, ev)) {
      const out = await h.run(text, ctx);
      return Array.isArray(out) ? out : [out];
    }
  }
  // No handler matched — give a soft fallback.
  const { textBubble } = await import("../lib/flex-topics");
  return [textBubble("看不懂 🙈 輸入 `help` 看指令")];
}
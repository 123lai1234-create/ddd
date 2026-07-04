/**
 * Topic subscribe/unsubscribe handler.
 *
 *   topic            → 顯示目前訂閱狀態
 *   topic <id>       → 開啟 <id> 推播
 *   topic -<id>      → 關閉 <id> 推播
 *   topic all        → 全部開啟
 *   topic clear      → 全部關閉
 *
 * Persists to line_subscribers.topics (JSON column added in Phase 3 migration).
 * The `topic` builtin delegates here on match.
 */

import { db, lineSubscribersTable } from "../_shims/db";
import { eq } from "drizzle-orm";
import type { Ctx } from "./dispatcher";
import type { LineMessage } from "../lib/line";
import { TOPICS, topicCard, textBubble, okFlex, THEME } from "../lib/flex-topics";
import { logger } from "../lib/logger";

const VALID_IDS = new Set(TOPICS.map((t) => t.id));

interface SubscriberRow {
  userId: string;
  topics: string | null;
  muted: number;
}

async function getRow(userId: string): Promise<SubscriberRow | null> {
  const rows = await db.select().from(lineSubscribersTable).where(eq(lineSubscribersTable.userId, userId));
  return (rows[0] as SubscriberRow | undefined) ?? null;
}

function parseTopics(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function statusLine(active: string[]): LineMessage {
  const lines = TOPICS.map((t) => `${active.includes(t.id) ? "🟢" : "⚪"} ${t.emoji} ${t.title} (${t.id})`);
  return textBubble(
    "📡 推播訂閱狀態\n" + lines.join("\n") +
    "\n\n輸入 `topic <id>` 開啟、`topic -<id>` 關閉。",
    THEME.fg,
  );
}

export async function runTopic(text: string, ctx: Ctx): Promise<LineMessage[]> {
  const userId = ctx.userId;
  if (!userId) return [textBubble("需要用戶 ID，請從 LINE 加好友後再試。", THEME.red)];

  const trimmed = text.trim();
  const arg = trimmed.replace(/^topic\s*/i, "").trim();

  // No arg → status
  if (!arg) {
    const row = await getRow(userId);
    const active = row?.muted ? [] : parseTopics(row?.topics ?? "[]");
    return [statusLine(active)];
  }

  // bulk commands
  if (arg === "all") return setTopics(userId, [...VALID_IDS]);
  if (arg === "clear" || arg === "-all") return setTopics(userId, []);
  if (arg === "-") return setTopics(userId, []);

  // parse +/-list
  const add = new Set<string>();
  const remove = new Set<string>();
  for (const tok of arg.split(/[\s,]+/).filter(Boolean)) {
    if (tok.startsWith("-")) {
      const id = tok.slice(1);
      if (VALID_IDS.has(id as never)) remove.add(id);
    } else {
      const id = tok;
      if (VALID_IDS.has(id as never)) add.add(id);
    }
  }

  if (!add.size && !remove.size) {
    return [textBubble(`未知的主題。有效值：${[...VALID_IDS].join(", ")}`, THEME.red)];
  }

  const row = await getRow(userId);
  const current = new Set(parseTopics(row?.topics ?? "[]"));
  for (const id of remove) current.delete(id);
  for (const id of add) current.add(id);

  const next = [...current];
  await db.update(lineSubscribersTable)
    .set({ topics: JSON.stringify(next) })
    .where(eq(lineSubscribersTable.userId, userId));
  logger.info({ userId, next }, "topic updated");

  const added = [...add].filter((x) => current.has(x));
  const removed = [...remove].filter((x) => !current.has(x));
  return [okFlex(
    `✅ 已更新\n+ ${added.join(", ") || "(無)"}\n- ${removed.join(", ") || "(無)"}\n目前：${next.join(", ") || "(未訂閱)"}`,
  )];
}

async function setTopics(userId: string, ids: string[]): Promise<LineMessage[]> {
  await db.update(lineSubscribersTable)
    .set({ topics: JSON.stringify(ids) })
    .where(eq(lineSubscribersTable.userId, userId));
  return [okFlex(ids.length ? `✅ 已訂閱：${ids.join(", ")}` : "✅ 已全部取消")];
}

// ---- Self-register on import (via the builtin stub) ------------------------
//
// Note: builtins.ts already imports this module lazily inside the topic handler's
// `run()` callback, so no top-level register() call is needed here.

export { TOPICS };
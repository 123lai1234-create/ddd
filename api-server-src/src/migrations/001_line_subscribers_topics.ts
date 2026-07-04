/**
 * LINE subscribers — extended schema with topic-based subscriptions.
 *
 * Run with:
 *   psql $DATABASE_URL -f migrations/001_line_subscribers_topics.sql
 *
 * Or programmatically:
 *   import { runMigrations } from './migrations';
 *   await runMigrations();
 *
 * Fields:
 *   topics          JSON array of topic ids (e.g. ["stock","protein","interview"])
 *   display_name    Optional, pulled from LINE profile API on first follow
 *   push_quiet_hrs  Optional, "HH:MM-HH:MM" — suppress pushes inside window
 *   last_pushed_at  Timestamp of most recent push (for rate-limit display)
 */

import { sql } from "drizzle-orm";
import { db } from "../_shims/db";
import { logger } from "../lib/logger";

export const MIGRATION_001 = `
ALTER TABLE line_subscribers
  ADD COLUMN IF NOT EXISTS topics JSONB NOT NULL DEFAULT '["stock"]'::jsonb,
  ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS push_quiet_hrs TEXT NOT NULL DEFAULT '22:00-08:00',
  ADD COLUMN IF NOT EXISTS last_pushed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS line_subscribers_topics_idx
  ON line_subscribers USING GIN (topics);
`;

export async function runMigrations(): Promise<void> {
  try {
    await db.execute(sql.raw(MIGRATION_001));
    logger.info("LINE subscribers migration 001 applied");
  } catch (err) {
    logger.error({ err }, "migration 001 failed");
    throw err;
  }
}
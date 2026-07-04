-- LINE subscribers: extend for topic-based subscriptions + push preferences.
-- Idempotent: safe to re-run.

ALTER TABLE line_subscribers
  ADD COLUMN IF NOT EXISTS topics JSONB NOT NULL DEFAULT '["stock"]'::jsonb,
  ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS push_quiet_hrs TEXT NOT NULL DEFAULT '22:00-08:00',
  ADD COLUMN IF NOT EXISTS last_pushed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS line_subscribers_topics_idx
  ON line_subscribers USING GIN (topics);
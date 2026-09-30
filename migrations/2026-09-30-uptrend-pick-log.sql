-- Migration: uptrend_pick_log table
-- Date: 2026-09-30
-- Purpose: Persist daily uptrend_watch scan results so the
--   /api/uptrend_pick_history endpoint can compute 5d/10d/20d win-rate
--   stats + per-pick return table. System cron `run UptrendScan` writes
--   rows; user "重新掃描" button also re-inserts via ON CONFLICT DO NOTHING.
-- Wired by `astro/api/catchall.mjs` :: uptrendWatch (insert side) and
--   uptrendPickHistory (read side).
-- Hit count = score (0..5) from cond1..cond5.

-- Run against the Neon Postgres instance (schema `public`).

CREATE TABLE IF NOT EXISTS uptrend_pick_log (
    scan_date        DATE        NOT NULL,
    code             TEXT        NOT NULL,
    name             TEXT,
    hit_count        INTEGER     NOT NULL,
    close_at_signal  NUMERIC,
    ma10             NUMERIC,
    ma20             NUMERIC,
    ma60             NUMERIC,
    dist_pct         NUMERIC,
    captured_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (scan_date, code)
);

-- For history queries (latest scan first, per-code lookups).
CREATE INDEX IF NOT EXISTS uptrend_pick_log_scan_date_idx
    ON uptrend_pick_log (scan_date DESC);

CREATE INDEX IF NOT EXISTS uptrend_pick_log_code_idx
    ON uptrend_pick_log (code, scan_date DESC);

-- Backfill helper: for cron bootstrap / historical insertion, can run
-- a single insert for "yesterday" picks:
--   INSERT INTO uptrend_pick_log (scan_date, code, name, hit_count, close_at_signal)
--   VALUES ($1, $2, $3, $4, $5)
--   ON CONFLICT (scan_date, code) DO NOTHING;
-- (catchall.mjs::uptrendWatch does this automatically on each scan.)
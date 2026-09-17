-- Migration: chatbot Q&A cache table
-- Date: 2026-09-17
-- Purpose: Cache LLM answers so repeat questions don't burn tokens.
-- Wired by `astro/api/catchall.mjs` :: _chatCacheLookup / _chatCacheSave
-- Cache key = FNV-1a 32-bit hash of normalized last user message.
--
-- Run against the Neon Postgres instance (schema `public`) used by
-- the donttalk Astro catchall edge function.

CREATE TABLE IF NOT EXISTS chat_qa_cache (
    q_hash      TEXT        PRIMARY KEY,
    q_text      TEXT        NOT NULL,
    a_text      TEXT        NOT NULL,
    hit_count   INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- For admin / analytics queries (most-recently-used, top hits, etc.)
CREATE INDEX IF NOT EXISTS chat_qa_cache_updated_at_idx
    ON chat_qa_cache (updated_at DESC);

CREATE INDEX IF NOT EXISTS chat_qa_cache_hit_count_idx
    ON chat_qa_cache (hit_count DESC);

-- Note: catchall.mjs sets `updated_at = NOW()` explicitly in its UPDATE
-- statements, so we do NOT install a trigger here. Keeps the migration
-- idempotent and easy to apply via the Neon HTTP SQL API (which rejects
-- multi-statement function bodies when split on `;`).

-- Optional: trim to a sane size if it grows unbounded.
-- Run manually or via a cron / scheduled Vercel function:
--   DELETE FROM chat_qa_cache
--   WHERE updated_at < NOW() - INTERVAL '90 days'
--     AND hit_count < 2;
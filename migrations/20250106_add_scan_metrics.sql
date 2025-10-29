-- Migration: Extend scanner stats and capture per-scan history
-- Run with: psql -d sora_feed -f migrations/20250106_add_scan_metrics.sql

BEGIN;

-- Extend scanner_stats with richer telemetry
ALTER TABLE scanner_stats
  ADD COLUMN IF NOT EXISTS last_overlap_pct NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_posts_per_second NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_new_posts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_duplicates INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_errors INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS scanner_started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Initialize new columns for existing row
UPDATE scanner_stats
SET
  last_overlap_pct = COALESCE(last_overlap_pct, 0),
  last_posts_per_second = COALESCE(last_posts_per_second, 0),
  last_new_posts = COALESCE(last_new_posts, 0),
  last_duplicates = COALESCE(last_duplicates, 0),
  consecutive_errors = COALESCE(consecutive_errors, 0),
  scanner_started_at = COALESCE(scanner_started_at, CURRENT_TIMESTAMP)
WHERE id = 1;

-- Historical scan results for diagnostics
CREATE TABLE IF NOT EXISTS scanner_scan_history (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  duration_ms INTEGER NOT NULL,
  fetch_count INTEGER DEFAULT 0,
  new_posts INTEGER DEFAULT 0,
  duplicate_posts INTEGER DEFAULT 0,
  overlap_pct NUMERIC(5,2),
  posts_per_second NUMERIC(10,2),
  poll_interval_ms INTEGER,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scan_history_started_at ON scanner_scan_history (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_history_status ON scanner_scan_history (status);

COMMIT;

-- Simplified Sora Scanner Database Schema
-- Wipe existing tables and create minimal, optimized schema

-- Drop existing tables
DROP TABLE IF EXISTS sora_posts CASCADE;
DROP TABLE IF EXISTS creators CASCADE;
DROP TABLE IF EXISTS scanner_stats CASCADE;

-- Create simplified posts table with only essential fields
CREATE TABLE sora_posts (
  id TEXT PRIMARY KEY,
  posted_at BIGINT NOT NULL,
  orientation TEXT NOT NULL CHECK (orientation IN ('wide', 'tall', 'square')),
  duration NUMERIC(5,2) NOT NULL, -- Duration in seconds (e.g., 10.00, 15.00)
  prompt TEXT,
  indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for all searchable fields
CREATE INDEX idx_posts_posted_at ON sora_posts (posted_at DESC);
CREATE INDEX idx_posts_orientation ON sora_posts (orientation);
CREATE INDEX idx_posts_duration ON sora_posts (duration);
CREATE INDEX idx_posts_prompt_fts ON sora_posts USING gin(to_tsvector('english', COALESCE(prompt, '')));
CREATE INDEX idx_posts_indexed_at ON sora_posts (indexed_at DESC);

-- Create scanner_stats table for monitoring
CREATE TABLE scanner_stats (
  id SERIAL PRIMARY KEY,
  total_scanned INTEGER DEFAULT 0,
  new_posts INTEGER DEFAULT 0,
  duplicate_posts INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  last_scan_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  scan_duration_ms INTEGER DEFAULT 0,
  status TEXT DEFAULT 'idle',
  error_message TEXT,
  last_scan_count INTEGER DEFAULT 0,
  avg_posts_per_second NUMERIC(10,2) DEFAULT 0,
  current_poll_interval INTEGER DEFAULT 10000
);

-- Initialize scanner_stats
INSERT INTO scanner_stats (
  total_scanned, 
  new_posts, 
  duplicate_posts, 
  errors, 
  status, 
  avg_posts_per_second, 
  current_poll_interval
) VALUES (0, 0, 0, 0, 'idle', 0, 10000);

-- Create index for scanner_stats
CREATE INDEX idx_scanner_stats_timestamp ON scanner_stats (last_scan_at DESC);


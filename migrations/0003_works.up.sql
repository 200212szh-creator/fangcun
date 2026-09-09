-- Fangcun 1.0 Work layer, additive only.
-- The isolated TypeScript runner conditionally adds work_id because SQLite
-- has no portable ALTER TABLE ... ADD COLUMN IF NOT EXISTS syntax.
CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  original_title TEXT,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE book_editions ADD COLUMN work_id TEXT;

CREATE INDEX IF NOT EXISTS idx_book_editions_work_id ON book_editions(work_id);

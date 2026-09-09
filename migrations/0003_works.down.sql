-- Rehearsal-only rollback for an isolated copy.
-- The rollback runner verifies the conservative one-Edition-to-one-Work
-- state before removing this additive layer.
DROP INDEX IF EXISTS idx_book_editions_work_id;
ALTER TABLE book_editions DROP COLUMN work_id;
DROP TABLE IF EXISTS works;

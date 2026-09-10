-- Rehearsal-only rollback for an isolated copy.
-- The runner refuses rollback after any relation or Contributor entity has been
-- added or edited beyond the conservative legacy backfill.
DROP INDEX IF EXISTS idx_edition_contributors_contributor;
DROP INDEX IF EXISTS idx_edition_contributors_edition_order;
DROP TABLE IF EXISTS edition_contributors;
DROP TABLE IF EXISTS contributors;

-- Fangcun 1.0 Contributor model, additive only.
-- Legacy book_editions.authors and book_editions.translators remain authoritative
-- compatibility fields during the migration window.
CREATE TABLE contributors (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  sort_name TEXT,
  normalized_name TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE edition_contributors (
  edition_id TEXT NOT NULL REFERENCES book_editions(id) ON DELETE CASCADE,
  contributor_id TEXT NOT NULL REFERENCES contributors(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('author', 'translator', 'editor', 'compiler', 'illustrator', 'other')),
  order_index INTEGER NOT NULL CHECK (order_index >= 0),
  credited_as TEXT,
  PRIMARY KEY (edition_id, contributor_id, role, order_index)
);

CREATE INDEX idx_edition_contributors_edition_order
  ON edition_contributors(edition_id, order_index, role, contributor_id);

CREATE INDEX idx_edition_contributors_contributor
  ON edition_contributors(contributor_id, role);

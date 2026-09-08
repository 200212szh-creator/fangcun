CREATE TABLE IF NOT EXISTS loans (id TEXT PRIMARY KEY, copy_id TEXT NOT NULL, borrower_name TEXT NOT NULL, borrower_contact TEXT, lent_at TEXT NOT NULL, due_at TEXT, returned_at TEXT, status TEXT NOT NULL DEFAULT 'active', note TEXT);
CREATE TABLE IF NOT EXISTS concepts (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, user_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS annotations (id TEXT PRIMARY KEY, copy_id TEXT NOT NULL, page_label TEXT, body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS annotation_concepts (annotation_id TEXT NOT NULL, concept_id TEXT NOT NULL, PRIMARY KEY(annotation_id, concept_id));
CREATE INDEX IF NOT EXISTS idx_loans_copy_status ON loans(copy_id, status);
CREATE INDEX IF NOT EXISTS idx_annotations_copy ON annotations(copy_id, created_at);

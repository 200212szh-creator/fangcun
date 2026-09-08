-- Fangcun Archive phase 1: additive fields only.
-- The idempotent runner applies each statement only when the column is absent.
ALTER TABLE book_editions ADD COLUMN original_title TEXT;
ALTER TABLE book_editions ADD COLUMN series_name TEXT;
ALTER TABLE book_editions ADD COLUMN edition_statement TEXT;
ALTER TABLE book_editions ADD COLUMN edition_number INTEGER;
ALTER TABLE book_editions ADD COLUMN print_run INTEGER;
ALTER TABLE book_editions ADD COLUMN publication_date TEXT;
ALTER TABLE book_editions ADD COLUMN edition_notes TEXT;
ALTER TABLE book_editions ADD COLUMN original_publisher TEXT;
ALTER TABLE owned_copies ADD COLUMN acquisition_method TEXT;
ALTER TABLE owned_copies ADD COLUMN acquisition_source TEXT;
ALTER TABLE owned_copies ADD COLUMN acquisition_place TEXT;
ALTER TABLE owned_copies ADD COLUMN price_cents INTEGER;
ALTER TABLE owned_copies ADD COLUMN currency TEXT;
ALTER TABLE owned_copies ADD COLUMN condition TEXT;
ALTER TABLE owned_copies ADD COLUMN inscription TEXT;
ALTER TABLE owned_copies ADD COLUMN receipt_note TEXT;
ALTER TABLE owned_copies ADD COLUMN shelf_location_id TEXT;
ALTER TABLE owned_copies ADD COLUMN shelf_slot TEXT;
ALTER TABLE owned_copies ADD COLUMN shelf_coordinate TEXT;
ALTER TABLE owned_copies ADD COLUMN location_sort_order INTEGER;
ALTER TABLE shelf_locations ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shelf_locations ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_owned_copies_shelf_location ON owned_copies(shelf_location_id);
CREATE INDEX IF NOT EXISTS idx_shelf_locations_user_order ON shelf_locations(user_id, active, sort_order, name);

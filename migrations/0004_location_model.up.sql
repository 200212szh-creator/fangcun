-- Fangcun 1.0 Location model, additive only.
-- Existing shelf_locations rows remain legacy nodes. The isolated runner applies
-- each ALTER conditionally because SQLite has no portable ADD COLUMN IF NOT EXISTS.
ALTER TABLE shelf_locations ADD COLUMN location_type TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE shelf_locations ADD COLUMN display_code TEXT;
ALTER TABLE loans ADD COLUMN original_location_id TEXT;
ALTER TABLE loans ADD COLUMN original_location_slot TEXT;
ALTER TABLE loans ADD COLUMN original_location_coordinate TEXT;
ALTER TABLE loans ADD COLUMN original_location_text TEXT;
ALTER TABLE loans ADD COLUMN original_location_sort_order INTEGER;
ALTER TABLE loans ADD COLUMN original_location_captured INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_shelf_locations_parent_order ON shelf_locations(user_id,parent_id,active,sort_order,name,id);
CREATE INDEX IF NOT EXISTS idx_owned_copies_location_owner ON owned_copies(shelf_location_id,user_id,deleted_at);
CREATE INDEX IF NOT EXISTS idx_loans_original_location ON loans(original_location_id);

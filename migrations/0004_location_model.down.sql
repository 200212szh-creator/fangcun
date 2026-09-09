-- Rehearsal-only rollback for an isolated copy.
-- The runner refuses rollback if any new type, code, or loan snapshot is populated.
DROP INDEX IF EXISTS idx_loans_original_location;
DROP INDEX IF EXISTS idx_owned_copies_location_owner;
DROP INDEX IF EXISTS idx_shelf_locations_parent_order;
ALTER TABLE loans DROP COLUMN original_location_sort_order;
ALTER TABLE loans DROP COLUMN original_location_captured;
ALTER TABLE loans DROP COLUMN original_location_text;
ALTER TABLE loans DROP COLUMN original_location_coordinate;
ALTER TABLE loans DROP COLUMN original_location_slot;
ALTER TABLE loans DROP COLUMN original_location_id;
ALTER TABLE shelf_locations DROP COLUMN display_code;
ALTER TABLE shelf_locations DROP COLUMN location_type;

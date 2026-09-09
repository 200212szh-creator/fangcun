import { bootstrapDatabase, db, sqlite } from "@/lib/db";
import { sql } from "drizzle-orm";

const migrationId = "0001_archive_fields";
const latestMigrationId = "0002_loans_annotations";
const targets: Array<[string, string]> = [
  ["book_editions", "original_title"], ["book_editions", "series_name"], ["book_editions", "edition_statement"], ["book_editions", "edition_number"], ["book_editions", "print_run"], ["book_editions", "publication_date"], ["book_editions", "edition_notes"], ["book_editions", "original_publisher"],
  ["owned_copies", "acquisition_method"], ["owned_copies", "acquisition_source"], ["owned_copies", "acquisition_place"], ["owned_copies", "price_cents"], ["owned_copies", "currency"], ["owned_copies", "condition"], ["owned_copies", "inscription"], ["owned_copies", "receipt_note"], ["owned_copies", "shelf_location_id"], ["owned_copies", "shelf_slot"], ["owned_copies", "shelf_coordinate"], ["owned_copies", "location_sort_order"], ["shelf_locations", "sort_order"], ["shelf_locations", "active"],
];
function hasColumn(table: string, name: string) { return (sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((column) => column.name === name); }
bootstrapDatabase();
const latestApplied = sqlite.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(latestMigrationId);
if (latestApplied) {
  sqlite.transaction(() => {
    sqlite.exec("DROP INDEX IF EXISTS idx_loans_copy_status");
    sqlite.exec("DROP INDEX IF EXISTS idx_annotations_copy");
    sqlite.exec("DROP TABLE IF EXISTS annotation_concepts");
    sqlite.exec("DROP TABLE IF EXISTS annotations");
    sqlite.exec("DROP TABLE IF EXISTS concepts");
    sqlite.exec("DROP TABLE IF EXISTS loans");
    db.run(sql`DELETE FROM schema_migrations WHERE id=${latestMigrationId}`);
  })();
  console.log(`${latestMigrationId} rolled back.`);
  process.exit(0);
}
const applied = sqlite.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(migrationId);
if (!applied) { console.log(`${migrationId} is not applied.`); process.exit(0); }
sqlite.transaction(() => {
  sqlite.exec("DROP INDEX IF EXISTS idx_owned_copies_shelf_location");
  sqlite.exec("DROP INDEX IF EXISTS idx_shelf_locations_user_order");
  for (const [table, column] of targets) if (hasColumn(table, column)) sqlite.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  db.run(sql`DELETE FROM schema_migrations WHERE id=${migrationId}`);
})();
console.log(`${migrationId} rolled back. Restore the latest backup if new-field data was entered.`);

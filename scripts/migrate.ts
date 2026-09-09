import { bootstrapDatabase, db, sqlite } from "@/lib/db";
import { assertMigrationRecorded } from "@/lib/db/schema-truth";
import { sql } from "drizzle-orm";

type Column = { table: string; name: string; definition: string };
const migrationId = "0001_archive_fields";
const columns: Column[] = [
  ["book_editions", "original_title", "TEXT"], ["book_editions", "series_name", "TEXT"], ["book_editions", "edition_statement", "TEXT"],
  ["book_editions", "edition_number", "INTEGER"], ["book_editions", "print_run", "INTEGER"], ["book_editions", "publication_date", "TEXT"],
  ["book_editions", "edition_notes", "TEXT"], ["book_editions", "original_publisher", "TEXT"], ["owned_copies", "acquisition_method", "TEXT"],
  ["owned_copies", "acquisition_source", "TEXT"], ["owned_copies", "acquisition_place", "TEXT"], ["owned_copies", "price_cents", "INTEGER"],
  ["owned_copies", "currency", "TEXT"], ["owned_copies", "condition", "TEXT"], ["owned_copies", "inscription", "TEXT"],
  ["owned_copies", "receipt_note", "TEXT"], ["owned_copies", "shelf_location_id", "TEXT"], ["owned_copies", "shelf_slot", "TEXT"],
  ["owned_copies", "shelf_coordinate", "TEXT"], ["owned_copies", "location_sort_order", "INTEGER"], ["shelf_locations", "sort_order", "INTEGER NOT NULL DEFAULT 0"],
  ["shelf_locations", "active", "INTEGER NOT NULL DEFAULT 1"],
].map(([table, name, definition]) => ({ table, name, definition }));

function hasColumn(table: string, name: string) {
  return (sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((column) => column.name === name);
}

bootstrapDatabase();
if (sqlite.prepare("SELECT id FROM schema_migrations WHERE id = ?").get("0002_loans_annotations")) assertMigrationRecorded(sqlite, migrationId);
db.run(sql`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
const applied = sqlite.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(migrationId);
if (applied) {
  console.log(`${migrationId} already applied.`);
  process.exit(0);
}

const apply = sqlite.transaction(() => {
  for (const column of columns) if (!hasColumn(column.table, column.name)) sqlite.exec(`ALTER TABLE ${column.table} ADD COLUMN ${column.name} ${column.definition}`);
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_owned_copies_shelf_location ON owned_copies(shelf_location_id)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_shelf_locations_user_order ON shelf_locations(user_id, active, sort_order, name)");
  sqlite.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(migrationId, new Date().toISOString());
});
apply();
console.log(`${migrationId} applied successfully.`);

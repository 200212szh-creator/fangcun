import { ensureDatabase, sqlite } from "@/lib/db";

const required: Record<string, string[]> = {
  book_editions: ["original_title", "series_name", "edition_statement", "edition_number", "print_run", "publication_date", "edition_notes", "original_publisher"],
  owned_copies: ["acquisition_method", "acquisition_source", "acquisition_place", "price_cents", "currency", "condition", "inscription", "receipt_note", "shelf_location_id", "shelf_slot", "shelf_coordinate", "location_sort_order"],
  shelf_locations: ["sort_order", "active"],
};
ensureDatabase();
for (const [table, names] of Object.entries(required)) {
  const actual = new Set((sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name));
  const missing = names.filter((name) => !actual.has(name));
  if (missing.length) throw new Error(`${table} missing: ${missing.join(", ")}`);
}
const counts = { editions: (sqlite.prepare("SELECT count(*) as count FROM book_editions").get() as { count: number }).count, copies: (sqlite.prepare("SELECT count(*) as count FROM owned_copies").get() as { count: number }).count, shelves: (sqlite.prepare("SELECT count(*) as count FROM shelf_locations").get() as { count: number }).count };
console.log(JSON.stringify({ valid: true, counts }, null, 2));

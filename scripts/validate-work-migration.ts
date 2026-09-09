import Database from "better-sqlite3";

function requireIsolatedDatabase() {
  if (process.env.FANGCUN_MIGRATION_TARGET !== "ISOLATED") throw new Error("Refusing validation: DATABASE TARGET must be ISOLATED");
  const databaseFile = process.env.FANGCUN_MIGRATION_DATABASE;
  if (!databaseFile || !/^(?:[A-Za-z]:[\\/]|[\\/]{2})/.test(databaseFile)) throw new Error("Refusing validation: FANGCUN_MIGRATION_DATABASE must be an explicit absolute path");
  return databaseFile;
}

function hasTable(sqlite: Database.Database, table: string) {
  return Boolean(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function hasColumn(sqlite: Database.Database, table: string, column: string) {
  return (sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((item) => item.name === column);
}

function count(sqlite: Database.Database, table: string) {
  return Number((sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
}

function main() {
  const sqlite = new Database(requireIsolatedDatabase(), { readonly: true, fileMustExist: true });
  try {
    const tables = ["book_editions", "owned_copies", "loans", "annotations", "shelf_locations", "categories", "tags", "copy_tags", "wishlist_items", "research_works", "research_folders", "concepts"];
    const counts = Object.fromEntries(tables.map((table) => [table, count(sqlite, table)]));
    const workSchemaPresent = hasTable(sqlite, "works") && hasColumn(sqlite, "book_editions", "work_id");
    const validation = workSchemaPresent ? {
      workCount: count(sqlite, "works"),
      missingWorkId: Number((sqlite.prepare("SELECT COUNT(*) AS count FROM book_editions WHERE work_id IS NULL").get() as { count: number }).count),
      orphanWorks: Number((sqlite.prepare("SELECT COUNT(*) AS count FROM works w LEFT JOIN book_editions e ON e.work_id=w.id WHERE e.id IS NULL").get() as { count: number }).count),
      orphanEditions: Number((sqlite.prepare("SELECT COUNT(*) AS count FROM book_editions e LEFT JOIN works w ON w.id=e.work_id WHERE e.work_id IS NOT NULL AND w.id IS NULL").get() as { count: number }).count),
      duplicateWorkIds: Number((sqlite.prepare("SELECT COUNT(*) AS count FROM (SELECT id FROM works GROUP BY id HAVING COUNT(*) > 1)").get() as { count: number }).count),
      unexpectedNullWorkFields: Number((sqlite.prepare("SELECT COUNT(*) AS count FROM works WHERE title IS NULL OR created_at IS NULL OR updated_at IS NULL").get() as { count: number }).count),
      foreignKeyViolations: sqlite.prepare("PRAGMA foreign_key_check").all().length,
    } : null;
    const migrationApplied = Boolean(sqlite.prepare("SELECT id FROM schema_migrations WHERE id=?").get("0003_works"));
    console.log(JSON.stringify({ databaseTarget: "ISOLATED", migrationId: "0003_works", migrationApplied, workSchemaPresent, counts, validation }));
  } finally {
    sqlite.close();
  }
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

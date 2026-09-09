import { bootstrapDatabase, ensureDatabase, sqlite } from "@/lib/db";

function hasTable(name: string) {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function hasColumn(table: string, name: string) {
  return (sqlite.prepare("PRAGMA table_info(" + table + ")").all() as Array<{ name: string }>).some((column) => column.name === name);
}

function main() {
  bootstrapDatabase();
  let ensureError: { name: string; code?: string; message: string } | null = null;
  try {
    ensureDatabase();
  } catch (error: unknown) {
    ensureError = {
      name: error instanceof Error ? error.name : "UnknownError",
      code: typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : undefined,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  console.log(JSON.stringify({
    schemaMigrations: hasTable("schema_migrations"),
    archiveColumn: hasColumn("book_editions", "original_title"),
    loans: hasTable("loans"),
    annotations: hasTable("annotations"),
    works: hasTable("works"),
    workId: hasColumn("book_editions", "work_id"),
    ensureError,
  }));
}

try {
  main();
} finally {
  sqlite.close();
}

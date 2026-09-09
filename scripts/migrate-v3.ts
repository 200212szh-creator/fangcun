import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

const migrationId = "0003_works";

type EditionRow = {
  id: string;
  title: string;
  original_title: string | null;
  description: string | null;
};

type CountSnapshot = {
  editions: number;
  copies: number;
  loans: number;
  annotations: number;
  locations: number;
};

function requireIsolatedDatabase() {
  if (process.env.FANGCUN_MIGRATION_TARGET !== "ISOLATED") throw new Error("Refusing migration: DATABASE TARGET must be ISOLATED");
  const databaseFile = process.env.FANGCUN_MIGRATION_DATABASE;
  if (!databaseFile || !/^(?:[A-Za-z]:[\\/]|[\\/]{2})/.test(databaseFile)) throw new Error("Refusing migration: FANGCUN_MIGRATION_DATABASE must be an explicit absolute path");
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

function snapshot(sqlite: Database.Database): CountSnapshot {
  return { editions: count(sqlite, "book_editions"), copies: count(sqlite, "owned_copies"), loans: count(sqlite, "loans"), annotations: count(sqlite, "annotations"), locations: count(sqlite, "shelf_locations") };
}

function validateWorkState(sqlite: Database.Database) {
  if (!hasTable(sqlite, "works") || !hasColumn(sqlite, "book_editions", "work_id")) throw new Error("0003 schema is incomplete");
  const workCount = count(sqlite, "works");
  const editionCount = count(sqlite, "book_editions");
  const missingWorkId = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM book_editions WHERE work_id IS NULL").get() as { count: number }).count);
  const orphanWorks = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM works w LEFT JOIN book_editions e ON e.work_id=w.id WHERE e.id IS NULL").get() as { count: number }).count);
  const duplicateWorkIds = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM (SELECT id FROM works GROUP BY id HAVING COUNT(*) > 1)").get() as { count: number }).count);
  const orphanEditions = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM book_editions e LEFT JOIN works w ON w.id=e.work_id WHERE e.work_id IS NOT NULL AND w.id IS NULL").get() as { count: number }).count);
  const unexpectedNullWorkFields = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM works WHERE title IS NULL OR created_at IS NULL OR updated_at IS NULL").get() as { count: number }).count);
  const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all().length;
  if (workCount !== editionCount || missingWorkId !== 0 || orphanWorks !== 0 || duplicateWorkIds !== 0 || orphanEditions !== 0 || unexpectedNullWorkFields !== 0 || foreignKeyViolations !== 0) throw new Error(`0003 validation failed: works=${workCount}, editions=${editionCount}, missingWorkId=${missingWorkId}, orphanWorks=${orphanWorks}, duplicateWorkIds=${duplicateWorkIds}, orphanEditions=${orphanEditions}, unexpectedNullWorkFields=${unexpectedNullWorkFields}, foreignKeyViolations=${foreignKeyViolations}`);
  return { workCount, editionCount, missingWorkId, orphanWorks, duplicateWorkIds, orphanEditions, unexpectedNullWorkFields, foreignKeyViolations };
}

function ensurePreconditions(sqlite: Database.Database) {
  for (const table of ["book_editions", "owned_copies", "loans", "annotations", "shelf_locations", "schema_migrations"]) if (!hasTable(sqlite, table)) throw new Error(`0003 prerequisite table is missing: ${table}`);
  const priorMigrations = sqlite.prepare("SELECT id FROM schema_migrations WHERE id IN (?, ?) ORDER BY id").all("0001_archive_fields", "0002_loans_annotations") as Array<{ id: string }>;
  if (priorMigrations.length !== 2) throw new Error("0003 requires 0001_archive_fields and 0002_loans_annotations to be recorded first");
}

function main() {
  const databaseFile = requireIsolatedDatabase();
  const sqlite = new Database(databaseFile);
  try {
    sqlite.pragma("foreign_keys = ON");
    ensurePreconditions(sqlite);
    const alreadyApplied = sqlite.prepare("SELECT id FROM schema_migrations WHERE id=?").get(migrationId);
    if (alreadyApplied) {
      const after = validateWorkState(sqlite);
      console.log(JSON.stringify({ status: "already_applied", migrationId, databaseTarget: "ISOLATED", createdWorkCount: 0, after }));
      return;
    }

    if (hasTable(sqlite, "works") && hasColumn(sqlite, "book_editions", "work_id")) {
      const existingOrphanWorks = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM works w LEFT JOIN book_editions e ON e.work_id=w.id WHERE e.id IS NULL").get() as { count: number }).count);
      const existingOrphanEditions = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM book_editions e LEFT JOIN works w ON w.id=e.work_id WHERE e.work_id IS NOT NULL AND w.id IS NULL").get() as { count: number }).count);
      if (existingOrphanWorks !== 0 || existingOrphanEditions !== 0) throw new Error("Refusing 0003: pre-existing Work links contain orphan rows");
    }

    const before = snapshot(sqlite);
    const migrationTimestamp = new Date().toISOString();
    let createdWorkCount = 0;
    sqlite.transaction(() => {
      sqlite.exec("CREATE TABLE IF NOT EXISTS works (id TEXT PRIMARY KEY, title TEXT NOT NULL, original_title TEXT, description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
      if (!hasColumn(sqlite, "book_editions", "work_id")) sqlite.exec("ALTER TABLE book_editions ADD COLUMN work_id TEXT");
      sqlite.exec("CREATE INDEX IF NOT EXISTS idx_book_editions_work_id ON book_editions(work_id)");
      const editions = sqlite.prepare("SELECT id,title,original_title,description FROM book_editions WHERE work_id IS NULL ORDER BY id").all() as EditionRow[];
      const insertWork = sqlite.prepare("INSERT INTO works (id,title,original_title,description,created_at,updated_at) VALUES (?,?,?,?,?,?)");
      const linkEdition = sqlite.prepare("UPDATE book_editions SET work_id=? WHERE id=? AND work_id IS NULL");
      for (const edition of editions) {
        const workId = randomUUID();
        insertWork.run(workId, edition.title, edition.original_title, edition.description, migrationTimestamp, migrationTimestamp);
        if (linkEdition.run(workId, edition.id).changes !== 1) throw new Error(`Could not link Edition ${edition.id} to Work ${workId}`);
        createdWorkCount += 1;
      }
      validateWorkState(sqlite);
      sqlite.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(migrationId, migrationTimestamp);
    })();
    const after = validateWorkState(sqlite);
    console.log(JSON.stringify({ status: "applied", migrationId, databaseTarget: "ISOLATED", createdWorkCount, before, after }));
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

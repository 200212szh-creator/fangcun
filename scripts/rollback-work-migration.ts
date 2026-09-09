import Database from "better-sqlite3";

function requireIsolatedDatabase() {
  if (process.env.FANGCUN_MIGRATION_TARGET !== "ISOLATED") throw new Error("Refusing rollback: DATABASE TARGET must be ISOLATED");
  const databaseFile = process.env.FANGCUN_MIGRATION_DATABASE;
  if (!databaseFile || !/^(?:[A-Za-z]:[\\/]|[\\/]{2})/.test(databaseFile)) throw new Error("Refusing rollback: FANGCUN_MIGRATION_DATABASE must be an explicit absolute path");
  return databaseFile;
}

function main() {
  const sqlite = new Database(requireIsolatedDatabase());
  try {
    const migrationId = "0003_works";
    if (!sqlite.prepare("SELECT id FROM schema_migrations WHERE id=?").get(migrationId)) {
      console.log(JSON.stringify({ status: "not_applied", migrationId, databaseTarget: "ISOLATED" }));
      return;
    }
    const workCount = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM works").get() as { count: number }).count);
    const editionCount = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM book_editions").get() as { count: number }).count);
    const missingWorkId = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM book_editions WHERE work_id IS NULL").get() as { count: number }).count);
    const orphanWorks = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM works w LEFT JOIN book_editions e ON e.work_id=w.id WHERE e.id IS NULL").get() as { count: number }).count);
    const multiEditionWorks = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM (SELECT work_id FROM book_editions WHERE work_id IS NOT NULL GROUP BY work_id HAVING COUNT(*) > 1)").get() as { count: number }).count);
    if (workCount !== editionCount || missingWorkId !== 0 || orphanWorks !== 0 || multiEditionWorks !== 0) throw new Error("Refusing rollback: Work layer is not the verified one-Edition-to-one-Work rehearsal state");
    sqlite.transaction(() => {
      sqlite.exec("UPDATE book_editions SET work_id=NULL");
      sqlite.exec("DROP INDEX IF EXISTS idx_book_editions_work_id");
      sqlite.exec("ALTER TABLE book_editions DROP COLUMN work_id");
      sqlite.exec("DROP TABLE works");
      sqlite.prepare("DELETE FROM schema_migrations WHERE id=?").run(migrationId);
    })();
    console.log(JSON.stringify({ status: "rolled_back", migrationId, databaseTarget: "ISOLATED", workCountBefore: workCount, editionCount }));
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

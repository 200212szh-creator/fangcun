import { db, ensureDatabase, sqlite } from "@/lib/db";
import { sql } from "drizzle-orm";

const migrationId = "0002_loans_annotations";
ensureDatabase();
db.run(sql`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
if (sqlite.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(migrationId)) { console.log(`${migrationId} already applied.`); process.exit(0); }
sqlite.transaction(() => {
  sqlite.exec("CREATE TABLE IF NOT EXISTS loans (id TEXT PRIMARY KEY, copy_id TEXT NOT NULL, borrower_name TEXT NOT NULL, borrower_contact TEXT, lent_at TEXT NOT NULL, due_at TEXT, returned_at TEXT, status TEXT NOT NULL DEFAULT 'active', note TEXT)");
  sqlite.exec("CREATE TABLE IF NOT EXISTS concepts (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, user_id TEXT NOT NULL)");
  sqlite.exec("CREATE TABLE IF NOT EXISTS annotations (id TEXT PRIMARY KEY, copy_id TEXT NOT NULL, page_label TEXT, body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
  sqlite.exec("CREATE TABLE IF NOT EXISTS annotation_concepts (annotation_id TEXT NOT NULL, concept_id TEXT NOT NULL, PRIMARY KEY(annotation_id, concept_id))");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_loans_copy_status ON loans(copy_id, status)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_annotations_copy ON annotations(copy_id, created_at)");
  sqlite.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(migrationId, new Date().toISOString());
})();
console.log(`${migrationId} applied successfully.`);

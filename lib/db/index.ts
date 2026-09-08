import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { ensureRuntimeDirectories, runtimePaths } from "@/lib/runtime/paths";

ensureRuntimeDirectories();
const databaseFile = runtimePaths.databaseFile;

const sqlite = new Database(databaseFile);
sqlite.pragma("journal_mode = WAL");
export const db = drizzle(sqlite, { schema });

let ready = false;
export function ensureDatabase() {
  if (ready) return;
  db.run(sql`CREATE TABLE IF NOT EXISTS book_editions (id TEXT PRIMARY KEY, title TEXT NOT NULL, authors TEXT NOT NULL, translators TEXT, publisher TEXT, publication_year INTEGER, edition TEXT, original_title TEXT, series_name TEXT, edition_statement TEXT, edition_number INTEGER, print_run INTEGER, publication_date TEXT, edition_notes TEXT, original_publisher TEXT, format TEXT, language TEXT, isbn10 TEXT, isbn13 TEXT, pages INTEGER, description TEXT, cover_url TEXT, subjects TEXT, source TEXT NOT NULL, external_id TEXT, user_override TEXT NOT NULL DEFAULT '{}')`);
  db.run(sql`CREATE TABLE IF NOT EXISTS owned_copies (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, edition_id TEXT NOT NULL, location TEXT, category_id TEXT, reading_status TEXT NOT NULL DEFAULT 'unread', rating INTEGER, notes TEXT, acquired_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, acquisition_method TEXT, acquisition_source TEXT, acquisition_place TEXT, price_cents INTEGER, currency TEXT, condition TEXT, inscription TEXT, receipt_note TEXT, shelf_location_id TEXT, shelf_slot TEXT, shelf_coordinate TEXT, location_sort_order INTEGER)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, color TEXT, user_id TEXT NOT NULL)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, user_id TEXT NOT NULL)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS copy_tags (copy_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY(copy_id, tag_id))`);
  db.run(sql`CREATE TABLE IF NOT EXISTS shelf_locations (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT, room TEXT, user_id TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS wishlist_items (id TEXT PRIMARY KEY, edition_id TEXT NOT NULL, note TEXT, user_id TEXT NOT NULL, created_at TEXT NOT NULL)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS research_works (id TEXT PRIMARY KEY, title TEXT NOT NULL, authors TEXT NOT NULL, abstract TEXT, doi TEXT, journal TEXT, year INTEGER, tags TEXT NOT NULL DEFAULT '[]', notes TEXT, open_access_url TEXT, source TEXT, user_id TEXT NOT NULL, created_at TEXT NOT NULL)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS research_folders (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, user_id TEXT NOT NULL, created_at TEXT NOT NULL)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS folder_works (folder_id TEXT NOT NULL, work_id TEXT NOT NULL, PRIMARY KEY(folder_id, work_id))`);
  db.run(sql`CREATE TABLE IF NOT EXISTS external_references (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, source TEXT NOT NULL, source_id TEXT, url TEXT, user_id TEXT NOT NULL)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS search_cache (cache_key TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS loans (id TEXT PRIMARY KEY, copy_id TEXT NOT NULL, borrower_name TEXT NOT NULL, borrower_contact TEXT, lent_at TEXT NOT NULL, due_at TEXT, returned_at TEXT, status TEXT NOT NULL DEFAULT 'active', note TEXT)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS concepts (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, user_id TEXT NOT NULL)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS annotations (id TEXT PRIMARY KEY, copy_id TEXT NOT NULL, page_label TEXT, body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS annotation_concepts (annotation_id TEXT NOT NULL, concept_id TEXT NOT NULL, PRIMARY KEY(annotation_id, concept_id))`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_loans_copy_status ON loans(copy_id, status)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_annotations_copy ON annotations(copy_id, created_at)`);
  ready = true;
}

export { sqlite };

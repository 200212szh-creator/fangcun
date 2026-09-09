import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { ensureRuntimeDirectories, runtimePaths } from "@/lib/runtime/paths";
import { assertRuntimeSchema } from "@/lib/db/schema-truth";

ensureRuntimeDirectories();
const databaseFile = runtimePaths.databaseFile;

const sqlite = new Database(databaseFile);
sqlite.pragma("journal_mode = WAL");
export const db = drizzle(sqlite, { schema });

let bootstrapReady = false;
let ready = false;

export function bootstrapDatabase() {
  if (bootstrapReady) return;
  sqlite.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  sqlite.exec("CREATE TABLE IF NOT EXISTS book_editions (id TEXT PRIMARY KEY, title TEXT NOT NULL, authors TEXT NOT NULL, translators TEXT, publisher TEXT, publication_year INTEGER, edition TEXT, format TEXT, language TEXT, isbn10 TEXT, isbn13 TEXT, pages INTEGER, description TEXT, cover_url TEXT, subjects TEXT, source TEXT NOT NULL, external_id TEXT, user_override TEXT NOT NULL DEFAULT '{}')");
  sqlite.exec("CREATE TABLE IF NOT EXISTS owned_copies (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, edition_id TEXT NOT NULL, location TEXT, category_id TEXT, reading_status TEXT NOT NULL DEFAULT 'unread', rating INTEGER, notes TEXT, acquired_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)");
  sqlite.exec("CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, color TEXT, user_id TEXT NOT NULL)");
  sqlite.exec("CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, user_id TEXT NOT NULL)");
  sqlite.exec("CREATE TABLE IF NOT EXISTS copy_tags (copy_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY(copy_id, tag_id))");
  sqlite.exec("CREATE TABLE IF NOT EXISTS shelf_locations (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT, room TEXT, user_id TEXT NOT NULL)");
  sqlite.exec("CREATE TABLE IF NOT EXISTS wishlist_items (id TEXT PRIMARY KEY, edition_id TEXT NOT NULL, note TEXT, user_id TEXT NOT NULL, created_at TEXT NOT NULL)");
  sqlite.exec("CREATE TABLE IF NOT EXISTS research_works (id TEXT PRIMARY KEY, title TEXT NOT NULL, authors TEXT NOT NULL, abstract TEXT, doi TEXT, journal TEXT, year INTEGER, tags TEXT NOT NULL DEFAULT '[]', notes TEXT, open_access_url TEXT, source TEXT, user_id TEXT NOT NULL, created_at TEXT NOT NULL)");
  sqlite.exec("CREATE TABLE IF NOT EXISTS research_folders (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, user_id TEXT NOT NULL, created_at TEXT NOT NULL)");
  sqlite.exec("CREATE TABLE IF NOT EXISTS folder_works (folder_id TEXT NOT NULL, work_id TEXT NOT NULL, PRIMARY KEY(folder_id, work_id))");
  sqlite.exec("CREATE TABLE IF NOT EXISTS external_references (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, source TEXT NOT NULL, source_id TEXT, url TEXT, user_id TEXT NOT NULL)");
  sqlite.exec("CREATE TABLE IF NOT EXISTS search_cache (cache_key TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL)");
  bootstrapReady = true;
}

export function ensureDatabase() {
  if (ready) return;
  bootstrapDatabase();
  assertRuntimeSchema(sqlite);
  ready = true;
}

export { sqlite };

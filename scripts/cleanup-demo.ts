import { sql } from "drizzle-orm";
import { db, ensureDatabase } from "@/lib/db";

const knownIsbns = ["9787209054666", "9787544253994", "9780465050659", "9780374533557"];
const seedCategoryNames = ["设计与方法", "文学与小说", "科学与社会"];
const seedShelfNames = ["书房", "A柜", "第2层"];

function getRows<T>(statement: ReturnType<typeof sql>): T[] {
  return db.all(statement) as T[];
}

function removeEdition(id: string) {
  db.run(sql`DELETE FROM copy_tags WHERE copy_id IN (SELECT id FROM owned_copies WHERE edition_id=${id})`);
  db.run(sql`DELETE FROM owned_copies WHERE edition_id=${id}`);
  db.run(sql`DELETE FROM wishlist_items WHERE edition_id=${id}`);
  db.run(sql`DELETE FROM external_references WHERE entity_type='book_edition' AND entity_id=${id}`);
  db.run(sql`DELETE FROM book_editions WHERE id=${id}`);
}

ensureDatabase();

const editionRows = getRows<{ id: string; title: string; isbn13: string | null; source: string }>(sql`SELECT id,title,isbn13,source FROM book_editions WHERE source='demo' OR (source='test' AND title='Integration Book')`);
const deletedCategoryIds = new Set<string>();
for (const row of editionRows) {
  const copies = getRows<{ category_id: string | null }>(sql`SELECT category_id FROM owned_copies WHERE edition_id=${row.id}`);
  copies.forEach((copy) => { if (copy.category_id) deletedCategoryIds.add(copy.category_id); });
  removeEdition(row.id);
}

const workRows = getRows<{ id: string; title: string; doi: string | null; source: string | null }>(sql`SELECT id,title,doi,source FROM research_works WHERE source='demo' OR doi='10.1234/library.demo.2026'`);
for (const work of workRows) {
  db.run(sql`DELETE FROM folder_works WHERE work_id=${work.id}`);
  db.run(sql`DELETE FROM external_references WHERE entity_type='research_work' AND entity_id=${work.id}`);
  db.run(sql`DELETE FROM research_works WHERE id=${work.id}`);
}

const folders = getRows<{ id: string; name: string }>(sql`SELECT id,name FROM research_folders WHERE name='阅读与设计研究' AND user_id='local-owner'`);
let deletedFolders = 0;
for (const folder of folders) {
  const references = getRows<{ work_id: string }>(sql`SELECT work_id FROM folder_works WHERE folder_id=${folder.id}`);
  if (!references.length) {
    db.run(sql`DELETE FROM folder_works WHERE folder_id=${folder.id}`);
    db.run(sql`DELETE FROM research_folders WHERE id=${folder.id}`);
    deletedFolders += 1;
  }
}

let deletedCategories = 0;
for (const categoryId of deletedCategoryIds) {
  const category = getRows<{ id: string; name: string }>(sql`SELECT id,name FROM categories WHERE id=${categoryId} AND name IN (${sql.join(seedCategoryNames.map((name) => sql`${name}`), sql`, `)})`)[0];
  const inUse = getRows<{ id: string }>(sql`SELECT id FROM owned_copies WHERE category_id=${categoryId} LIMIT 1`);
  if (category && !inUse.length) {
    db.run(sql`DELETE FROM categories WHERE id=${categoryId}`);
    deletedCategories += 1;
  }
}

let deletedShelves = 0;
const shelves = getRows<{ id: string; name: string; room: string | null }>(sql`SELECT id,name,room FROM shelf_locations WHERE user_id='local-owner' AND room='书房' AND name IN (${sql.join(seedShelfNames.map((name) => sql`${name}`), sql`, `)})`);
for (const shelf of shelves) {
  const inUse = getRows<{ id: string }>(sql`SELECT id FROM owned_copies WHERE location LIKE ${`%${shelf.name}%`} LIMIT 1`);
  if (!inUse.length) {
    db.run(sql`DELETE FROM shelf_locations WHERE id=${shelf.id}`);
    deletedShelves += 1;
  }
}

const cachedRows = getRows<{ cache_key: string }>(sql`SELECT cache_key FROM search_cache`);
db.run(sql`DELETE FROM search_cache`);

console.log(JSON.stringify({
  deletedEditions: editionRows.length,
  deletedWorks: workRows.length,
  deletedFolders,
  deletedCategories,
  deletedShelves,
  clearedSearchCache: cachedRows.length,
  knownIsbns,
}, null, 2));

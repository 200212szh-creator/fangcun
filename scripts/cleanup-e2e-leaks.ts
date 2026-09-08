import { sql } from "drizzle-orm";
import { db, ensureDatabase } from "@/lib/db";

const targets = [
  { id: "3c1a1441-3074-45b2-a1e4-56d66b3bc48d", name: "测试书架-chromium" },
  { id: "3fddc4f9-9e9c-45aa-9e86-518d21a1898b", name: "测试书架-mobile" },
] as const;

ensureDatabase();
let deleted = 0;
for (const target of targets) {
  const shelf = db.get(sql`SELECT id,name FROM shelf_locations WHERE id=${target.id} AND name=${target.name} AND user_id='local-owner'`) as { id: string; name: string } | undefined;
  if (!shelf) continue;
  const inUse = db.get(sql`SELECT id FROM owned_copies WHERE location LIKE ${`%${target.name}%`} LIMIT 1`);
  if (inUse) throw new Error(`Refusing to remove an in-use test shelf: ${target.name}`);
  db.run(sql`DELETE FROM shelf_locations WHERE id=${target.id} AND name=${target.name} AND user_id='local-owner'`);
  deleted += 1;
}

console.log(JSON.stringify({ deletedTestShelves: deleted }));

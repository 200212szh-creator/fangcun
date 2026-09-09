import { NextResponse } from "next/server";
import { inspectSchema } from "@/lib/db/schema-truth";
import { ensureDatabase, sqlite } from "@/lib/db";

export const dynamic = "force-dynamic";

function isIsolatedE2E() {
  return process.env.FANGCUN_E2E === "1" && process.env.FANGCUN_MIGRATION_TARGET === "ISOLATED";
}

function count(table: string, where = "") {
  return Number((sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}${where}`).get() as { count: number }).count);
}

export async function GET() {
  if (!isIsolatedE2E()) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  ensureDatabase();
  const schema = inspectSchema(sqlite);
  const integrity = String(sqlite.pragma("integrity_check", { simple: true }));
  const quickCheck = String(sqlite.pragma("quick_check", { simple: true }));
  return NextResponse.json({
    databaseTarget: "ISOLATED",
    migrations: schema.migrations.map((migration) => migration.id),
    counts: {
      works: count("works"),
      editions: count("book_editions"),
      copies: count("owned_copies"),
      activeCopies: count("owned_copies", " WHERE deleted_at IS NULL"),
      shelves: count("shelf_locations"),
      loans: count("loans"),
      annotations: count("annotations"),
    },
    integrity,
    quickCheck,
    foreignKeyViolations: sqlite.prepare("PRAGMA foreign_key_check").all().length,
    missingWorkId: count("book_editions", " WHERE work_id IS NULL"),
    orphanEditions: Number((sqlite.prepare("SELECT COUNT(*) AS count FROM book_editions e LEFT JOIN works w ON w.id=e.work_id WHERE e.work_id IS NOT NULL AND w.id IS NULL").get() as { count: number }).count),
    orphanWorks: Number((sqlite.prepare("SELECT COUNT(*) AS count FROM works w LEFT JOIN book_editions e ON e.work_id=w.id WHERE e.id IS NULL").get() as { count: number }).count),
  });
}

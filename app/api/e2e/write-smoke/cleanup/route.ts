import { NextResponse } from "next/server";
import { ensureDatabase, sqlite } from "@/lib/db";

export const dynamic = "force-dynamic";

type CleanupRequest = {
  marker?: string;
  workId?: string;
  editionId?: string;
  copyId?: string;
  shelfId?: string;
};

function isIsolatedE2E() {
  return process.env.FANGCUN_E2E === "1" && process.env.FANGCUN_MIGRATION_TARGET === "ISOLATED";
}

function conflict(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 409 });
}

export async function POST(request: Request) {
  if (!isIsolatedE2E()) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  ensureDatabase();
  const body = await request.json() as CleanupRequest;
  const marker = body.marker?.trim();
  const workId = body.workId?.trim();
  const editionId = body.editionId?.trim();
  const copyId = body.copyId?.trim();
  const shelfId = body.shelfId?.trim();
  if (!marker || !workId || !editionId || !copyId || !shelfId) return conflict("EXACT_IDS_REQUIRED");

  const record = sqlite.prepare("SELECT c.id AS copy_id,c.deleted_at,e.id AS edition_id,e.work_id,e.title,e.source,w.id AS work_record_id,s.id AS shelf_id FROM owned_copies c JOIN book_editions e ON e.id=c.edition_id JOIN works w ON w.id=e.work_id JOIN shelf_locations s ON s.id=c.shelf_location_id WHERE c.id=? AND c.user_id=?").get(copyId, "local-owner") as { copy_id: string; deleted_at: string | null; edition_id: string; work_id: string; title: string; source: string; work_record_id: string; shelf_id: string } | undefined;
  if (!record) return conflict("FIXTURE_NOT_FOUND");
  if (record.edition_id !== editionId || record.work_id !== workId || record.work_record_id !== workId || record.shelf_id !== shelfId) return conflict("FIXTURE_RELATION_MISMATCH");
  if (!record.title.startsWith(marker) || record.source !== "task006-write-smoke") return conflict("FIXTURE_MARKER_MISMATCH");
  if (!record.deleted_at) return conflict("COPY_MUST_BE_SOFT_DELETED_FIRST");
  if (Number((sqlite.prepare("SELECT COUNT(*) AS count FROM book_editions WHERE id=?").get(editionId) as { count: number }).count) !== 1) return conflict("EDITION_ID_NOT_EXACT");
  if (Number((sqlite.prepare("SELECT COUNT(*) AS count FROM works WHERE id=?").get(workId) as { count: number }).count) !== 1) return conflict("WORK_ID_NOT_EXACT");
  if (Number((sqlite.prepare("SELECT COUNT(*) AS count FROM shelf_locations WHERE id=?").get(shelfId) as { count: number }).count) !== 1) return conflict("SHELF_ID_NOT_EXACT");
  for (const [table, column, id] of [["loans", "copy_id", copyId], ["annotations", "copy_id", copyId], ["copy_tags", "copy_id", copyId], ["wishlist_items", "edition_id", editionId], ["external_references", "entity_id", copyId], ["external_references", "entity_id", editionId]] as const) {
    if (Number((sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column}=?`).get(id) as { count: number }).count) !== 0) return conflict(`DEPENDENCY_EXISTS:${table}`);
  }
  if (Number((sqlite.prepare("SELECT COUNT(*) AS count FROM book_editions WHERE work_id=?").get(workId) as { count: number }).count) !== 1) return conflict("WORK_HAS_OTHER_EDITIONS");
  if (Number((sqlite.prepare("SELECT COUNT(*) AS count FROM owned_copies WHERE edition_id=?").get(editionId) as { count: number }).count) !== 1) return conflict("EDITION_HAS_OTHER_COPIES");

  const purge = sqlite.transaction(() => {
    if (sqlite.prepare("DELETE FROM owned_copies WHERE id=? AND user_id=?").run(copyId, "local-owner").changes !== 1) throw new Error("COPY_DELETE_MISMATCH");
    if (sqlite.prepare("DELETE FROM book_editions WHERE id=? AND work_id=?").run(editionId, workId).changes !== 1) throw new Error("EDITION_DELETE_MISMATCH");
    if (sqlite.prepare("DELETE FROM works WHERE id=?").run(workId).changes !== 1) throw new Error("WORK_DELETE_MISMATCH");
    if (sqlite.prepare("DELETE FROM shelf_locations WHERE id=? AND user_id=?").run(shelfId, "local-owner").changes !== 1) throw new Error("SHELF_DELETE_MISMATCH");
  });
  purge();
  return NextResponse.json({ ok: true, deleted: { workId, editionId, copyId, shelfId } });
}

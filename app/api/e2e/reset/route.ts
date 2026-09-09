import { NextResponse } from "next/server";
import { ensureDatabase, sqlite } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Test-only reset for the disposable E2E database. The E2E server sets
 * FANGCUN_E2E=1 and always uses an OS-temporary database. The production
 * runtime never exposes this route.
 */
export async function POST() {
  if (process.env.FANGCUN_E2E !== "1") return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  ensureDatabase();
  const reset = sqlite.transaction(() => {
    for (const table of [
      "annotation_concepts",
      "annotations",
      "concepts",
      "loans",
      "copy_tags",
      "wishlist_items",
      "owned_copies",
      "book_editions",
      "works",
      "shelf_locations",
      "categories",
      "tags",
      "folder_works",
      "research_works",
      "research_folders",
      "external_references",
      "search_cache",
    ]) {
      sqlite.prepare(`DELETE FROM ${table}`).run();
    }
  });
  reset();
  return NextResponse.json({ ok: true });
}

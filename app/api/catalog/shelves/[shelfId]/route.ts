import { NextResponse } from "next/server";
import { deleteShelf, updateShelf } from "@/lib/db/repository";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ shelfId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { shelfId } = await params;
  const body = await request.json() as { name?: string; parentId?: string | null; room?: string; sortOrder?: number; active?: boolean };
  if (body.name !== undefined && !body.name.trim()) return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
  if (body.sortOrder !== undefined && (!Number.isInteger(body.sortOrder) || body.sortOrder < 0 || body.sortOrder > 100000)) return NextResponse.json({ error: "INVALID_SORT_ORDER" }, { status: 400 });
  const item = updateShelf(shelfId, { ...body, name: body.name?.trim() });
  return item ? NextResponse.json(item) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}

export async function DELETE(_request: Request, { params }: Context) {
  const { shelfId } = await params;
  const result = deleteShelf(shelfId);
  if (!result.ok && result.reason === "NOT_FOUND") return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!result.ok) return NextResponse.json({ error: "SHELF_IN_USE", message: "Move books out of this shelf before deleting it." }, { status: 409 });
  return NextResponse.json({ ok: true });
}

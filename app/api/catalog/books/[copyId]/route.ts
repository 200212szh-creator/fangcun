import { NextResponse } from "next/server";
import { getOwnedCopy, softDeleteOwnedCopy, updateBookEdition, updateOwnedCopy, restoreOwnedCopy } from "@/lib/db/repository";
import { copyUpdateSchema, editionUpdateSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ copyId: string }> };

export async function GET(_request: Request, { params }: Context) { const { copyId } = await params; const item = getOwnedCopy(copyId); return item ? NextResponse.json(item) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); }
export async function PATCH(request: Request, { params }: Context) { const { copyId } = await params; const body = await request.json() as Record<string, unknown>; if (body.restore) { const item = restoreOwnedCopy(copyId); return item ? NextResponse.json(item) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); } const copyInput = body.copy ?? body; const copy = copyUpdateSchema.safeParse(copyInput); const edition = body.edition === undefined ? { success: true as const, data: undefined } : editionUpdateSchema.safeParse(body.edition); if (!copy.success || !edition.success) return NextResponse.json({ error: "INVALID_BOOK_UPDATE", details: { copy: copy.success ? undefined : copy.error.flatten(), edition: edition.success ? undefined : edition.error.flatten() } }, { status: 400 }); const current = getOwnedCopy(copyId); if (!current) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); if (edition.data) updateBookEdition(current.editionId, edition.data); const item = updateOwnedCopy(copyId, copy.data as Record<string, unknown>); return item ? NextResponse.json(item) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); }
export async function DELETE(_request: Request, { params }: Context) { const { copyId } = await params; const item = softDeleteOwnedCopy(copyId); return item ? NextResponse.json(item) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); }

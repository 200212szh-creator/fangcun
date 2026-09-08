import { NextResponse } from "next/server";
import { deleteAnnotation, updateAnnotation } from "@/lib/db/repository";
import { annotationUpdateSchema } from "@/lib/validations";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ annotationId: string }> };
export async function PATCH(request: Request, { params }: Context) { const { annotationId } = await params; const parsed = annotationUpdateSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "INVALID_ANNOTATION", details: parsed.error.flatten() }, { status: 400 }); const item = updateAnnotation(annotationId, parsed.data); return item ? NextResponse.json(item) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); }
export async function DELETE(_request: Request, { params }: Context) { const { annotationId } = await params; deleteAnnotation(annotationId); return NextResponse.json({ ok: true }); }

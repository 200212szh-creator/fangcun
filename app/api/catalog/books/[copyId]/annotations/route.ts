import { NextResponse } from "next/server";
import { createAnnotation, getOwnedCopy, listAnnotations } from "@/lib/db/repository";
import { annotationInputSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ copyId: string }> };
export async function GET(_request: Request, { params }: Context) { const { copyId } = await params; return NextResponse.json({ items: listAnnotations(copyId) }); }
export async function POST(request: Request, { params }: Context) { const { copyId } = await params; if (!getOwnedCopy(copyId)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); const parsed = annotationInputSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "INVALID_ANNOTATION", details: parsed.error.flatten() }, { status: 400 }); const annotation = createAnnotation(copyId, parsed.data); return annotation ? NextResponse.json(annotation, { status: 201 }) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); }

import { NextResponse } from "next/server";
import { createResearchFolder, createResearchWork, listResearch } from "@/lib/db/repository";
import { paperInputSchema } from "@/lib/validations";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(listResearch()); }
export async function POST(request: Request) { const body = await request.json() as Record<string, unknown> & { type?: string; folderId?: string }; if (body.type === "folder") { if (typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 }); return NextResponse.json(createResearchFolder({ name: body.name.trim(), description: typeof body.description === "string" ? body.description : undefined }), { status: 201 }); } const parsed = paperInputSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "INVALID_PAPER", details: parsed.error.flatten() }, { status: 400 }); return NextResponse.json({ id: createResearchWork({ ...parsed.data, tags: [], source: "Crossref", folderId: body.folderId }) }, { status: 201 }); }

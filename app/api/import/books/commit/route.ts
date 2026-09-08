import { NextResponse } from "next/server";
import { createOwnedCopy } from "@/lib/db/repository";
import { normalizeISBN } from "@/lib/isbn";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { const body = await request.json() as { rows?: Array<Record<string, string>> }; const created = (body.rows ?? []).map((row) => createOwnedCopy({ edition: { id: crypto.randomUUID(), title: row.title || row.name || "未命名书目", authors: (row.authors || row.author || "未知作者").split(/[,，、]/), publisher: row.publisher, publicationYear: Number(row.year) || undefined, isbn13: normalizeISBN(row.isbn13 || row.isbn)?.isbn13, source: "import" }, location: row.location, notes: row.notes })); return NextResponse.json({ imported: created.length }); }

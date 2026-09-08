import { NextResponse } from "next/server";
import { getBookByISBN } from "@/lib/discovery/providers";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ isbn: string }> }) { const { isbn } = await params; const items = await getBookByISBN(isbn); return NextResponse.json({ items }); }

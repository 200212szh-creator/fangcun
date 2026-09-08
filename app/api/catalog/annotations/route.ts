import { NextResponse } from "next/server";
import { listAnnotations } from "@/lib/db/repository";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { const concept = new URL(request.url).searchParams.get("concept")?.trim() || undefined; return NextResponse.json({ items: listAnnotations(undefined, concept) }); }

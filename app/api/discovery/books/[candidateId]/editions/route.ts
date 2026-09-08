import { NextResponse } from "next/server";
import { getEditionsForCandidate } from "@/lib/discovery/api";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  const title = new URL(request.url).searchParams.get("title") ?? undefined;
  return NextResponse.json({ items: await getEditionsForCandidate(candidateId, title) });
}

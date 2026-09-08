import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getOwnedCopy } from "@/lib/db/repository";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ copyId: string }> };
export async function GET(request: Request, { params }: Context) { const { copyId } = await params; const book = getOwnedCopy(copyId); if (!book) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); const format = new URL(request.url).searchParams.get("format") === "png" ? "png" : "svg"; const payload = `fangcun://book/${copyId}`; if (format === "png") { const png = await QRCode.toBuffer(payload, { type: "png", width: 640, margin: 4, errorCorrectionLevel: "M" }); return new NextResponse(png as BodyInit, { headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="fangcun-${copyId}.png"`, "Cache-Control": "no-store" } }); } const svg = await QRCode.toString(payload, { type: "svg", width: 320, margin: 4, errorCorrectionLevel: "M" }); return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Content-Disposition": `attachment; filename="fangcun-${copyId}.svg"`, "Cache-Control": "no-store" } }); }

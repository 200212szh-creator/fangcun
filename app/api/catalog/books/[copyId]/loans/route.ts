import { NextResponse } from "next/server";
import { createLoan, getOwnedCopy, listLoans } from "@/lib/db/repository";
import { loanInputSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ copyId: string }> };
export async function GET(_request: Request, { params }: Context) { const { copyId } = await params; return NextResponse.json({ items: listLoans(copyId) }); }
export async function POST(request: Request, { params }: Context) { const { copyId } = await params; if (!getOwnedCopy(copyId)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); const parsed = loanInputSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "INVALID_LOAN", details: parsed.error.flatten() }, { status: 400 }); const result = createLoan(copyId, { ...parsed.data, dueAt: parsed.data.dueAt || undefined }); if (!result.ok && result.reason === "ALREADY_LENT") return NextResponse.json({ error: "ALREADY_LENT", message: "This copy already has an active loan." }, { status: 409 }); if (!result.ok) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); return NextResponse.json(result.loan, { status: 201 }); }

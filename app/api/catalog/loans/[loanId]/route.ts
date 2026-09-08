import { NextResponse } from "next/server";
import { renewLoan, returnLoan } from "@/lib/db/repository";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ loanId: string }> };
export async function PATCH(request: Request, { params }: Context) { const { loanId } = await params; const body = await request.json() as { action?: string; dueAt?: string }; if (body.action === "return") { const loan = returnLoan(loanId); return loan ? NextResponse.json(loan) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); } if (body.action === "renew" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueAt ?? "")) { const loan = renewLoan(loanId, body.dueAt!); return loan ? NextResponse.json(loan) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }); } return NextResponse.json({ error: "INVALID_LOAN_ACTION" }, { status: 400 }); }

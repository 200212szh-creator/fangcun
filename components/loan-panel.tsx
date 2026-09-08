"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Clock3, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Loan } from "@/lib/types";

async function getLoans(copyId: string) {
  const response = await fetch(`/api/catalog/books/${copyId}/loans`);
  if (!response.ok) throw new Error("request-failed");
  return response.json() as Promise<{ items: Loan[] }>;
}

export function LoanPanel({ copyId }: { copyId: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["loans", copyId], queryFn: () => getLoans(copyId) });
  const [borrower, setBorrower] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [renewalDueAt, setRenewalDueAt] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const active = query.data?.items.find((loan) => loan.status === "active");

  useEffect(() => { if (active?.dueAt) setRenewalDueAt(active.dueAt); }, [active?.dueAt]);

  const submit = async () => {
    if (!borrower.trim() || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/catalog/books/${copyId}/loans`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ borrowerName: borrower, dueAt: dueAt || undefined, note: note || undefined }) });
      if (!response.ok) throw new Error("request-failed");
      setBorrower(""); setDueAt(""); setNote(""); setMessage("借阅已记录");
      await client.invalidateQueries({ queryKey: ["loans", copyId] });
    } catch { setError("保存失败；当前副本可能已有未归还借阅。"); }
    finally { setBusy(false); }
  };

  const action = async (loanId: string, body: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/catalog/loans/${loanId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error("request-failed");
      await client.invalidateQueries({ queryKey: ["loans", copyId] });
      setMessage(body.action === "return" ? "已归还" : "期限已更新");
    } catch { setError("操作失败，请保留当前信息后重试。"); }
    finally { setBusy(false); }
  };

  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-brass" />借阅记录</CardTitle><CardDescription>借出状态独立记录，并保留每次借阅的历史。</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {message ? <p role="status" aria-live="polite" className="motion-feedback-in min-h-6 text-sm text-success">{message}</p> : null}
      {error ? <p role="alert" className="motion-feedback-in min-h-6 text-sm text-danger">{error}</p> : null}
      {active ? <div className="motion-crossfade min-h-32 rounded-lg border border-brass/30 bg-brass/10 p-4"><div className="flex flex-col gap-4"><div><p className="font-semibold">借给：{active.borrowerName}</p><p className="mt-1 text-sm text-ink/65">{active.dueAt ? `应还：${active.dueAt}` : "未设归还日期"}{active.overdue ? <strong className="ml-2 text-danger">已逾期</strong> : null}</p></div><div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"><Input type="text" value={renewalDueAt} onChange={(event) => setRenewalDueAt(event.target.value)} placeholder="新的归还日期 YYYY-MM-DD" aria-label="新的归还日期" /><Button variant="secondary" disabled={busy || !renewalDueAt} onClick={() => void action(active.id, { action: "renew", dueAt: renewalDueAt })}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}续借</Button><Button variant="brass" disabled={busy} onClick={() => void action(active.id, { action: "return" })}><Check className="h-4 w-4" />归还</Button></div></div></div> : <div className="motion-crossfade min-h-32 grid gap-3 sm:grid-cols-[1fr_180px_auto]"><Input value={borrower} onChange={(event) => setBorrower(event.target.value)} placeholder="借阅人" aria-label="借阅人" /><Input type="text" value={dueAt} onChange={(event) => setDueAt(event.target.value)} placeholder="应还日期 YYYY-MM-DD" aria-label="应还日期" /><Button variant="brass" className="min-w-28" disabled={busy || !borrower.trim()} onClick={() => void submit()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{busy ? "保存中…" : "记录借出"}</Button><Input className="sm:col-span-2" value={note} onChange={(event) => setNote(event.target.value)} placeholder="借阅备注（可选）" aria-label="借阅备注" /></div>}
      {query.data?.items.filter((loan) => loan.status === "returned").length ? <details><summary className="motion-disclosure-summary min-h-11 cursor-pointer py-3 text-sm font-semibold text-navy"><span className="inline-flex items-center gap-2"><ChevronDown className="motion-disclosure-icon h-4 w-4" aria-hidden="true" />查看归还历史（{query.data.items.filter((loan) => loan.status === "returned").length}）</span></summary><div className="motion-disclosure-content mt-2 space-y-2">{query.data.items.filter((loan) => loan.status === "returned").map((loan) => <p key={loan.id} className="border-b border-border py-2 text-sm text-ink/60">{loan.borrowerName} · 借出 {loan.lentAt.slice(0, 10)} · 归还 {loan.returnedAt?.slice(0, 10) ?? "—"}</p>)}</div></details> : null}
    </CardContent>
  </Card>;
}


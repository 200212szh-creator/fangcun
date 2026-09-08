"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquarePlus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Annotation } from "@/lib/types";

async function getAnnotations(copyId: string) {
  const response = await fetch(`/api/catalog/books/${copyId}/annotations`);
  if (!response.ok) throw new Error("request-failed");
  return response.json() as Promise<{ items: Annotation[] }>;
}

export function AnnotationPanel({ copyId }: { copyId: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["annotations", copyId], queryFn: () => getAnnotations(copyId) });
  const [pageLabel, setPageLabel] = useState("");
  const [body, setBody] = useState("");
  const [concepts, setConcepts] = useState("");
  const [conceptSearch, setConceptSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Annotation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    if (!body.trim() || busy) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/catalog/books/${copyId}/annotations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageLabel, body, concepts: concepts.split(/[,，、]/).map((value) => value.trim()).filter(Boolean) }) });
      if (!response.ok) throw new Error("request-failed");
      setBody(""); setPageLabel(""); setConcepts(""); setMessage("批注已保存");
      await client.invalidateQueries({ queryKey: ["annotations", copyId] });
    } catch { setError("批注保存失败，请保留内容后重试。"); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (busy || !window.confirm("删除这条批注？")) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/catalog/annotations/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("request-failed");
      setMessage("批注已删除");
      await client.invalidateQueries({ queryKey: ["annotations", copyId] });
    } catch { setError("删除失败，请稍后重试。"); }
    finally { setBusy(false); }
  };

  const search = async () => {
    const concept = conceptSearch.trim();
    if (!concept || searchBusy) return;
    setSearchBusy(true); setSearchResults(null); setError("");
    try {
      const response = await fetch(`/api/catalog/annotations?concept=${encodeURIComponent(concept)}`);
      if (!response.ok) throw new Error("request-failed");
      const result = await response.json() as { items: Annotation[] };
      setSearchResults(result.items);
    } catch { setError("概念检索失败，请稍后重试。"); }
    finally { setSearchBusy(false); }
  };

  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquarePlus className="h-5 w-5 text-brass" />批注与概念</CardTitle><CardDescription>按页码或章节记录原文思考；概念会自动合并同名项，可跨书检索。</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {message ? <p role="status" aria-live="polite" className="motion-feedback-in min-h-6 text-sm text-success">{message}</p> : null}
      {error ? <p role="alert" className="motion-feedback-in min-h-6 text-sm text-danger">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]"><Input value={pageLabel} onChange={(event) => setPageLabel(event.target.value)} placeholder="页码 / 章节" aria-label="页码或章节" /><Input value={concepts} onChange={(event) => setConcepts(event.target.value)} placeholder="概念，用逗号分隔" aria-label="概念" /></div>
      <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="写下这本书留下的批注…" aria-label="批注内容" />
      <Button variant="brass" className="min-w-24" disabled={busy || !body.trim()} onClick={() => void submit()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{busy ? "保存中…" : "保存批注"}</Button>
      {query.data?.items.length ? <div className="motion-crossfade space-y-3">{query.data.items.map((annotation) => <article key={annotation.id} className="rounded-lg border border-border p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.12em] text-brass">{annotation.pageLabel || "未标页码"}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{annotation.body}</p><div className="mt-3 flex flex-wrap gap-2">{annotation.concepts.map((concept) => <span key={concept.id} className="rounded-full bg-paper-muted px-2 py-1 text-xs text-ink/65">#{concept.name}</span>)}</div></div><Button variant="ghost" size="sm" disabled={busy} aria-label="删除批注" onClick={() => void remove(annotation.id)}><Trash2 className="h-4 w-4 text-danger" /></Button></div></article>)}</div> : <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-ink/50">还没有批注；填写上方内容即可保存第一条。</p>}
      <div className="border-t border-border pt-4"><p className="mb-2 text-sm font-semibold">跨书检索概念</p><div className="flex flex-col gap-2 sm:flex-row"><Input value={conceptSearch} onChange={(event) => setConceptSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} placeholder="例如：设计" aria-label="跨书检索概念" /><Button variant="secondary" className="min-w-20" disabled={searchBusy || !conceptSearch.trim()} onClick={() => void search()}>{searchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{searchBusy ? "检索中…" : "检索"}</Button></div>
        {searchResults ? <div className="motion-crossfade mt-4 space-y-3" aria-live="polite">{searchResults.length ? searchResults.map((annotation) => <article key={annotation.id} className="rounded-lg border border-border bg-paper-muted/35 p-4"><p className="text-xs font-semibold text-brass">{annotation.pageLabel || "未标页码"}</p><p className="mt-2 line-clamp-3 text-sm leading-6">{annotation.body}</p><Link href={`/books/${annotation.copyId}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-navy">打开原书</Link></article>) : <p className="rounded-lg border border-dashed border-border p-4 text-sm text-ink/55">没有找到包含“{conceptSearch.trim()}”的批注。</p>}</div> : null}
      </div>
    </CardContent>
  </Card>;
}


"use client";

import { useQueryClient } from "@tanstack/react-query";
import { FolderHeart, Heart, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { CoverArt } from "@/components/cover-art";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SearchResult } from "@/lib/types";

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("request-failed");
  return response.json() as Promise<T>;
}

async function saveJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error("request-failed");
}

function SearchContent() {
  const t = useTranslations();
  const params = useSearchParams();
  const initialQuery = params.get("q") ?? "";
  const queryClient = useQueryClient();
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState<"all" | "book" | "paper">("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = async (event?: React.FormEvent, nextType = type) => {
    event?.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) { setNotice("请输入至少 2 个字符再检索。"); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const currentRequest = ++requestId.current;
    setBusy(true); setShowLoading(false); setNotice(""); setDuration(null); setResults([]);
    const loadingTimer = window.setTimeout(() => setShowLoading(true), 300);
    const startedAt = performance.now();
    try {
      const data = await getJson<{ items: SearchResult[]; offline?: boolean }>(`/api/discovery/search?type=${nextType}&q=${encodeURIComponent(trimmed)}`, controller.signal);
      if (currentRequest !== requestId.current) return;
      setResults(data.items); setDuration(Math.round(performance.now() - startedAt)); setShowLoading(false);
      if (data.offline && !data.items.length) setNotice(t("search.offline"));
    } catch (cause) {
      if ((cause as Error).name === "AbortError") return;
      if (currentRequest === requestId.current) { setShowLoading(false); setNotice(t("search.offline")); }
    } finally { if (currentRequest === requestId.current) { window.clearTimeout(loadingTimer); setShowLoading(false); setBusy(false); } }
  };

  useEffect(() => { if (initialQuery) { setQuery(initialQuery); void runSearch(undefined, type); } // Query changes only when this deep link changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const saveBook = async (item: Extract<SearchResult, { kind: "book" }>) => {
    if (!item.edition) return;
    try { await saveJson("/api/catalog/wishlist", { edition: item.edition }); setSaved((value) => [...new Set([...value, item.id])]); setNotice(t("search.savedWishlist")); await queryClient.invalidateQueries({ queryKey: ["wishlist"] }); }
    catch { setNotice(t("common.failed")); }
  };

  const savePaper = async (item: Extract<SearchResult, { kind: "paper" }>) => {
    try { await saveJson("/api/catalog/research", { ...item, type: "paper", tags: [] }); setSaved((value) => [...new Set([...value, item.id])]); setNotice(t("search.savedPaper")); await queryClient.invalidateQueries({ queryKey: ["research"] }); }
    catch { setNotice(t("common.failed")); }
  };

  return <div>
    <div className="mb-7"><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-brass">DISCOVERY</p><h1 className="serif text-4xl font-semibold tracking-tight text-ink sm:text-5xl">{t("search.title")}</h1><p className="mt-3 max-w-2xl text-base leading-7 text-ink/65">{t("search.subtitle")}</p></div>
    <Card className="mb-7"><CardContent className="p-4 sm:p-6"><form onSubmit={(event) => void runSearch(event)} className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink/45" aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search.placeholder")} className="pl-9" aria-label={t("search.placeholder")} /></div><Button type="submit" variant="brass" disabled={busy}><Search className="h-4 w-4" aria-hidden="true" />{busy ? t("common.loading") : t("common.search")}</Button></form><div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="检索类型">{(["all", "book", "paper"] as const).map((value) => <Button key={value} type="button" role="tab" aria-selected={type === value} size="sm" variant={type === value ? "default" : "secondary"} onClick={() => { setType(value); if (query.trim()) void runSearch(undefined, value); }}>{value === "all" ? t("common.all") : value === "book" ? t("search.books") : t("search.papers")}</Button>)}</div></CardContent></Card>
    {notice ? <div className="motion-feedback-in mb-5 rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-ink" role="status" aria-live="polite">{notice}</div> : null}
    {showLoading ? <div className="motion-crossfade grid gap-4 lg:grid-cols-2" role="status" aria-label="正在检索"><div className="motion-skeleton h-48 rounded-xl border border-border" /><div className="motion-skeleton h-48 rounded-xl border border-border" /></div> : null}
    {!busy && results.length ? <div key={`${type}-${duration ?? "result"}`} className="motion-crossfade"><div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink/55"><span className="font-semibold text-ink">找到 {results.length} 条结果</span>{duration !== null ? <span>· 本次用时 {duration} ms</span> : null}<span>· 已按相关性筛选</span></div><div className="grid gap-4 lg:grid-cols-2">{results.map((item) => <Card key={`${item.kind}-${item.id}`} className="border-border"><CardContent className="flex gap-4 p-5">{item.kind === "book" ? <CoverArt title={item.title} variant={item.coverUrl} compact /> : <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-md bg-navy/10 text-navy"><FolderHeart className="h-6 w-6" aria-hidden="true" /></div>}<div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap gap-2"><Badge>{item.kind === "book" ? t("search.books") : t("search.papers")}</Badge><Badge>{item.source}</Badge></div><h2 className="serif text-xl font-semibold leading-tight">{item.title}</h2><p className="mt-1 text-sm text-ink/65">{item.authors.join(" · ") || "作者未记录"}</p>{item.kind === "book" ? <><p className="mt-2 text-xs text-ink/55">{item.publisher || "出版社未记录"} · {item.year || "年份未记录"}</p><Button className="mt-4 min-w-28" variant={saved.includes(item.id) ? "secondary" : "brass"} size="sm" onClick={() => void saveBook(item)} disabled={saved.includes(item.id) || !item.edition}><Heart className="h-4 w-4" aria-hidden="true" />{saved.includes(item.id) ? t("search.savedWishlist") : t("search.addWishlist")}</Button></> : <><p className="mt-3 line-clamp-3 text-sm leading-6 text-ink/65">{item.abstract || t("search.paperAbstract")}</p><Button className="mt-4 min-w-28" variant={saved.includes(item.id) ? "secondary" : "default"} size="sm" onClick={() => void savePaper(item)} disabled={saved.includes(item.id)}><FolderHeart className="h-4 w-4" aria-hidden="true" />{saved.includes(item.id) ? t("search.savedPaper") : t("search.savePaper")}</Button></>}</div></CardContent></Card>)}</div></div> : null}
    {!busy && query && !results.length && !notice ? <div className="rounded-xl border border-dashed border-border bg-surface/70 p-8 text-center"><Search className="mx-auto h-8 w-8 text-brass/70" aria-hidden="true" /><p className="mt-3 font-semibold">{t("search.noResults")}</p></div> : null}
    {!busy && !query ? <div className="rounded-xl border border-dashed border-border bg-surface/70 p-8 text-center"><Search className="mx-auto h-8 w-8 text-brass/70" aria-hidden="true" /><p className="mt-3 serif text-2xl text-ink">{t("search.searchHint")}</p></div> : null}
  </div>;
}

export function SearchPage() { return <AppShell><SearchContent /></AppShell>; }






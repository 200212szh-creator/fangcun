"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, LibraryBig, Loader2, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { CoverArt } from "@/components/cover-art";
import { IsbnScanner } from "@/components/isbn-scanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { bookInputSchema } from "@/lib/validations";
import { makeShelfCoordinate } from "@/lib/shelf-coordinate";
import type { BookCandidate, BookEdition, Category, ReadingStatus, ShelfLocation } from "@/lib/types";

type ManualValues = {
  title: string; authors: string; publisher?: string; publicationYear?: number | ""; publicationDate?: string; isbn13?: string; isbn10?: string; language?: string; format?: string; pages?: number | ""; originalTitle?: string; seriesName?: string; editionStatement?: string; editionNumber?: number | ""; printRun?: number | ""; editionNotes?: string; originalPublisher?: string; description?: string; location?: string; shelfLocationId?: string; shelfSlot?: string; shelfCoordinate?: string; categoryId?: string; readingStatus: ReadingStatus; notes?: string; acquiredAt?: string; acquisitionMethod?: "purchase" | "gift" | "inherited" | "other"; acquisitionSource?: string; acquisitionPlace?: string; priceCents?: number | ""; currency?: string; condition?: string; inscription?: string; receiptNote?: string;
};

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("request-failed");
  return response.json() as Promise<T>;
}

async function sendJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error("request-failed");
  return response.json() as Promise<T>;
}

function Notice({ children, tone = "success" }: { children: React.ReactNode; tone?: "success" | "danger" }) {
  return <div role={tone === "danger" ? "alert" : "status"} className={`motion-feedback-in rounded-lg border px-4 py-3 text-sm leading-6 ${tone === "danger" ? "border-danger/20 bg-danger/10 text-danger" : "border-success/20 bg-success/10 text-success"}`}>{children}</div>;
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return <label className={`block ${className ?? ""}`}><span className="mb-2 block text-sm font-semibold">{label}{required ? <span className="ml-1 text-danger">*</span> : null}</span>{children}</label>;
}

function EditionDetails({ edition }: { edition: BookEdition }) {
  const meta = [edition.publisher, edition.publicationYear, edition.format, edition.isbn13].filter(Boolean).join(" · ");
  return <p className="mt-2 text-sm leading-6 text-ink/60">{meta || "—"}</p>;
}

function AddBookContent() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("title");
  const [title, setTitle] = useState("");
  const [isbn, setIsbn] = useState("");
  const [candidates, setCandidates] = useState<BookCandidate[]>([]);
  const [queryStatus, setQueryStatus] = useState<"idle" | "loading" | "ready" | "empty" | "unavailable">("idle");
  const [showSearchLoading, setShowSearchLoading] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [lookupNonce, setLookupNonce] = useState(0);
  const [editions, setEditions] = useState<BookEdition[]>([]);
  const [selectedEdition, setSelectedEdition] = useState<BookEdition | null>(null);
  const [shelfLocationId, setShelfLocationId] = useState("");
  const [shelfSlot, setShelfSlot] = useState("");
  const [loadingCandidateId, setLoadingCandidateId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const editionRef = useRef<HTMLDivElement>(null);
  const categoriesQuery = useQuery({ queryKey: ["metadata"], queryFn: () => getJson<{ categories: Category[]; shelves: ShelfLocation[] }>("/api/catalog/metadata") });
  const form = useForm<ManualValues>({ resolver: zodResolver(bookInputSchema) as never, defaultValues: { readingStatus: "unread", language: "zh", currency: "CNY" } });
  const manualShelfId = form.watch("shelfLocationId");
  const manualShelfSlot = form.watch("shelfSlot");
  const changeTab = (value: string) => { setTab(value); setNotice(""); setError(""); };
  const runTitleLookup = () => { if (title.trim().length >= 2) setLookupNonce((value) => value + 1); };
  useEffect(() => {
    const shelf = (categoriesQuery.data?.shelves ?? []).find((item) => item.id === manualShelfId);
    form.setValue("shelfCoordinate", makeShelfCoordinate(shelf, manualShelfSlot), { shouldDirty: true });
  }, [categoriesQuery.data?.shelves, form, manualShelfId, manualShelfSlot]);

  useEffect(() => {
    const query = title.trim();
    if (tab !== "title" || query.length < 2) { setCandidates([]); setSelectedCandidateId(null); setQueryStatus("idle"); setShowSearchLoading(false); return; }
    const controller = new AbortController();
    let active = true;
    setQueryStatus("loading");
    setError("");
    const loadingTimer = window.setTimeout(() => setShowSearchLoading(true), 300);
    const timer = window.setTimeout(async () => {
      try {
        const data = await getJson<{ items: BookCandidate[]; offline?: boolean }>(`/api/discovery/books?q=${encodeURIComponent(query)}`, controller.signal);
        if (!active) return;
        setCandidates(data.items); setShowSearchLoading(false);
        setQueryStatus(data.items.length ? "ready" : data.offline ? "unavailable" : "empty");
      } catch (cause) {
        if ((cause as Error).name === "AbortError" || !active) return;
        setCandidates([]); setShowSearchLoading(false); setQueryStatus("unavailable");
      }
    }, 350);
    return () => { active = false; window.clearTimeout(timer); window.clearTimeout(loadingTimer); controller.abort(); };
  }, [lookupNonce, tab, title]);

  const chooseCandidate = async (candidate: BookCandidate) => {
    setLoadingCandidateId(candidate.id); setSelectedCandidateId(candidate.id); setBusy(true); setError(""); setNotice(""); setEditions([]); setSelectedEdition(null);
    try {
      const data = await getJson<{ items: BookEdition[] }>(`/api/discovery/books/${encodeURIComponent(candidate.id)}/editions?title=${encodeURIComponent(candidate.title)}`);
      setEditions(data.items);
      if (!data.items.length) setError(`${candidate.title} 暂时没有可选版本，请稍后重试或使用手动录入。`);
      else { setNotice(`${candidate.title} 的版本已加载，请选择出版社、年份和装帧。`); window.requestAnimationFrame(() => { const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; editionRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }); }); }
    } catch { setError(t("add.unavailable")); }
    finally { setLoadingCandidateId(null); setBusy(false); }
  };

  const confirmEdition = async (edition: BookEdition) => {
    setBusy(true); setError("");
    try {
      const shelf = (categoriesQuery.data?.shelves ?? []).find((item) => item.id === shelfLocationId);
      const result = await sendJson<{ duplicateId?: string | null }>("/api/catalog/books/from-edition", { edition, shelfLocationId: shelfLocationId || undefined, shelfSlot: shelfSlot || undefined, shelfCoordinate: makeShelfCoordinate(shelf, shelfSlot) || undefined });
      setNotice(result.duplicateId ? `${t("add.duplicate")} · ${t("add.addAnother")}` : t("add.created"));
      await queryClient.invalidateQueries({ queryKey: ["books"] });
    } catch { setError(t("common.failed")); }
    finally { setBusy(false); }
  };

  const lookupIsbn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isbn.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try { const data = await getJson<{ items: BookEdition[] }>(`/api/discovery/isbn/${encodeURIComponent(isbn.trim())}`); setEditions(data.items); setSelectedEdition(null); if (!data.items.length) setError(t("add.noMatch")); }
    catch { setError(t("add.unavailable")); }
    finally { setBusy(false); }
  };

  const submitManual = async (values: ManualValues) => {
    setBusy(true); setError(""); setNotice("");
    try { await sendJson("/api/catalog/books", { ...values, priceCents: values.priceCents === "" || values.priceCents === undefined ? undefined : Math.round(Number(values.priceCents) * 100) }); setNotice(t("add.created")); form.reset({ readingStatus: "unread", language: "zh", currency: "CNY" }); await queryClient.invalidateQueries({ queryKey: ["books"] }); }
    catch { setError(t("common.failed")); }
    finally { setBusy(false); }
  };

  const fillManual = (edition: BookEdition) => { form.reset({ title: edition.title, authors: edition.authors.join(", "), publisher: edition.publisher ?? "", publicationYear: edition.publicationYear ?? "", publicationDate: edition.publicationDate ?? "", isbn13: edition.isbn13 ?? "", language: edition.language ?? "", format: edition.format ?? "", pages: edition.pages ?? "", originalTitle: edition.originalTitle ?? "", seriesName: edition.seriesName ?? "", editionStatement: edition.editionStatement ?? "", editionNumber: edition.editionNumber ?? "", printRun: edition.printRun ?? "", editionNotes: edition.editionNotes ?? "", originalPublisher: edition.originalPublisher ?? "", description: edition.description ?? "", shelfCoordinate: "", readingStatus: "unread" }); changeTab("manual"); };

  const activeShelf = (categoriesQuery.data?.shelves ?? []).find((shelf) => shelf.id === shelfLocationId);
  return <div>
    <div className="mb-7"><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-brass">CATALOG</p><h1 className="serif text-4xl font-semibold tracking-tight text-ink sm:text-5xl">{t("add.title")}</h1><p className="mt-3 max-w-2xl text-base leading-7 text-ink/65">{t("add.subtitle")}</p></div>
    {notice ? <div className="mb-5"><Notice>{notice}</Notice></div> : null}
    {error ? <div className="mb-5"><Notice tone="danger">{error}</Notice></div> : null}
    <Card><CardContent className="p-4 sm:p-6"><Tabs value={tab}>
      <TabsList className="w-full justify-start overflow-x-auto"><TabsTrigger value="title" activeValue={tab} onValueChange={changeTab}>{t("add.byTitle")}</TabsTrigger><TabsTrigger value="isbn" activeValue={tab} onValueChange={changeTab}>{t("add.byIsbn")}</TabsTrigger><TabsTrigger value="manual" activeValue={tab} onValueChange={changeTab}>{t("add.manual")}</TabsTrigger></TabsList>
      <TabsContent value="title" activeValue={tab}>
        <div className="max-w-2xl"><form onSubmit={(event) => { event.preventDefault(); runTitleLookup(); }} className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="relative flex-1"><label htmlFor="book-title" className="mb-2 block text-sm font-semibold">{t("add.titlePlaceholder")}</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink/45" aria-hidden="true" /><Input id="book-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("add.titlePlaceholder")} className="pl-9 pr-28" autoComplete="off" />{queryStatus === "loading" ? <span className="absolute right-3 top-3 text-xs text-ink/55">{t("add.searching")}</span> : null}</div></div><Button type="submit" variant="brass" disabled={title.trim().length < 2 || queryStatus === "loading"}><Search className="h-4 w-4" aria-hidden="true" />{t("add.find")}</Button></form><p className="mt-3 text-sm leading-6 text-ink/55">{t("add.titleHint")}</p></div>
        {showSearchLoading && queryStatus === "loading" ? <div className="motion-crossfade mt-7 grid gap-3" role="status" aria-label="正在检索"><div className="motion-skeleton h-24 rounded-xl border border-border" /><div className="motion-skeleton h-24 rounded-xl border border-border" /></div> : null}
        {queryStatus === "unavailable" ? <div role="alert" className="mt-7 rounded-xl border border-warning/25 bg-warning/10 p-5"><p className="font-semibold text-ink">{t("add.unavailable")}</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={runTitleLookup}>{t("common.retry")}</Button><Button variant="ghost" size="sm" onClick={() => changeTab("manual")}>{t("add.useManual")}</Button></div></div> : null}
        {queryStatus === "empty" ? <div className="mt-7 rounded-xl border border-dashed border-border bg-paper-muted/50 p-6 text-center"><LibraryBig className="mx-auto h-8 w-8 text-brass/70" aria-hidden="true" /><p className="mt-3 font-semibold text-ink">{t("add.noMatch")}</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink/60">{t("add.noMatchHint")}</p><Button className="mt-5" variant="secondary" onClick={() => changeTab("manual")}>{t("add.useManual")}</Button></div> : null}
        {candidates.length ? <div className="motion-crossfade mt-7 space-y-3"><p className="text-sm font-semibold text-ink">{t("search.books")} · {candidates.length}<span className="ml-2 font-normal text-ink/50">点击一项查看可用版本</span></p>{candidates.map((candidate, index) => { const loading = loadingCandidateId === candidate.id; return <button type="button" key={candidate.id} onClick={() => void chooseCandidate(candidate)} disabled={busy} aria-busy={loading} aria-pressed={selectedCandidateId === candidate.id} className={`motion-list-in motion-press flex min-h-24 w-full cursor-pointer items-center gap-4 rounded-xl border border-border bg-surface p-4 text-left hover:border-navy disabled:cursor-wait disabled:opacity-70`} style={{ "--motion-delay": `${Math.min(index, 3) * 25}ms` } as React.CSSProperties}><CoverArt title={candidate.title} variant={candidate.coverUrl} compact /><span className="min-w-0 flex-1"><strong className="serif block text-xl font-semibold">{candidate.title}</strong><span className="mt-1 block truncate text-sm text-ink/60">{candidate.authors.join(" · ") || "作者未记录"}</span><span className="mt-2 flex flex-wrap gap-2"><Badge>{candidate.source}</Badge><Badge>{t("add.confidence")} {Math.round(candidate.score * 100)}%</Badge>{candidate.editionCount > 1 ? <Badge className="border border-border bg-surface">{candidate.editionCount} 个版本</Badge> : null}</span></span>{loading ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brass" aria-hidden="true" /> : selectedCandidateId === candidate.id ? <Check className="h-5 w-5 shrink-0 text-brass" aria-hidden="true" /> : <ChevronRight className="h-5 w-5 shrink-0 text-ink/30" aria-hidden="true" />}</button>; })}</div> : null}
      </TabsContent>
      <TabsContent value="isbn" activeValue={tab}><form onSubmit={lookupIsbn} className="max-w-2xl"><label htmlFor="isbn" className="mb-2 block text-sm font-semibold">{t("add.isbnPlaceholder")}</label><div className="flex flex-col gap-3 sm:flex-row"><Input id="isbn" value={isbn} onChange={(event) => setIsbn(event.target.value)} placeholder={t("add.isbnPlaceholder")} inputMode="numeric" autoComplete="isbn" /><Button type="submit" className="min-w-24" disabled={busy}><Search className="h-4 w-4" aria-hidden="true" />{busy ? t("common.loading") : t("add.find")}</Button></div><p className="mt-4 text-sm leading-6 text-ink/60">{t("add.scanHint")}</p><IsbnScanner onDetected={(value) => { setIsbn(value); void getJson<{ items: BookEdition[] }>(`/api/discovery/isbn/${encodeURIComponent(value)}`).then((data) => { setEditions(data.items); setSelectedEdition(null); }).catch(() => setError(t("add.unavailable"))); }} /></form></TabsContent>
      <TabsContent value="manual" activeValue={tab}>
        <form onSubmit={form.handleSubmit(submitManual, () => { setNotice(""); setError("请检查书名、作者、日期和数字格式。"); })} className="grid gap-4 sm:grid-cols-2">
          <Field label={t("add.manualTitle")} required className="sm:col-span-2"><Input {...form.register("title")} /></Field><Field label={t("add.manualAuthors")} required><Input {...form.register("authors")} /></Field><Field label="书架位置"><select {...form.register("shelfLocationId")} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option value="">未指定</option>{(categoriesQuery.data?.shelves ?? []).filter((shelf) => shelf.active).map((shelf) => <option key={shelf.id} value={shelf.id}>{shelf.name}</option>)}</select></Field><Field label="层 / 格"><Input {...form.register("shelfSlot")} placeholder="例如：2" /></Field><Field label={t("add.manualStatus")}><select {...form.register("readingStatus")} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm">{(["unread", "reading", "read", "paused", "dropped"] as const).map((value) => <option key={value} value={value}>{t(`status.${value}`)}</option>)}</select></Field>
          <Field label="位置编码" className="sm:col-span-2"><Input {...form.register("shelfCoordinate")} readOnly placeholder="选择书架和层 / 格后自动生成" className="bg-paper-muted/45" /><span className="mt-2 block text-xs leading-5 text-ink/50">按书架名称与层 / 格自动生成；需要更细的编号时可以在详情页修改。</span></Field>
          <details className="sm:col-span-2 rounded-xl border border-border bg-paper-muted/35 p-4"><summary className="motion-disclosure-summary min-h-11 cursor-pointer py-2 text-sm font-semibold text-navy"><span className="inline-flex items-center gap-2"><ChevronDown className="motion-disclosure-icon h-4 w-4" aria-hidden="true" />完善版本与购藏档案（可选）</span></summary><div className="motion-disclosure-content mt-4 grid gap-4 sm:grid-cols-2"><Field label={t("add.manualPublisher")}><Input {...form.register("publisher")} /></Field><Field label={t("add.manualYear")}><Input type="number" inputMode="numeric" {...form.register("publicationYear")} /></Field><Field label="出版日期"><Input placeholder="YYYY-MM-DD" {...form.register("publicationDate")} /></Field><Field label={t("add.manualIsbn")}><Input inputMode="numeric" {...form.register("isbn13")} /></Field><Field label="ISBN-10"><Input inputMode="numeric" {...form.register("isbn10")} /></Field><Field label={t("add.manualLanguage")}><Input {...form.register("language")} /></Field><Field label={t("add.manualFormat")}><Input {...form.register("format")} /></Field><Field label={t("add.manualPages")}><Input type="number" inputMode="numeric" {...form.register("pages")} /></Field><Field label="原书名"><Input {...form.register("originalTitle")} /></Field><Field label="丛书"><Input {...form.register("seriesName")} /></Field><Field label="版次 / 印次"><Input {...form.register("editionStatement")} /></Field><Field label="版本编号"><Input type="number" {...form.register("editionNumber")} /></Field><Field label="印数"><Input type="number" {...form.register("printRun")} /></Field><Field label="原出版社"><Input {...form.register("originalPublisher")} /></Field><Field label={t("add.manualCategory")}><select {...form.register("categoryId")} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option value="">{t("common.optional")}</option>{(categoriesQuery.data?.categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field><Field label={t("add.manualLocation")}><Input {...form.register("location")} placeholder="补充位置说明" /></Field><Field label="购藏方式"><select {...form.register("acquisitionMethod")} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option value="">未记录</option><option value="purchase">购买</option><option value="gift">获赠</option><option value="inherited">继承</option><option value="other">其他</option></select></Field><Field label="价格（元）"><Input type="number" min="0" step="0.01" {...form.register("priceCents")} /></Field><Field label="币种"><Input maxLength={3} {...form.register("currency")} /></Field><Field label="来源 / 赠予人"><Input {...form.register("acquisitionSource")} /></Field><Field label="购藏地点"><Input {...form.register("acquisitionPlace")} /></Field><Field label="购藏日期"><Input placeholder="YYYY-MM-DD" {...form.register("acquiredAt")} /></Field><Field label="品相"><Input {...form.register("condition")} /></Field><Field label="题记 / 签名 / 藏印" className="sm:col-span-2"><Textarea {...form.register("inscription")} /></Field><Field label="票据备注" className="sm:col-span-2"><Textarea {...form.register("receiptNote")} /></Field><Field label="版本备注" className="sm:col-span-2"><Textarea {...form.register("editionNotes")} /></Field><Field label={t("add.manualDescription")} className="sm:col-span-2"><Textarea {...form.register("description")} /></Field><Field label="我的备注" className="sm:col-span-2"><Textarea {...form.register("notes")} /></Field></div></details><div className="sm:col-span-2"><Button type="submit" variant="brass" className="min-w-28" disabled={busy}><Plus className="h-4 w-4" aria-hidden="true" />{busy ? "保存中…" : t("common.save")}</Button></div>
        </form>
      </TabsContent>
    </Tabs></CardContent></Card>
    {loadingCandidateId ? <div className="mt-5 flex items-center gap-2 rounded-lg border border-brass/20 bg-brass/10 px-4 py-3 text-sm text-ink" role="status"><Loader2 className="h-4 w-4 animate-spin text-brass" aria-hidden="true" />正在读取可用版本，请稍候…</div> : null}
    <div ref={editionRef}>{editions.length ? <Card className="motion-crossfade mt-6"><CardHeader><CardTitle>{t("add.versions")}</CardTitle><CardDescription>{t("add.versionsHint")}</CardDescription></CardHeader><CardContent className="space-y-3">{editions.map((edition, index) => <button type="button" key={edition.id} onClick={() => setSelectedEdition(edition)} className={`motion-list-in motion-press w-full cursor-pointer rounded-lg border p-4 text-left ${selectedEdition?.id === edition.id ? "border-brass bg-brass/10" : "border-border hover:border-navy"}`} style={{ "--motion-delay": `${Math.min(index, 3) * 25}ms` } as React.CSSProperties}><p className="serif text-lg font-semibold">{edition.title}</p><p className="mt-1 text-sm text-ink/60">{edition.authors.join(" · ")}</p><EditionDetails edition={edition} /></button>)}{selectedEdition ? <div className="border-t border-border pt-4"><div className="mb-4 grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-sm font-semibold">书架位置</span><select value={shelfLocationId} onChange={(event) => setShelfLocationId(event.target.value)} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"><option value="">未指定</option>{(categoriesQuery.data?.shelves ?? []).filter((shelf) => shelf.active).map((shelf) => <option key={shelf.id} value={shelf.id}>{shelf.name}</option>)}</select></label><label className="block"><span className="mb-2 block text-sm font-semibold">层 / 格</span><Input value={shelfSlot} onChange={(event) => setShelfSlot(event.target.value)} placeholder="例如：第 2 层" /></label><label className="block sm:col-span-2"><span className="mb-2 block text-sm font-semibold">位置编码</span><Input value={makeShelfCoordinate(activeShelf, shelfSlot)} readOnly placeholder="选择书架和层 / 格后自动生成" className="bg-paper-muted/45" /></label></div><div className="flex flex-col gap-2 sm:flex-row"><Button variant="brass" className="min-w-32" onClick={() => void confirmEdition(selectedEdition)} disabled={busy}><Check className="h-4 w-4" aria-hidden="true" />{busy ? "保存中…" : t("add.confirmVersion")}</Button><Button variant="secondary" onClick={() => fillManual(selectedEdition)}>{t("add.useManual")}</Button></div></div> : null}</CardContent></Card> : null}</div>
  </div>;
}

export function AddBookPage() { return <AppShell><AddBookContent /></AppShell>; }








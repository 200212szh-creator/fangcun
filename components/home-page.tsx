"use client";

import Link from "next/link";
import { ArrowRight, BookMarked, Bookmark, FolderHeart, LibraryBig, MapPin, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { BookCard } from "@/components/book-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { OwnedCopy, ResearchWork, ShelfLocation } from "@/lib/types";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("request-failed");
  return response.json() as Promise<T>;
}

function Stat({ label, value, detail, icon: Icon }: { label: string; value: number; detail: string; icon: React.ElementType }) {
  return (
    <Card className="border-transparent bg-surface/90">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-ink/50">{label}</p>
          <Icon className="h-4 w-4 shrink-0 text-brass" aria-hidden="true" />
        </div>
        <p className="serif text-4xl font-semibold tabular-nums text-ink">{value}</p>
        <p className="mt-1 text-xs text-ink/50">{detail}</p>
      </CardContent>
    </Card>
  );
}

function getShelfLabel(shelf: ShelfLocation, byId: Map<string, ShelfLocation>) {
  const names: string[] = [];
  const seen = new Set<string>();
  let current: ShelfLocation | undefined = shelf;
  while (current && !seen.has(current.id)) {
    names.unshift(current.name);
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  if (shelf.room && !names.includes(shelf.room)) names.unshift(shelf.room);
  return names.join(" / ");
}

function shelfContainsBook(book: OwnedCopy, shelf: ShelfLocation, label: string) {
  if (book.shelfLocationId === shelf.id) return true;
  if (!book.location) return false;
  const location = book.location.trim();
  const parts = location.split("/").map((part) => part.trim()).filter(Boolean);
  return location === label || parts.includes(shelf.name) || location.includes(shelf.name);
}

function HomeContent() {
  const t = useTranslations();
  const booksQuery = useQuery({ queryKey: ["books"], queryFn: () => getJson<{ items: OwnedCopy[] }>("/api/catalog/books") });
  const metadataQuery = useQuery({ queryKey: ["metadata"], queryFn: () => getJson<{ shelves: ShelfLocation[] }>("/api/catalog/metadata") });
  const researchQuery = useQuery({ queryKey: ["research"], queryFn: () => getJson<{ works: ResearchWork[] }>("/api/catalog/research") });
  const books = booksQuery.data?.items ?? [];
  const shelves = (metadataQuery.data?.shelves ?? []).filter((shelf) => shelf.active);
  const byId = new Map(shelves.map((shelf) => [shelf.id, shelf]));
  const shelfRows = shelves.map((shelf) => {
    const label = getShelfLabel(shelf, byId);
    return { shelf, label, count: books.filter((book) => shelfContainsBook(book, shelf, label)).length };
  });

  return (
    <div className="space-y-9">
      <section className="relative overflow-hidden rounded-2xl border border-navy/20 bg-navy text-white shadow-lifted">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_10%,rgba(215,162,58,.26),transparent_35%),linear-gradient(120deg,rgba(10,25,42,.08),rgba(10,25,42,.62))]" aria-hidden="true" />
        <div className="relative p-6 sm:p-10 lg:p-12">
          <div className="max-w-3xl">
            <p className="mb-4 text-xs font-bold uppercase tracking-[.22em] text-brass">{t("home.eyebrow")}</p>
            <h1 className="serif max-w-2xl text-4xl font-semibold leading-[1.03] tracking-tight sm:text-6xl">{t("home.title")}</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/75">{t("home.subtitle")}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/add"><Button className="min-h-12" size="lg" variant="brass"><Plus className="h-4 w-4" aria-hidden="true" />{t("home.addBook")}</Button></Link>
              <Link href="/search"><Button className="min-h-12 border-white/30 bg-white/10 text-white hover:bg-white/15 hover:text-white" size="lg" variant="secondary"><Search className="h-4 w-4" aria-hidden="true" />{t("home.searchLibrary")}</Button></Link>
            </div>
          </div>
        </div>
      </section>

      <section aria-label={t("home.statsLabel")} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("home.statsBooks")} value={books.length} detail={t("home.statsDetail")} icon={LibraryBig} />
        <Stat label={t("home.statsReading")} value={books.filter((book) => book.readingStatus === "reading").length} detail={t("status.reading")} icon={BookMarked} />
        <Stat label={t("home.statsUnread")} value={books.filter((book) => book.readingStatus === "unread").length} detail={t("status.unread")} icon={Bookmark} />
        <Stat label={t("home.statsPapers")} value={researchQuery.data?.works.length ?? 0} detail={t("nav.research")} icon={FolderHeart} />
      </section>

      <div className="grid gap-9 xl:grid-cols-[1.35fr_.65fr]">
        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="serif text-2xl font-semibold text-ink">{t("home.recent")}</h2>
            <Link className="flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-semibold text-navy motion-press hover:bg-paper-muted" href="/library">{t("common.viewAll")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          </div>
          {booksQuery.isLoading ? <div className="grid gap-4 sm:grid-cols-2"><div className="h-60 motion-skeleton rounded-xl border border-border bg-surface/70" /><div className="h-60 motion-skeleton rounded-xl border border-border bg-surface/70" /></div> : books.length ? <div className="grid gap-4 sm:grid-cols-2">{books.slice(0, 4).map((book) => <BookCard key={book.id} book={book} />)}</div> : <Card className="border-dashed bg-surface/65"><CardContent className="flex min-h-56 flex-col items-center justify-center p-6 text-center"><LibraryBig className="mb-3 h-8 w-8 text-brass/70" aria-hidden="true" /><p className="font-semibold text-ink">{t("home.emptyRecent")}</p><p className="mt-2 max-w-sm text-sm leading-6 text-ink/55">{t("home.emptyRecentHint")}</p><Link className="mt-5" href="/add"><Button variant="brass"><Plus className="h-4 w-4" aria-hidden="true" />{t("home.addBook")}</Button></Link></CardContent></Card>}
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between gap-4"><h2 className="serif text-2xl font-semibold text-ink">{t("home.shelves")}</h2><Link className="flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-semibold text-navy motion-press hover:bg-paper-muted" href="/manage">{t("common.manage")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div>
          {metadataQuery.isLoading ? <div className="h-56 motion-skeleton rounded-xl border border-border bg-surface/70" /> : shelfRows.length ? <Card><CardContent className="space-y-1 p-4">{shelfRows.map(({ shelf, label, count }) => <Link className="flex min-h-14 items-center gap-3 rounded-lg px-2 motion-press hover:bg-paper-muted" href={`/library?location=${encodeURIComponent(shelf.name)}`} key={shelf.id}><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-paper-muted text-navy"><MapPin className="h-4 w-4" aria-hidden="true" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{label}</p><p className="text-xs text-ink/55">{count} {t("home.shelfBooks")}</p></div><ArrowRight className="h-4 w-4 shrink-0 text-ink/30" aria-hidden="true" /></Link>)}</CardContent></Card> : <Card className="border-dashed bg-surface/65"><CardContent className="flex min-h-56 flex-col items-center justify-center p-6 text-center"><MapPin className="mb-3 h-8 w-8 text-brass/70" aria-hidden="true" /><p className="font-semibold text-ink">{t("home.noShelves")}</p><p className="mt-2 max-w-sm text-sm leading-6 text-ink/55">{t("home.noShelvesHint")}</p><Link className="mt-5" href="/manage?focus=shelf"><Button variant="secondary"><Plus className="h-4 w-4" aria-hidden="true" />{t("home.createShelf")}</Button></Link></CardContent></Card>}
        </section>
      </div>
    </div>
  );
}

export function HomePage() {
  return <AppShell><HomeContent /></AppShell>;
}


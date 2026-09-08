"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BookMarked, Bookmark, FolderHeart, LibraryBig, MapPin, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { CoverArt } from "@/components/cover-art";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { OwnedCopy, ResearchWork, ShelfLocation } from "@/lib/types";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("request-failed");
  return response.json() as Promise<T>;
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

function StatLine({ label, value, detail, icon: Icon }: { label: string; value: number; detail: string; icon: React.ElementType }) {
  return <div className="atelier-stat-line">
    <Icon className="h-4 w-4 text-brass" aria-hidden="true" />
    <span className="atelier-stat-value">{value}</span>
    <span className="atelier-stat-label">{label}</span>
    <span className="atelier-stat-detail">{detail}</span>
  </div>;
}

function HomeContent() {
  const t = useTranslations();
  const booksQuery = useQuery({ queryKey: ["books"], queryFn: () => getJson<{ items: OwnedCopy[] }>("/api/catalog/books"), staleTime: 30_000 });
  const metadataQuery = useQuery({ queryKey: ["metadata"], queryFn: () => getJson<{ shelves: ShelfLocation[] }>("/api/catalog/metadata"), staleTime: 60_000 });
  const researchQuery = useQuery({ queryKey: ["research"], queryFn: () => getJson<{ works: ResearchWork[] }>("/api/catalog/research"), staleTime: 30_000 });
  const books = [...(booksQuery.data?.items ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const shelves = (metadataQuery.data?.shelves ?? []).filter((shelf) => shelf.active);
  const byId = new Map(shelves.map((shelf) => [shelf.id, shelf]));
  const shelfRows = shelves.map((shelf) => {
    const label = getShelfLabel(shelf, byId);
    return { shelf, label, count: books.filter((book) => shelfContainsBook(book, shelf, label)).length };
  });
  const featured = books[0];

  return <div className="atelier-home">
    <section className="atelier-home-masthead" aria-labelledby="home-title">
      <div className="atelier-home-intro">
        <p className="atelier-kicker">{t("home.eyebrow")}</p>
        <h1 id="home-title" className="atelier-display atelier-home-title">{t("home.title")}</h1>
        <p className="atelier-home-subtitle">{t("home.subtitle")}</p>
        <div className="atelier-home-actions">
          <Link href="/add"><Button variant="brass" size="lg"><Plus className="h-4 w-4" aria-hidden="true" />{t("home.addBook")}</Button></Link>
          <Link href="/search"><Button variant="secondary" size="lg"><Search className="h-4 w-4" aria-hidden="true" />{t("home.searchLibrary")}</Button></Link>
        </div>
        <div className="atelier-rule mt-8" />
        <p className="atelier-note mt-4">LOCAL FIRST · {t("home.statusLine")}</p>
      </div>

      <figure className="atelier-home-image">
        <Image src="/editorial-atelier/hero-shelf.png" alt="温暖纸张与木质书架上的藏书" fill priority sizes="(max-width: 900px) 100vw, 48vw" />
        <figcaption>{t("welcome.visualNote")}</figcaption>
      </figure>

      <aside className="atelier-record-panel" aria-label="BOOK RECORD">
        <p className="atelier-kicker">BOOK RECORD</p>
        {featured ? <Link href={"/books/" + featured.id} className="atelier-record-link motion-press">
          <p className="atelier-record-index">01 / {t("home.recent")}</p>
          <h2 className="atelier-record-title">{featured.edition.title}</h2>
          <p className="atelier-record-author">{featured.edition.authors.join(" · ") || "—"}</p>
          <div className="atelier-record-lines">
            <span>{featured.edition.publicationYear || "—"}</span>
            <span>{featured.location || t("library.location")}</span>
            <span>{featured.edition.isbn13 || featured.edition.format || "—"}</span>
          </div>
          <span className="atelier-record-cta">{t("common.viewAll")} <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></span>
        </Link> : <div className="atelier-record-empty"><LibraryBig className="h-6 w-6 text-brass" aria-hidden="true" /><p>{t("home.emptyRecent")}</p><span>{t("home.emptyRecentHint")}</span></div>}
      </aside>
    </section>

    <section className="atelier-stats" aria-label={t("home.statsLabel")}>
      <StatLine label={t("home.statsBooks")} value={books.length} detail={t("home.statsDetail")} icon={LibraryBig} />
      <StatLine label={t("home.statsReading")} value={books.filter((book) => book.readingStatus === "reading").length} detail={t("status.reading")} icon={BookMarked} />
      <StatLine label={t("home.statsUnread")} value={books.filter((book) => book.readingStatus === "unread").length} detail={t("status.unread")} icon={Bookmark} />
      <StatLine label={t("home.statsPapers")} value={researchQuery.data?.works.length ?? 0} detail={t("nav.research")} icon={FolderHeart} />
    </section>

    <section className="atelier-home-lower">
      <div className="atelier-section-block">
        <div className="atelier-section-heading">
          <div><p className="atelier-kicker">COLLECTION</p><h2 className="atelier-section-title">{t("home.recent")}</h2></div>
          <Link className="atelier-text-link" href="/library">{t("common.viewAll")} <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
        {booksQuery.isLoading ? <div className="atelier-loading-row motion-skeleton" /> : books.length ? <div className="atelier-recent-list">
          {books.slice(0, 4).map((book, index) => <Link href={"/books/" + book.id} className="atelier-recent-item motion-book" key={book.id} style={{ "--motion-delay": index * 25 + "ms" } as React.CSSProperties}>
            <CoverArt title={book.edition.title} variant={book.edition.coverUrl} compact />
            <span className="atelier-recent-copy"><span className="atelier-recent-title">{book.edition.title}</span><span className="atelier-recent-author">{book.edition.authors.join(" · ") || "—"}</span></span>
            <span className="atelier-recent-location">{book.location || "—"}</span>
            <ArrowUpRight className="h-4 w-4 text-ink/35" aria-hidden="true" />
          </Link>)}
        </div> : <Card className="atelier-empty-surface"><LibraryBig className="h-6 w-6 text-brass" aria-hidden="true" /><p>{t("home.emptyRecent")}</p><span>{t("home.emptyRecentHint")}</span></Card>}
      </div>

      <div className="atelier-section-block">
        <div className="atelier-section-heading">
          <div><p className="atelier-kicker">SHELVES</p><h2 className="atelier-section-title">{t("home.shelves")}</h2></div>
          <Link className="atelier-text-link" href="/manage">{t("common.manage")} <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
        {metadataQuery.isLoading ? <div className="atelier-loading-row motion-skeleton" /> : shelfRows.length ? <div className="atelier-shelf-list">
          {shelfRows.map(({ shelf, label, count }) => <Link className="atelier-shelf-item motion-press" href={"/library?location=" + encodeURIComponent(shelf.name)} key={shelf.id}>
            <MapPin className="h-4 w-4 text-brass" aria-hidden="true" />
            <span><strong>{label}</strong><small>{count} {t("home.shelfBooks")}</small></span>
            <ArrowUpRight className="h-4 w-4 text-ink/35" aria-hidden="true" />
          </Link>)}
        </div> : <Card className="atelier-empty-surface"><MapPin className="h-6 w-6 text-brass" aria-hidden="true" /><p>{t("home.noShelves")}</p><span>{t("home.noShelvesHint")}</span><Link href="/manage?focus=shelf"><Button variant="secondary" size="sm"><Plus className="h-4 w-4" aria-hidden="true" />{t("home.createShelf")}</Button></Link></Card>}
      </div>
    </section>
  </div>;
}

export function HomePage() {
  return <AppShell><HomeContent /></AppShell>;
}

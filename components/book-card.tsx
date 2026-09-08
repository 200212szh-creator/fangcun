"use client";

import Link from "next/link";
import { ArrowUpRight, MoreHorizontal } from "lucide-react";
import { CoverArt } from "@/components/cover-art";
import { StatusPill } from "@/components/status-pill";

import { Card } from "@/components/ui/card";
import type { OwnedCopy } from "@/lib/types";
import { useTranslations } from "next-intl";

export function BookCard({ book, selected, onSelect }: { book: OwnedCopy; selected?: boolean; onSelect?: (value: boolean) => void }) {
  const t = useTranslations();
  return <Card className={"atelier-book-card group relative overflow-hidden motion-book " + (selected ? "ring-2 ring-brass" : "")}>
    <div className="flex gap-4 p-4 sm:p-5">
      {onSelect ? <label className="absolute left-3 top-3 z-10 flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md bg-surface/90 shadow-sm"><input aria-label={t("common.select") + " " + book.edition.title} type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} className="h-4 w-4 accent-brass" /></label> : null}
      <CoverArt title={book.edition.title} variant={book.edition.coverUrl} />
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-start justify-between gap-2"><StatusPill status={book.readingStatus} label={t("status." + book.readingStatus)} /><Link href={"/books/" + book.id} aria-label={t("common.edit") + " " + book.edition.title} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-ink/45 motion-press hover:bg-paper-muted"><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Link></div>
        <Link href={"/books/" + book.id} className="group/title block motion-press"><h3 className="atelier-book-title">{book.edition.title}</h3><ArrowUpRight className="mt-1 inline h-4 w-4 text-ink/35 transition-colors duration-[var(--motion-base)] group-hover/title:text-brass" aria-hidden="true" /></Link>
        <p className="mt-2 overflow-wrap-anywhere text-sm text-ink/65">{book.edition.authors.join(" · ") || "—"}</p>
        <div className="mt-4 space-y-1 text-xs text-ink/55"><p>{book.location || "—"}</p><p>{book.edition.publicationYear || "—"} · {book.edition.format || "—"}</p></div>
      </div>
    </div>
  </Card>;
}

export function BookListRow({ book }: { book: OwnedCopy }) {
  const t = useTranslations();
  return <Link href={"/books/" + book.id} className="atelier-book-list-row motion-press">
    <CoverArt title={book.edition.title} variant={book.edition.coverUrl} compact />
    <div className="min-w-0 flex-1"><p className="atelier-list-title">{book.edition.title}</p><p className="truncate text-sm text-ink/60">{book.edition.authors.join(" · ") || "—"}</p></div>
    <div className="hidden text-right text-sm text-ink/55 sm:block"><p>{book.location || "—"}</p><p>{book.edition.publicationYear || "—"}</p></div>
    <StatusPill status={book.readingStatus} label={t("status." + book.readingStatus)} />
    <ArrowUpRight className="h-4 w-4 shrink-0 text-ink/35" aria-hidden="true" />
  </Link>;
}

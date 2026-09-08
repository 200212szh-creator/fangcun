"use client";

import { ArrowRight, Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAppLocale } from "@/components/providers";
import { LibraryMark } from "@/components/library-mark";
import { Button } from "@/components/ui/button";
import { brand } from "@/lib/brand";

export function WelcomePage() {
  const t = useTranslations();
  const router = useRouter();
  const { locale, setLocale } = useAppLocale();
  const [ready, setReady] = useState(false);
  const [mottoFirst, mottoSecond] = brand.mottoZh.split("，");

  useEffect(() => {
    setReady(true);
  }, []);

  const enterLibrary = () => {
    router.push("/home");
  };

  if (!ready) return <main className="entry-page min-h-dvh" aria-busy="true" />;

  return <main className="entry-page motion-page-in relative isolate min-h-dvh overflow-hidden bg-parchment text-ink">
    <div className="entry-glow pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-5 sm:px-8 sm:py-7">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy shadow-card"><LibraryMark size="sm" tone="light" /></div><div><p className="serif text-lg font-semibold leading-none">{brand.nameZh}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[.18em] text-ink/50">{brand.nameEn}</p></div></div>
        <div className="flex items-center gap-1 rounded-full border border-border bg-surface/80 p-1 shadow-sm" aria-label={t("common.language")}><Languages className="ml-2 h-4 w-4 text-ink/55" aria-hidden="true" />{(["zh", "en"] as const).map((value) => <button aria-pressed={locale === value} className={`min-h-10 min-w-10 rounded-full px-3 text-xs font-semibold motion-press ${locale === value ? "bg-navy text-white" : "text-ink/60 hover:bg-paper-muted hover:text-ink"}`} key={value} onClick={() => setLocale(value)} type="button">{value === "zh" ? "中" : "EN"}</button>)}</div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-10 text-center sm:py-12">
        <div className="mb-7 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[.26em] text-brass"><span className="h-px w-10 bg-brass/45" aria-hidden="true" /><span>{t("welcome.eyebrow")}</span><span className="h-px w-10 bg-brass/45" aria-hidden="true" /></div>
        <h1 aria-label={brand.mottoZh} className="serif text-5xl font-semibold leading-[.98] tracking-tight text-ink sm:text-7xl"><span>{mottoFirst}，</span><br /><span>{mottoSecond}</span></h1>
        <p className="mt-7 text-lg font-medium leading-8 text-navy sm:text-xl">{brand.mottoEn}</p>
        <p className="mt-1 text-xs font-medium tracking-[.1em] text-ink/50 sm:text-sm" lang="de">{brand.mottoDe}</p>
        <div className="mt-8 flex items-center justify-center"><Button className="min-h-12 px-6" onClick={enterLibrary} size="lg" variant="brass">{t("welcome.enter")}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Button></div>
        <div className="entry-shelf relative mt-10 h-36 w-full max-w-sm sm:mt-12" aria-label={t("welcome.visualLabel")} role="img"><div className="entry-shelf-line absolute inset-x-5 bottom-4 h-1.5 rounded-full bg-brass/80 shadow-[0_8px_20px_hsl(var(--brass)/.2)] sm:inset-x-9" /><div className="relative flex h-full items-end justify-center gap-2 px-10 pb-5 sm:gap-3 sm:px-14"><div className="entry-book entry-book-a h-24 w-9 rounded-t-lg sm:h-28 sm:w-11" /><div className="entry-book entry-book-b h-32 w-11 rounded-t-lg sm:h-36 sm:w-14" /><div className="entry-book entry-book-c h-28 w-10 rounded-t-lg sm:h-32 sm:w-12" /><div className="entry-book entry-book-d h-20 w-8 rounded-t-lg sm:h-24 sm:w-10" /></div></div>
      </section>
      <footer className="flex items-center justify-between border-t border-border/70 pt-4 text-xs text-ink/45"><span>{t("welcome.footer")}</span><span className="font-semibold tracking-[.14em]">{brand.nameEn}</span></footer>
    </div>
  </main>;
}


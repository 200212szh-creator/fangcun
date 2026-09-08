"use client";

import Link from "next/link";
import { Database, Download, Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppLocale } from "@/components/providers";
import { brand } from "@/lib/brand";

export function SettingsPage() {
  const t = useTranslations();
  const { locale, setLocale } = useAppLocale();

  return <AppShell>
    <div className="space-y-7">
      <div><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-brass">SYSTEM</p><h1 className="serif text-4xl font-semibold tracking-tight text-ink sm:text-5xl">{t("settings.title")}</h1><p className="mt-3 max-w-2xl text-base leading-7 text-ink/65">{t("settings.subtitle")}</p></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Languages className="h-5 w-5 text-brass" aria-hidden="true" />{t("settings.appearance")}</CardTitle><CardDescription>{t("settings.languageHint")}</CardDescription></CardHeader><CardContent><div className="grid grid-cols-2 gap-3">{(["zh", "en"] as const).map((value) => <button aria-pressed={locale === value} type="button" key={value} onClick={() => setLocale(value)} className={`min-h-16 cursor-pointer rounded-lg border p-3 text-left motion-press ${locale === value ? "border-navy bg-navy/5" : "border-border hover:border-navy"}`}><p className="font-semibold">{value === "zh" ? t("common.zh") : t("common.en")}</p><p className="mt-1 text-xs text-ink/55">{value === "zh" ? "简体中文" : "English interface"}</p></button>)}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-brass" aria-hidden="true" />{t("settings.data")}</CardTitle><CardDescription>{t("settings.backupHint")}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3"><a href="/api/export?format=json" download><Button variant="secondary"><Download className="h-4 w-4" aria-hidden="true" />{t("settings.exportJson")}</Button></a><a href="/api/export?format=csv" download><Button variant="secondary"><Download className="h-4 w-4" aria-hidden="true" />{t("settings.exportCsv")}</Button></a><Link href="/import"><Button variant="brass"><Download className="h-4 w-4" aria-hidden="true" />{t("settings.importCsv")}</Button></Link></CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><CardTitle>{t("settings.entry")}</CardTitle><CardDescription>{t("settings.entryHint")}</CardDescription></CardHeader><CardContent><Link href="/"><Button variant="secondary">{t("settings.viewEntry")}</Button></Link></CardContent></Card>
        <Card className="border-border/70 bg-surface/60 lg:col-span-2"><CardContent className="p-6"><p className="text-xs font-bold uppercase tracking-[.14em] text-ink/45">{t("settings.local")}</p><p className="serif mt-2 text-2xl font-semibold text-ink">{brand.nameZh} · {brand.nameEn}</p><p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">{t("settings.localHint")}</p></CardContent></Card>
      </div>
    </div>
  </AppShell>;
}


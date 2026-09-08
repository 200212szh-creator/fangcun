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
    <div className="atelier-page atelier-settings-page">
      <div className="atelier-page-header">
        <div><p className="atelier-kicker">SYSTEM</p><h1 className="atelier-display atelier-page-title">{t("settings.title")}</h1><p className="atelier-page-subtitle">{t("settings.subtitle")}</p></div>
        <p className="atelier-page-aside">LOCAL FIRST<br />YOUR DATA / YOUR PLACE</p>
      </div>
      <div className="atelier-settings-grid">
        <Card className="atelier-settings-card">
          <CardHeader><div className="atelier-panel-kicker"><Languages className="h-4 w-4 text-brass" aria-hidden="true" /><span>LANGUAGE</span></div><CardTitle>{t("settings.appearance")}</CardTitle><CardDescription>{t("settings.languageHint")}</CardDescription></CardHeader>
          <CardContent><div className="grid grid-cols-2 gap-3">{(["zh", "en"] as const).map((value) => <button aria-pressed={locale === value} type="button" key={value} onClick={() => setLocale(value)} className={"atelier-language-option motion-press " + (locale === value ? "is-selected" : "")}><p className="font-semibold">{value === "zh" ? t("common.zh") : t("common.en")}</p><p className="mt-1 text-xs text-ink/55">{value === "zh" ? "简体中文" : "English interface"}</p></button>)}</div></CardContent>
        </Card>
        <Card className="atelier-settings-card">
          <CardHeader><div className="atelier-panel-kicker"><Database className="h-4 w-4 text-brass" aria-hidden="true" /><span>ARCHIVE</span></div><CardTitle>{t("settings.data")}</CardTitle><CardDescription>{t("settings.backupHint")}</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-3"><a href="/api/export?format=json" download><Button variant="secondary"><Download className="h-4 w-4" aria-hidden="true" />{t("settings.exportJson")}</Button></a><a href="/api/export?format=csv" download><Button variant="secondary"><Download className="h-4 w-4" aria-hidden="true" />{t("settings.exportCsv")}</Button></a><Link href="/import"><Button variant="brass"><Download className="h-4 w-4" aria-hidden="true" />{t("settings.importCsv")}</Button></Link></CardContent>
        </Card>
        <Card className="atelier-settings-card">
          <CardHeader><CardTitle>{t("settings.entry")}</CardTitle><CardDescription>{t("settings.entryHint")}</CardDescription></CardHeader>
          <CardContent><Link href="/"><Button variant="secondary">{t("settings.viewEntry")}</Button></Link></CardContent>
        </Card>
        <Card className="atelier-settings-note"><CardContent className="p-6"><p className="atelier-kicker">{t("settings.local")}</p><p className="atelier-settings-brand">{brand.nameZh} · {brand.nameEn}</p><p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">{t("settings.localHint")}</p></CardContent></Card>
      </div>
    </div>
  </AppShell>;
}

"use client";

import { useState } from "react";
import { Check, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type PreviewRow = { row: number; item: Record<string, string>; errors: string[] };

export function ImportPage() {
  const t = useTranslations();
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const preview = async () => {
    setNotice("");
    setBusy(true);
    try {
      const response = await fetch("/api/import/books/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv }) });
      const data = await response.json() as { rows: PreviewRow[] };
      setRows(data.rows);
    } finally { setBusy(false); }
  };

  const commit = async () => {
    const validRows = rows.filter((row) => !row.errors.length).map((row) => row.item);
    if (!validRows.length) return;
    setBusy(true);
    try {
      const response = await fetch("/api/import/books/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: validRows }) });
      const data = await response.json() as { imported: number };
      setNotice(`${data.imported} ${t("import.success")}`);
      setRows([]);
      setCsv("");
    } finally { setBusy(false); }
  };

  return <AppShell><div className="space-y-7"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-brass">COLLECTION / CSV</p><h1 className="serif text-4xl font-semibold tracking-tight text-ink sm:text-5xl">{t("import.title")}</h1><p className="mt-3 max-w-2xl text-base leading-7 text-ink/65">{t("import.subtitle")}</p></div>{notice ? <p className="rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success" role="status"><Check className="mr-2 inline h-4 w-4" aria-hidden="true" />{notice}</p> : null}<div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]"><Card><CardHeader><CardTitle>{t("import.csvLabel")}</CardTitle><CardDescription>{t("import.placeholder")}</CardDescription></CardHeader><CardContent className="space-y-4"><Textarea value={csv} onChange={(event) => setCsv(event.target.value)} placeholder={t("import.placeholder")} className="min-h-64 font-mono text-sm" aria-label={t("import.csvLabel")} /><Button onClick={preview} disabled={busy || !csv.trim()} variant="brass"><Upload className="h-4 w-4" aria-hidden="true" />{busy ? t("common.loading") : t("import.preview")}</Button></CardContent></Card><Card><CardHeader><CardTitle>{t("import.preview")}</CardTitle><CardDescription>{rows.length ? `${rows.length} rows` : t("import.empty")}</CardDescription></CardHeader><CardContent>{rows.length ? <div className="space-y-3">{rows.map((row) => <div className="rounded-lg border border-border p-3 text-sm" key={row.row}><div className="flex items-center justify-between gap-3"><span className="font-semibold">#{row.row} · {row.item.title || row.item.name || "—"}</span>{row.errors.length ? <span className="text-danger">{row.errors.join(" · ")}</span> : <span className="text-success">{t("common.success")}</span>}</div><p className="mt-1 text-xs text-ink/55">{row.item.authors || row.item.author || "—"} · {row.item.isbn13 || row.item.isbn || "—"}</p></div>)}<Button className="mt-2" onClick={commit} disabled={busy || !rows.some((row) => !row.errors.length)} variant="default">{t("import.commit")}</Button></div> : <div className="flex min-h-64 items-center justify-center text-center text-sm text-ink/50">{t("import.empty")}</div>}</CardContent></Card></div></div></AppShell>;
}

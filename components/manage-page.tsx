"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, MoreHorizontal, Pencil, Plus, Tag, Trash2, ArrowDown, ArrowUp } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { ShelfMap } from "@/components/shelf-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Category, ShelfLocation, Tag as TagType } from "@/lib/types";

async function getMetadata() {
  const response = await fetch("/api/catalog/metadata");
  if (!response.ok) throw new Error("request-failed");
  return response.json() as Promise<{ categories: Category[]; shelves: ShelfLocation[]; tags: TagType[] }>;
}

async function createItem(url: string, name: string) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  if (!response.ok) throw new Error("request-failed");
}

function MetaPanel({ icon: Icon, title, description, items, empty, placeholder, value, onChange, onSubmit, button, inputId, children }: { icon: React.ElementType; title: string; description: string; items: string[]; empty: string; placeholder: string; value: string; onChange: (value: string) => void; onSubmit: (event: React.FormEvent) => void; button: string; inputId?: string; children?: React.ReactNode }) {
  return <Card><CardHeader className="pb-4"><div className="flex items-center gap-2"><Icon className="h-5 w-5 text-brass" aria-hidden="true" /><CardTitle>{title}</CardTitle></div><CardDescription>{description}</CardDescription></CardHeader><CardContent><form onSubmit={onSubmit} className="flex gap-2"><Input id={inputId} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} /><Button type="submit" variant="brass" aria-label={button}><Plus className="h-4 w-4" aria-hidden="true" /></Button></form>{children ?? <div className="mt-5 flex flex-wrap gap-2">{items.length ? items.map((item) => <Badge key={item} className="border border-border bg-surface">{item}</Badge>) : <p className="py-3 text-sm leading-6 text-ink/50">{empty}</p>}</div>}</CardContent></Card>;
}

function ShelfRows({ shelves, onNotice }: { shelves: ShelfLocation[]; onNotice: (message: string, tone?: "success" | "danger") => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const update = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    try {
      const response = await fetch(`/api/catalog/shelves/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error("request-failed");
      await queryClient.invalidateQueries({ queryKey: ["metadata"] });
      return true;
    } catch {
      onNotice("更新失败，请稍后再试。", "danger");
      return false;
    } finally { setBusyId(null); }
  };

  const remove = async (id: string) => {
    if (!window.confirm("确定删除这个位置吗？仍在使用的位置不能删除。")) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/catalog/shelves/${id}`, { method: "DELETE" });
      if (response.status === 409) { onNotice("这个位置仍有藏书，请先移动副本后再删除。", "danger"); return; }
      if (!response.ok) throw new Error("request-failed");
      await queryClient.invalidateQueries({ queryKey: ["metadata"] });
      onNotice("位置已删除");
    } catch { onNotice("删除失败，请稍后再试。", "danger"); }
    finally { setBusyId(null); }
  };

  return <div className="mt-5 space-y-3">{shelves.length ? shelves.map((shelf, index) => <div key={shelf.id} className="rounded-xl border border-border bg-paper-muted/20 p-3 motion-control hover:border-navy/40">
    <div className="flex min-h-11 items-center gap-3"><MapPin className="h-4 w-4 shrink-0 text-brass" aria-hidden="true" /><div className="min-w-0 flex-1"><p className={`truncate text-sm font-semibold ${shelf.active ? "" : "text-ink/45 line-through"}`}>{shelf.name}</p><p className="mt-1 text-xs text-ink/50">{shelf.active ? "启用中" : "已停用"}{shelf.room ? ` · ${shelf.room}` : ""}</p></div><Button variant="ghost" size="sm" disabled={busyId === shelf.id} onClick={() => void update(shelf.id, { active: !shelf.active }).then((ok) => { if (ok) onNotice(shelf.active ? "位置已停用" : "位置已启用"); })}>{busyId === shelf.id ? "处理中…" : shelf.active ? "停用" : "启用"}</Button><details className="relative"><summary className="flex min-h-10 min-w-10 cursor-pointer list-none items-center justify-center rounded-lg text-ink/60 motion-press hover:bg-paper-muted" aria-label={`更多操作：${shelf.name}`}><MoreHorizontal className="h-5 w-5" aria-hidden="true" /></summary><div className="motion-panel-in absolute right-0 z-20 mt-2 w-44 rounded-xl border border-border bg-surface p-2 shadow-lifted"><button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm motion-press hover:bg-paper-muted" onClick={() => { setEditing(shelf.id); setName(shelf.name); }}><Pencil className="h-4 w-4" aria-hidden="true" />编辑名称</button><button type="button" disabled={index === 0 || Boolean(busyId)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm motion-press hover:bg-paper-muted disabled:opacity-40" onClick={() => void update(shelf.id, { sortOrder: Math.max(0, shelf.sortOrder - 1) }).then((ok) => { if (ok) onNotice("位置已上移"); })}><ArrowUp className="h-4 w-4" aria-hidden="true" />上移</button><button type="button" disabled={index === shelves.length - 1 || Boolean(busyId)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm motion-press hover:bg-paper-muted disabled:opacity-40" onClick={() => void update(shelf.id, { sortOrder: shelf.sortOrder + 1 }).then((ok) => { if (ok) onNotice("位置已下移"); })}><ArrowDown className="h-4 w-4" aria-hidden="true" />下移</button><button type="button" disabled={Boolean(busyId)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-danger motion-press hover:bg-danger/10 disabled:opacity-40" onClick={() => void remove(shelf.id)}><Trash2 className="h-4 w-4" aria-hidden="true" />删除位置</button></div></details></div>
    {editing === shelf.id ? <div className="mt-3 flex gap-2 border-t border-border pt-3"><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setEditing(null); }} aria-label="位置名称" /><Button size="sm" variant="brass" disabled={!name.trim() || busyId === shelf.id} onClick={() => void update(shelf.id, { name: name.trim() }).then((ok) => { if (ok) { setEditing(null); onNotice("位置名称已更新"); } })}>保存</Button><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>取消</Button></div> : null}
  </div>) : <p className="py-3 text-sm leading-6 text-ink/50">还没有位置；先创建一个位置。</p>}</div>;
}

export function ManagePage() {
  const t = useTranslations();
  const searchParams = useSearchParams();

  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["metadata"], queryFn: getMetadata, staleTime: 60_000 });
  const booksQuery = useQuery({ queryKey: ["books"], queryFn: async () => { const response = await fetch("/api/catalog/books"); if (!response.ok) throw new Error("request-failed"); return response.json() as Promise<{ items: import("@/lib/types").OwnedCopy[] }>; }, staleTime: 60_000 });
  const [activePanel, setActivePanel] = useState<"category" | "shelf" | "tag">(searchParams.get("focus") === "shelf" ? "shelf" : "category");
  const [categoryName, setCategoryName] = useState("");
  const [shelfName, setShelfName] = useState("");
  const [tagName, setTagName] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "danger">("success");

  const showNotice = (message: string, tone: "success" | "danger" = "success") => { setNotice(message); setNoticeTone(tone); };
  useEffect(() => { if (searchParams.get("focus") === "shelf") setActivePanel("shelf"); const timer = window.setTimeout(() => { if (searchParams.get("focus") === "shelf") document.getElementById("new-shelf")?.focus(); }, 50); return () => window.clearTimeout(timer); }, [searchParams]);

  const create = async (kind: "category" | "shelf" | "tag", event: React.FormEvent) => {
    event.preventDefault();
    const value = (kind === "category" ? categoryName : kind === "shelf" ? shelfName : tagName).trim();
    if (!value) return;
    try {
      const endpoint = kind === "category" ? "/api/catalog/categories" : kind === "shelf" ? "/api/catalog/shelves" : "/api/catalog/tags";
      await createItem(endpoint, value);
      if (kind === "category") setCategoryName(""); else if (kind === "shelf") setShelfName(""); else setTagName("");
      showNotice(kind === "category" ? "分类已创建" : kind === "shelf" ? "位置已创建" : "标签已创建");
      await queryClient.invalidateQueries({ queryKey: ["metadata"] });
    } catch { showNotice("创建失败，请稍后再试。", "danger"); }
  };

  return <AppShell><div className="space-y-7"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-brass">ORGANIZE</p><h1 className="serif text-4xl font-semibold tracking-tight text-ink sm:text-5xl">{t("manage.title")}</h1><p className="mt-3 max-w-2xl text-base leading-7 text-ink/65">{t("manage.subtitle")}</p></div>{notice ? <p role="status" className={`motion-feedback-in rounded-lg border px-4 py-3 text-sm ${noticeTone === "danger" ? "border-danger/20 bg-danger/10 text-danger" : "border-success/20 bg-success/10 text-success"}`}>{notice}</p> : null}<Card><CardContent className="p-3 sm:p-4"><Tabs value={activePanel}><TabsList className="grid w-full grid-cols-3"><TabsTrigger value="category" activeValue={activePanel} onValueChange={(value) => setActivePanel(value as typeof activePanel)}>分类 <span className="ml-1 text-xs text-ink/45">{query.data?.categories.length ?? 0}</span></TabsTrigger><TabsTrigger value="shelf" activeValue={activePanel} onValueChange={(value) => setActivePanel(value as typeof activePanel)}>书架 <span className="ml-1 text-xs text-ink/45">{query.data?.shelves.length ?? 0}</span></TabsTrigger><TabsTrigger value="tag" activeValue={activePanel} onValueChange={(value) => setActivePanel(value as typeof activePanel)}>标签 <span className="ml-1 text-xs text-ink/45">{query.data?.tags.length ?? 0}</span></TabsTrigger></TabsList><TabsContent value="category" activeValue={activePanel}><MetaPanel icon={Tag} title={t("manage.categories")} description="按主题、兴趣或项目整理；不会改变书架位置。" items={query.data?.categories.map((item) => item.name) ?? []} empty="还没有分类；先创建一个用于筛选的主题。" placeholder={t("manage.categoryPlaceholder")} value={categoryName} onChange={setCategoryName} onSubmit={(event) => void create("category", event)} button={t("manage.newCategory")} /></TabsContent><TabsContent value="shelf" activeValue={activePanel}><MetaPanel icon={MapPin} title={t("manage.shelves")} description="书架决定实体位置；停用只会隐藏它，不会删除藏书。" items={[]} empty="" placeholder={t("manage.shelfPlaceholder")} value={shelfName} onChange={setShelfName} onSubmit={(event) => void create("shelf", event)} button={t("manage.newShelf")} inputId="new-shelf"><ShelfRows shelves={query.data?.shelves ?? []} onNotice={showNotice} /></MetaPanel></TabsContent><TabsContent value="tag" activeValue={activePanel}><MetaPanel icon={Tag} title={t("manage.tags")} description="跨分类标记主题、阅读场景或项目，方便之后筛选。" items={query.data?.tags.map((item) => item.name) ?? []} empty="还没有标签；先创建一个轻量标记。" placeholder="例如：通勤阅读" value={tagName} onChange={setTagName} onSubmit={(event) => void create("tag", event)} button={t("manage.tags")} /></TabsContent></Tabs></CardContent></Card><div className="mt-6"><ShelfMap shelves={query.data?.shelves ?? []} books={booksQuery.data?.items ?? []} /></div></div></AppShell>;
}





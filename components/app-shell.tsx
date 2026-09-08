"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bookmark, Boxes, FolderHeart, Home, LibraryBig, Menu, Search, Settings, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { LibraryMark } from "@/components/library-mark";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";

const navigation = [
  { href: "/home", key: "home", icon: Home }, { href: "/library", key: "library", icon: LibraryBig }, { href: "/add", key: "addBook", icon: LibraryMark }, { href: "/search", key: "search", icon: Search }, { href: "/wishlist", key: "wishlist", icon: Bookmark }, { href: "/research", key: "research", icon: FolderHeart }, { href: "/manage", key: "manage", icon: Boxes }, { href: "/settings", key: "settings", icon: Settings },
] as const;

const navigationGroups = [
  { key: "library", items: navigation.slice(0, 3) },
  { key: "discovery", items: navigation.slice(3, 6) },
  { key: "manage", items: navigation.slice(6) },
] as const;

function NavIcon({ icon: Icon }: { icon: (typeof navigation)[number]["icon"] }) { if (Icon === LibraryMark) return <LibraryMark size="sm" aria-hidden="true" />; return <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />; }

type MobileMenuState = "closed" | "open" | "closing";

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [mobileMenu, setMobileMenu] = useState<MobileMenuState>("closed");
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);
  const routeTimer = useRef<number | null>(null);
  const wasMobileOpen = useRef(false);
  const closeMobileMenuRef = useRef<() => void>(() => undefined);

  const active = (href: string) => pathname === href || (href !== "/home" && pathname.startsWith(href));
  const navClass = (href: string) => cn("relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-ink/65 motion-press hover:bg-paper-muted hover:text-ink", active(href) && "bg-paper-muted font-semibold text-navy before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-navy");
  const goSearch = (event: React.FormEvent) => { event.preventDefault(); if (search.trim()) router.push(`/search?q=${encodeURIComponent(search.trim())}`); };
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const openMobileMenu = () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); setMobileMenu("open"); };
  const closeMobileMenu = () => { if (mobileMenu !== "open") return; if (reducedMotion()) { setMobileMenu("closed"); return; } setMobileMenu("closing"); closeTimer.current = window.setTimeout(() => setMobileMenu("closed"), 140); }; closeMobileMenuRef.current = closeMobileMenu;
  const navigateFromMobile = (href: string) => { const delay = reducedMotion() ? 0 : 140; closeMobileMenu(); if (routeTimer.current) window.clearTimeout(routeTimer.current); routeTimer.current = window.setTimeout(() => router.push(href), delay); };

  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); if (routeTimer.current) window.clearTimeout(routeTimer.current); }, []);
  useEffect(() => {
    if (mobileMenu === "open") window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    if (mobileMenu === "closed" && wasMobileOpen.current) window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    wasMobileOpen.current = mobileMenu !== "closed";
  }, [mobileMenu]);
  useEffect(() => {
    if (mobileMenu === "closed") return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeMobileMenuRef.current(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenu]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => document.getElementById("main-content")?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  const mobileVisible = mobileMenu !== "closed";
  return <div className="min-h-screen bg-parchment"><a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-navy focus:px-4 focus:py-3 focus:text-white">{t("common.skipToContent")}</a><aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-surface lg:flex"><div className="flex h-20 items-center gap-3 border-b border-border px-6"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy text-white"><LibraryMark size="md" tone="light" /></div><div><p className="brand-wordmark text-lg font-bold text-ink">{brand.nameZh}</p><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink/50">{brand.nameEn}</p></div></div><nav aria-label={t("common.primaryNavigation")} className="flex-1 space-y-6 overflow-y-auto p-4">{navigationGroups.map(({ key: groupKey, items }) => <div key={groupKey} className="space-y-1"><p className="px-3 text-[10px] font-bold uppercase tracking-[.16em] text-ink/40">{t("nav.groups." + groupKey)}</p>{items.map(({ href, key, icon }) => <Link key={href} href={href} className={navClass(href)}><NavIcon icon={icon} /><span>{t("nav." + key)}</span></Link>)}</div>)}</nav></aside>
    {mobileVisible ? <div className={cn("fixed inset-0 z-50 bg-ink/40 lg:hidden", mobileMenu === "closing" ? "motion-backdrop-out" : "motion-backdrop-in")} onClick={closeMobileMenu}><aside role="dialog" aria-modal="true" aria-label={t("common.primaryNavigation")} className={cn("h-full w-[min(20rem,88vw)] bg-surface p-4", mobileMenu === "closing" ? "motion-drawer-out" : "motion-drawer-in")} onClick={(event) => event.stopPropagation()}><div className="mb-5 flex items-center justify-between"><div className="flex items-center gap-2"><LibraryMark size="sm" /><span className="brand-wordmark text-xl font-bold">{brand.nameZh}</span></div><Button ref={closeButtonRef} variant="ghost" size="sm" onClick={closeMobileMenu} aria-label={t("common.close")}><X className="h-5 w-5" /></Button></div><nav aria-label={t("common.primaryNavigation")} className="space-y-1">{navigation.map(({ href, key, icon }) => <Link onClick={(event) => { event.preventDefault(); navigateFromMobile(href); }} key={href} href={href} className={navClass(href)}><NavIcon icon={icon} />{t(`nav.${key}`)}</Link>)}</nav></aside></div> : null}
    <div className="lg:pl-64"><header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-border bg-parchment/95 px-4 backdrop-blur sm:px-6"><Button ref={menuButtonRef} variant="ghost" size="sm" className="px-2 lg:hidden" onClick={openMobileMenu} aria-label={t("common.openMenu")}><Menu className="h-5 w-5" /></Button><form onSubmit={goSearch} className="relative max-w-xl flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink/45" aria-hidden="true" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("library.searchPlaceholder")} className="pl-9" aria-label={t("common.search")} /></form></header><main id="main-content" tabIndex={-1} className="app-grid min-h-[calc(100vh-4rem)] px-4 pb-24 pt-6 sm:px-6 lg:px-10 lg:pb-10"><div key={pathname} className="motion-page-in mx-auto max-w-[1440px]">{children}</div></main></div>
    <nav aria-label={t("common.mobileNavigation")} className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 px-2 pt-2 backdrop-blur lg:hidden">{navigation.slice(0, 5).map(({ href, key, icon }) => <Link key={href} href={href} className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium text-ink/60 motion-press hover:bg-paper-muted", active(href) && "text-navy")}><NavIcon icon={icon} /><span>{t(`nav.${key}`)}</span></Link>)}</nav>
  </div>;
}










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
  { href: "/home", key: "home", icon: Home },
  { href: "/add", key: "addBook", icon: LibraryMark },
  { href: "/library", key: "library", icon: LibraryBig },
  { href: "/search", key: "search", icon: Search },
  { href: "/wishlist", key: "wishlist", icon: Bookmark },
  { href: "/research", key: "research", icon: FolderHeart },
  { href: "/manage", key: "manage", icon: Boxes },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

type NavEntry = (typeof navigation)[number];
type MobileMenuState = "closed" | "open" | "closing";

function NavIcon({ icon: Icon }: { icon: NavEntry["icon"] }) {
  if (Icon === LibraryMark) return <LibraryMark size="sm" aria-hidden="true" />;
  return <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

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
  const goSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (search.trim()) router.push("/search?q=" + encodeURIComponent(search.trim()));
  };
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const openMobileMenu = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setMobileMenu("open");
  };
  const closeMobileMenu = () => {
    if (mobileMenu !== "open") return;
    if (reducedMotion()) {
      setMobileMenu("closed");
      return;
    }
    setMobileMenu("closing");
    closeTimer.current = window.setTimeout(() => setMobileMenu("closed"), 140);
  };
  closeMobileMenuRef.current = closeMobileMenu;
  const navigateFromMobile = (href: string) => {
    const delay = reducedMotion() ? 0 : 140;
    closeMobileMenu();
    if (routeTimer.current) window.clearTimeout(routeTimer.current);
    routeTimer.current = window.setTimeout(() => router.push(href), delay);
  };

  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    if (routeTimer.current) window.clearTimeout(routeTimer.current);
  }, []);
  useEffect(() => {
    if (mobileMenu === "open") window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    if (mobileMenu === "closed" && wasMobileOpen.current) window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    wasMobileOpen.current = mobileMenu !== "closed";
  }, [mobileMenu]);
  useEffect(() => {
    if (mobileMenu === "closed") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobileMenuRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenu]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => document.getElementById("main-content")?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  const mobileVisible = mobileMenu !== "closed";
  const navClass = (href: string) => cn("atelier-nav-link motion-press", active(href) && "is-active");
  const drawerNavClass = (href: string) => cn(
    "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-ink/70 motion-press hover:bg-paper-muted hover:text-ink",
    active(href) && "bg-paper-muted font-semibold text-navy before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-navy",
  );

  return <div className="min-h-screen bg-parchment">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-navy focus:px-4 focus:py-3 focus:text-white">{t("common.skipToContent")}</a>

    <header className="atelier-topbar sticky top-0 z-40">
      <div className="atelier-topbar-inner">
        <div className="flex min-w-0 items-center gap-2.5">
          <Button ref={menuButtonRef} variant="ghost" size="sm" className="px-2 xl:hidden" onClick={openMobileMenu} aria-label={t("common.openMenu")}>
            <Menu className="h-5 w-5" />
          </Button>
          <Link href="/home" className="atelier-brand motion-press" aria-label={brand.nameZh + " · " + brand.nameEn}>
            <span className="atelier-brand-mark"><LibraryMark size="sm" tone="light" /></span>
            <span className="min-w-0">
              <span className="brand-wordmark block truncate text-base font-bold leading-none text-ink">{brand.nameZh}</span>
              <span className="mt-1 block truncate text-[9px] font-semibold uppercase tracking-[.19em] text-ink/45">{brand.nameEn}</span>
            </span>
          </Link>
        </div>

        <nav aria-label={t("common.primaryNavigation")} className="atelier-desktop-nav">
          {navigation.map(({ href, key, icon }) => <Link key={href} href={href} className={navClass(href)}>
            <NavIcon icon={icon} />
            <span>{t("nav." + key)}</span>
          </Link>)}
        </nav>

        <form onSubmit={goSearch} className="atelier-shell-search">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink/40" aria-hidden="true" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("library.searchPlaceholder")} className="h-10 border-transparent bg-surface/65 pl-9 shadow-none" aria-label={t("common.search")} />
        </form>
      </div>
    </header>

    {mobileVisible ? <div className={cn("fixed inset-0 z-50 bg-ink/40 xl:hidden", mobileMenu === "closing" ? "motion-backdrop-out" : "motion-backdrop-in")} onClick={closeMobileMenu}>
      <aside role="dialog" aria-modal="true" aria-label={t("common.primaryNavigation")} className={cn("h-full w-[min(21rem,88vw)] bg-surface p-4", mobileMenu === "closing" ? "motion-drawer-out" : "motion-drawer-in")} onClick={(event) => event.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2" onClick={(event) => { event.preventDefault(); navigateFromMobile("/home"); }}>
            <LibraryMark size="sm" />
            <span className="brand-wordmark text-lg font-bold">{brand.nameZh}</span>
          </Link>
          <Button ref={closeButtonRef} variant="ghost" size="sm" onClick={closeMobileMenu} aria-label={t("common.close")}><X className="h-5 w-5" /></Button>
        </div>
        <nav aria-label={t("common.primaryNavigation")} className="space-y-1">
          {navigation.map(({ href, key, icon }) => <Link onClick={(event) => { event.preventDefault(); navigateFromMobile(href); }} key={href} href={href} className={drawerNavClass(href)}><NavIcon icon={icon} />{t("nav." + key)}</Link>)}
        </nav>
      </aside>
    </div> : null}

    <main id="main-content" tabIndex={-1} className="atelier-main app-grid min-h-[calc(100vh-4rem)] px-4 pb-24 pt-7 sm:px-6 lg:px-10 lg:pb-12">
      <div key={pathname} className="motion-page-in mx-auto max-w-[1440px]">{children}</div>
    </main>

    <nav aria-label={t("common.mobileNavigation")} className="atelier-bottom-nav safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 px-2 pt-2 backdrop-blur xl:hidden">
      {navigation.slice(0, 4).map(({ href, key, icon }) => <Link key={href} href={href} className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium text-ink/60 motion-press hover:bg-paper-muted", active(href) && "text-navy")}><NavIcon icon={icon} /><span>{t("nav." + key)}</span></Link>)}
      <button type="button" onClick={openMobileMenu} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium text-ink/60 motion-press hover:bg-paper-muted"><Menu className="h-4 w-4" aria-hidden="true" /><span>{t("common.more")}</span></button>
    </nav>
  </div>;
}

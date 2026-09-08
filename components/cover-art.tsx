import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function CoverArt({ title, variant, compact = false }: { title: string; variant?: string; compact?: boolean }) {
  const cleanTitle = title.trim() || "未命名书籍";
  const length = Array.from(cleanTitle).length;
  const titleSize = compact ? (length > 28 ? 9 : length > 16 ? 11 : 13) : (length > 48 ? 9 : length > 28 ? 11 : 15);

  return <div aria-label={`${cleanTitle} cover`} role="img" title={cleanTitle} className={cn("book-cover flex shrink-0 flex-col justify-between overflow-hidden rounded-md p-3 text-white", variant, compact ? "h-20 w-14" : "h-48 w-32 sm:h-56 sm:w-40")}>
    <span className="text-[9px] uppercase tracking-[.18em] text-white/70">{brand.nameEn}</span>
    <span className="block w-full min-w-0 break-all font-serif font-semibold leading-[1.12] text-white" style={{ fontSize: `${titleSize}px` }}>{cleanTitle}</span>
  </div>;
}

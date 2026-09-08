import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function CoverArt({ title, variant, compact = false }: { title: string; variant?: string; compact?: boolean }) {
  const cleanTitle = title.trim() || "未命名书籍";
  const length = Array.from(cleanTitle).length;
  const titleSize = compact ? (length > 34 ? 8 : length > 22 ? 9 : 11) : (length > 52 ? 9 : length > 34 ? 11 : 14);

  return <div
    aria-label={cleanTitle + " cover"}
    role="img"
    title={cleanTitle}
    data-title={cleanTitle}
    className={cn("book-cover flex shrink-0 flex-col overflow-hidden rounded-md p-3 text-white", variant, compact ? "h-24 w-16" : "h-48 w-32 sm:h-56 sm:w-40")}
  >
    <span className="relative z-[1] text-[9px] uppercase tracking-[.18em] text-white/70">{brand.nameEn}</span>
    <span className="relative z-[1] mt-auto block w-full min-w-0 break-words font-serif font-semibold leading-[1.08]" style={{ fontSize: titleSize + "px", overflowWrap: "anywhere" }}>{cleanTitle}</span>
  </div>;
}

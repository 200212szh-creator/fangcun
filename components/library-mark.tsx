import { brand } from "@/lib/brand";

type LibraryMarkProps = {
  size?: "sm" | "md" | "lg";
  tone?: "dark" | "light";
  className?: string;
};

const dimensions = { sm: 20, md: 32, lg: 64 } as const;

export function LibraryMark({ size = "md", tone = "dark", className }: LibraryMarkProps) {
  const dimension = dimensions[size];
  const color = tone === "light" ? "#fffaf0" : "#18324b";
  const accent = tone === "light" ? "#d7a23a" : "#9a6700";

  return (
    <svg
      aria-label={brand.nameZh}
      className={className}
      fill="none"
      height={dimension}
      role="img"
      viewBox="0 0 64 64"
      width={dimension}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{brand.nameZh}</title>
      <path d="M12 50V23.5A5.5 5.5 0 0 1 17.5 18H23v32H12Z" fill={color} />
      <path d="M27 50V16a5 5 0 0 1 10 0v34H27Z" fill={color} />
      <path d="M41 50V23.5A5.5 5.5 0 0 1 46.5 18H52v32H41Z" fill={color} />
      <path d="M10 50h44" stroke={accent} strokeLinecap="round" strokeWidth="3" />
      <path d="M18 27h2M32 21v18M46 27h2" stroke={accent} strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

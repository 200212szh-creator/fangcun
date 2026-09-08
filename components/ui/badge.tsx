import { cn } from "@/lib/utils";
export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) { return <span className={cn("inline-flex items-center rounded-full border border-border bg-paper-muted px-2.5 py-1 text-xs font-medium text-ink/75", className)} {...props} />; }

import { cn } from "@/lib/utils";
export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) { return <input className={cn("h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink shadow-sm motion-control placeholder:text-ink/45 focus:border-navy focus:outline-none focus:ring-2 focus:ring-brass/30", className)} {...props} />; }

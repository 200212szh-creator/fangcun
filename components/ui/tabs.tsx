"use client";
import { cn } from "@/lib/utils";

export function Tabs({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) { return <div data-value={value} className={className}>{children}</div>; }
export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) { return <div role="tablist" className={cn("inline-flex min-h-11 items-center gap-1 rounded-lg bg-paper-muted p-1", className)}>{children}</div>; }
export function TabsTrigger({ value, activeValue, onValueChange, children }: { value: string; activeValue: string; onValueChange: (value: string) => void; children: React.ReactNode }) { return <button type="button" onClick={() => onValueChange(value)} aria-selected={activeValue === value} role="tab" className={cn("min-h-11 cursor-pointer rounded-md px-3 text-sm font-semibold text-ink/60 motion-tab hover:text-ink", activeValue === value && "bg-surface text-ink shadow-sm")}>{children}</button>; }
export function TabsContent({ value, activeValue, children }: { value: string; activeValue: string; children: React.ReactNode }) { return activeValue === value ? <div role="tabpanel" className="motion-crossfade mt-5">{children}</div> : null; }

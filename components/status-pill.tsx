import { Badge } from "@/components/ui/badge";
import type { ReadingStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
export function StatusPill({ status, label }: { status: ReadingStatus; label: string }) { return <Badge className={cn(status === "reading" && "border-navy/20 bg-navy/10 text-navy", status === "read" && "border-success/20 bg-success/10 text-success", status === "paused" && "border-warning/20 bg-warning/10 text-warning", status === "dropped" && "border-danger/20 bg-danger/10 text-danger")}>{label}</Badge>; }

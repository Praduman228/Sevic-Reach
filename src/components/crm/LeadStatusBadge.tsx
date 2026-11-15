import { Badge } from "@/components/ui/badge";
import { leadStatusLabel, type LeadStatus } from "@/lib/crm";

export function LeadStatusBadge({ status }: { status: LeadStatus | null }) {
  return <Badge variant={status === "hot" ? "success" : status === "cold" ? "warning" : status === "junk" ? "destructive" : "outline"} className={status === null ? "text-muted-foreground" : undefined}>{leadStatusLabel(status)}</Badge>;
}
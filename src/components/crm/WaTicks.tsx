import { Check, CheckCheck, CornerDownLeft, X } from "lucide-react";
import type { WaStatus } from "@/lib/templates";
import { cn } from "@/lib/utils";

export function WaTicks({ s, label }: { s?: WaStatus | undefined; label?: boolean }) {
  if (!s) return label ? <span className="text-xs text-muted-foreground">Not messaged</span> : null;
  const map: Record<string, { icon: typeof Check; text: string; cls: string }> = {
    read: { icon: CheckCheck, text: "Read", cls: "text-info" },
    delivered: { icon: CheckCheck, text: "Delivered", cls: "text-muted-foreground" },
    failed: { icon: X, text: "Failed", cls: "text-destructive" },
  };
  const m = s.replied
    ? { icon: CornerDownLeft, text: "Replied", cls: "text-success" }
    : map[s.status] ?? { icon: Check, text: "Sent", cls: "text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", m.cls)} title={`WhatsApp: ${m.text}`}>
      <m.icon className="h-3.5 w-3.5" />{label && m.text}
    </span>
  );
}

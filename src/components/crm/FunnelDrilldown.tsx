import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { stageLabel } from "@/lib/crm";
import type { reportDrilldown } from "@/lib/funnel-report";

export type FunnelSelection = { title: string; items: ReturnType<typeof reportDrilldown> };
export function FunnelDrilldown({ selection, onClose, ownerName }: { selection: FunnelSelection | null; onClose: () => void; ownerName: (id: string | null) => string }) {
  const [search, setSearch] = useState("");
  const items = selection?.items ?? [];
  const visible = items.filter(({ report }) => `${report.firm.name} ${report.firm.city ?? ""} ${ownerName(report.firm.owner_id)}`.toLowerCase().includes(search.toLowerCase()));
  return <Sheet open={selection !== null} onOpenChange={(open) => { if (!open) { setSearch(""); onClose(); } }}>
    <SheetContent className="flex w-full flex-col sm:max-w-lg motion-reduce:animate-none">
      <SheetHeader className="pr-8 text-left">
        <SheetTitle>{selection?.title}</SheetTitle>
        <SheetDescription>{items.length.toLocaleString("en-IN")} organisations · {items.reduce((n, item) => n + item.count, 0).toLocaleString("en-IN")} total</SheetDescription>
      </SheetHeader>
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search included organisations" placeholder="Search organisation, city or owner" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" /></div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.map(({ report: r, count }) => <Link key={r.firm.id} to="/firms/$id" params={{ id: r.firm.id }} onClick={onClose} className="flex items-start justify-between gap-3 border-b py-4 hover:text-primary">
          <div className="min-w-0"><p className="break-words font-medium">{r.firm.name}</p><p className="mt-1 text-xs text-muted-foreground">{ownerName(r.firm.owner_id)} · {r.firm.city ?? "No city"}</p><p className="mt-2 text-xs text-muted-foreground">{stageLabel(r.firm.stage)} · {r.sent} sent · {r.scheduled} scheduled · {r.followups} follow-ups · {r.replies} replies</p></div>
          <div className="flex shrink-0 items-center gap-2"><span className="font-semibold tabular-nums">{count}</span><ArrowUpRight className="h-4 w-4" /></div>
        </Link>)}
        {visible.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{items.length ? "No organisations match this search." : "No organisations included in this total."}</p>}
      </div>
    </SheetContent>
  </Sheet>;
}
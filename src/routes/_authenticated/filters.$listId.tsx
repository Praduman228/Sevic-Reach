import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLists, useSetMembership } from "@/lib/lists";
import { useFirms } from "@/lib/queries";
import { stageLabel } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/filters/$listId")({
  head: () => ({ meta: [
    {"title": "Filter — Sevic Reach"},
    {"name": "description", "content": "Browse and manage architecture firms in a shared custom tag."},
    {"property": "og:title", "content": "Filter — Sevic Reach"},
    {"property": "og:description", "content": "Browse and manage architecture firms in a shared custom tag."},
    {"property": "og:type", "content": "website"},
    {"name": "twitter:card", "content": "summary"},
  ] }),
  component: ListPage,
});

function ListPage() {
  const { listId } = Route.useParams();
  const { data: lists, isLoading } = useLists();
  const { data: firms } = useFirms();
  const setM = useSetMembership();
  const [q, setQ] = useState("");
  const list = lists?.find((l) => l.id === listId);
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!list) return <p className="text-muted-foreground">Filter not found.</p>;
  const ids = new Set(list.firmIds);
  const rows = (firms ?? []).filter((f) => ids.has(f.id) && f.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <Link to="/filters" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Custom filters</Link>
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-3xl font-semibold">{list.name}</h1>
          <p className="text-muted-foreground">{list.firmIds.length} firms</p>
        </div>
        <Input className="w-56" placeholder="Search firms…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No firms here yet. Add firms from the Pipeline list view or a firm's page.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((f) => (
            <div key={f.id} className="relative rounded-xl border bg-card p-4 hover:border-primary">
              <Link to="/firms/$id" params={{ id: f.id }} className="block pr-6">
                <p className="truncate font-medium">{f.name}</p>
                <p className="truncate text-sm text-muted-foreground">{[f.contact_name, f.city, f.state].filter(Boolean).join(" · ") || "—"}</p>
                <Badge variant="outline" className="mt-2">{stageLabel(f.stage)}</Badge>
              </Link>
              <button aria-label={`Remove ${f.name}`} className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:text-destructive"
                onClick={() => setM.mutate({ listId, firmIds: [f.id], add: false })}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

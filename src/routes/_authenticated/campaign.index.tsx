import { createFileRoute, Link } from "@tanstack/react-router";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CAMPAIGN_STATUS_LABEL, useCampaigns, useDeleteCampaign } from "@/lib/campaigns";
import { useProfiles } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/campaign/")({
  head: () => ({
    meta: [
      { title: "Campaigns — Sevic Reach" },
      { name: "description", content: "Create campaigns that research firms and send three personalised messages automatically." },
      { property: "og:title", content: "Campaigns — Sevic Reach" },
      { property: "og:description", content: "Create campaigns that research firms and send three personalised messages automatically." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignList,
});

function CampaignList() {
  const { data, isLoading } = useCampaigns();
  const { data: profiles } = useProfiles();
  const del = useDeleteCampaign();
  const who = (id: string | null) => profiles?.find((p) => p.id === id)?.full_name || profiles?.find((p) => p.id === id)?.email || "—";
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <Button asChild><Link to="/campaign/new"><Plus className="mr-1 h-4 w-4" />Create campaign</Link></Button>
      </div>
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : !data?.length ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Megaphone className="mx-auto mb-3 h-8 w-8" />No campaigns yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => {
            const count = (s: string) => c.campaign_firms.filter((f) => f.status === s).length;
            return (
              <div key={c.id} className="flex flex-col rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link to="/campaign/$id" params={{ id: c.id }} className="font-display text-lg font-semibold hover:text-primary">{c.name}</Link>
                  <Badge variant={c.status === "running" ? "success" : c.status === "paused" ? "warning" : "outline"}>{CAMPAIGN_STATUS_LABEL[c.status]}</Badge>
                </div>
                {c.motto && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.motto}</p>}
                <p className="mt-3 text-xs text-muted-foreground">By {who(c.created_by)} · {c.channels.map((x) => x === "email" ? "Email" : "WhatsApp").join(" + ")}</p>
                <p className="mt-1 text-sm">{c.campaign_firms.length} firms · {count("scheduled")} sent · {count("missing_contact")} missing contact · {count("failed")} failed</p>
                <div className="mt-auto flex gap-2 pt-4">
                  <Button asChild size="sm" variant="outline"><Link to="/campaign/$id/edit" params={{ id: c.id }}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Link></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm(`Delete “${c.name}”? Messages already sent stay in history.`)) del.mutate(c.id); }}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

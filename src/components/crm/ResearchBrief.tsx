import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { enrichFirm, type ResearchBrief as Brief } from "@/lib/research.functions";

type FirmLite = { id: string; email: string | null; phone: string | null; notes: string | null; whatsapp_opt_in: boolean };

function List({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="list-disc space-y-0.5 pl-5 text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}

export function ResearchBrief({ firm }: { firm: FirmLite }) {
  const firmId = firm.id;
  const qc = useQueryClient();
  const enrich = useServerFn(enrichFirm);
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["research", firmId],
    queryFn: async () => {
      const { data, error } = await supabase.from("firm_research").select("*").eq("firm_id", firmId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const brief = data?.brief as unknown as Brief | undefined;
  const sources = (data?.sources ?? []) as unknown as { url: string; title: string }[];

  async function run() {
    setBusy(true);
    try {
      const r = await enrich({ data: { firmId } });
      qc.invalidateQueries({ queryKey: ["sequence", firmId] });
      qc.invalidateQueries({ queryKey: ["ai-runs", firmId] });
      toast.success([r.filled?.length ? `Filled ${r.filled.join(", ")}` : "", r.mismatches ? `${r.mismatches} mismatch(es) found` : "", r.followups ? `${r.followups} messages ready in Lead follow-ups` : ""].filter(Boolean).join(" · ") || "Research brief ready");
      qc.invalidateQueries({ queryKey: ["research", firmId] });
      qc.invalidateQueries({ queryKey: ["firm", firmId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center gap-3 border-b px-5 py-3">
        <h2 className="mr-auto text-sm font-semibold">Research brief</h2>
        {data && <span className="text-xs text-muted-foreground">{format(new Date(data.created_at), "d MMM, HH:mm")}</span>}
        <Button size="sm" variant={brief ? "outline" : "default"} onClick={run} disabled={busy}>
          <Sparkles className="mr-1 h-4 w-4" />{busy ? "Researching… (~30s)" : brief ? "Refresh" : "Enrich lead"}
        </Button>
      </div>
      {!brief ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">No research brief yet.</p>
      ) : (
        <div className="space-y-4 p-5">
          {!!brief.mismatches?.length && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-destructive">Details that don't match the lead</p>
              <ul className="space-y-1 text-sm">{brief.mismatches.map((m, i) => <li key={i}><span className="font-medium">{m.field}:</span> lead has “{m.in_crm}”, web says “{m.found}”</li>)}</ul>
            </div>
          )}
          {!!brief.filled_fields?.length && <p className="text-xs text-muted-foreground">Filled in from the web: {brief.filled_fields.join(", ")}</p>}
          <p className="text-sm">{brief.summary}</p>
          {brief.design_style && <p className="text-sm"><span className="font-medium">Style: </span>{brief.design_style}</p>}
          <List title="People" items={brief.founders_or_leaders} />
          <List title="Notable projects" items={brief.notable_projects} />
          <List title="Recent news" items={brief.recent_news} />
          <List title="Likely pain points" items={brief.pain_points} />
          <List title="Talking points" items={brief.talking_points} />
          {sources.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sources</p>
              <ul className="space-y-0.5 text-sm">
                {sources.map((s) => (
                  <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><ExternalLink className="h-3 w-3" /><span className="truncate">{s.title}</span></a></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

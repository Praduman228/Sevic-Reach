import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Pause, Pencil, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useFirms, useProfiles } from "@/lib/queries";
import { filterSentByChannel, groupSentByFirm, sentChannelCounts, sendErrorReason, type Channel, type SentChannelFilter } from "@/lib/campaign";

import { CAMPAIGN_STATUS_LABEL, FIRM_STATUS_LABEL, useCampaign, useSetCampaignStatus } from "@/lib/campaigns";

export const Route = createFileRoute("/_authenticated/campaign/$id/")({
  head: () => ({
    meta: [
      { title: "Campaign details — Sevic Reach" },
      { name: "description", content: "Track campaign progress, the firms a campaign sent to, missing contact details and delivery errors." },
      { property: "og:title", content: "Campaign details — Sevic Reach" },
      { property: "og:description", content: "Track campaign progress, the firms a campaign sent to, missing contact details and delivery errors." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignDetail,
});

const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

function CampaignDetail() {
  const { id } = Route.useParams();
  const { data, isLoading } = useCampaign(id);
  const { data: firms = [] } = useFirms();
  const { data: profiles = [] } = useProfiles();
  const setStatus = useSetCampaignStatus();
  const [sentFilter, setSentFilter] = useState<SentChannelFilter>("all");

  const firmIds = data?.firms.map((f) => f.firm_id) ?? [];
  const since = data?.campaign.launched_at;
  // Every message sent since launch, then narrowed to this campaign's firms in the browser:
  // two requests instead of one per 200 firms, so the sent and failed lists appear quickly.
  type Out = { firmId: string; channel: Channel; to: string; error: string | null; status: string; at: string };
  const outbound = useQuery({
    queryKey: ["campaign-outbound", id, since, firmIds.length],
    enabled: !!since && firmIds.length > 0,
    refetchInterval: 30000,
    queryFn: async () => {
      const want = new Set(firmIds);
      const launched = since!;
      const emails = async () => {
        const out: Out[] = [];
        for (let from = 0; from < 5000; from += 1000) {
          const { data, error } = await supabase.from("email_messages").select("firm_id, to_email, error, status, created_at").eq("direction", "out").gte("created_at", launched).range(from, from + 999);
          if (error) throw error;
          const page = data ?? [];
          out.push(...page.filter((r) => r.firm_id && want.has(r.firm_id)).map((r) => ({ firmId: r.firm_id!, channel: "email" as Channel, to: r.to_email, error: r.error, status: r.status, at: r.created_at })));
          if (page.length < 1000) break;
        }
        return out;
      };
      const whatsapp = async () => {
        const out: Out[] = [];
        for (let from = 0; from < 5000; from += 1000) {
          const { data, error } = await supabase.from("whatsapp_messages").select("firm_id, phone, error, status, created_at").eq("direction", "out").gte("created_at", launched).range(from, from + 999);
          if (error) throw error;
          const page = data ?? [];
          out.push(...page.filter((r) => r.firm_id && want.has(r.firm_id)).map((r) => ({ firmId: r.firm_id!, channel: "whatsapp" as Channel, to: r.phone, error: r.error, status: r.status, at: r.created_at })));
          if (page.length < 1000) break;
        }
        return out;
      };
      const [e, w] = await Promise.all([emails(), whatsapp()]);
      return [...e, ...w];
    },
  });
  const failures = useMemo(() => (outbound.data ?? []).filter((r) => r.status === "failed").sort((a, b) => b.at.localeCompare(a.at)), [outbound.data]);
  const sent = useMemo(() => groupSentByFirm((outbound.data ?? []).filter((r) => r.status !== "failed").map((r) => ({ firmId: r.firmId, channel: r.channel, to: r.to, at: r.at }))), [outbound.data]);
  const sentCounts = useMemo(() => sentChannelCounts(sent), [sent]);
  const sentOnly = useMemo(() => filterSentByChannel(sent, sentFilter), [sent, sentFilter]);
  // Per-channel message counts, so a filtered row shows that channel's messages rather than the firm's total.
  const sendsByChannel = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of outbound.data ?? []) if (r.status !== "failed") m.set(`${r.firmId}|${r.channel}`, (m.get(`${r.firmId}|${r.channel}`) ?? 0) + 1);
    return m;
  }, [outbound.data]);



  if (isLoading || !data) return <p className="text-muted-foreground">Loading…</p>;
  const { campaign: c, firms: rows } = data;
  const name = (fid: string) => firms.find((f) => f.id === fid)?.name ?? "Firm";
  const by = profiles.find((p) => p.id === c.created_by);
  const missing = rows.filter((r) => r.missing.length > 0);
  const failedRows = rows.filter((r) => r.status === "failed");
  const lowFit = rows.filter((r) => r.status === "low_fit");
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const FirmLink = ({ fid }: { fid: string }) => <Link to="/firms/$id" params={{ id: fid }} className="font-medium hover:text-primary">{name(fid)}</Link>;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back"><Link to="/campaign"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-semibold">{c.name}</h1>
        <Badge variant={c.status === "running" ? "success" : c.status === "paused" ? "warning" : "outline"}>{CAMPAIGN_STATUS_LABEL[c.status]}</Badge>
        <div className="ml-auto flex gap-2">
          {c.status === "running" && <Button variant="outline" onClick={() => setStatus.mutate({ id, status: "paused" })}><Pause className="mr-1 h-4 w-4" />Pause</Button>}
          {c.status === "paused" && <Button onClick={() => setStatus.mutate({ id, status: "running" })}><Play className="mr-1 h-4 w-4" />Resume</Button>}
          <Button asChild variant="outline"><Link to="/campaign/$id/edit" params={{ id }}><Pencil className="mr-1 h-4 w-4" />{c.status === "draft" ? "Edit, test & launch" : "Edit"}</Link></Button>
        </div>
      </div>
      {c.motto && <p className="text-muted-foreground">{c.motto}</p>}
      {c.pause_reason && <p className="rounded-md border border-warning bg-warning/10 p-3 text-sm">Paused: {c.pause_reason}</p>}
      <p className="text-sm text-muted-foreground">Created by {by?.full_name || by?.email || "—"} · {c.channels.map((x) => x === "email" ? "Email" : "WhatsApp").join(" + ")} · Launched {fmt(c.launched_at)}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {[["Firms", rows.length], ["Waiting", count("pending") + count("processing")], ["Orgs sent to", sent.length], ["Sent & scheduled", count("scheduled")], ["Missing contact", missing.length], ["Unable to send", failedRows.length + failures.length]].map(([l, v]) => (
          <div key={l} className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="font-display text-2xl font-semibold">{v}</p></div>
        ))}
      </div>
      <Tabs defaultValue="firms">
        <TabsList><TabsTrigger value="firms">All firms</TabsTrigger><TabsTrigger value="sent">Sent ({sent.length})</TabsTrigger><TabsTrigger value="missing">Missing contact ({missing.length})</TabsTrigger><TabsTrigger value="lowfit">Low fit ({lowFit.length})</TabsTrigger><TabsTrigger value="failed">Unable to send ({failedRows.length + failures.length})</TabsTrigger></TabsList>
        <TabsContent value="firms" className="divide-y rounded-lg border bg-card">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <FirmLink fid={r.firm_id} />{r.is_test && <Badge variant="outline">Test</Badge>}
              {r.fit_score != null && <Badge variant="outline">Fit {r.fit_score}/5</Badge>}<span className="ml-auto text-muted-foreground">{r.status === "processing" ? `In progress · ${r.phase === "research" ? "researching" : r.phase === "draft" ? "drafting" : "sending"}` : FIRM_STATUS_LABEL[r.status]}{r.processed_at ? ` · ${fmt(r.processed_at)}` : ""}</span>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="sent" className="space-y-3">
          {sent.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {([["all", "All channels"], ["email", "Email"], ["whatsapp", "WhatsApp"]] as [SentChannelFilter, string][]).map(([v, l]) => (
                <Button key={v} size="sm" variant={sentFilter === v ? "default" : "outline"} aria-pressed={sentFilter === v} onClick={() => setSentFilter(v)}>{l}<span className="ml-1.5 text-xs opacity-70">{sentCounts[v]}</span></Button>
              ))}
            </div>
          )}
          <div className="divide-y rounded-lg border bg-card">
            {!sentOnly.length ? <p className="p-4 text-sm text-muted-foreground">{outbound.isPending && since ? "Checking sent messages…" : sentFilter === "all" ? "No messages sent yet." : `No organizations messaged by ${sentFilter === "email" ? "email" : "WhatsApp"} yet.`}</p> : sentOnly.map((s) => {
              const channels = sentFilter === "all" ? s.channels : s.channels.filter((ch) => ch === sentFilter);
              const addresses = sentFilter === "all" ? s.addresses : s.addresses.filter((a) => (sentFilter === "email" ? a.includes("@") : !a.includes("@")));
              const sends = sentFilter === "all" ? s.sends : sendsByChannel.get(`${s.firmId}|${sentFilter}`) ?? 0;
              return (
                <div key={s.firmId} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                  <FirmLink fid={s.firmId} />
                  {channels.map((ch) => <Badge key={ch} variant="outline">{ch === "email" ? "Email" : "WhatsApp"}</Badge>)}
                  <span className="text-muted-foreground">{addresses.join(", ")}</span>
                  <span className="ml-auto text-muted-foreground">{sends} message{sends > 1 ? "s" : ""} · last {fmt(s.lastSentAt)}</span>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="missing" className="divide-y rounded-lg border bg-card">
          {!missing.length ? <p className="p-4 text-sm text-muted-foreground">No firms missing contact details yet.</p> : missing.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 p-3 text-sm"><FirmLink fid={r.firm_id} />{r.missing.map((m) => <Badge key={m} variant="warning">{m}</Badge>)}<span className="ml-auto text-muted-foreground">{r.status === "missing_contact" ? "Not sent" : "Sent on other channel"}</span></div>
          ))}
        </TabsContent>
        <TabsContent value="lowfit" className="divide-y rounded-lg border bg-card">
          {!lowFit.length ? <p className="p-4 text-sm text-muted-foreground">No firms skipped for low fit.</p> : lowFit.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 p-3 text-sm"><FirmLink fid={r.firm_id} /><Badge variant="outline">Fit {r.fit_score}/5</Badge><span className="ml-auto text-muted-foreground">Not sent · fit 3/5 or below</span></div>
          ))}
        </TabsContent>
        <TabsContent value="failed" className="divide-y rounded-lg border bg-card">
          {!failedRows.length && !failures.length ? <p className="p-4 text-sm text-muted-foreground">No send or delivery errors.</p> : <>
            {failedRows.map((r) => <div key={r.id} className="p-3 text-sm"><FirmLink fid={r.firm_id} /><p className="text-destructive">{sendErrorReason(r.error ?? "Could not be processed")}</p></div>)}
            {failures.map((f, i) => <div key={i} className="p-3 text-sm"><div className="flex flex-wrap gap-2"><FirmLink fid={f.firmId} /><Badge variant="outline">{f.channel === "email" ? "Email" : "WhatsApp"}</Badge><span className="text-muted-foreground">{f.to} · {fmt(f.at)}</span></div><p className="text-destructive">{sendErrorReason(f.error ?? "Failed")}</p></div>)}
          </>}
        </TabsContent>
      </Tabs>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, FlaskConical, Loader2, Rocket, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useFirms, useProfiles } from "@/lib/queries";
import { useLists } from "@/lib/lists";
import { LEAD_STATUSES, STAGES, stageLabel } from "@/lib/crm";
import { MAX_TEST_FIRMS, type Channel } from "@/lib/campaign";
import { saveCampaign, useCampaign } from "@/lib/campaigns";
import { previewCampaignFirm } from "@/lib/campaigns.functions";
import { LeadStatusBadge } from "./LeadStatusBadge";

type Preview = Awaited<ReturnType<typeof previewCampaignFirm>>;

export function CampaignEditor({ id }: { id?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: firms = [] } = useFirms();
  const { data: profiles = [] } = useProfiles();
  const { data: lists = [] } = useLists();
  const existing = useCampaign(id);
  const preview = useServerFn(previewCampaignFirm);

  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [motto, setMotto] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [channels, setChannels] = useState<Channel[]>(["email", "whatsapp"]);
  const [selected, setSelected] = useState<string[]>([]);
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [testIds, setTestIds] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, Preview | { error: string } | "loading">>({});
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    if (!createdBy) supabase.auth.getUser().then(({ data }) => data.user && setCreatedBy((v) => v || data.user!.id));
  }, [createdBy]);
  useEffect(() => {
    const d = existing.data;
    if (!d || loaded) return;
    setName(d.campaign.name); setMotto(d.campaign.motto); setChannels(d.campaign.channels as Channel[]);
    if (d.campaign.created_by) setCreatedBy(d.campaign.created_by);
    setSelected(d.firms.map((f) => f.firm_id));
    setLocked(new Set(d.firms.filter((f) => f.status !== "pending").map((f) => f.firm_id)));
    setTestIds(d.firms.filter((f) => f.is_test).map((f) => f.firm_id));
    setLoaded(true);
  }, [existing.data, loaded]);

  const byId = useMemo(() => new Map(firms.map((f) => [f.id, f])), [firms]);
  const sel = new Set(selected);
  const add = (ids: string[]) => setSelected((s) => [...s, ...ids.filter((i) => !s.includes(i))]);
  const remove = (fid: string) => { if (!locked.has(fid)) { setSelected((s) => s.filter((x) => x !== fid)); setTestIds((t) => t.filter((x) => x !== fid)); } };
  const status = existing.data?.campaign.status ?? "draft";
  const valid = name.trim() && createdBy && channels.length && selected.length;

  async function persist() {
    return saveCampaign({ id, name, motto, createdBy, channels, firmIds: selected, testIds });
  }
  async function next() {
    if (!valid) { toast.error("Add a name, at least one channel and at least one firm"); return; }
    if (!testIds.length) setTestIds(selected.slice(0, MAX_TEST_FIRMS));
    setStep(2);
  }
  async function runTests() {
    for (const fid of testIds) {
      setResults((r) => ({ ...r, [fid]: "loading" }));
      try { const res = await preview({ data: { firmId: fid, channels, motto: motto.trim() || undefined } }); setResults((r) => ({ ...r, [fid]: res })); }
      catch (e) { setResults((r) => ({ ...r, [fid]: { error: (e as Error).message } })); }
    }
  }
  async function finish(launch: boolean) {
    setSaving(true);
    try {
      const cid = await persist();
      if (launch) {
        const { error } = await supabase.from("campaigns").update({ status: "running", launched_at: new Date().toISOString(), pause_reason: null }).eq("id", cid);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["campaigns"] }); qc.invalidateQueries({ queryKey: ["campaign"] });
      toast.success(launch ? "Campaign launched" : "Campaign saved");
      navigate({ to: "/campaign/$id", params: { id: cid } });
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }

  if (!loaded) return <p className="text-muted-foreground">Loading…</p>;
  const matches = q.trim() ? firms.filter((f) => `${f.name} ${f.city ?? ""} ${f.contact_name ?? ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 50) : [];

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back"><Link to="/campaign"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-semibold">{id ? "Edit campaign" : "Create campaign"}</h1>
        <span className="ml-auto text-sm text-muted-foreground">Step {step} of 2 · {step === 1 ? "Configure" : "Test & launch"}</span>
      </div>

      {step === 1 ? (
        <>
          <div className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="cname">Campaign name</Label><Input id="cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Raipur studios – November" /></div>
            <div className="space-y-1.5"><Label>Created by</Label>
              <Select value={createdBy} onValueChange={setCreatedBy}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5 md:col-span-2"><Label htmlFor="motto">Campaign motto</Label><Textarea id="motto" value={motto} onChange={(e) => setMotto(e.target.value)} placeholder="What is this campaign trying to achieve?" rows={2} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>Send on</Label>
              <div className="flex gap-6">{(["email", "whatsapp"] as const).map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm"><Checkbox checked={channels.includes(c)} onCheckedChange={(v) => setChannels((s) => v ? [...s, c] : s.filter((x) => x !== c))} />{c === "email" ? "Email" : "WhatsApp (only firms with consent)"}</label>
              ))}</div>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 font-semibold">Add firms</h2>
            <Tabs defaultValue="status">
              <TabsList><TabsTrigger value="status">By stage / status</TabsTrigger><TabsTrigger value="search">Search</TabsTrigger><TabsTrigger value="tags">From tags</TabsTrigger></TabsList>
              <TabsContent value="status" className="space-y-3 pt-3">
                <p className="text-sm text-muted-foreground">Stage</p>
                <div className="flex flex-wrap gap-2">{STAGES.map((s) => { const ids = firms.filter((f) => f.stage === s.id).map((f) => f.id); return <Button key={s.id} size="sm" variant="outline" disabled={!ids.length} onClick={() => add(ids)}>{s.label} ({ids.length})</Button>; })}</div>
                <p className="text-sm text-muted-foreground">Lead status</p>
                <div className="flex flex-wrap gap-2">{LEAD_STATUSES.map((s) => { const ids = firms.filter((f) => f.lead_status === s.id).map((f) => f.id); return <Button key={s.id} size="sm" variant="outline" disabled={!ids.length} onClick={() => add(ids)}>{s.label} ({ids.length})</Button>; })}</div>
              </TabsContent>
              <TabsContent value="search" className="space-y-2 pt-3">
                <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search firm, city or contact" /></div>
                <div className="max-h-64 divide-y overflow-y-auto">{matches.map((f) => (
                  <label key={f.id} className="flex cursor-pointer items-center gap-2 py-2 text-sm"><Checkbox checked={sel.has(f.id)} onCheckedChange={(v) => v ? add([f.id]) : remove(f.id)} /><span className="font-medium">{f.name}</span><span className="text-muted-foreground">{f.city ?? ""} · {stageLabel(f.stage)}</span></label>
                ))}</div>
              </TabsContent>
              <TabsContent value="tags" className="pt-3">
                {!lists.length ? <p className="text-sm text-muted-foreground">No tags yet.</p> : <div className="flex flex-wrap gap-2">{lists.map((l) => <Button key={l.id} size="sm" variant="outline" disabled={!l.firmIds.length} onClick={() => add(l.firmIds)}>{l.name} ({l.firmIds.length})</Button>)}</div>}
              </TabsContent>
            </Tabs>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Selected firms ({selected.length})</h2>
              {selected.some((s) => !locked.has(s)) && <Button size="sm" variant="ghost" onClick={() => { setSelected((s) => s.filter((x) => locked.has(x))); setTestIds([]); }}>Clear</Button>}</div>
            <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">{selected.map((fid) => (
              <span key={fid} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs">{byId.get(fid)?.name ?? "Firm"}{!locked.has(fid) && <button aria-label="Remove" onClick={() => remove(fid)}><X className="h-3 w-3" /></button>}</span>
            ))}</div>
          </div>
          <div className="flex justify-end"><Button onClick={next} disabled={!valid}>Next<ArrowRight className="ml-1 h-4 w-4" /></Button></div>
        </>
      ) : (
        <>
          <div className="rounded-lg border bg-card p-4">
            <h2 className="font-semibold">Test on up to {MAX_TEST_FIRMS} firms</h2>
            <p className="mb-3 text-sm text-muted-foreground">See the three messages each firm would get. Testing researches the firm if needed but sends nothing.</p>
            <div className="max-h-48 divide-y overflow-y-auto">{selected.map((fid) => { const f = byId.get(fid); const on = testIds.includes(fid); return (
              <label key={fid} className="flex items-center gap-2 py-1.5 text-sm"><Checkbox checked={on} disabled={!on && testIds.length >= MAX_TEST_FIRMS} onCheckedChange={(v) => setTestIds((t) => v ? [...t, fid] : t.filter((x) => x !== fid))} />{f?.name}<span className="text-muted-foreground">{f?.city ?? ""}</span>{f && <LeadStatusBadge status={f.lead_status} />}</label>
            ); })}</div>
            <Button className="mt-3" variant="outline" onClick={runTests} disabled={!testIds.length || Object.values(results).includes("loading")}><FlaskConical className="mr-1 h-4 w-4" />Run test</Button>
          </div>
          {testIds.map((fid) => { const r = results[fid]; if (!r) return null; return (
            <div key={fid} className="space-y-3 rounded-lg border bg-card p-4">
              <h3 className="font-semibold">{byId.get(fid)?.name}</h3>
              {r === "loading" ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Researching and drafting… this can take a minute.</p>
                : "error" in r ? <p className="text-sm text-destructive">{r.error}</p> : (<>
                  {(r.missing.length > 0 || r.researchNote) && <div className="flex flex-wrap gap-2">{r.missing.map((m) => <Badge key={m} variant="warning">{m}</Badge>)}{r.researchNote && <Badge variant="outline">{r.researchNote}</Badge>}</div>}
                  {r.fitScore != null && <p className={r.lowFit ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>Fit score {r.fitScore}/5{r.lowFit ? " — this firm will be skipped at launch (3/5 or below)." : ""}</p>}
                  <div className="grid gap-3 md:grid-cols-3">{r.messages.map((m, i) => (
                    <div key={m.touch} className="space-y-2 rounded-md border p-3 text-sm">
                      <p className="text-xs font-medium uppercase text-muted-foreground">{["Introduction", "Follow-up 1 · Day 3", "Follow-up 2 · Day 7"][i] ?? m.touch}</p>
                      {channels.includes("email") && <div><p className="font-medium">{m.emailSubject}</p><p className="whitespace-pre-wrap text-muted-foreground">{m.emailBody}</p></div>}
                      {channels.includes("whatsapp") && m.whatsapp && <div className="rounded bg-secondary p-2"><p className="mb-1 text-xs font-medium">WhatsApp</p><p className="whitespace-pre-wrap">{m.whatsapp}</p></div>}
                    </div>
                  ))}</div>
                </>)}
            </div>
          ); })}
          <div className="rounded-lg border bg-secondary/40 p-4 text-sm text-muted-foreground">
            After launch, each firm is researched, given three personalised messages and sent its introduction automatically — about one firm per minute. Firms with a fit score of 3/5 or below are skipped. Follow-ups go on Day 3 and Day 7 unless the firm replies. Firms without an email or phone number are listed on the campaign page.
          </div>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="mr-1 h-4 w-4" />Back</Button>
            <div className="flex gap-2">
              <Button variant="outline" disabled={saving} onClick={() => finish(false)}>Save {status === "draft" ? "draft" : "changes"}</Button>
              {status !== "running" && status !== "completed" && <Button disabled={saving} onClick={() => finish(true)}><Rocket className="mr-1 h-4 w-4" />{status === "paused" ? "Save & resume" : "Launch"}</Button>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

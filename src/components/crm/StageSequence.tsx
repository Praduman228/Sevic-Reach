import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, Plus, Sparkles, Trash2, Undo2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useFirmContacts } from "@/lib/firm-contacts";
import { PRIMARY_CONTACT_ID, recipientOptions, selectedRecipients, personaliseForContact } from "@/lib/sequence-recipients";
import { supabase } from "@/integrations/supabase/client";
import { messagingStage, stageLabel, type Firm } from "@/lib/crm";
import { CADENCE, scheduleFor, summaryStatus } from "@/lib/sequences";
import { WA_TEMPLATES } from "@/lib/whatsapp-template";
import { draftStageSequence, redraftSequenceStep } from "@/lib/research.functions";
import { sendDueForFirm } from "@/lib/sequences.functions";
import type { Database } from "@/integrations/supabase/types";
import { reviewBlock, TOUCHES, type DraftRun } from "@/lib/offer-chain";

type Msg = Database["public"]["Tables"]["sequence_messages"]["Row"];

const TONE: Record<string, string> = { draft: "outline", approved: "default", sending: "default", sent: "secondary", failed: "destructive", skipped: "outline" };

function ContactStageSequence({ firm, contactId }: { firm: Firm; contactId?: string | undefined }) {
  const table = contactId ? "contact_sequence_messages" : "sequence_messages";
  const deliveryTable = contactId ? "contact_sequence_deliveries" : "sequence_deliveries";
  const qc = useQueryClient();
  const draft = useServerFn(draftStageSequence);
  const sendDue = useServerFn(sendDueForFirm);
  const redraftOne = useServerFn(redraftSequenceStep);
  const [redrafting, setRedrafting] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [touchId,setTouchId]=useState(TOUCHES[firm.stage]?.[0]?.id??"");
  const individual=firm.stage==="pilot"||firm.stage==="paid"||firm.stage==="customer";
  const { data: contacts = [], isLoading: contactsLoading, error: contactsError } = useFirmContacts(firm.id);
  const contact = contacts.find((c) => c.id === contactId);
  const options = (ch: "email" | "whatsapp") => recipientOptions(firm, contacts, ch).filter((r) => !contactId || r.id === contactId);
  const [approving, setApproving] = useState(false);
  const { data: deliveries = [] } = useQuery({
    queryKey: ["sequence-deliveries", firm.id, contactId ?? "legacy"],
    queryFn: async () => {
      const { data, error } = await supabase.from(deliveryTable).select(`*, ${table}!inner(firm_id)`).eq(`${table}.firm_id`, firm.id).order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Database["public"]["Tables"]["sequence_deliveries"]["Row"][];
    },
    refetchInterval: 30000,
  });
  const [persona, setPersona] = useState("");
  const needsPersona = firm.stage !== "outreach";
  const { data: savedPersona = "" } = useQuery({
    queryKey: ["persona", firm.id, firm.stage],
    queryFn: async () => {
      const { data } = await supabase.from("firm_personas").select("persona").eq("firm_id", firm.id).eq("stage", firm.stage).maybeSingle();
      return data?.persona ?? "";
    },
  });
  useEffect(() => { setPersona(savedPersona); }, [savedPersona]);
  const key = ["sequence", firm.id, firm.stage, contactId ?? "legacy"];
  const {data:runs=[]}=useQuery({queryKey:["ai-runs",firm.id,firm.stage,contactId??"legacy"],queryFn:async()=>{
    let query=supabase.from("ai_draft_runs").select("*").eq("firm_id",firm.id).eq("stage",firm.stage).neq("kind","single").order("created_at",{ascending:false});
    query=contactId?query.eq("contact_id",contactId):query.is("contact_id",null);
    const {data,error}=await query;if(error)throw error;return data as unknown as DraftRun[];
  }});
  const channelReview=(m:Msg,ch:"email"|"whatsapp")=>{const id=ch==="email"?m.email_ai_run_id:m.whatsapp_ai_run_id;return runs.find(r=>r.id===id);};
  const { data: msgs = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const query = contactId
        ? supabase.from("contact_sequence_messages").select("*").eq("firm_id", firm.id).eq("stage", firm.stage).eq("contact_id", contactId)
        : supabase.from("sequence_messages").select("*").eq("firm_id", firm.id).eq("stage", firm.stage);
      const { data, error } = await query.order("offset_minutes").order("step");
      if (error) throw error;
      return data as Msg[];
    },
    refetchInterval: 30000,
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["firm", firm.id] }); qc.invalidateQueries({ queryKey: ["firms"] }); qc.invalidateQueries({queryKey:["ai-runs",firm.id]}); qc.invalidateQueries({ queryKey: ["sequence", firm.id] }); qc.invalidateQueries({ queryKey: ["history", firm.id] }); qc.invalidateQueries({ queryKey: ["sequence-deliveries", firm.id, contactId ?? "legacy"] }); };
  if (!CADENCE[firm.stage]) return null;
  const firstSent = msgs.find((m) => m.step === 0)?.sent_at ?? null;

  async function generate() {
    setBusy(true);
    try { const r = await draft({ data: { firmId: firm.id, contactId, ...(individual?{touchId}: {}) } }); toast.success(`${r.count} messages drafted — review and approve each one`); refresh(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  async function savePersonaAndDraft() {
    if (!persona.trim()) { toast.error("Write the persona first"); return; }
    const { error } = await supabase.from("firm_personas").upsert({ firm_id: firm.id, stage: firm.stage, persona: persona.trim().slice(0, 4000), updated_at: new Date().toISOString() }, { onConflict: "firm_id,stage" });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["persona", firm.id] });
    await generate();
  }

  type Ch = "email" | "whatsapp";
  const col = (ch: Ch) => (ch === "email" ? "email_status" : "whatsapp_status") as "email_status" | "whatsapp_status";
  const chLabel = (ch: Ch) => (ch === "email" ? "Email" : "WhatsApp");

  async function setChannel(m: Msg, ch: Ch, next: string) {
    const statuses: [string, string] = ch === "email" ? [next, m.whatsapp_status] : [m.email_status, next];
    const anyApproved = statuses.some((x) => x === "approved");
    const patch: Partial<Msg> = { [col(ch)]: next, status: summaryStatus(statuses[0], statuses[1]), updated_at: new Date().toISOString() };
    if (next === "approved") { patch.approved_at = new Date().toISOString(); patch.scheduled_at = m.scheduled_at && m.sent_at ? m.scheduled_at : scheduleFor(m.step, m.offset_minutes, firstSent); }
    else if (!anyApproved && !m.sent_at) patch.scheduled_at = null;
    return supabase.from(table).update(patch).eq("id", m.id);
  }

  async function approve(list: Msg[], ch: Ch) {
    if (approving || contactsLoading || contactsError) return;
    try {
      for (const m of list) {
        const block=reviewBlock(channelReview(m,ch),ch,m.ai_touch_id??undefined,firm.whatsapp_opt_in);
        if(block)throw new Error(block);
        const ids = ch === "email" ? m.email_contact_ids : m.whatsapp_contact_ids;
        if (!selectedRecipients(firm, contacts, ch, ids).length) throw new Error(`Select at least one ${chLabel(ch)} recipient`);
      }
    } catch (e) { toast.error((e as Error).message); return; }
    setApproving(true);
    try {
    for (const m of list) {
      const { error } = await setChannel(m, ch, "approved");
      if (error) { toast.error(error.message); return; }
    }
    toast.success(`${chLabel(ch)} ${list.length > 1 ? "all approved" : "approved"}`);
    refresh();
    try { const r = await sendDue({ data: { firmId: firm.id } }); if (r.sent) toast.success(`${r.sent} message(s) sent now`); }
    catch (e) { toast.error((e as Error).message); }
    refresh();
    } finally { setApproving(false); }
  }

  async function unapprove(m: Msg, ch: Ch) {
    const { error } = await setChannel(m, ch, "draft");
    if (error) toast.error(error.message);
    refresh();
  }

  async function save(m: Msg, patch: Partial<Msg>) {
    const { error } = await supabase.from(table).update({ ...patch, updated_at: new Date().toISOString() }).eq("id", m.id);
    if (error) toast.error(error.message); else refresh();
  }

  async function changeDay(m: Msg, day: number) {
    if (!Number.isFinite(day) || day < 0 || day > 400) { toast.error("Day must be between 0 and 400"); return; }
    const offset = Math.round(day * 1440);
    const scheduled = m.status === "approved" ? scheduleFor(m.step, offset, firstSent) : m.scheduled_at;
    await save(m, { offset_minutes: offset, scheduled_at: scheduled });
  }

  async function addCustom() {
    const step = Math.max(-1, ...msgs.map((m) => m.step)) + 1;
    const lastDay = Math.max(0, ...msgs.map((m) => m.offset_minutes)) / 1440;
    const row = {
      firm_id: firm.id, stage: firm.stage, step, label: "Custom follow-up", offset_minutes: Math.round((lastDay + 3) * 1440), status: "draft",
      whatsapp_template: step === 0 ? "shegruhmessage" : "outreach1",
    };
    const { error } = contactId
      ? await supabase.from("contact_sequence_messages").insert({ ...row, contact_id: contactId, email_contact_ids: contact?.email ? [contactId] : [], whatsapp_contact_ids: contact?.phone ? [contactId] : [] })
      : await supabase.from("sequence_messages").insert(row);
    if (error) toast.error(error.message); else refresh();
  }

  async function redraft(m: Msg) {
    setRedrafting(m.id);
    try { await redraftOne({ data: { id: m.id, contactSequence: !!contactId, hint: hints[m.id] } }); toast.success("Redrafted"); refresh(); }
    catch (e) { toast.error((e as Error).message); } finally { setRedrafting(null); }
  }

  async function remove(m: Msg) {
    await supabase.from(table).delete().eq("id", m.id);
    refresh();
  }

  const emailDrafts = msgs.filter((m) => m.email_status === "draft");
  const waDrafts = msgs.filter((m) => m.whatsapp_status === "draft");
  return (
    <section className="rounded-xl border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
        <h2 className="mr-auto text-sm font-semibold">{contact ? `${contact.name}${contact.designation ? ` · ${contact.designation}` : ""}` : `${stageLabel(firm.stage)} follow-up messages`} <span className="font-normal text-muted-foreground">· this lead only</span></h2>
        {individual&&<select aria-label="Touch to draft" className="h-8 rounded-md border bg-background px-2 text-sm" value={touchId} onChange={e=>setTouchId(e.target.value)}>{(TOUCHES[firm.stage]??[]).map(t=><option key={t.id} value={t.id}>{t.id}</option>)}</select>}
        {emailDrafts.length > 1 && <Button size="sm" disabled={approving || contactsLoading || !!contactsError} onClick={() => approve(emailDrafts, "email")}><Check className="mr-1 h-4 w-4" />Approve all emails</Button>}
        {waDrafts.length > 1 && <Button size="sm" disabled={approving || contactsLoading || !!contactsError} onClick={() => approve(waDrafts, "whatsapp")}><Check className="mr-1 h-4 w-4" />Approve all WhatsApp</Button>}
        <Button size="sm" variant="outline" onClick={addCustom}><Plus className="mr-1 h-4 w-4" />Add follow-up</Button>
        <Button size="sm" variant="outline" disabled={busy || contactsLoading || !!contactsError} onClick={generate}><Sparkles className="mr-1 h-4 w-4" />{busy ? "Writing…" : msgs.length ? "Redraft" : "Draft messages"}</Button>
      </header>
      <p className="px-5 pt-3 text-xs text-muted-foreground">
        Approve email and WhatsApp separately — each sends on its own once approved. Days count from when the first message is sent. Follow-ups stop if this contact replies or the firm moves stage.
        {!options("email").length && " No email — email will be skipped."}{!options("whatsapp").length ? " No phone — WhatsApp will be skipped." : !firm.whatsapp_opt_in ? " WhatsApp opt-in is off — WhatsApp will be skipped." : ""}
      </p>
      {needsPersona && (
        <div className="mx-5 mt-3 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-medium">Persona for {stageLabel(firm.stage)} · optional</p>
          <p className="text-xs text-muted-foreground">Who you spoke to, their role, what they care about, problems they mentioned. Saved for this stage. Follow-ups are drafted from this, personas from earlier stages, and the research brief.</p>
          <Textarea rows={4} value={persona} maxLength={4000} onChange={(e) => setPersona(e.target.value)} placeholder="e.g. Ankur, founding partner. Runs 25 people across 3 sites. Struggles with tracking site progress and client approvals. Wants a demo next week." />
          <Button size="sm" disabled={busy || !persona.trim()} onClick={savePersonaAndDraft}><Sparkles className="mr-1 h-4 w-4" />{busy ? "Writing…" : msgs.length ? "Save persona & redraft" : "Save persona & draft follow-ups"}</Button>
        </div>
      )}
      {msgs.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">No messages yet.</p>
      ) : (
        <ol className="divide-y">
          {msgs.map((m) => {
            const anyDraft = m.email_status === "draft" || m.whatsapp_status === "draft";
            const anySent = !!(m.email_sent_at || m.whatsapp_sent_at);
            const when = m.sent_at ? `Sent ${format(new Date(m.sent_at), "d MMM, HH:mm")}` : m.scheduled_at ? `Sends ${format(new Date(m.scheduled_at), "d MMM, HH:mm")}` : m.status === "approved" ? "Sends after the first message" : m.label;
            return (
              <li key={`${m.id}-${m.updated_at}`} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  {!anyDraft ? <span className="text-sm font-semibold">{m.label}</span> : <Input className="h-8 w-48 font-semibold" defaultValue={m.label} onBlur={(e) => e.target.value.trim() && e.target.value !== m.label && save(m, { label: e.target.value.trim().slice(0, 80) })} />}
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">Day
                    <Input type="number" min={0} max={400} step={m.offset_minutes % 1440 ? 0.01 : 1} className="h-8 w-20" disabled={anySent || m.status === "sending"} defaultValue={+(m.offset_minutes / 1440).toFixed(2)} onBlur={(e) => Number(e.target.value) * 1440 !== m.offset_minutes && changeDay(m, Number(e.target.value))} />
                  </label>
                  <span className="mr-auto text-xs text-muted-foreground">{when}</span>
                </div>
                {anyDraft && (
                  <div className="flex flex-wrap gap-2">
                    <Input className="h-8 min-w-48 flex-1" placeholder="Optional: tell AI what to say, e.g. mention our free pilot" value={hints[m.id] ?? ""} onChange={(e) => setHints({ ...hints, [m.id]: e.target.value })} maxLength={500} />
                    <Button size="sm" variant="outline" disabled={redrafting === m.id} onClick={() => redraft(m)}><Wand2 className="mr-1 h-4 w-4" />{redrafting === m.id ? "Writing…" : "Redraft with AI"}</Button>
                    {!anySent && m.email_status === "draft" && m.whatsapp_status === "draft" && <Button size="sm" variant="ghost" aria-label="Delete message" onClick={() => remove(m)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                )}
                {m.result && <p className="text-xs text-muted-foreground">{m.result}</p>}
                <div className="grid gap-3 md:grid-cols-2">
                  {(["email", "whatsapp"] as Ch[]).map((ch) => {
                    const st = m[col(ch)];
                    const locked = st !== "draft";
                    const sentAt = ch === "email" ? m.email_sent_at : m.whatsapp_sent_at;
                    return (
                      <div key={ch} className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="mr-auto text-xs font-medium text-muted-foreground">{chLabel(ch)}{sentAt ? ` · sent ${format(new Date(sentAt), "d MMM, HH:mm")}` : ""}</p>
                          {ch === "whatsapp" && (
                            <select aria-label="WhatsApp template" className="h-7 max-w-44 rounded-md border bg-background px-1.5 text-xs" value={m.whatsapp_template ?? "shegruhmessage"} disabled={locked} onChange={(e) => save(m, { whatsapp_template: e.target.value })}>
                              {Object.entries(WA_TEMPLATES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
                            </select>
                          )}
                          <Badge variant={TONE[st] as never}>{st}</Badge>
                          {st === "draft" && <Button size="sm" className="h-7" disabled={approving || contactsLoading || !!contactsError || !!reviewBlock(channelReview(m,ch),ch,m.ai_touch_id??undefined,firm.whatsapp_opt_in)} onClick={() => approve([m], ch)}><Check className="mr-1 h-3.5 w-3.5" />Approve {chLabel(ch)}</Button>}
                          {st === "approved" && <Button size="sm" variant="ghost" className="h-7" onClick={() => unapprove(m, ch)}><Undo2 className="mr-1 h-3.5 w-3.5" />Back to draft</Button>}
                          {(st === "failed" || (st === "skipped" && !sentAt)) && <Button size="sm" variant="outline" className="h-7" onClick={() => unapprove(m, ch)}>Edit & retry</Button>}
                        </div>
                        <fieldset disabled={locked || contactsLoading} className="space-y-1 py-2">
                          <legend className="text-xs font-medium">Recipients</legend>
                          {contactsError && <p className="text-xs text-destructive">Could not load contacts</p>}
                          {options(ch).map((r) => {
                            const ids = (ch === "email" ? m.email_contact_ids : m.whatsapp_contact_ids) ?? [PRIMARY_CONTACT_ID];
                            return <label key={r.id} className="flex items-start gap-2 text-xs"><Checkbox aria-label={`${chLabel(ch)} recipient ${r.name} ${r.address}`} checked={ids.includes(r.id)} onCheckedChange={(checked) => save(m, { [ch === "email" ? "email_contact_ids" : "whatsapp_contact_ids"]: checked ? [...ids, r.id] : ids.filter((id) => id !== r.id) })} /><span className="min-w-0 break-all">{r.name} · {r.address}</span></label>;
                          })}
                        </fieldset>
                        {deliveries.filter((d) => d.sequence_id === m.id && d.channel === ch).map((d) => <p key={d.id} className="break-all text-xs text-muted-foreground">{d.contact_name} · {d.address} · {d.status}{d.error ? ` — ${d.error}` : ""}</p>)}
                        <details className="py-1 text-xs"><summary className="cursor-pointer text-muted-foreground">Recipient previews</summary>{options(ch).filter((r) => ((ch === "email" ? m.email_contact_ids : m.whatsapp_contact_ids) ?? [PRIMARY_CONTACT_ID]).includes(r.id)).map((r) => <div key={r.id} className="border-b py-2"><p className="font-medium">{r.name} · {r.address}</p><p className="whitespace-pre-wrap break-words">{personaliseForContact(ch === "email" ? m.email_body : m.whatsapp_body, r.name, firm.name, true)}</p></div>)}</details>
                        {ch === "email" ? (<>
                          <Input defaultValue={m.email_subject} disabled={locked} onBlur={(e) => e.target.value !== m.email_subject && save(m, { email_subject: e.target.value })} />
                          <Textarea rows={6} defaultValue={m.email_body} disabled={locked} onBlur={(e) => e.target.value !== m.email_body && save(m, { email_body: e.target.value })} />
                        </>) : (
                          <Textarea rows={8} defaultValue={m.whatsapp_body} disabled={locked} onBlur={(e) => e.target.value !== m.whatsapp_body && save(m, { whatsapp_body: e.target.value })} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <PastStages firm={firm} contactId={contactId} />
    </section>
  );
}

type Reply = { id: string; channel: "Email" | "WhatsApp"; body: string; subject?: string; created_at: string; stage: string | null };

function PastStages({ firm, contactId }: { firm: Firm; contactId?: string | undefined }) {
  const { data } = useQuery({
    queryKey: ["sequence", firm.id, "past", firm.stage, contactId ?? "legacy"],
    queryFn: async () => {
      const [seq, em, wa] = await Promise.all([
        (contactId ? supabase.from("contact_sequence_messages").select("*").eq("contact_id", contactId) : supabase.from("sequence_messages").select("*")).eq("firm_id", firm.id).neq("stage", firm.stage).order("offset_minutes").order("step"),
        supabase.from("email_messages").select("id, subject, body, created_at, stage").eq("firm_id", firm.id).eq("direction", "in").neq("stage", firm.stage),
        supabase.from("whatsapp_messages").select("id, body, created_at, stage").eq("firm_id", firm.id).eq("direction", "in").neq("stage", firm.stage),
      ]);
      const replies: Reply[] = contactId ? [] : [
        ...(em.data ?? []).map((r) => ({ ...r, channel: "Email" as const })),
        ...(wa.data ?? []).map((r) => ({ ...r, channel: "WhatsApp" as const })),
      ];
      return { msgs: (seq.data ?? []) as Msg[], replies };
    },
  });
  const stages = [...new Set([...(data?.msgs ?? []).map((m) => m.stage as string), ...(data?.replies ?? []).map((r) => r.stage).filter(Boolean) as string[]])];
  if (!stages.length) return null;
  return (
    <div className="border-t px-5 py-4">
      <h3 className="mb-2 text-sm font-semibold">Earlier stages <span className="font-normal text-muted-foreground">· saved follow-ups and replies</span></h3>
      <div className="space-y-2">
        {stages.map((st) => {
          const ms = (data?.msgs ?? []).filter((m) => m.stage === st);
          const rs = (data?.replies ?? []).filter((r) => r.stage === st).sort((a, b) => a.created_at.localeCompare(b.created_at));
          return (
            <details key={st} className="rounded-lg border">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                {stageLabel(st as Firm["stage"])} · {ms.length} message{ms.length === 1 ? "" : "s"}, {ms.filter((m) => m.status === "sent").length} sent
                {rs.length > 0 && <span className="ml-2 text-success">{rs.length} repl{rs.length === 1 ? "y" : "ies"}</span>}
              </summary>
              <ol className="divide-y border-t">
                {ms.map((m) => (
                  <li key={m.id} className="space-y-1 px-3 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{m.label}</span>
                      <Badge variant={TONE[m.status] as never}>{m.status}</Badge>
                      <span className="text-xs text-muted-foreground">Day {+(m.offset_minutes / 1440).toFixed(2)}{m.sent_at ? ` · sent ${format(new Date(m.sent_at), "d MMM, HH:mm")}` : ""}</span>
                    </div>
                    {m.email_subject && <p className="font-medium">{m.email_subject}</p>}
                    {m.email_body && <p className="whitespace-pre-wrap text-muted-foreground">{m.email_body}</p>}
                    {m.whatsapp_body && <p className="whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">WhatsApp: {m.whatsapp_body}</p>}
                  </li>
                ))}
                {rs.map((r) => (
                  <li key={r.id} className="space-y-1 border-l-4 border-success bg-success/10 px-3 py-3 text-sm">
                    <p className="text-xs font-medium text-success">{r.channel} reply · {format(new Date(r.created_at), "d MMM, HH:mm")}</p>
                    {r.subject && <p className="font-medium">{r.subject}</p>}
                    <p className="whitespace-pre-wrap">{r.body}</p>
                  </li>
                ))}
              </ol>
            </details>
          );
        })}
      </div>
    </div>
  );
}

export function StageSequence({ firm }: { firm: Firm }) {
  const { data: contacts = [] } = useFirmContacts(firm.id);
  const [selected, setSelected] = useState("legacy");
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`contact-sequence-${firm.id}`} className="text-sm font-medium">Contact follow-ups</label>
      <select id={`contact-sequence-${firm.id}`} className="h-9 max-w-full rounded-md border bg-background px-3 text-sm" value={selected} onChange={(e) => setSelected(e.target.value)}>
        <option value="legacy">Existing lead sequence</option>
        {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.designation ? ` · ${c.designation}` : " · No designation"}</option>)}
      </select>
    </div>
    <ContactStageSequence key={selected} firm={{ ...firm, stage: messagingStage(firm.stage) }} contactId={selected === "legacy" ? undefined : selected} />
  </div>;
}

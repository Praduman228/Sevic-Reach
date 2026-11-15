import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { STAGES, type Stage } from "@/lib/crm";
import { useFirms } from "@/lib/queries";
import { useSaveTemplate, useStageTemplates, type StageTemplate } from "@/lib/templates";
import { sendBulkEmail } from "@/lib/email.functions";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({
    meta: [
      { title: "Stage messages — Sevic Reach" },
      { name: "description", content: "Saved email and WhatsApp messages for every pipeline stage." },
      { property: "og:title", content: "Stage messages — Sevic Reach" },
      { property: "og:description", content: "Saved email and WhatsApp messages for every pipeline stage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const { data: tpl } = useStageTemplates();
  const { data: firms } = useFirms();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Stage messages</h1>
        <p className="text-sm text-muted-foreground">
          Save one email and one WhatsApp message for each stage. Use {"{{name}}"} for the contact and {"{{studio}}"} for the firm name.
          They appear on every firm page in that stage.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {STAGES.map((s) => {
          const inStage = (firms ?? []).filter((f) => f.stage === s.id);
          return (
            <StageCard key={s.id} stage={s.id} label={s.label} t={tpl?.[s.id]}
              total={inStage.length} withEmail={inStage.filter((f) => f.email).length}
              withPhone={inStage.filter((f) => f.phone).length} />
          );
        })}
      </div>
    </div>
  );
}

function StageCard({ stage, label, t, total, withEmail, withPhone }: { stage: Stage; label: string; t?: StageTemplate | undefined; total: number; withEmail: number; withPhone: number }) {
  const save = useSaveTemplate();
  const send = useServerFn(sendBulkEmail);
  const [v, setV] = useState<StageTemplate>({ stage, email_subject: "", email_body: "", whatsapp_body: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (t) setV(t); }, [t]);

  async function sendAll() {
    if (!v.email_subject.trim() || !v.email_body.trim()) { toast.error("Write a subject and email first"); return; }
    if (!confirm(`Send this email to ${withEmail} firms in ${label}?`)) return;
    setBusy(true);
    try {
      const r = await send({ data: { subject: v.email_subject, body: v.email_body, stage } });
      toast.success(`${r.sent} sent${r.failed ? `, ${r.failed} failed` : ""}`);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <div className="flex items-baseline gap-2">
        <h2 className="font-semibold">{label}</h2>
        <span className="text-xs text-muted-foreground">{total} firms · {withEmail} with email · {withPhone} with phone</span>
      </div>
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />Email subject</Label>
        <Input value={v.email_subject} onChange={(e) => setV({ ...v, email_subject: e.target.value })} />
      </div>
      <Textarea rows={5} placeholder="Email message" value={v.email_body} onChange={(e) => setV({ ...v, email_body: e.target.value })} />
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />WhatsApp message</Label>
        <Textarea rows={3} value={v.whatsapp_body} onChange={(e) => setV({ ...v, whatsapp_body: e.target.value })} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save.mutate(v)} disabled={save.isPending}>Save</Button>
        <Button variant="outline" onClick={sendAll} disabled={busy || withEmail === 0}>
          <Send className="mr-1 h-4 w-4" />{busy ? "Sending…" : `Email all ${withEmail}`}
        </Button>
      </div>
    </section>
  );
}

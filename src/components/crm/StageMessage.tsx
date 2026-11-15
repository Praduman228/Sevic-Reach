import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Mail, MessageCircle, Sparkles } from "lucide-react";
import { draftFirmEmail, draftFirmWhatsApp } from "@/lib/research.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { firmEmails, firmPhones } from "@/lib/contacts";
import { messagingStage, stageLabel, type Firm } from "@/lib/crm";
import { fillTemplate, useStageTemplates } from "@/lib/templates";
import { sendBulkEmail } from "@/lib/email.functions";
import { sendWhatsApp } from "@/lib/whatsapp.functions";
import { cn } from "@/lib/utils";
import { reviewBlock, type DraftRun } from "@/lib/offer-chain";

function Chips({ items, picked, setPicked, empty }: { items: string[]; picked: string[]; setPicked: (v: string[]) => void; empty: string }) {
  if (!items.length) return <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((x) => {
        const on = picked.includes(x);
        return (
          <button key={x} type="button" onClick={() => setPicked(on ? picked.filter((p) => p !== x) : [...picked, x])}
            className={cn("rounded-full border px-2 py-0.5 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>
            {x}
          </button>
        );
      })}
    </div>
  );
}

export function StageMessage({ firm }: { firm: Firm }) {
  const { data: tpl } = useStageTemplates();
  const t = tpl?.[messagingStage(firm.stage)];
  const qc = useQueryClient();
  const emails = firmEmails(firm);
  const phones = firmPhones(firm);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [wa, setWa] = useState("");
  const [toE, setToE] = useState<string[]>([]);
  const [toP, setToP] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "e" | "w">("");
  const [drafting, setDrafting] = useState<"" | "e" | "w">("");
  const [emailRun,setEmailRun]=useState<DraftRun|null>(null);
  const [waRun,setWaRun]=useState<DraftRun|null>(null);
  const sendE = useServerFn(sendBulkEmail);
  const sendW = useServerFn(sendWhatsApp);
  const draftE = useServerFn(draftFirmEmail);
  const draftW = useServerFn(draftFirmWhatsApp);

  useEffect(() => {
    setSubject(fillTemplate(t?.email_subject ?? "", firm));
    setBody(fillTemplate(t?.email_body ?? "", firm));
    setWa(fillTemplate(t?.whatsapp_body ?? "", firm));
    setEmailRun(null);setWaRun(null);
  }, [t, firm.stage, firm.name, firm.contact_name]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setToE(emails.slice(0, 1)); setToP(phones.slice(0, 1)); }, [emails.join(), phones.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = (s: string) => { navigator.clipboard.writeText(s); toast.success("Copied"); };

  async function doEmail() {
    setBusy("e");
    try {
      const r = await sendE({ data: { subject, body, firmIds: [firm.id], toEmails: toE, aiRunId:emailRun?.id } });
      r.failed ? toast.error(r.results.find((x) => !x.ok)?.error ?? "Failed") : toast.success(`Email sent to ${r.sent}`);
      qc.invalidateQueries({ queryKey: ["firm", firm.id] });
      qc.invalidateQueries({ queryKey: ["firms"] });
    } catch (e) { toast.error((e as Error).message); }
    setBusy("");
  }
  async function doWa() {
    setBusy("w");
    try {
      const r = await sendW({ data: { firmId: firm.id, text: wa, phones: toP, aiRunId:waRun?.id } });
      toast.success(`WhatsApp sent to ${r.sent}`);
      qc.invalidateQueries({ queryKey: ["wa_status"] });
      qc.invalidateQueries({ queryKey: ["firm", firm.id] });
      qc.invalidateQueries({ queryKey: ["firms"] });
    } catch (e) { toast.error((e as Error).message); }
    setBusy("");
  }
  async function runDraftE() {
    setDrafting("e");
    try {
      const d = await draftE({ data: { firmId: firm.id } });
      setSubject(d.email_subject);
      setBody(d.email_body);
      setEmailRun(JSON.parse(d.runJson) as DraftRun);
    } catch (e) { toast.error((e as Error).message); }
    setDrafting("");
  }
  async function runDraftW() {
    setDrafting("w");
    try {
      const d = await draftW({ data: { firmId: firm.id } });
      setWa(d.message);
      setWaRun(JSON.parse(d.runJson) as DraftRun);
    } catch (e) { toast.error((e as Error).message); }
    setDrafting("");
  }

  const waBlock = !phones.length ? "No phone number" : !firm.whatsapp_opt_in ? "Turn on WhatsApp opt-in to send" : !toP.length ? "Pick a number" : "";

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <h2 className="text-sm font-semibold">{stageLabel(firm.stage)} message</h2>
        {!t && <span className="text-xs text-muted-foreground">No saved message for this stage yet — write one here or in the Stage messages tab.</span>}
      </div>
      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium"><Mail className="h-4 w-4" />Email</div>
          <div className="flex items-center gap-2 text-xs"><span className="text-muted-foreground">To:</span><Chips items={emails} picked={toE} setPicked={setToE} empty="No email" /></div>
          <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea rows={6} placeholder="Write your email" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={doEmail} disabled={busy !== "" || drafting !== "" || !toE.length || !subject.trim() || !body.trim() || !!reviewBlock(emailRun,"email")}>{busy === "e" ? "Sending…" : "Send email"}</Button>
            <Button size="sm" variant="outline" onClick={runDraftE} disabled={busy !== "" || drafting !== ""} title="Write a personalised email from this firm's research brief">
              <Sparkles className="mr-1 h-3.5 w-3.5" />{drafting === "e" ? "Drafting…" : "Draft"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => copy(`${subject}\n\n${body}`)}><Copy className="mr-1 h-3.5 w-3.5" />Copy</Button>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium"><MessageCircle className="h-4 w-4" />WhatsApp</div>
          <div className="flex items-center gap-2 text-xs"><span className="text-muted-foreground">To:</span><Chips items={phones} picked={toP} setPicked={setToP} empty="No phone number" /></div>
          <Textarea rows={8} placeholder="Write your WhatsApp message" value={wa} onChange={(e) => setWa(e.target.value)} />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={doWa} disabled={busy !== "" || drafting !== "" || !!waBlock || !wa.trim() || !!reviewBlock(waRun,"whatsapp",undefined,firm.whatsapp_opt_in)}>{busy === "w" ? "Sending…" : "Send WhatsApp"}</Button>
            <Button size="sm" variant="outline" onClick={runDraftW} disabled={busy !== "" || drafting !== ""} title="Write a personalised message from this firm's research brief">
              <Sparkles className="mr-1 h-3.5 w-3.5" />{drafting === "w" ? "Drafting…" : "Draft"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => copy(wa)}><Copy className="mr-1 h-3.5 w-3.5" />Copy</Button>
            {waBlock && <span className="text-xs text-muted-foreground">{waBlock}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

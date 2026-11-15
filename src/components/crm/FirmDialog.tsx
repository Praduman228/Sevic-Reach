import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_STATUSES, SOURCES, STAGES, type Firm, type LeadStatus, type Source, type Stage } from "@/lib/crm";
import { useProfiles, useSaveFirm } from "@/lib/queries";

const schema = z.object({
  name: z.string().trim().min(1, "Firm name is required").max(150),
  city: z.string().trim().max(80),
  state: z.string().trim().max(80),
  contact_name: z.string().trim().max(100),
  phone: z.string().trim().regex(/^(\+[1-9]\d{7,14})?$/, "Phone must be E.164, e.g. +919876543210"),
  email: z.string().trim().max(255).refine((v) => v === "" || z.string().email().safeParse(v).success, "Invalid email"),
  notes: z.string().max(2000),
  lost_reason: z.string().max(300),
});

const empty = {
  name: "", city: "", state: "", team_size: "", contact_name: "", phone: "", email: "",
  source: "linkedin" as Source, stage: "backlog" as Stage, whatsapp_opt_in: false,
  owner_id: "", notes: "", lost_reason: "", lead_status: null as LeadStatus | null,
};

export function FirmDialog({ open, onOpenChange, firm }: { open: boolean; onOpenChange: (o: boolean) => void; firm?: Firm }) {
  const [f, setF] = useState(empty);
  const save = useSaveFirm();
  const { data: profiles } = useProfiles();

  useEffect(() => {
    if (!open) return;
    setF(firm ? {
      name: firm.name, city: firm.city ?? "", state: firm.state ?? "", team_size: firm.team_size?.toString() ?? "",
      contact_name: firm.contact_name ?? "", phone: firm.phone ?? "", email: firm.email ?? "",
      source: firm.source, stage: firm.stage, whatsapp_opt_in: firm.whatsapp_opt_in,
      owner_id: firm.owner_id ?? "", notes: firm.notes ?? "", lost_reason: firm.lost_reason ?? "", lead_status: firm.lead_status,
    } : empty);
  }, [open, firm]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = schema.safeParse(f);
    if (!p.success) { toast.error(p.error.issues[0]?.message ?? "Invalid input"); return; }
    if (f.stage === "lost" && !f.lost_reason.trim()) { toast.error("Lost reason is required"); return; }
    await save.mutateAsync({
      id: firm?.id,
      values: {
        ...p.data,
        city: p.data.city || null, state: p.data.state || null, contact_name: p.data.contact_name || null,
        phone: p.data.phone || null, email: p.data.email || null, notes: p.data.notes || null,
        lost_reason: p.data.lost_reason || null,
        team_size: f.team_size ? Math.max(0, parseInt(f.team_size, 10)) : null,
        source: f.source, stage: f.stage, lead_status: f.lead_status, whatsapp_opt_in: f.whatsapp_opt_in,
        whatsapp_opt_in_at: f.whatsapp_opt_in ? firm?.whatsapp_opt_in_at ?? new Date().toISOString() : null,
        owner_id: f.owner_id || null,
      },
    });
    toast.success(firm ? "Firm updated" : "Firm added");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{firm ? "Edit firm" : "Add firm"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <Field label="Firm name" className="col-span-2"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="City"><Input value={f.city} onChange={(e) => set("city", e.target.value)} /></Field>
          <Field label="State"><Input value={f.state} onChange={(e) => set("state", e.target.value)} /></Field>
          <Field label="Team size"><Input type="number" min={0} value={f.team_size} onChange={(e) => set("team_size", e.target.value)} /></Field>
          <Field label="Contact name"><Input value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} /></Field>
          <Field label="Phone"><Input placeholder="+919876543210" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Email" className="col-span-2"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Source">
            <Select value={f.source} onValueChange={(v) => set("source", v as Source)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Stage">
            <Select value={f.stage} onValueChange={(v) => set("stage", v as Stage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Lead status">
            <Select value={f.lead_status ?? "unclassified"} onValueChange={(v) => set("lead_status", v === "unclassified" ? null : v as LeadStatus)}>
              <SelectTrigger aria-label="Lead status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unclassified">Unclassified</SelectItem>
                {LEAD_STATUSES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {f.stage === "lost" && (
            <Field label="Lost reason (required)" className="col-span-2"><Input value={f.lost_reason} onChange={(e) => set("lost_reason", e.target.value)} /></Field>
          )}
          <Field label="Owner">
            <Select value={f.owner_id || "none"} onValueChange={(v) => set("owner_id", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {profiles?.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-end gap-2 pb-2">
            <Switch id="optin" checked={f.whatsapp_opt_in} onCheckedChange={(v) => set("whatsapp_opt_in", v)} />
            <Label htmlFor="optin">WhatsApp opt-in</Label>
          </div>
          <Field label="Notes" className="col-span-2"><Textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className ?? ""}`}><Label>{label}</Label>{children}</div>;
}

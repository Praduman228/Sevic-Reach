import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useFirmContacts } from "@/lib/firm-contacts";
import { normalizePhone } from "@/lib/contacts";
import type { NamedContact } from "@/lib/sequence-recipients";

export function FirmContacts({ firmId }: { firmId: string }) {
  const { data: contacts = [], isLoading, error } = useFirmContacts(firmId);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  function edit(contact?: NamedContact) {
    setEditing(contact?.id ?? "new"); setName(contact?.name ?? ""); setDesignation(contact?.designation ?? ""); setEmail(contact?.email ?? ""); setPhone(contact?.phone ?? "");
  }
  async function save() {
    const normalized = phone.trim() ? normalizePhone(phone) : null;
    if (phone.trim() && !normalized) { toast.error("Enter a valid phone number with country code"); return; }
    const result = z.object({ name: z.string().trim().min(1, "Enter a contact name").max(120), designation: z.string().trim().max(80).nullable(), email: z.string().email("Enter a valid email").max(254).nullable(), phone: z.string().nullable() }).safeParse({ name, designation: designation.trim() || null, email: email.trim().toLowerCase() || null, phone: normalized });
    if (!result.success) { toast.error(result.error.issues[0]?.message); return; }
    if (!result.data.email && !result.data.phone) { toast.error("Add an email or phone number"); return; }
    setBusy(true);
    const row = { ...result.data, firm_id: firmId };
    const { error } = editing === "new" ? await supabase.from("firm_contacts").insert(row) : await supabase.from("firm_contacts").update(row).eq("id", editing ?? "").eq("firm_id", firmId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setEditing(null); await qc.invalidateQueries({ queryKey: ["firm-contacts", firmId] }); toast.success("Contact saved");
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this contact? Follow-ups selecting this contact will need new recipients.")) return;
    const { error } = await supabase.from("firm_contacts").delete().eq("id", id).eq("firm_id", firmId);
    if (error) toast.error(error.message); else await qc.invalidateQueries({ queryKey: ["firm-contacts", firmId] });
  }
  return <div className="space-y-3 border-b pb-5">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Additional contacts</h3><Button size="sm" variant="outline" onClick={() => edit()}><Plus className="h-4 w-4" />Add contact</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">Could not load contacts.</p>}
    {isLoading && <p className="text-sm text-muted-foreground">Loading contacts…</p>}
    {contacts.map((contact) => <div key={contact.id} className="flex items-start gap-2 border-b py-2 last:border-b-0"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{contact.name}{contact.designation && <span className="font-normal text-muted-foreground"> · {contact.designation}</span>}</p>{contact.email && <p className="break-all text-xs text-muted-foreground">{contact.email}</p>}{contact.phone && <p className="text-xs text-muted-foreground">{contact.phone}</p>}</div><Button size="icon" variant="ghost" aria-label={`Edit ${contact.name}`} onClick={() => edit(contact)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Delete ${contact.name}`} onClick={() => remove(contact.id)}><Trash2 className="h-4 w-4" /></Button></div>)}
    {editing && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <label className="block space-y-1 text-xs">Contact name<Input aria-label="Contact name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required /></label>
      <div className="grid gap-3 lg:grid-cols-2"><label className="block space-y-1 text-xs">Contact email<Input aria-label="Contact email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} /></label><label className="block space-y-1 text-xs">Contact phone<Input aria-label="Contact phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} placeholder="+91" /></label></div>
      <label className="block space-y-1 text-xs">Designation<Input aria-label="Contact designation" value={designation} onChange={(e) => setDesignation(e.target.value)} maxLength={80} placeholder="Principal Architect" /></label>
      <div className="flex gap-2"><Button size="sm" disabled={busy} type="submit"><Check className="h-4 w-4" />{busy ? "Saving…" : "Save contact"}</Button><Button size="sm" variant="ghost" type="button" onClick={() => setEditing(null)}><X className="h-4 w-4" />Cancel</Button></div>
    </form>}
  </div>;
}
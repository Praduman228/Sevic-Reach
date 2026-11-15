import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Firm } from "@/lib/crm";

const FIELDS = [
  { id: "name", label: "Firm name *", keys: ["firm", "company", "studio", "organisation", "organization", "business", "name"] },
  { id: "contact_name", label: "Contact name", keys: ["contact", "person", "founder", "principal", "owner name"] },
  { id: "email", label: "Email", keys: ["email", "mail"] },
  { id: "phone", label: "Phone", keys: ["phone", "mobile", "whatsapp", "contact no", "number"] },
  { id: "city", label: "City", keys: ["city", "location", "town"] },
  { id: "state", label: "State", keys: ["state", "province", "region"] },
  { id: "website", label: "Website", keys: ["website", "site", "url", "web"] },
  { id: "address", label: "Address", keys: ["address"] },
  { id: "team_size", label: "Team size", keys: ["team", "size", "employees", "staff"] },
  { id: "notes", label: "Notes", keys: ["note", "remark", "comment"] },
] as const;
type FieldId = (typeof FIELDS)[number]["id"];
const NONE = "__none";

function autoMap(headers: string[]) {
  const map: Partial<Record<FieldId, string>> = {};
  const used = new Set<string>();
  // email/phone/website first so "name" doesn't grab "email name" etc.
  for (const id of ["email", "phone", "website", "contact_name", "city", "state", "address", "team_size", "notes", "name"] as FieldId[]) {
    const f = FIELDS.find((x) => x.id === id)!;
    const h = headers.find((h) => !used.has(h) && f.keys.some((k) => h.toLowerCase().includes(k)));
    if (h) { map[id] = h; used.add(h); }
  }
  return map;
}

function phoneE164(v: string) {
  const d = v.replace(/[^\d+]/g, "");
  if (!d) return null;
  if (d.startsWith("+")) return /^\+[1-9]\d{7,14}$/.test(d) ? d : null;
  if (/^[6-9]\d{9}$/.test(d)) return `+91${d}`;
  if (/^0[6-9]\d{9}$/.test(d)) return `+91${d.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(d)) return `+${d}`;
  return null;
}

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Partial<Record<FieldId, string>>>({});
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer());
    const ws = wb.Sheets[wb.SheetNames[0]!]!;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
    const hi = Math.max(0, grid.findIndex((r) => r.filter((c) => String(c).trim()).length >= 3));
    const hs = (grid[hi] ?? []).map((c, i) => String(c).trim() || `Column ${i + 1}`);
    const data = grid.slice(hi + 1).filter((r) => r.some((c) => String(c).trim()))
      .map((r) => Object.fromEntries(hs.map((h, i) => [h, r[i] ?? ""])));
    setRows(data); setHeaders(hs); setMap(autoMap(hs));
    if (!data.length) toast.error("No rows found in the first sheet");
  }

  const get = (r: Record<string, unknown>, id: FieldId) => (map[id] ? String(r[map[id]!] ?? "").trim() : "");

  async function runImport() {
    if (!map.name) { toast.error("Pick which column is the firm name"); return; }
    setBusy(true);
    try {
      const { data: existing } = await supabase.from("firms").select("name");
      const seen = new Set((existing ?? []).map((f) => f.name.trim().toLowerCase()));
      const toInsert: Partial<Firm>[] = [];
      let skipped = 0;
      for (const r of rows) {
        const name = get(r, "name");
        if (!name || seen.has(name.toLowerCase())) { skipped++; continue; }
        seen.add(name.toLowerCase());
        const rawPhone = get(r, "phone");
        const phone = rawPhone ? phoneE164(rawPhone) : null;
        const size = parseInt(get(r, "team_size"), 10);
        const notes = [get(r, "notes"), rawPhone && !phone ? `Phone (unverified): ${rawPhone}` : ""].filter(Boolean).join("\n");
        toInsert.push({
          name, phone,
          contact_name: get(r, "contact_name") || null,
          email: get(r, "email") || null,
          city: get(r, "city") || null,
          state: get(r, "state") || null,
          website: get(r, "website") || null,
          address: get(r, "address") || null,
          team_size: Number.isFinite(size) ? size : null,
          notes: notes || null,
          stage: "backlog",
        });
      }
      let ok = 0; let failed = 0;
      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50);
        const { error } = await supabase.from("firms").insert(chunk as Firm[]);
        if (!error) { ok += chunk.length; continue; }
        for (const one of chunk) {
          const { error: e } = await supabase.from("firms").insert(one as Firm);
          if (e) failed++; else ok++;
        }
      }
      toast.success(`Imported ${ok}${skipped ? `, skipped ${skipped} duplicates/blank` : ""}${failed ? `, ${failed} failed` : ""}`);
      qc.invalidateQueries({ queryKey: ["firms"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setRows([]); setHeaders([]); onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Import leads from Excel / CSV</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">From Google Sheets: File → Download → Microsoft Excel (.xlsx), then pick it here. The first sheet is used; firms already in the CRM (same name) are skipped.</p>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-sm hover:bg-secondary">
          <Upload className="h-4 w-4" />{rows.length ? `${rows.length} rows loaded — choose another file` : "Choose .xlsx or .csv file"}
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {headers.length > 0 && (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.id} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-sm">{f.label}</span>
                  <Select value={map[f.id] ?? NONE} onValueChange={(v) => setMap((m) => ({ ...m, [f.id]: v === NONE ? undefined : v }))}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— skip —</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto rounded-lg border text-xs">
              <table className="w-full">
                <thead className="bg-secondary"><tr>{FIELDS.filter((f) => map[f.id]).map((f) => <th key={f.id} className="px-2 py-1 text-left">{f.label}</th>)}</tr></thead>
                <tbody>{rows.slice(0, 5).map((r, i) => <tr key={i} className="border-t">{FIELDS.filter((f) => map[f.id]).map((f) => <td key={f.id} className="max-w-40 truncate px-2 py-1">{get(r, f.id)}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <Button onClick={runImport} disabled={busy || !map.name}>{busy ? "Importing…" : `Import ${rows.length} rows`}</Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

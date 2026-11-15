import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Instagram, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { normalizeInstagram, openInstagramUrl } from "@/lib/instagram";


export function InstagramProfile({ firmId, value }: { firmId: string; value: string | null }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    const handle = text.trim() ? normalizeInstagram(text) : null;
    if (text.trim() && !handle) { toast.error("Enter a valid Instagram username or link"); return; }
    setBusy(true);
    const { error } = await supabase.from("firms").update({ instagram: handle }).eq("id", firmId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Instagram saved");
    setEditing(false);
    qc.invalidateQueries();
  }

  return (
    <div className="space-y-2 border-b pb-5">
      <h3 className="text-sm font-semibold text-muted-foreground">Instagram profile</h3>
      {editing ? (
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-xs" placeholder="@studio or instagram.com/studio" value={text} onChange={(e) => setText(e.target.value)} />
          <Button size="sm" onClick={save} disabled={busy}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(value ?? ""); }}>Cancel</Button>
        </div>
      ) : value ? (
        <div className="flex items-center gap-2 text-sm">
          <Instagram className="h-4 w-4 text-muted-foreground" />
          <a className="text-primary underline-offset-2 hover:underline" href={`https://instagram.com/${value}`} target="_blank" rel="noreferrer" onClick={(e) => { e.preventDefault(); openInstagramUrl(`https://instagram.com/${value}`); }}>@{value}</a>
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit Instagram" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /></Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          No Instagram found yet.
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Add Instagram</Button>
        </div>
      )}
    </div>
  );
}

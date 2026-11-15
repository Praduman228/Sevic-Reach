import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { Stage } from "@/lib/crm";

export function AddFollowUp({ firmId, stage }: { firmId: string; stage: Stage }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !due) return;
    setBusy(true);
    const { error } = await supabase.from("tasks").insert({
      firm_id: firmId, title: title.trim().slice(0, 200), stage, due_at: new Date(`${due}T10:00:00`).toISOString(), auto: false,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setTitle("");
    toast.success("Follow-up added");
    qc.invalidateQueries({ queryKey: ["firm", firmId] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  return (
    <form onSubmit={add} className="flex flex-wrap gap-2 border-t px-5 py-3">
      <Input className="min-w-40 flex-1" placeholder="Add a follow-up, e.g. Call back about pricing" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      <Input type="date" className="w-40" value={due} onChange={(e) => setDue(e.target.value)} />
      <Button type="submit" disabled={busy || !title.trim()}><Plus className="mr-1 h-4 w-4" />Add</Button>
    </form>
  );
}

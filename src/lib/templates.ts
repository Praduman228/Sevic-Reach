import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Stage } from "./crm";

export type StageTemplate = { stage: Stage; email_subject: string; email_body: string; whatsapp_body: string };

export function fillTemplate(t: string, f: { name: string; contact_name?: string | null }) {
  return t.replaceAll("{{name}}", f.contact_name?.trim() || "there").replaceAll("{{studio}}", f.name);
}

export function useStageTemplates() {
  return useQuery({
    queryKey: ["stage_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stage_templates").select("stage, email_subject, email_body, whatsapp_body");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((t) => [t.stage, t])) as Partial<Record<Stage, StageTemplate>>;
    },
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: StageTemplate) => {
      const { error } = await supabase.from("stage_templates").upsert({ ...t, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stage_templates"] }); toast.success("Saved"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export type WaStatus = { status: string; replied: boolean; at: string };

/** Latest WhatsApp state per firm: last outgoing status + whether they replied after it. */
export function useWhatsAppStatus() {
  return useQuery({
    queryKey: ["wa_status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages").select("firm_id, status, direction, created_at")
        .order("created_at", { ascending: false }).limit(1500);
      if (error) throw error;
      const out: Record<string, WaStatus> = {};
      for (const m of data ?? []) {
        if (!m.firm_id) continue;
        const cur = out[m.firm_id];
        if (!cur) out[m.firm_id] = { status: m.direction === "in" ? "replied" : m.status, replied: m.direction === "in", at: m.created_at };
        else if (cur.status === "replied" && m.direction === "out") cur.status = "read";
      }
      return out;
    },
    staleTime: 60000,
    refetchInterval: 60000,
  });
}

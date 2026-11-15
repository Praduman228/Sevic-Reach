import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Channel } from "./campaign";

export type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];
export type CampaignFirmRow = Database["public"]["Tables"]["campaign_firms"]["Row"];
export type CampaignWithCounts = CampaignRow & { campaign_firms: Pick<CampaignFirmRow, "status">[] };

export function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*, campaign_firms(status)").order("created_at", { ascending: false });
      if (error) throw error;
      return data as CampaignWithCounts[];
    },
    refetchInterval: 30000,
  });
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: ["campaign", id],
    enabled: !!id,
    queryFn: async () => {
      const [{ data: c, error }, { data: firms, error: fErr }] = await Promise.all([
        supabase.from("campaigns").select("*").eq("id", id!).single(),
        supabase.from("campaign_firms").select("*").eq("campaign_id", id!).order("created_at"),
      ]);
      if (error) throw error;
      if (fErr) throw fErr;
      return { campaign: c, firms: firms ?? [] };
    },
    refetchInterval: 15000,
  });
}

export type CampaignDraft = { id?: string | undefined; name: string; motto: string; createdBy: string; channels: Channel[]; firmIds: string[]; testIds: string[] };

/** Save campaign settings and its firm list. Only firms not yet started can be removed. */
export async function saveCampaign(d: CampaignDraft): Promise<string> {
  const row = { name: d.name.trim(), motto: d.motto.trim(), created_by: d.createdBy, channels: d.channels, updated_at: new Date().toISOString() };
  let id = d.id;
  if (id) { const { error } = await supabase.from("campaigns").update(row).eq("id", id); if (error) throw error; }
  else { const { data, error } = await supabase.from("campaigns").insert(row).select("id").single(); if (error) throw error; id = data.id; }
  const { data: existing, error } = await supabase.from("campaign_firms").select("id, firm_id, status").eq("campaign_id", id);
  if (error) throw error;
  const want = new Set(d.firmIds);
  const removable = (existing ?? []).filter((r) => !want.has(r.firm_id) && r.status === "pending").map((r) => r.id);
  if (removable.length) { const { error: e } = await supabase.from("campaign_firms").delete().in("id", removable); if (e) throw e; }
  const have = new Set((existing ?? []).map((r) => r.firm_id));
  const add = d.firmIds.filter((f) => !have.has(f)).map((firm_id) => ({ campaign_id: id!, firm_id, is_test: d.testIds.includes(firm_id) }));
  for (let i = 0; i < add.length; i += 500) { const { error: e } = await supabase.from("campaign_firms").insert(add.slice(i, i + 500)); if (e) throw e; }
  return id!;
}

export function useSetCampaignStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "running" | "paused" }) => {
      const patch = status === "running" ? { status, pause_reason: null, launched_at: new Date().toISOString() } : { status };
      const { data: cur } = await supabase.from("campaigns").select("launched_at").eq("id", id).single();
      const { error } = await supabase.from("campaigns").update(status === "running" && cur?.launched_at ? { status, pause_reason: null } : patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["campaigns"] }); qc.invalidateQueries({ queryKey: ["campaign"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("campaigns").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["campaigns"] }); toast.success("Campaign deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = { draft: "Draft", running: "Running", paused: "Paused", completed: "Completed" };
export const FIRM_STATUS_LABEL: Record<string, string> = { pending: "Waiting", processing: "In progress", scheduled: "Sent & scheduled", missing_contact: "Missing contact", failed: "Failed", low_fit: "Skipped – low fit" };

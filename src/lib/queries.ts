import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Firm, Stage, Task } from "./crm";

export function useFirms() {
  return useQuery({
    queryKey: ["firms"],
    queryFn: async () => {
      // The Data API caps each request at 1000 rows, so page through every firm.
      const size = 1000;
      const all: Firm[] = [];
      for (let from = 0; ; from += size) {
        const { data, error } = await supabase
          .from("firms")
          .select("*")
          .order("updated_at", { ascending: false })
          .order("id")
          .range(from, from + size - 1);
        if (error) throw error;
        all.push(...(data as Firm[]));
        if (!data || data.length < size) break;
      }
      return all;
    },
    staleTime: 30000,
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      return data;
    },
    staleTime: 300000,
  });
}

export type TaskWithFirm = Task & { firms: { id: string; name: string; stage: Stage } | null };

export function useOpenTasks() {
  return useQuery({
    queryKey: ["tasks", "open"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, firms(id, name, stage)")
        .is("completed_at", null)
        .order("due_at");
      if (error) throw error;
      return data as TaskWithFirm[];
    },
  });
}

export function useSaveFirm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string | undefined; values: Partial<Firm> }) => {
      if (id) {
        const { error } = await supabase.from("firms").update(values).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("firms").insert(values as Firm);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["firms"] });
      qc.invalidateQueries({ queryKey: ["firm"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").update({ completed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["firm"] }); toast.success("Done"); },
    onError: (e: Error) => toast.error(e.message),
  });
}


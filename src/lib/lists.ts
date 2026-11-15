import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type FirmList = { id: string; name: string; firmIds: string[] };

export function useLists() {
  return useQuery({
    queryKey: ["lists"],
    queryFn: async (): Promise<FirmList[]> => {
      const [lists, members] = await Promise.all([
        supabase.from("firm_lists").select("id,name").order("created_at"),
        supabase.from("firm_list_members").select("list_id,firm_id").range(0, 49999),
      ]);
      if (lists.error) throw lists.error;
      if (members.error) throw members.error;
      return (lists.data ?? []).map((l) => ({
        ...l,
        firmIds: (members.data ?? []).filter((m) => m.list_id === l.id).map((m) => m.firm_id),
      }));
    },
    staleTime: 60000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["lists"] });
}

export function useCreateList() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.from("firm_lists").insert({ name }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => { inv(); toast.success("Filter created"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteList() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("firm_lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { inv(); toast.success("Filter deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSetMembership() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async ({ listId, firmIds, add }: { listId: string; firmIds: string[]; add: boolean }) => {
      for (let i = 0; i < firmIds.length; i += 500) {
        const chunk = firmIds.slice(i, i + 500);
        const { error } = add
          ? await supabase.from("firm_list_members").upsert(chunk.map((firm_id) => ({ list_id: listId, firm_id })), { ignoreDuplicates: true })
          : await supabase.from("firm_list_members").delete().eq("list_id", listId).in("firm_id", chunk);
        if (error) throw error;
      }
    },
    onSuccess: inv,
    onError: (e: Error) => toast.error(e.message),
  });
}

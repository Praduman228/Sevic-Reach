import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useFirmContacts(firmId: string) {
  return useQuery({
    queryKey: ["firm-contacts", firmId],
    queryFn: async () => {
      const { data, error } = await supabase.from("firm_contacts").select("*").eq("firm_id", firmId).order("created_at");
      if (error) throw error;
      return data;
    },
  });
}
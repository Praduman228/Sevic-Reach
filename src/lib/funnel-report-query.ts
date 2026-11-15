import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ReportData } from "./funnel-report";

// Read narrow projections in pages: database row caps must not truncate reports.
async function allRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await fetchPage(from, from + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}
export const funnelReportOptions = queryOptions({
  queryKey: ["funnel-report"], staleTime: 60000,
  queryFn: async (): Promise<ReportData> => {
    const [firms, email, whatsapp, legacy, contactsSequences, tasks, contacts, profiles] = await Promise.all([
      allRows((from, to) => supabase.from("firms").select("*").order("id").range(from, to)),
      allRows((from, to) => supabase.from("email_messages").select("id,firm_id,direction,status,created_at,sent_by,stage").order("id").range(from, to)),
      allRows((from, to) => supabase.from("whatsapp_messages").select("id,firm_id,direction,status,created_at,sent_by,stage").order("id").range(from, to)),
      allRows((from, to) => supabase.from("sequence_messages").select("id,firm_id,stage,step,label,email_status,whatsapp_status,scheduled_at").order("id").range(from, to)),
      allRows((from, to) => supabase.from("contact_sequence_messages").select("id,firm_id,stage,step,label,contact_id,email_status,whatsapp_status,scheduled_at").order("id").range(from, to)),
      allRows((from, to) => supabase.from("tasks").select("id,firm_id,due_at,completed_at").is("completed_at", null).order("id").range(from, to)),
      allRows((from, to) => supabase.from("firm_contacts").select("id,firm_id,name,designation").order("id").range(from, to)),
      allRows((from, to) => supabase.from("profiles").select("id,full_name,email").order("id").range(from, to)),
    ]);
    return { firms, messages: [...email.map((m) => ({ ...m, channel: "email" as const })), ...whatsapp.map((m) => ({ ...m, channel: "whatsapp" as const }))], sequences: [...legacy, ...contactsSequences], tasks, contacts, profiles };
  },
});
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { toast } from "sonner";
import { RotateCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { sendWhatsApp } from "@/lib/whatsapp.functions";

export function WhatsAppChat({ firmId, canSend, reason }: { firmId: string; canSend: boolean; reason?: string }) {
  const qc = useQueryClient();
  const send = useServerFn(sendWhatsApp);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: msgs = [] } = useQuery({
    queryKey: ["wa", firmId],
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_messages").select("*").eq("firm_id", firmId).order("created_at");
      if (error) throw error;
      return data;
    },
  });

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    try { await send({ data: { firmId, text } }); setText(""); toast.success("Sent"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); qc.invalidateQueries({ queryKey: ["wa"] }); }
  }

  async function resend(m: { body: string; phone: string }) {
    // Drop the template footer/button lines that were stored with the rendered message.
    const text = m.body.split(/\n\nThanks Team Shegruh/)[0]?.trim() ?? m.body;
    setBusy(true);
    try { await send({ data: { firmId, text, phones: [m.phone] } }); toast.success("Resent"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); qc.invalidateQueries({ queryKey: ["wa"] }); }
  }

  return (
    <section className="rounded-xl border bg-card">
      <h2 className="border-b px-5 py-3 text-sm font-semibold">WhatsApp</h2>
      <div className="max-h-96 space-y-2 overflow-y-auto px-5 py-4">
        {msgs.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.direction === "out" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className="mt-1 text-[11px] opacity-70">
                {format(new Date(m.created_at), "d MMM, HH:mm")}{m.direction === "out" && ` · ${m.status}`}
                {m.error && ` · ${m.error}`}
              </p>
              {m.direction === "out" && m.status === "failed" && (
                <Button size="sm" variant="secondary" className="mt-2 h-7" disabled={!canSend || busy} onClick={() => resend(m)}>
                  <RotateCw className="mr-1 h-3 w-3" />Resend
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t p-3">
        <Textarea rows={2} placeholder={canSend ? "Type a message…" : reason} disabled={!canSend || busy} value={text} onChange={(e) => setText(e.target.value)} />
        <Button onClick={submit} disabled={!canSend || busy || !text.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
      </div>
    </section>
  );
}

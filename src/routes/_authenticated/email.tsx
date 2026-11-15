import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { emailConfigStatus, sendBulkEmail } from "@/lib/email.functions";
import { STAGES, stageLabel, type Stage } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/email")({
  head: () => ({ meta: [
    {"title": "Bulk email — Sevic Reach"},
    {"name": "description", "content": "Send bulk emails to firms by stage."},
    {"property": "og:title", "content": "Bulk email — Sevic Reach"},
    {"property": "og:description", "content": "Send bulk emails to firms by stage."},
    {"property": "og:type", "content": "website"},
    {"name": "twitter:card", "content": "summary"},
  ] }),
  component: BulkEmail,
});

type FirmRow = { id: string; name: string; contact_name: string | null; email: string; stage: string };

function BulkEmail() {
  const qc = useQueryClient();
  const send = useServerFn(sendBulkEmail);
  const [audience, setAudience] = useState<"all" | Stage>("all");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ sent: number; failed: number; results: { name: string; email: string; ok: boolean; error: string | null }[] } | null>(null);

  const { data: config } = useQuery({ queryKey: ["email", "config"], queryFn: () => emailConfigStatus() });
  const { data: firms = [], isLoading } = useQuery({
    queryKey: ["email", "firms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("firms").select("id, name, contact_name, email, stage").neq("email", "");
      if (error) throw error;
      return data as FirmRow[];
    },
  });
  const { data: log = [] } = useQuery({
    queryKey: ["email", "log"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_messages").select("*, firms(id, name)").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });

  const targets = audience === "all" ? firms : firms.filter((f) => f.stage === audience);
  const preview = targets[0];
  const render = (t: string, name: string | null, studio: string) =>
    t.replaceAll("{{name}}", name?.trim() || "there").replaceAll("{{studio}}", studio);
  const configured = config?.configured ?? false;

  async function submit() {
    if (!subject.trim() || !body.trim()) return;
    setBusy(true);
    setResults(null);
    try {
      const r = await send({ data: { subject, body, stage: audience === "all" ? null : audience } });
      setResults(r);
      if (r.sent > 0) toast.success(`Sent ${r.sent}${r.failed ? `, ${r.failed} failed` : ""}`);
      else if (r.failed > 0) toast.error(`${r.failed} failed`);
      else toast.info("No firms matched");
      qc.invalidateQueries({ queryKey: ["email"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Bulk email</h1>

      {!configured && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            Email sending isn't connected yet — add your Zoho Mail details (client ID, client secret, refresh token, sender email) when ready and this screen will go live automatically. You can draft messages now.
          </p>
        </div>
      )}
      {configured && config?.sender && (
        <p className="text-sm text-muted-foreground">Sending from <span className="font-medium text-foreground">{config.sender}</span> ({config.region})</p>
      )}

      <div className="space-y-3 rounded-xl border bg-card p-5">
        <div>
          <p className="mb-2 text-sm font-medium">Send to</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setAudience("all")} className={`rounded-full border px-3 py-1 text-sm ${audience === "all" ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
              All with email ({firms.length})
            </button>
            {STAGES.map((s) => {
              const n = firms.filter((f) => f.stage === s.id).length;
              return (
                <button key={s.id} onClick={() => setAudience(s.id)} className={`rounded-full border px-3 py-1 text-sm ${audience === s.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
                  {s.label} ({n})
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="subject" className="text-sm font-medium">Subject</label>
            <span className="text-xs text-muted-foreground">Use {'{{name}}'} and {'{{studio}}'} — filled per firm</span>
          </div>
          <Input id="subject" placeholder="Quick question for {{studio}}" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="body" className="text-sm font-medium">Message</label>
            <div className="flex gap-1">
              <button onClick={() => setBody((b) => b + "{{name}}")} className="rounded-md border px-2 py-0.5 text-xs hover:bg-secondary">+ {'{{name}}'}</button>
              <button onClick={() => setBody((b) => b + "{{studio}}")} className="rounded-md border px-2 py-0.5 text-xs hover:bg-secondary">+ {'{{studio}}'}</button>
            </div>
          </div>
          <Textarea id="body" rows={8} placeholder={"Hi {{name}},\n\nSaw {{studio}}'s work — would love to show you how other studios in your space are handling <one-liner>.\n\nWorth a quick call?"} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>

        {preview && (
          <div className="rounded-lg border bg-secondary/50 p-4 text-sm">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Preview for {preview.name}</p>
            <p className="font-medium">{render(subject, preview.contact_name, preview.name)}</p>
            <p className="mt-1 whitespace-pre-wrap">{render(body, preview.contact_name, preview.name)}</p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={submit} disabled={!configured || busy || !subject.trim() || !body.trim() || targets.length === 0}>
            <Send className="mr-2 h-4 w-4" />{busy ? "Sending…" : `Send to ${targets.length} firm${targets.length === 1 ? "" : "s"}`}
          </Button>
          {busy && <span className="text-sm text-muted-foreground">Sending one by one, each firm gets its own copy…</span>}
        </div>
      </div>

      {results && (
        <div className="rounded-xl border bg-card p-5">
          <p className="mb-2 text-sm font-semibold">Last batch — {results.sent} sent, {results.failed} failed</p>
          {results.results.filter((r) => !r.ok).length > 0 && (
            <ul className="space-y-1 text-sm">
              {results.results.filter((r) => !r.ok).map((r) => (
                <li key={r.email} className="text-destructive">{r.name} ({r.email}): {r.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="rounded-xl border bg-card">
        <h2 className="border-b px-5 py-3 text-sm font-semibold">Recent emails</h2>
        {isLoading ? <Skeleton className="m-5 h-40" /> : log.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No emails yet.</p>
        ) : (
          <ul className="divide-y">
            {log.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                {m.firms ? <span className="w-40 truncate font-medium">{m.firms.name}</span> : <span className="w-40 truncate">{m.to_email}</span>}
                <span className="flex-1 truncate text-muted-foreground">{m.subject}</span>
                <Badge variant={m.status === "sent" ? "secondary" : "destructive"}>{m.status}</Badge>
                <span className="w-24 text-right text-xs text-muted-foreground">{format(new Date(m.created_at), "d MMM, HH:mm")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

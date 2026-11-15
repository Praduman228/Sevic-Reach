import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ChevronDown, CornerDownLeft, Mail, MessageCircle, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { checkEmailReplies } from "@/lib/email.functions";
import { stageLabel, type Stage } from "@/lib/crm";
import { cn } from "@/lib/utils";

type Item = {
  id: string; kind: "email" | "wa"; dir: "out" | "in"; at: string; stage: Stage | null;
  subject?: string; body: string; status: string; error: string | null; who: string;
};

const statusText: Record<string, string> = {
  queued: "Queued", submitted: "Submitted", enqueued: "Queued", sent: "Sent", delivered: "Delivered",
  read: "Read", failed: "Failed", received: "Reply received",
};

export function MessageHistory({ firmId }: { firmId: string }) {
  const qc = useQueryClient();
  const check = useServerFn(checkEmailReplies);
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "email" | "wa">("all");

  const { data = [] } = useQuery({
    queryKey: ["history", firmId],
    refetchInterval: 15000,
    queryFn: async (): Promise<Item[]> => {
      const [e, w] = await Promise.all([
        supabase.from("email_messages").select("*").eq("firm_id", firmId),
        supabase.from("whatsapp_messages").select("*").eq("firm_id", firmId),
      ]);
      const items: Item[] = [
        ...(e.data ?? []).map((m) => ({
          id: m.id, kind: "email" as const, dir: m.direction as "out" | "in", at: m.created_at, stage: m.stage,
          subject: m.subject, body: m.body, status: m.status, error: m.error,
          who: m.direction === "in" ? m.from_email ?? "" : m.to_email,
        })),
        ...(w.data ?? []).map((m) => ({
          id: m.id, kind: "wa" as const, dir: m.direction as "out" | "in", at: m.created_at, stage: m.stage,
          body: m.body, status: m.direction === "in" ? "received" : m.status, error: m.error, who: m.phone,
        })),
      ];
      return items.sort((a, b) => b.at.localeCompare(a.at));
    },
  });

  const run = async (quiet: boolean) => {
    setChecking(true);
    try {
      const r = await check({ data: { firmId } });
      if (r.found) qc.invalidateQueries({ queryKey: ["history", firmId] });
      if (!quiet) toast.success(r.found ? `${r.found} new email repl${r.found === 1 ? "y" : "ies"}` : "No new email replies");
    } catch (err) {
      if (!quiet) toast.error((err as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const hasSentEmail = data.some((i) => i.kind === "email" && i.dir === "out" && i.status === "sent");
  useEffect(() => { if (hasSentEmail) void run(true); }, [firmId, hasSentEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = data.filter((i) => filter === "all" || i.kind === filter);
  const replies = data.filter((i) => i.dir === "in").length;

  // Pair each reply with the latest message we sent before it on the same channel (and same address when possible).
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9@.]/g, "").replace(/^\+/, "");
  const asc = [...rows].sort((a, b) => a.at.localeCompare(b.at));
  const threads: { root: Item; replies: Item[]; last: string }[] = [];
  const orphans: Item[] = [];
  for (const m of asc) {
    if (m.dir === "out") { threads.push({ root: m, replies: [], last: m.at }); continue; }
    const same = threads.filter((t) => t.root.kind === m.kind && t.root.at <= m.at);
    const t = [...same].reverse().find((x) => norm(x.root.who) === norm(m.who)) ?? same[same.length - 1];
    if (t) { t.replies.push(m); t.last = m.at; } else orphans.push(m);
  }
  const list = [
    ...threads,
    ...orphans.map((o) => ({ root: o, replies: [] as Item[], last: o.at })),
  ].sort((a, b) => b.last.localeCompare(a.last));

  const Detail = ({ m }: { m: Item }) => (
    <dl className="mb-3 grid grid-cols-[80px_1fr] gap-y-1 text-xs">
      <dt className="text-muted-foreground">{m.dir === "in" ? "From" : "To"}</dt><dd>{m.who}</dd>
      {m.subject && <><dt className="text-muted-foreground">Subject</dt><dd>{m.subject}</dd></>}
      <dt className="text-muted-foreground">Stage</dt><dd>{m.stage ? stageLabel(m.stage) : "—"}</dd>
      <dt className="text-muted-foreground">Status</dt><dd>{statusText[m.status] ?? m.status}</dd>
      <dt className="text-muted-foreground">Time</dt><dd>{format(new Date(m.at), "d MMM yyyy, HH:mm")}</dd>
      {m.error && <><dt className="text-destructive">Error</dt><dd className="text-destructive">{m.error}</dd></>}
    </dl>
  );

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
        <h2 className="text-sm font-semibold">Message history</h2>
        <span className="text-xs text-muted-foreground">{data.length} messages · </span>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", replies ? "bg-success/15 text-success" : "text-muted-foreground")}>
          {replies} repl{replies === 1 ? "y" : "ies"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {(["all", "email", "wa"] as const).map((k) => (
            <Button key={k} size="sm" variant={filter === k ? "secondary" : "ghost"} onClick={() => setFilter(k)}>
              {k === "all" ? "All" : k === "email" ? "Email" : "WhatsApp"}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => run(false)} disabled={checking}>
            <RefreshCw className={cn("mr-1 h-3.5 w-3.5", checking && "animate-spin")} />Check replies
          </Button>
        </div>
      </div>
      {list.length === 0 ? <p className="px-5 py-6 text-sm text-muted-foreground">No messages yet.</p> : (
        <ul className="divide-y">
          {list.map(({ root: m, replies: rs }) => {
            const isOpen = open === m.id;
            const Icon = m.kind === "email" ? Mail : MessageCircle;
            return (
              <li key={m.id} className={cn(rs.length > 0 && "border-l-4 border-l-success")}>
                <button type="button" onClick={() => setOpen(isOpen ? null : m.id)} className="flex w-full items-start gap-3 px-5 py-3 text-left text-sm">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {m.dir === "in"
                        ? <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><CornerDownLeft className="h-3 w-3" />Reply</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Send className="h-3 w-3" />Sent</span>}
                      <span className="font-medium">{m.subject ?? (m.kind === "wa" ? "WhatsApp message" : "")}</span>
                      {m.stage && <Badge variant="outline" className="text-[10px]">{stageLabel(m.stage)}</Badge>}
                      <span className={cn("text-xs", m.status === "failed" ? "text-destructive" : m.status === "read" ? "text-info" : "text-muted-foreground")}>
                        {statusText[m.status] ?? m.status}
                      </span>
                      {rs.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[10px] font-semibold text-success-foreground">
                          <CornerDownLeft className="h-3 w-3" />{rs.length} repl{rs.length === 1 ? "y" : "ies"}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{m.dir === "in" ? "From" : "To"} {m.who}</p>
                    {!isOpen && <p className="mt-1 line-clamp-1 text-muted-foreground">{m.body}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{format(new Date(m.at), "d MMM, HH:mm")}</span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="mx-5 mb-3 rounded-lg border bg-background p-4 text-sm">
                    <Detail m={m} />
                    <div className="whitespace-pre-wrap border-t pt-3 leading-relaxed">{m.body}</div>
                  </div>
                )}
                {rs.length > 0 && (
                  <div className="mb-4 ml-12 mr-5 space-y-2">
                    {rs.map((r) => (
                      <div key={r.id} className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-1 font-semibold text-success">
                            <CornerDownLeft className="h-3 w-3" />Reply to {m.kind === "email" ? `"${m.subject}"` : "your WhatsApp"}
                          </span>
                          <span className="text-muted-foreground">from {r.who}</span>
                          {r.stage && <Badge variant="outline" className="text-[10px]">{stageLabel(r.stage)}</Badge>}
                          <span className="ml-auto text-muted-foreground">{format(new Date(r.at), "d MMM, HH:mm")}</span>
                        </div>
                        {r.subject && r.subject !== m.subject && <p className="mb-1 text-xs font-medium">{r.subject}</p>}
                        <div className="whitespace-pre-wrap leading-relaxed">{r.body}</div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

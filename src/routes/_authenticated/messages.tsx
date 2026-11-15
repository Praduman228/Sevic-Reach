import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, CornerDownLeft, Mail, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { checkEmailReplies } from "@/lib/email.functions";
import { stageLabel, type Stage } from "@/lib/crm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Sevic Reach" },
      { name: "description", content: "Track every email and WhatsApp message sent to firms, with stage and replies." },
      { property: "og:title", content: "Messages — Sevic Reach" },
      { property: "og:description", content: "Email and WhatsApp tracker with replies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Messages,
});

type Row = { id: string; kind: "email" | "wa"; dir: string; at: string; stage: Stage | null; subject?: string; body: string; status: string; who: string; error: string | null; firm: { id: string; name: string } | null };

function Messages() {
  const qc = useQueryClient();
  const check = useServerFn(checkEmailReplies);
  const [checking, setChecking] = useState(false);
  const [kind, setKind] = useState<"all" | "email" | "wa">("all");
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["messages", "all"],
    refetchInterval: 15000,
    queryFn: async (): Promise<Row[]> => {
      const [w, e] = await Promise.all([
        supabase.from("whatsapp_messages").select("*, firms(id, name)").order("created_at", { ascending: false }).limit(200),
        supabase.from("email_messages").select("*, firms(id, name)").order("created_at", { ascending: false }).limit(200),
      ]);
      if (w.error) throw w.error;
      if (e.error) throw e.error;
      return [
        ...w.data.map((r) => ({ id: r.id, kind: "wa" as const, dir: r.direction, at: r.created_at, stage: r.stage, body: r.body, status: r.direction === "in" ? "received" : r.status, who: r.phone, error: r.error, firm: r.firms })),
        ...e.data.map((r) => ({ id: r.id, kind: "email" as const, dir: r.direction, at: r.created_at, stage: r.stage, subject: r.subject, body: r.body, status: r.status, who: r.direction === "in" ? r.from_email ?? "" : r.to_email, error: r.error, firm: r.firms })),
      ].sort((a, b) => b.at.localeCompare(a.at));
    },
  });

  const runCheck = async () => {
    setChecking(true);
    try {
      const r = await check({ data: {} });
      qc.invalidateQueries({ queryKey: ["messages", "all"] });
      toast.success(r.found ? `${r.found} new email replies` : "No new email replies");
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setChecking(false); }
  };

  if (isLoading) return <Skeleton className="h-96" />;
  const all = data ?? [];
  const rows = all.filter((r) => kind === "all" || r.kind === kind);
  const out = rows.filter((r) => r.dir === "out");
  const count = (s: string[]) => out.filter((r) => s.includes(r.status)).length;
  const repliedFirms = new Set(rows.filter((r) => r.dir === "in" && r.firm).map((r) => r.firm!.id));
  const stats = [
    { label: "Sent", v: out.length },
    { label: "Delivered", v: count(["delivered", "read"]) },
    { label: "Read", v: count(["read"]) },
    { label: "Failed", v: count(["failed"]) },
    { label: "Replies", v: rows.filter((r) => r.dir === "in").length },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-3xl font-semibold">Messages</h1>
        <div className="ml-auto flex gap-1">
          {(["all", "email", "wa"] as const).map((k) => (
            <Button key={k} size="sm" variant={kind === k ? "secondary" : "ghost"} onClick={() => setKind(k)}>{k === "all" ? "All" : k === "email" ? "Email" : "WhatsApp"}</Button>
          ))}
          <Button size="sm" variant="outline" onClick={runCheck} disabled={checking}><RefreshCw className={cn("mr-1 h-3.5 w-3.5", checking && "animate-spin")} />Check email replies</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((s) => <div key={s.label} className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">{s.label}</p><p className="text-2xl font-semibold">{s.v}</p></div>)}
      </div>
      <div className="rounded-xl border bg-card">
        {rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No messages yet. Send one from a firm's page.</p> : (
          <ul className="divide-y">
            {rows.map((r) => {
              const Icon = r.kind === "email" ? Mail : MessageCircle;
              const isOpen = open === r.id;
              return (
                <li key={r.id} className={cn(r.dir === "in" && "bg-success/5")}>
                  <div className="flex cursor-pointer items-center gap-3 px-5 py-3 text-sm" onClick={() => setOpen(isOpen ? null : r.id)}>
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="w-12 text-xs">{r.dir === "in" ? <span className="inline-flex items-center gap-1 text-success"><CornerDownLeft className="h-3 w-3" />Reply</span> : <span className="text-muted-foreground">Sent</span>}</span>
                    {r.firm ? <Link to="/firms/$id" params={{ id: r.firm.id }} onClick={(e) => e.stopPropagation()} className="w-40 truncate font-medium hover:text-primary">{r.firm.name}</Link> : <span className="w-40 truncate">{r.who}</span>}
                    {r.stage ? <Badge variant="outline" className="hidden text-[10px] sm:inline-flex">{stageLabel(r.stage)}</Badge> : null}
                    <span className="flex-1 truncate text-muted-foreground">{r.subject ? <span className="text-foreground">{r.subject} — </span> : null}{r.body}</span>
                    {r.dir === "out" && r.firm && repliedFirms.has(r.firm.id) && <span className="hidden text-xs text-success sm:inline">replied</span>}
                    <span className={cn("text-xs", r.status === "failed" ? "text-destructive" : r.status === "read" ? "text-info" : "")}>{r.status}</span>
                    <span className="w-24 text-right text-xs text-muted-foreground">{format(new Date(r.at), "d MMM, HH:mm")}</span>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                  </div>
                  {isOpen && (
                    <div className="mx-5 mb-4 rounded-lg border bg-background p-4 text-sm">
                      <p className="mb-2 text-xs text-muted-foreground">{r.dir === "in" ? "From" : "To"} {r.who}{r.stage ? ` · ${stageLabel(r.stage)} stage` : ""}{r.error ? ` · ${r.error}` : ""}</p>
                      <div className="whitespace-pre-wrap leading-relaxed">{r.body}</div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

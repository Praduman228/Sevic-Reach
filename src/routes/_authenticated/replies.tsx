import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { Mail, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { checkEmailReplies } from "@/lib/email.functions";
import { stageLabel, type Stage } from "@/lib/crm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/replies")({
  head: () => ({
    meta: [
      { title: "Replies — Sevic Reach" },
      { name: "description", content: "Every email and WhatsApp reply from firms in one live inbox." },
      { property: "og:title", content: "Replies — Sevic Reach" },
      { property: "og:description", content: "Live inbox of email and WhatsApp replies from firms." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Replies,
});

const SEEN_KEY = "replies:lastSeen";
type Row = { id: string; kind: "email" | "wa"; at: string; stage: Stage | null; subject?: string; body: string; who: string; firm: { id: string; name: string } | null; replyTo: { at: string; subject?: string; body: string } | null };

function FullText({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(true);
  const t = text.replace(/\s+$/, "");
  const lines = t.split("\n");
  const long = t.length > 700 || lines.length > 10;
  return (
    <div>
      <p className={cn("whitespace-pre-wrap break-words", open || !long ? "" : "line-clamp-5", className)}>{t}</p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-xs font-medium text-primary hover:underline"
        >
          {open ? "Show less" : "Show full message"}
        </button>
      )}
    </div>
  );
}

function Replies() {
  const qc = useQueryClient();
  const check = useServerFn(checkEmailReplies);
  const [checking, setChecking] = useState(false);
  const [kind, setKind] = useState<"all" | "email" | "wa">("all");
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    setLastSeen(localStorage.getItem(SEEN_KEY) ?? "1970-01-01");
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["replies"],
    refetchInterval: 10000,
    queryFn: async (): Promise<Row[]> => {
      const [w, e, wo, eo] = await Promise.all([
        supabase.from("whatsapp_messages").select("id, created_at, stage, body, phone, firm_id, firms(id, name)").eq("direction", "in").order("created_at", { ascending: false }).limit(300),
        supabase.from("email_messages").select("id, created_at, stage, subject, body, from_email, to_email, firm_id, firms(id, name)").eq("direction", "in").order("created_at", { ascending: false }).limit(300),
        supabase.from("whatsapp_messages").select("created_at, body, phone, firm_id").eq("direction", "out").order("created_at", { ascending: false }).limit(1000),
        supabase.from("email_messages").select("created_at, subject, body, to_email, firm_id").eq("direction", "out").order("created_at", { ascending: false }).limit(1000),
      ]);
      for (const r of [w, e, wo, eo]) if (r.error) throw r.error;
      const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^0-9a-z@.]/g, "");
      const match = <T extends { created_at: string; firm_id: string | null }>(outs: T[], firmId: string | null, at: string, addr: (o: T) => string, who: string) => {
        const before = outs.filter((o) => o.firm_id && o.firm_id === firmId && o.created_at <= at);
        return before.find((o) => norm(addr(o)) === norm(who)) ?? before[0] ?? null;
      };
      return [
        ...w.data!.map((r) => {
          const o = match(wo.data!, r.firm_id, r.created_at, (x) => x.phone, r.phone);
          return { id: r.id, kind: "wa" as const, at: r.created_at, stage: r.stage, body: r.body, who: r.phone, firm: r.firms, replyTo: o ? { at: o.created_at, body: o.body } : null };
        }),
        ...e.data!.map((r) => {
          const who = r.from_email ?? r.to_email ?? "";
          const o = match(eo.data!, r.firm_id, r.created_at, (x) => x.to_email, who);
          return { id: r.id, kind: "email" as const, at: r.created_at, stage: r.stage, subject: r.subject, body: r.body, who, firm: r.firms, replyTo: o ? { at: o.created_at, subject: o.subject, body: o.body } : null };
        }),
      ].sort((a, b) => b.at.localeCompare(a.at));
    },
  });

  const runCheck = async (silent = false) => {
    setChecking(true);
    try {
      const r = await check({ data: {} });
      qc.invalidateQueries({ queryKey: ["replies"] });
      if (!silent || r.found) toast.success(r.found ? `${r.found} new email replies` : "No new email replies");
    } catch (err) {
      if (!silent) toast.error(err instanceof Error ? err.message : "Could not check email");
    } finally {
      setChecking(false);
    }
  };

  // Check the Zoho inbox on open and every 2 minutes while the tab is open.
  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false; runCheck(true); }
    const t = setInterval(() => runCheck(true), 120000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = (data ?? []).filter((r) => kind === "all" || r.kind === kind);
  const newCount = lastSeen ? (data ?? []).filter((r) => r.at > lastSeen).length : 0;

  const markSeen = () => {
    const now = new Date().toISOString();
    localStorage.setItem(SEEN_KEY, now);
    setLastSeen(now);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Replies</h1>
          <p className="text-sm text-muted-foreground">New replies appear here on their own as they come in.</p>
        </div>
        <div className="flex gap-2">
          {newCount > 0 && <Button variant="outline" size="sm" onClick={markSeen}>Mark all read ({newCount})</Button>}
          <Button size="sm" onClick={() => runCheck(false)} disabled={checking}>
            <RefreshCw className={cn("mr-1.5 h-4 w-4", checking && "animate-spin")} /> Check now
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        {(["all", "email", "wa"] as const).map((k) => (
          <Button key={k} size="sm" variant={kind === k ? "secondary" : "ghost"} onClick={() => setKind(k)}>
            {k === "all" ? "All" : k === "email" ? "Email" : "WhatsApp"}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No replies yet. They'll show up here as soon as a firm answers.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const isNew = !!lastSeen && r.at > lastSeen;
            return (
              <li key={r.kind + r.id} className={cn("rounded-lg border p-4", isNew ? "border-primary/50 bg-primary/5" : "bg-card")}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {r.kind === "email" ? <Mail className="h-4 w-4 text-muted-foreground" /> : <MessageCircle className="h-4 w-4 text-muted-foreground" />}
                  {r.firm ? (
                    <Link to="/firms/$id" params={{ id: r.firm.id }} className="font-medium hover:underline">{r.firm.name}</Link>
                  ) : <span className="font-medium">Unknown firm</span>}
                  <span className="text-muted-foreground">{r.who}</span>
                  {r.stage && <Badge variant="outline">{stageLabel(r.stage)}</Badge>}
                  {isNew && <Badge>New</Badge>}
                  <span className="ml-auto text-xs text-muted-foreground" title={format(new Date(r.at), "d MMM yyyy, HH:mm")}>
                    {formatDistanceToNow(new Date(r.at), { addSuffix: true })}
                  </span>
                </div>
                {r.replyTo ? (
                  <div className="mt-3 rounded-md border-l-4 border-muted-foreground/30 bg-muted/50 px-3 py-2 text-xs">
                    <p className="font-medium text-muted-foreground">
                      Reply to your {r.kind === "email" ? "email" : "WhatsApp"} · {format(new Date(r.replyTo.at), "d MMM, HH:mm")}
                    </p>
                    {r.replyTo.subject && <p className="mt-1 font-medium">{r.replyTo.subject}</p>}
                    <FullText text={r.replyTo.body} className="mt-0.5 text-muted-foreground" />
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">Reply to: no earlier message found</p>
                )}
                <div className="mt-2 rounded-md border-l-4 border-success bg-success/10 px-3 py-2">
                  {r.subject && <p className="text-sm font-medium">{r.subject}</p>}
                  <FullText text={r.body} className="mt-0.5 text-sm" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

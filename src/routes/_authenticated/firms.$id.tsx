import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Activity, ArrowLeft, Check, FileSearch, History, ListTodo, Mail, MessageCircle, Pencil, Phone, Send, Tags, UserRound } from "lucide-react";
import { ListPicker } from "@/components/crm/ListPicker";
import { useLists } from "@/lib/lists";

function FirmLists({ firmId }: { firmId: string }) {
  const { data } = useLists();
  const mine = (data ?? []).filter((l) => l.firmIds.includes(firmId));
  if (!mine.length) return null;
  return <div className="mt-2 flex flex-wrap gap-1">{mine.map((l) => <Badge key={l.id} variant="outline">{l.name}</Badge>)}</div>;
}
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { FirmDialog } from "@/components/crm/FirmDialog";
import { FirmContacts } from "@/components/crm/FirmContacts";
import { InstagramProfile } from "@/components/crm/InstagramProfile";
import { InstagramPosts } from "@/components/crm/InstagramPosts";
import { LeadStatusBadge } from "@/components/crm/LeadStatusBadge";
import { WhatsAppChat } from "@/components/crm/WhatsAppChat";
import { ResearchBrief } from "@/components/crm/ResearchBrief";
import { StageMessage } from "@/components/crm/StageMessage";
import { MessageHistory } from "@/components/crm/MessageHistory";
import { AddFollowUp } from "@/components/crm/AddFollowUp";
import { StageSequence } from "@/components/crm/StageSequence";
import { daysSince, stageLabel, type Firm } from "@/lib/crm";
import { useCompleteTask } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/firms/$id")({
  head: () => ({ meta: [
    {"title": "Firm — Sevic Reach"},
    {"name": "description", "content": "Research architecture firms, draft personalised messages and track follow-ups and replies."},
    {"property": "og:title", "content": "Firm — Sevic Reach"},
    {"property": "og:description", "content": "Research architecture firms, draft personalised messages and track follow-ups and replies."},
    {"property": "og:type", "content": "website"},
    {"name": "twitter:card", "content": "summary"},
  ] }),
  component: FirmPage,
});

const FIRM_SECTIONS = [
  { id: "overview", label: "Overview", icon: UserRound },
  { id: "followups", label: "Lead follow-ups", icon: ListTodo },
  { id: "instagram", label: "Instagram posts", icon: MessageCircle },
  { id: "compose", label: "Compose message", icon: Send },
  { id: "research", label: "Research brief", icon: FileSearch },
  { id: "history", label: "Message history", icon: History },
  { id: "whatsapp", label: "WhatsApp chat", icon: MessageCircle },
  { id: "tasks", label: "Team tasks", icon: Check },
  { id: "activity", label: "Activity", icon: Activity },
] as const;
type FirmSection = typeof FIRM_SECTIONS[number]["id"];

function FirmPage() {
  const { id } = Route.useParams();
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState<FirmSection>("overview");
  const complete = useCompleteTask();
  const { data, isLoading } = useQuery({
    queryKey: ["firm", id],
    queryFn: async () => {
      const [firm, tasks, events, emails] = await Promise.all([
        supabase.from("firms").select("*").eq("id", id).maybeSingle(),
        supabase.from("tasks").select("*").eq("firm_id", id).order("due_at"),
        supabase.from("firm_events").select("*").eq("firm_id", id).order("created_at", { ascending: false }),
        supabase.from("email_messages").select("*").eq("firm_id", id).order("created_at", { ascending: false }),
      ]);
      if (firm.error) throw firm.error;
      return { firm: firm.data as Firm | null, tasks: tasks.data ?? [], events: events.data ?? [], emails: emails.data ?? [] };
    },
  });
  useEffect(() => {
    if (!data?.firm) return;
    const updateSection = () => {
      let current: FirmSection = "overview";
      for (const item of FIRM_SECTIONS) {
        const element = document.getElementById(`firm-panel-${item.id}`);
        if (element && element.getBoundingClientRect().top <= 120) current = item.id;
      }
      setSection(current);
    };
    window.addEventListener("scroll", updateSection, { passive: true });
    updateSection();
    return () => window.removeEventListener("scroll", updateSection);
  }, [data?.firm?.id]);

  const scrollToSection = (target: FirmSection) => {
    setSection(target);
    document.getElementById(`firm-panel-${target}`)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "start",
    });
  };
  if (isLoading) return <Skeleton className="h-96" />;
  if (!data?.firm) return <p className="text-muted-foreground">Firm not found.</p>;
  const f = data.firm;
  const open = data.tasks.filter((t) => !t.completed_at);

  return (
    <div className="space-y-6">
      <Link to="/board" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Pipeline</Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-0 basis-full sm:basis-auto sm:flex-1">
          <h1 className="break-words text-3xl font-semibold">{f.name}</h1>
          <p className="mt-1 text-muted-foreground">{[f.city, f.state, f.team_size && `${f.team_size} people`, f.source].filter(Boolean).join(" · ")}</p>
          <FirmLists firmId={f.id} />
        </div>
        <LeadStatusBadge status={f.lead_status} />
        <Badge variant={f.stage === "lost" ? "destructive" : "default"} className="text-sm">{stageLabel(f.stage)} · {daysSince(f.stage_entered_at)}d</Badge>
        <ListPicker firmIds={[f.id]} trigger={<Button variant="outline"><Tags className="mr-1 h-4 w-4" />Custom filters</Button>} />
        <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="mr-1 h-4 w-4" />Edit</Button>
      </div>

      <div className="grid items-start gap-6 sm:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="min-w-0 sm:sticky sm:top-20">
          <nav aria-label="Firm sections" className="flex gap-1 overflow-x-auto border-b pb-3 sm:flex-col sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4">
            {FIRM_SECTIONS.map((item) => (
              <Button key={item.id} id={`firm-tab-${item.id}`} aria-current={section === item.id ? "location" : undefined} aria-controls={`firm-panel-${item.id}`} variant={section === item.id ? "secondary" : "ghost"} onClick={() => scrollToSection(item.id)} className={`shrink-0 justify-start sm:w-full ${section === item.id ? "text-primary" : "text-muted-foreground"}`}>
                <item.icon />{item.label}
              </Button>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 space-y-10 [&>div]:scroll-mt-24">
        <div role="region" id="firm-panel-overview" aria-labelledby="firm-tab-overview">
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Overview</h2>
          <div className="space-y-3 border-y py-5">
          <h3 className="text-sm font-semibold text-muted-foreground">Contact details</h3>
          <p className="font-medium">{f.contact_name ?? "—"}</p>
          {f.phone && <p className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" />{f.phone}</p>}
          {f.email && <p className="flex items-center gap-2 break-all text-sm"><Mail className="h-4 w-4 shrink-0 text-muted-foreground" />{f.email}</p>}
          <p className="flex items-center gap-2 text-sm">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            {f.whatsapp_opt_in ? `Opted in ${f.whatsapp_opt_in_at ? format(new Date(f.whatsapp_opt_in_at), "d MMM yyyy") : ""}` : "No WhatsApp opt-in"}
          </p>
          {f.lost_reason && <p className="text-sm text-destructive">Lost: {f.lost_reason}</p>}
          </div>
          <InstagramProfile firmId={f.id} value={f.instagram ?? null} />
          <FirmContacts firmId={f.id} />
          {f.notes && <div className="space-y-2"><h3 className="text-sm font-semibold text-muted-foreground">Notes</h3><p className="whitespace-pre-wrap break-words text-sm">{f.notes}</p></div>}
        </section>
        </div>

        <div role="region" id="firm-panel-followups" aria-labelledby="firm-tab-followups">
          <StageSequence key={f.stage} firm={f} />
        </div>
        <div role="region" id="firm-panel-instagram" aria-labelledby="firm-tab-instagram">
          <InstagramPosts key={f.instagram} firmId={f.id} handle={f.instagram ?? null} />
        </div>
        <div role="region" id="firm-panel-compose" aria-labelledby="firm-tab-compose">
          <StageMessage firm={f} />
        </div>
        <div role="region" id="firm-panel-research" aria-labelledby="firm-tab-research">
          <ResearchBrief firm={f} />
        </div>
        <div role="region" id="firm-panel-history" aria-labelledby="firm-tab-history">
          <MessageHistory firmId={f.id} />
        </div>
        <div role="region" id="firm-panel-whatsapp" aria-labelledby="firm-tab-whatsapp">
          <WhatsAppChat firmId={f.id} canSend={!!f.phone && f.whatsapp_opt_in} reason={!f.phone ? "Add a phone number to send WhatsApp" : "Turn on WhatsApp opt-in to send"} />
        </div>
        <div role="region" id="firm-panel-tasks" aria-labelledby="firm-tab-tasks">
        <section>
          <h2 className="border-b pb-4 text-xl font-semibold">Team tasks <span className="text-sm font-normal text-muted-foreground">({open.length})</span></h2>
          {open.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No open team tasks.</p> : (
            <ul className="divide-y">
              {open.map((t) => {
                const late = new Date(t.due_at) < new Date();
                return (
                  <li key={t.id} className="flex items-center gap-3 py-3">
                    <Button size="icon" variant="outline" onClick={() => complete.mutate(t.id)} disabled={complete.isPending} aria-label="Mark done" className="h-7 w-7 shrink-0 hover:border-success hover:bg-success hover:text-success-foreground"><Check /></Button>
                    <span className="min-w-0 flex-1 break-words text-sm">{t.title}</span>
                    <span className={`text-xs ${late ? "text-destructive" : "text-muted-foreground"}`}>{format(new Date(t.due_at), "d MMM")}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <AddFollowUp firmId={f.id} stage={f.stage} />
        </section>
        </div>
        <div role="region" id="firm-panel-activity" aria-labelledby="firm-tab-activity">
      <section>
        <h2 className="mb-4 border-b pb-4 text-xl font-semibold">Activity</h2>
        {data.events.length === 0 ? <p className="text-sm text-muted-foreground">No activity yet.</p> : (
          <ul className="space-y-2">
            {data.events.map((e) => (
              <li key={e.id} className="break-words text-sm"><span className="text-muted-foreground">{format(new Date(e.created_at), "d MMM, HH:mm")}</span> — {e.detail}</li>
            ))}
          </ul>
        )}
      </section>
        </div>
        </div>
      </div>
      <FirmDialog open={editing} onOpenChange={setEditing} firm={f} />
    </div>
  );
}

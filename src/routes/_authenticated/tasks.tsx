import { createFileRoute, Link } from "@tanstack/react-router";
import { format, isToday } from "date-fns";
import { Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { stageLabel } from "@/lib/crm";
import { useCompleteTask, useOpenTasks, type TaskWithFirm } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({ meta: [
    {"title": "Team follow-ups — Sevic Reach"},
    {"name": "description", "content": "Track the team's due, overdue and upcoming follow-up tasks for architecture firms."},
    {"property": "og:title", "content": "Team follow-ups — Sevic Reach"},
    {"property": "og:description", "content": "Track the team's due, overdue and upcoming follow-up tasks for architecture firms."},
    {"property": "og:type", "content": "website"},
    {"name": "twitter:card", "content": "summary"},
  ] }),
  component: Tasks,
});

function Tasks() {
  const { data, isLoading } = useOpenTasks();
  if (isLoading || !data) return <Skeleton className="h-96" />;
  const now = new Date();
  const overdue = data.filter((t) => new Date(t.due_at) < now && !isToday(new Date(t.due_at)));
  const today = data.filter((t) => isToday(new Date(t.due_at)));
  const upcoming = data.filter((t) => new Date(t.due_at) > now && !isToday(new Date(t.due_at))).slice(0, 15);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Team follow-ups</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Queue title="Overdue" tone="destructive" tasks={overdue} />
        <Queue title="Due today" tone="primary" tasks={today} />
      </div>
      <Queue title="Coming up" tone="muted" tasks={upcoming} />
    </div>
  );
}

function Queue({ title, tasks, tone }: { title: string; tasks: TaskWithFirm[]; tone: "destructive" | "primary" | "muted" }) {
  const complete = useCompleteTask();
  const dot = tone === "destructive" ? "bg-destructive" : tone === "primary" ? "bg-primary" : "bg-muted-foreground";
  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="ml-auto text-xs text-muted-foreground">{tasks.length}</span>
      </header>
      {tasks.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing here. Nice.</p>
      ) : (
        <ul className="divide-y">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3">
              <button
                onClick={() => complete.mutate(t.id)}
                aria-label="Mark done"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:border-success hover:bg-success hover:text-success-foreground"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.title}</p>
                {t.firms && (
                  <Link to="/firms/$id" params={{ id: t.firms.id }} className="text-xs text-muted-foreground hover:text-primary">
                    {t.firms.name} · {stageLabel(t.firms.stage)}
                  </Link>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{format(new Date(t.due_at), "d MMM")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

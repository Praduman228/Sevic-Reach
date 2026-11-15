import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import {
  Columns3,
  Filter,
  Inbox,
  ListTodo,
  LogOut,
  Megaphone,
  ShieldCheck,
  Tags,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { processCampaigns } from "@/lib/campaigns.functions";
import { fetchUserRole, useCurrentUserRole } from "@/lib/auth-role";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const roleInfo = await fetchUserRole(data.user.id);
    return { user: data.user, isAdmin: roleInfo.isAdmin, role: roleInfo.role };
  },
  component: Shell,
});

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

const NAV: readonly NavItem[] = [
  { to: "/board", label: "Pipeline", icon: Columns3 },
  { to: "/funnel", label: "Funnel", icon: Filter },
  { to: "/tasks", label: "Team follow-ups", icon: ListTodo },
  { to: "/replies", label: "Replies", icon: Inbox },
  { to: "/campaign", label: "Campaign", icon: Megaphone },
  { to: "/filters", label: "Tags", icon: Tags },
  { to: "/admin", label: "Admin", icon: ShieldCheck, adminOnly: true },
] as const;

/** While anyone on the team has the app open, advance running campaigns about once a minute. */
function useCampaignRunner() {
  const run = useServerFn(processCampaigns);
  const qc = useQueryClient();
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (busy) return;
      const { count } = await supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "running");
      if (!count) return;
      busy = true;
      try { await run({ data: {} }); qc.invalidateQueries({ queryKey: ["campaign"] }); qc.invalidateQueries({ queryKey: ["campaigns"] }); }
      catch (e) { console.warn("campaign step failed", e); }
      finally { busy = false; }
    };
    const t = setInterval(tick, 30000);
    tick();
    return () => clearInterval(t);
  }, [run, qc]);
}

function Shell() {
  const context = Route.useRouteContext();
  const user = context.user;
  const qc = useQueryClient();
  const navigate = useNavigate();
  useCampaignRunner();

  const { data: roleInfo } = useCurrentUserRole(user?.id);
  const isAdmin = roleInfo?.isAdmin ?? context.isAdmin ?? false;
  const visibleNav = NAV.filter((n) => !n.adminOnly || isAdmin);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 lg:gap-6">
          <Link to="/board" className="font-display text-lg font-semibold">
            Sevic Reach<span className="text-primary">.</span>
          </Link>
          <nav className="hidden gap-1 md:flex">
            {visibleNav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground lg:px-3"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm text-muted-foreground xl:inline">{user.email}</span>
            <button onClick={signOut} aria-label="Sign out" className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t bg-background md:hidden">
        {visibleNav.map((n) => (
          <Link
            key={n.to}
            to={n.to}
             className="flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 px-1 py-2.5 text-center text-xs text-muted-foreground"
            activeProps={{ className: "text-primary" }}
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

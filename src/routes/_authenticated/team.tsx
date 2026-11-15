import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { addTeamMember, removeTeamMember, resetMemberPassword } from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team — Sevic Reach" },
      { name: "description", content: "Add and remove sales team members." },
      { property: "og:title", content: "Team — Sevic Reach" },
      { property: "og:description", content: "Add and remove sales team members." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, created_at").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (p.error) throw p.error;
      const roles = r.data ?? [];
      return {
        isAdmin: roles.some((x) => x.user_id === user.id && x.role === "admin"),
        members: (p.data ?? []).map((m) => ({ ...m, role: roles.find((x) => x.user_id === m.id)?.role ?? "sales" })),
      };
    },
  });
  const add = useServerFn(addTeamMember);
  const remove = useServerFn(removeTeamMember);
  const reset = useServerFn(resetMemberPassword);
  const [f, setF] = useState({ fullName: "", email: "", password: "", role: "sales" as "admin" | "sales" });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await add({ data: f });
      toast.success(`${f.email} added — share the password with them`);
      setF({ fullName: "", email: "", password: "", role: "sales" });
      qc.invalidateQueries({ queryKey: ["team"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err) { toast.error((err as Error).message); }
    setBusy(false);
  }

  if (data && !data.isAdmin) return <p className="text-muted-foreground">Only an admin can manage the team.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-sm text-muted-foreground">Add people with an email and password. They sign in with those — nobody can create their own account.</p>
      </div>
      <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-card p-5 sm:grid-cols-5">
        <div className="space-y-1.5"><Label>Name</Label><Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Email</Label><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Password</Label><Input type="text" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Role</Label>
          <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v as "admin" | "sales" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="sales">Sales</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="flex items-end"><Button type="submit" className="w-full" disabled={busy}><UserPlus className="mr-1 h-4 w-4" />{busy ? "Adding…" : "Add member"}</Button></div>
      </form>
      <ul className="divide-y rounded-xl border bg-card">
        {data?.members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="mr-auto">
              <p className="font-medium">{m.full_name || m.email}</p>
              <p className="text-xs text-muted-foreground">{m.email}</p>
            </div>
            <Badge variant={m.role === "admin" ? "default" : "secondary"}>{m.role}</Badge>
            <Button size="sm" variant="ghost" onClick={async () => {
              const pw = prompt(`New password for ${m.email} (min 8 characters)`);
              if (!pw) return;
              try { await reset({ data: { userId: m.id, password: pw } }); toast.success("Password changed"); } catch (err) { toast.error((err as Error).message); }
            }}><KeyRound className="mr-1 h-4 w-4" />Password</Button>
            {m.id !== user.id && (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
                if (!confirm(`Remove ${m.email}? They will no longer be able to sign in.`)) return;
                try { await remove({ data: { userId: m.id } }); toast.success("Removed"); qc.invalidateQueries({ queryKey: ["team"] }); } catch (err) { toast.error((err as Error).message); }
              }}><Trash2 className="mr-1 h-4 w-4" />Remove</Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

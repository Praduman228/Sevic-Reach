import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useCreateList, useDeleteList, useLists } from "@/lib/lists";

export const Route = createFileRoute("/_authenticated/filters")({
  head: () => ({ meta: [
    {"title": "Custom filters — Sevic Reach"},
    {"name": "description", "content": "Organize architecture firms into shared custom tags."},
    {"property": "og:title", "content": "Custom filters — Sevic Reach"},
    {"property": "og:description", "content": "Organize architecture firms into shared custom tags."},
    {"property": "og:type", "content": "website"},
    {"name": "twitter:card", "content": "summary"},
  ] }),
  component: FiltersLayout,
});

function FiltersLayout() {
  const match = useMatchRoute();
  if (match({ to: "/filters/$listId", fuzzy: true })) return <Outlet />;
  return <FiltersGrid />;
}

function useRenameList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("firm_lists").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lists"] }); toast.success("Filter renamed"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

function FiltersGrid() {
  const { data: lists, isLoading } = useLists();
  const create = useCreateList();
  const del = useDeleteList();
  const rename = useRenameList();
  const [name, setName] = useState("");
  const add = () => { const n = name.trim(); if (n) create.mutate(n, { onSuccess: () => setName("") }); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-3xl font-semibold">Custom filters</h1>
          <p className="text-muted-foreground">Group firms your way. Open a filter to see its firms.</p>
        </div>
        <div className="flex gap-2">
          <Input className="w-56" placeholder="New filter name…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Button onClick={add} disabled={!name.trim() || create.isPending}><Plus className="mr-1 h-4 w-4" />Create</Button>
        </div>
      </div>
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : (lists ?? []).length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No custom filters yet. Create one above.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(lists ?? []).map((l) => (
            <div key={l.id} className="group relative rounded-xl border bg-card p-5 transition-colors hover:border-primary">
              <Link to="/filters/$listId" params={{ listId: l.id }} className="block">
                <Tags className="mb-3 h-5 w-5 text-primary" />
                <p className="truncate pr-16 font-semibold">{l.name}</p>
                <p className="text-sm text-muted-foreground">{l.firmIds.length} firm{l.firmIds.length === 1 ? "" : "s"}</p>
              </Link>
              <div className="absolute right-3 top-3 flex gap-1">
                <button aria-label={`Rename ${l.name}`} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => { const n = prompt("Rename filter", l.name)?.trim(); if (n && n !== l.name) rename.mutate({ id: l.id, name: n }); }}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button aria-label={`Delete ${l.name}`} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                  onClick={() => confirm(`Delete filter "${l.name}"? Firms stay in your pipeline.`) && del.mutate(l.id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

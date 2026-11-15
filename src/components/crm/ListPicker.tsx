import { useState, type ReactNode } from "react";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCreateList, useDeleteList, useLists, useSetMembership } from "@/lib/lists";

/** Add/remove the given firms to custom filters; create new filters inline. */
export function ListPicker({ firmIds, trigger }: { firmIds: string[]; trigger: ReactNode }) {
  const { data: lists } = useLists();
  const create = useCreateList();
  const setM = useSetMembership();
  const [name, setName] = useState("");

  function toggle(listId: string, allIn: boolean) {
    setM.mutate({ listId, firmIds, add: !allIn }, {
      onSuccess: () => toast.success(allIn ? `Removed ${firmIds.length} firm(s)` : `Added ${firmIds.length} firm(s)`),
    });
  }

  async function add() {
    const n = name.trim();
    if (!n) return;
    const id = await create.mutateAsync(n);
    setName("");
    if (firmIds.length) setM.mutate({ listId: id, firmIds, add: true });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <p className="px-1 pb-2 text-xs text-muted-foreground">Custom filters{firmIds.length > 1 ? ` · ${firmIds.length} selected` : ""}</p>
        <div className="max-h-60 space-y-0.5 overflow-auto">
          {(lists ?? []).length === 0 && <p className="px-1 py-2 text-sm text-muted-foreground">No custom filters yet.</p>}
          {(lists ?? []).map((l) => {
            const n = firmIds.filter((id) => l.firmIds.includes(id)).length;
            const allIn = firmIds.length > 0 && n === firmIds.length;
            return (
              <button key={l.id} disabled={!firmIds.length || setM.isPending} onClick={() => toggle(l.id, allIn)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50">
                <span className="flex h-4 w-4 items-center justify-center rounded border">
                  {allIn ? <Check className="h-3 w-3" /> : n > 0 ? <Minus className="h-3 w-3" /> : null}
                </span>
                <span className="flex-1 truncate">{l.name}</span>
                <span className="text-xs text-muted-foreground">{l.firmIds.length}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex gap-1 border-t pt-2">
          <Input className="h-8" placeholder="New filter name…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Button size="sm" className="h-8" onClick={add} disabled={!name.trim() || create.isPending} aria-label="Create filter"><Plus className="h-4 w-4" /></Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Manage (create/delete) custom filters. */
export function ManageLists({ trigger }: { trigger: ReactNode }) {
  const { data: lists } = useLists();
  const create = useCreateList();
  const del = useDeleteList();
  const [name, setName] = useState("");
  const add = () => { const n = name.trim(); if (n) create.mutate(n, { onSuccess: () => setName("") }); };
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <p className="px-1 pb-2 text-xs text-muted-foreground">Custom filters</p>
        <div className="max-h-60 space-y-0.5 overflow-auto">
          {(lists ?? []).length === 0 && <p className="px-1 py-2 text-sm text-muted-foreground">None yet.</p>}
          {(lists ?? []).map((l) => (
            <div key={l.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent">
              <span className="flex-1 truncate">{l.name}</span>
              <span className="text-xs text-muted-foreground">{l.firmIds.length}</span>
              <button aria-label={`Delete ${l.name}`} className="text-muted-foreground hover:text-destructive"
                onClick={() => confirm(`Delete filter "${l.name}"? Firms stay in your pipeline.`) && del.mutate(l.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1 border-t pt-2">
          <Input className="h-8" placeholder="New filter name…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Button size="sm" className="h-8" onClick={add} disabled={!name.trim()} aria-label="Create filter"><Plus className="h-4 w-4" /></Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

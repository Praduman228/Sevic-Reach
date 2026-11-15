import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Columns3, FoldVertical, List, MapPin, MessageCircle, Plus, Tags, Upload, UserRound, Users, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePipelinePreferences, type PipelinePreferences } from "@/lib/pipeline-preferences";
import { Checkbox } from "@/components/ui/checkbox";
import { ListPicker, ManageLists } from "@/components/crm/ListPicker";
import { useLists } from "@/lib/lists";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FirmDialog } from "@/components/crm/FirmDialog";
import { LeadStatusBadge } from "@/components/crm/LeadStatusBadge";
import { FitBadge } from "@/components/crm/FitBadge";
import { fitBucketLabel, fitLabel, matchesFit, matchesTeam, teamBucketLabel, teamSizeLabel, FIT_BUCKETS, TEAM_BUCKETS } from "@/lib/fit";
import { ImportDialog } from "@/components/crm/ImportDialog";
import { LostReasonDialog } from "@/components/crm/LostReasonDialog";
import { FilterCombobox, byCity, byState } from "@/components/crm/FilterCombobox";
import { ANY, LEAD_STATUSES, SOURCES, STAGES, classify, daysSince, facet, leadStatusLabel, matchesLeadStatus, stageLabel, type Firm, type LeadStatus, type Stage } from "@/lib/crm";
import { useFirms, useProfiles, useSaveFirm } from "@/lib/queries";
import { useWhatsAppStatus } from "@/lib/templates";
import { WaTicks } from "@/components/crm/WaTicks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/board")({
  head: () => ({
    meta: [
      { title: "Pipeline — Sevic Reach" },
      { name: "description", content: "Every architecture firm in your pipeline, filterable by stage, source, owner, state, city, research fit score and team size." },
      { property: "og:title", content: "Pipeline — Sevic Reach" },
      { property: "og:description", content: "Kanban and list views of your firm pipeline, classified state-wise and city-wise." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Board,
});

const PAGE = 50;
const COLUMN_LIMIT = 30;

function Board() {
  const { data: firms, isLoading } = useFirms();
  const { data: profiles } = useProfiles();
  const { data: wa } = useWhatsAppStatus();
  const save = useSaveFirm();
  const { user } = Route.useRouteContext();
  const { preferences, setFilter, clearFilters } = usePipelinePreferences(user.id);
  const { view, q, stage, leadStatus, source, owner, stateF, cityF, fitF, teamF, groupBy, listF } = preferences;
  const setView = (value: PipelinePreferences["view"]) => setFilter("view", value);
  const setQ = (value: string) => setFilter("q", value);
  const setStage = (value: string) => setFilter("stage", value);
  const setLeadStatus = (value: string) => setFilter("leadStatus", value);
  const setSource = (value: string) => setFilter("source", value);
  const setOwner = (value: string) => setFilter("owner", value);
  const setStateF = (value: string) => setFilter("stateF", value);
  const setCityF = (value: string) => setFilter("cityF", value);
  const setGroupBy = (value: PipelinePreferences["groupBy"]) => setFilter("groupBy", value);
  const setListF = (value: string) => setFilter("listF", value);
  const setFitF = (value: string) => setFilter("fitF", value);
  const setTeamF = (value: string) => setFilter("teamF", value);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState<Stage | null>(null);
  const [shown, setShown] = useState<Partial<Record<Stage, number>>>({});
  const [pendingLost, setPendingLost] = useState<Firm | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data: lists } = useLists();
  const listSet = useMemo(() => new Set(lists?.find((l) => l.id === listF)?.firmIds ?? []), [lists, listF]);

  const stateOptions = useMemo(() => facet(firms ?? [], byState), [firms]);
  const cityOptions = useMemo(() => facet(firms ?? [], byCity), [firms]);

  const filtered = useMemo(() => (firms ?? []).filter((f) => {
    if (q && !`${f.name} ${f.city ?? ""} ${f.state ?? ""} ${f.contact_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (stage !== ANY && f.stage !== stage) return false;
    if (!matchesLeadStatus(f, leadStatus)) return false;
    if (source !== ANY && f.source !== source) return false;
    if (owner !== ANY && (owner === "none" ? f.owner_id : f.owner_id !== owner)) return false;
    if (stateF !== ANY && classify(f, byState) !== stateF) return false;
    if (cityF !== ANY && classify(f, byCity) !== cityF) return false;
    if (listF !== ANY && !listSet.has(f.id)) return false;
    if (!matchesFit(f, fitF)) return false;
    if (!matchesTeam(f, teamF)) return false;
    return true;
  }), [firms, q, stage, leadStatus, source, owner, stateF, cityF, listF, listSet, fitF, teamF]);
  const pageIds = filtered.slice(0, PAGE).map((f) => f.id);

  const groups = useMemo(() => {
    const pick = groupBy === "state" ? byState : byCity;
    const map = new Map<string, Firm[]>();
    for (const f of filtered) {
      const key = classify(f, pick);
      const list = map.get(key);
      if (list) list.push(f); else map.set(key, [f]);
    }
    return [...map.entries()]
      .map(([name, items]) => ({
        name,
        items,
        stages: STAGES
          .map((s) => ({ id: s.id, label: s.label, n: items.filter((f) => f.stage === s.id).length }))
          .filter((x) => x.n > 0),
      }))
      .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  }, [filtered, groupBy]);

  const active = [
    { label: `Stage: ${stageLabel(stage as Stage)}`, clear: () => setStage(ANY) },
    { label: `Source: ${SOURCES.find((s) => s.id === source)?.label ?? source}`, clear: () => setSource(ANY) },
    { label: `Owner: ${owner === "none" ? "Unassigned" : (profiles?.find((p) => p.id === owner)?.full_name || "—")}`, clear: () => setOwner(ANY) },
    { label: `State: ${stateF}`, clear: () => setStateF(ANY) },
    { label: `City: ${cityF}`, clear: () => setCityF(ANY) },
    { label: `Filter: ${lists?.find((l) => l.id === listF)?.name ?? "—"}`, clear: () => setListF(ANY) },
    { label: `Lead status: ${leadStatusLabel(leadStatus === "unclassified" ? null : leadStatus as LeadStatus)}`, clear: () => setLeadStatus(ANY) },
    { label: `Fit: ${fitBucketLabel(fitF)}`, clear: () => setFitF(ANY) },
    { label: `Team: ${teamBucketLabel(teamF)}`, clear: () => setTeamF(ANY) },
  ].filter((_, i) => [stage, source, owner, stateF, cityF, listF, leadStatus, fitF, teamF][i] !== ANY);

  const ownerName = (id: string | null) => profiles?.find((p) => p.id === id)?.full_name ?? "—";

  function move(firm: Firm, to: Stage) {
    if (firm.stage === to) return;
    if (to === "lost") return setPendingLost(firm);
    save.mutate({ id: firm.id, values: { stage: to } }, { onSuccess: () => toast.success(`${firm.name} → ${stageLabel(to)}`) });
  }

  function openGroup(name: string) {
    if (groupBy === "state") { setStateF(name); setCityF(ANY); } else { setCityF(name); setStateF(ANY); }
    setView("list");
  }

  return (
    <TooltipProvider delayDuration={200}><div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Pipeline</h1>
        <div className="flex rounded-md border p-0.5">
          <Button size="sm" variant={view === "board" ? "secondary" : "ghost"} onClick={() => setView("board")} aria-label="Board view"><Columns3 className="h-4 w-4" /></Button>
          <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} onClick={() => setView("list")} aria-label="List view"><List className="h-4 w-4" /></Button>
          <Button size="sm" variant={view === "groups" ? "secondary" : "ghost"} onClick={() => setView("groups")} aria-label="Group view"><FoldVertical className="h-4 w-4" /></Button>
        </div>
        <Button variant="outline" onClick={() => setImporting(true)}><Upload className="mr-1 h-4 w-4" />Import</Button>
        <Button onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" />Add firm</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input className="w-full sm:w-56" placeholder="Search firms…" value={q} onChange={(e) => setQ(e.target.value)} />
        <FilterCombobox value={stateF} onChange={setStateF} options={stateOptions} allLabel="All states" placeholder="Search state…" />
        <FilterCombobox value={cityF} onChange={setCityF} options={cityOptions} allLabel="All cities" placeholder="Search city…" />
        {view !== "board" && (
          <FilterSelect value={stage} onChange={setStage} all="All stages" options={STAGES.map((s) => ({ id: s.id, label: s.label }))} />
        )}
        <FilterSelect value={source} onChange={setSource} all="All sources" options={SOURCES} />
        <FilterSelect value={leadStatus} onChange={setLeadStatus} all="All lead statuses" options={[...LEAD_STATUSES, { id: "unclassified", label: "Unclassified" }]} />
        <FilterSelect value={owner} onChange={setOwner} all="All owners" options={[{ id: "none", label: "Unassigned" }, ...(profiles ?? []).map((p) => ({ id: p.id, label: p.full_name || p.email || "" }))]} />
        <FilterSelect value={listF} onChange={setListF} all="All custom filters" options={(lists ?? []).map((l) => ({ id: l.id, label: `${l.name} (${l.firmIds.length})` }))} />
        <FilterSelect value={fitF} onChange={setFitF} all="All fit scores" options={FIT_BUCKETS} />
        <FilterSelect value={teamF} onChange={setTeamF} all="All team sizes" options={TEAM_BUCKETS} />
        <ManageLists trigger={<Button variant="outline" size="icon" aria-label="Manage custom filters"><Tags className="h-4 w-4" /></Button>} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{filtered.length} of {firms?.length ?? 0} firms · {stateOptions.length} states · {cityOptions.length} cities</span>
        {view === "list" && (
          <>
            <ListPicker firmIds={[...selected]} trigger={<Button size="sm" variant="outline" disabled={!selected.size}><Tags className="mr-1 h-3.5 w-3.5" />Add/remove {selected.size || ""} to filter</Button>} />
            {filtered.length > 0 && <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(filtered.map((f) => f.id)))}>Select all {filtered.length}</Button>}
            {selected.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>}
          </>
        )}
        {active.map((a) => (
          <button key={a.label} onClick={a.clear} className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2 py-0.5 text-xs text-foreground hover:bg-accent">
            {a.label}<X className="h-3 w-3" />
          </button>
        ))}
        {(active.length > 0 || q) && (
          <Button variant="link" size="sm" onClick={clearFilters} className="h-auto p-0 text-xs">
            Clear all
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64" />)}</div>
      ) : view === "board" ? (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4">
          {STAGES.map((s) => {
            const items = filtered.filter((f) => f.stage === s.id);
            const limit = shown[s.id] ?? COLUMN_LIMIT;
            return (
              <div
                key={s.id}
                onDragOver={(e) => { e.preventDefault(); setDragOver(s.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(null);
                  const firm = firms?.find((f) => f.id === e.dataTransfer.getData("text/plain"));
                  if (firm) move(firm, s.id);
                }}
                className={cn("w-72 shrink-0 snap-start rounded-xl bg-secondary/60 p-2 transition-colors", dragOver === s.id && "bg-accent ring-2 ring-primary/40")}
              >
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-sm font-semibold">{s.label}</span>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="min-h-24 space-y-2">
                  {items.slice(0, limit).map((f) => (
                    <div
                      key={f.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", f.id)}
                      className="cursor-grab rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
                    >
                      <Link to="/firms/$id" params={{ id: f.id }} className="block font-medium hover:text-primary">{f.name}</Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">{[f.city, f.state, f.contact_name].filter(Boolean).join(" · ")}</p>
                      {(fitLabel(f) || f.fit_tier || teamSizeLabel(f.team_size)) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <FitBadge firm={f} />
                          {teamSizeLabel(f.team_size) && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title="Team size on file">
                              <Users className="h-3 w-3" />{teamSizeLabel(f.team_size)}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <LeadStatusBadge status={f.lead_status} />
                        <AssigneeBadge ownerId={f.owner_id} profiles={profiles ?? []} />
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{daysSince(f.stage_entered_at)}d in stage</span>
                        {f.whatsapp_opt_in && <MessageCircle className="h-3.5 w-3.5 text-success" aria-label="WhatsApp opt-in" />}
                        <WaTicks s={wa?.[f.id]} />
                        <select
                          aria-label="Move to stage"
                          className="ml-auto rounded border bg-background px-1 py-0.5 text-xs md:hidden"
                          value={f.stage}
                          onChange={(e) => move(f, e.target.value as Stage)}
                        >
                          {STAGES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                  {items.length > limit && (
                    <button
                      onClick={() => setShown((n) => ({ ...n, [s.id]: limit + COLUMN_LIMIT }))}
                      className="w-full rounded-lg border border-dashed px-3 py-2 text-center text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      +{items.length - limit} more
                    </button>
                  )}
                  {items.length <= limit && limit > COLUMN_LIMIT && (
                    <button
                      onClick={() => setShown((n) => ({ ...n, [s.id]: COLUMN_LIMIT }))}
                      className="w-full rounded-lg px-3 py-1 text-center text-xs text-muted-foreground hover:text-foreground"
                    >
                      Show less
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "groups" ? (
        <div className="space-y-4">
          <div className="flex gap-1 self-start rounded-md border p-0.5">
            <Button size="sm" variant={groupBy === "state" ? "secondary" : "ghost"} onClick={() => setGroupBy("state")}>By state</Button>
            <Button size="sm" variant={groupBy === "city" ? "secondary" : "ghost"} onClick={() => setGroupBy("city")}>By city</Button>
          </div>
          {groups.length === 0 && <p className="text-sm text-muted-foreground">No firms match these filters.</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <button
                key={g.name}
                onClick={() => openGroup(g.name)}
                className="rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-secondary/50"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-semibold">{g.name}</span>
                  <span className="ml-auto shrink-0 text-lg font-semibold tabular-nums">{g.items.length}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {g.stages.map((s) => (
                    <Badge key={s.id} variant={s.id === "lost" ? "destructive" : "secondary"} className="text-xs">
                      {s.label} {s.n}
                    </Badge>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {g.items.filter((f) => f.phone && f.whatsapp_opt_in).length} WhatsApp-ready · {g.items.filter((f) => f.email).length} with email
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-8"><Checkbox aria-label="Select all shown" checked={pageIds.length > 0 && pageIds.every((id) => selected.has(id))}
                onCheckedChange={(v) => setSelected(v ? new Set(pageIds) : new Set())} /></TableHead>
              <TableHead>Firm</TableHead><TableHead>City</TableHead><TableHead>State</TableHead><TableHead>Team</TableHead><TableHead>Contact</TableHead>
              <TableHead>Source</TableHead><TableHead>Stage</TableHead><TableHead>Lead status</TableHead><TableHead>Owner</TableHead><TableHead>WhatsApp</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={12} className="py-10 text-center text-muted-foreground">No firms match these filters.</TableCell></TableRow>}
              {filtered.slice(0, PAGE).map((f) => (
                <TableRow key={f.id}>
                  <TableCell><Checkbox aria-label={`Select ${f.name}`} checked={selected.has(f.id)} onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(f.id); else n.delete(f.id); return n; })} /></TableCell>
                  <TableCell><Link to="/firms/$id" params={{ id: f.id }} className="font-medium hover:text-primary">{f.name}</Link></TableCell>
                  <TableCell>{f.city}</TableCell>
                  <TableCell>{f.state}</TableCell>
                  <TableCell>{f.team_size}</TableCell>
                  <TableCell>{f.contact_name}</TableCell>
                  <TableCell className="capitalize">{f.source}</TableCell>
                  <TableCell><Badge variant={f.stage === "lost" ? "destructive" : "secondary"}>{stageLabel(f.stage)}</Badge></TableCell>
                  <TableCell><LeadStatusBadge status={f.lead_status} /></TableCell>
                  <TableCell>{ownerName(f.owner_id)}</TableCell>
                  <TableCell><div className="flex flex-col gap-0.5">{f.whatsapp_opt_in ? <Badge variant="success" className="w-fit">Opted in</Badge> : <span className="text-xs text-muted-foreground">No opt-in</span>}<WaTicks s={wa?.[f.id]} label /></div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filtered.length > PAGE && (
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">
              Showing first {PAGE} of {filtered.length} — narrow with a state or city filter to see more.
            </p>
          )}
        </div>
      )}

      <FirmDialog open={adding} onOpenChange={setAdding} />
      <ImportDialog open={importing} onOpenChange={setImporting} />
      <LostReasonDialog
        firmName={pendingLost?.name ?? null}
        onCancel={() => setPendingLost(null)}
        onConfirm={(reason) => {
          const f = pendingLost;
          if (!f) return;
          setPendingLost(null);
          save.mutate({ id: f.id, values: { stage: "lost", lost_reason: reason } }, { onSuccess: () => toast.success(`${f.name} marked lost`) });
        }}
      />
    </div></TooltipProvider>
  );
}

function AssigneeBadge({ ownerId, profiles }: { ownerId: string | null; profiles: { id: string; full_name: string | null; email: string | null }[] }) {
  const profile = profiles.find((person) => person.id === ownerId);
  const name = profile?.full_name?.trim() || profile?.email || (ownerId ? "Assigned team member" : "Unassigned");
  const words = name.split(/\s+/);
  const initials = profile ? `${words[0]?.[0] ?? ""}${words.length > 1 ? words.at(-1)?.[0] ?? "" : words[0]?.[1] ?? ""}`.toUpperCase() : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Avatar className="h-7 w-7" tabIndex={0} aria-label={`Assignee: ${name}`}>
          <AvatarFallback className={cn("text-[10px] font-semibold", ownerId ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
            {initials || <UserRound className="h-3.5 w-3.5" />}
          </AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  );
}

function FilterSelect({ value, onChange, all, options }: { value: string; onChange: (v: string) => void; all: string; options: readonly { id: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{all}</SelectItem>
        {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

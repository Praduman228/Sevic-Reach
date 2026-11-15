import type { Database } from "@/integrations/supabase/types";

export type Firm = Database["public"]["Tables"]["firms"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type Stage = Database["public"]["Enums"]["firm_stage"];
export type Source = Database["public"]["Enums"]["firm_source"];
export type LeadStatus = Database["public"]["Enums"]["lead_status"];
export const LEAD_STATUSES: { id: LeadStatus; label: string }[] = [
  { id: "hot", label: "Hot" },
  { id: "cold", label: "Cold" },
  { id: "junk", label: "Junk" },
];
export const leadStatusLabel = (status: LeadStatus | null) => LEAD_STATUSES.find((s) => s.id === status)?.label ?? "Unclassified";
export function matchesLeadStatus(firm: Pick<Firm, "lead_status">, filter: string) {
  return filter === "all" || (filter === "unclassified" ? firm.lead_status === null : firm.lead_status === filter);
}

export const STAGES: { id: Stage; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "outreach", label: "Outreach" },
  { id: "discovery", label: "Discovery call" },
  { id: "demo", label: "Demo" },
  { id: "pilot", label: "Pilot" },
  { id: "paid", label: "Paid" },
  { id: "customer", label: "Customer" },
  { id: "nurture", label: "Nurture" },
  { id: "lost", label: "Lost" },
];

export const stageLabel = (s: Stage) => STAGES.find((x) => x.id === s)?.label ?? s;
export const messagingStage = (stage: Stage): Stage => stage === "backlog" ? "outreach" : stage;
export const matchesSequenceStage = (stage: Stage, sequenceStage: Stage) => messagingStage(stage) === sequenceStage;

export const SOURCES: { id: Source; label: string }[] = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "email", label: "Email" },
  { id: "referral", label: "Referral" },
  { id: "event", label: "Event" },
  { id: "notion", label: "Notion" },
];

export const FUNNEL_STEPS = [
  { from: "Outreach", to: "Discovery", target: 0.2, fromKey: null, toKey: "reached_discovery_at" },
  { from: "Discovery", to: "Demo", target: 0.56, fromKey: "reached_discovery_at", toKey: "reached_demo_at" },
  { from: "Demo", to: "Pilot", target: 0.5, fromKey: "reached_demo_at", toKey: "reached_pilot_at" },
  { from: "Pilot", to: "Paid", target: 0.7, fromKey: "reached_pilot_at", toKey: "reached_paid_at" },
] as const;

export function rag(actual: number, target: number): "green" | "amber" | "red" {
  if (actual >= target) return "green";
  if (actual >= target * 0.8) return "amber";
  return "red";
}

export function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export const ANY = "all";
export const BLANK = "Unspecified";

/** Count how many firms sit under each value of a classifier (state, city, …). */
export function facet(rows: Firm[], pick: (f: Firm) => string | null): { id: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const f of rows) {
    const key = (pick(f) ?? "").trim() || BLANK;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

/** Value a firm has for a classifier, or the "Unspecified" bucket. */
export function classify(f: Firm, pick: (f: Firm) => string | null) {
  return (pick(f) ?? "").trim() || BLANK;
}

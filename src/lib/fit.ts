import type { Firm } from "./crm";

export type FirmFit = Pick<Firm, "fit_score" | "fit_max" | "fit_tier">;

/** 0-1 strength of the research fit verdict; null when the brief quoted no score. */
export function fitRatio(firm: FirmFit): number | null {
  if (firm.fit_score == null || !firm.fit_max) return null;
  return firm.fit_score / firm.fit_max;
}

/** "Fit 8/10" on whatever scale the brief used; null when there is no score. */
export function fitLabel(firm: FirmFit): string | null {
  if (firm.fit_score == null || !firm.fit_max) return null;
  return `Fit ${firm.fit_score}/${firm.fit_max}`;
}

/** Neutral tone until a score exists, then green / amber / red by strength. */
export function fitTone(firm: FirmFit): "success" | "warning" | "destructive" | "outline" {
  const ratio = fitRatio(firm);
  if (ratio === null) return "outline";
  if (ratio >= 0.7) return "success";
  if (ratio >= 0.5) return "warning";
  return "destructive";
}

/** Headcount as shown on a card; null when the firm has none on file. */
export function teamSizeLabel(size: number | null | undefined): string | null {
  if (size == null || size <= 0) return null;
  return `${size} ${size === 1 ? "person" : "people"}`;
}

export type FitBucket = "strong" | "middling" | "weak" | "none";

/** Strength bands the pipeline can filter on; same cut-offs as the badge colours. */
export const FIT_BUCKETS: { id: FitBucket; label: string }[] = [
  { id: "strong", label: "Strong fit (70%+)" },
  { id: "middling", label: "Middling fit (50–69%)" },
  { id: "weak", label: "Weak fit (below 50%)" },
  { id: "none", label: "No fit score yet" },
];

export function fitBucket(firm: FirmFit): FitBucket {
  const ratio = fitRatio(firm);
  if (ratio === null) return "none";
  if (ratio >= 0.7) return "strong";
  if (ratio >= 0.5) return "middling";
  return "weak";
}

/** True when a firm's research fit falls in the selected band. */
export function matchesFit(firm: FirmFit, filter: string) {
  return filter === "all" || fitBucket(firm) === filter;
}

export const fitBucketLabel = (bucket: string) =>
  FIT_BUCKETS.find((b) => b.id === bucket)?.label ?? bucket;

export type TeamBucket = "1-5" | "6-15" | "16-50" | "50+" | "none";

/** Headcount bands the pipeline can filter on. */
export const TEAM_BUCKETS: { id: TeamBucket; label: string }[] = [
  { id: "1-5", label: "1–5 people" },
  { id: "6-15", label: "6–15 people" },
  { id: "16-50", label: "16–50 people" },
  { id: "50+", label: "50+ people" },
  { id: "none", label: "No team size on file" },
];

export function teamBucket(size: number | null | undefined): TeamBucket {
  if (size == null || size <= 0) return "none";
  if (size <= 5) return "1-5";
  if (size <= 15) return "6-15";
  if (size <= 50) return "16-50";
  return "50+";
}

/** True when a firm's headcount falls in the selected band. */
export function matchesTeam(firm: Pick<Firm, "team_size">, filter: string) {
  return filter === "all" || teamBucket(firm.team_size) === filter;
}

export const teamBucketLabel = (bucket: string) =>
  TEAM_BUCKETS.find((b) => b.id === bucket)?.label ?? bucket;


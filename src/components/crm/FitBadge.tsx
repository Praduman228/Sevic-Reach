import { Badge } from "@/components/ui/badge";
import { fitLabel, fitTone, type FirmFit } from "@/lib/fit";

/** Research fit verdict, e.g. "Fit 8/10 · A". Renders nothing when the lead was never scored. */
export function FitBadge({ firm }: { firm: FirmFit }) {
  const label = fitLabel(firm);
  const tier = firm.fit_tier;
  if (!label && !tier) return null;
  const text = label ? (tier ? `${label} · ${tier}` : label) : `Tier ${tier}`;
  return (
    <Badge variant={fitTone(firm)} title="Fit score from this lead's research brief" className="px-1.5 py-0 text-[11px] font-medium">
      {text}
    </Badge>
  );
}

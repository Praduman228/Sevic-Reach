import type { Stage } from "./crm";

export type CadenceStep = { label: string; minutes: number; purpose: string };

const H = 60, D = 24 * 60;

/** Per-lead message cadence for each stage. Minutes count from when step 1 is sent. */
export const CADENCE: Partial<Record<Stage, CadenceStep[]>> = {
  outreach: [
    { label: "Introduction", minutes: 0, purpose: "first introduction message" },
    { label: "Follow-up 1 (day 3)", minutes: 3 * D, purpose: "friendly follow-up" },
    { label: "Follow-up 2 (day 7)", minutes: 7 * D, purpose: "last gentle nudge" },
  ],
  discovery: [
    { label: "Recap + demo invite", minutes: 0, purpose: "recap the discovery call and invite to a demo" },
    { label: "Nudge 1 (day 2)", minutes: 2 * D, purpose: "short nudge about the demo" },
    { label: "Nudge 2 (day 5)", minutes: 5 * D, purpose: "second nudge with a different angle" },
    { label: "Nudge 3 (day 10)", minutes: 10 * D, purpose: "final nudge before pausing" },
  ],
  demo: [
    { label: "Pilot proposal", minutes: 0, purpose: "propose a pilot after the demo" },
    { label: "Touch 1 (day 1)", minutes: 1 * D, purpose: "quick check on the pilot proposal" },
    { label: "Touch 2 (day 3)", minutes: 3 * D, purpose: "answer likely questions about the pilot" },
    { label: "Touch 3 (day 7)", minutes: 7 * D, purpose: "last touch asking for a decision" },
  ],
  pilot: [
    { label: "Welcome (hour 1)", minutes: 1 * H, purpose: "welcome to the pilot and first steps" },
    { label: "Check 1 (day 1)", minutes: 1 * D, purpose: "activation check" },
    { label: "Check 2 (day 3)", minutes: 3 * D, purpose: "activation check and tips" },
    { label: "Check 3 (day 7)", minutes: 7 * D, purpose: "progress check" },
    { label: "Convert offer (day 10)", minutes: 10 * D, purpose: "offer to convert to a paid plan" },
  ],
  paid: [
    { label: "Confirm value", minutes: 0, purpose: "confirm the value they got" },
    { label: "Plan + price (day 4)", minutes: 4 * D, purpose: "share the plan and pricing" },
    { label: "Invoice (day 6)", minutes: 6 * D, purpose: "send invoice details" },
    { label: "Close (day 10)", minutes: 10 * D, purpose: "close the deal" },
  ],
  customer: [
    { label: "Day 7 check-in", minutes: 7 * D, purpose: "first-week check-in, offer help with blockers" },
    { label: "Day 30 usage review", minutes: 30 * D, purpose: "usage review and ask for two peer introductions" },
    { label: "Day 60 NPS + referral", minutes: 60 * D, purpose: "ask how likely they are to recommend and for a referral" },
    { label: "Day 90 review", minutes: 90 * D, purpose: "business review, suggest adding users or modules" },
    { label: "Month 11 renewal", minutes: 330 * D, purpose: "renewal and price conversation" },
  ],
  nurture: [
    { label: "Re-engage (day 30)", minutes: 30 * D, purpose: "gentle re-engagement" },
    { label: "Re-engage (day 60)", minutes: 60 * D, purpose: "share something useful" },
    { label: "Re-engage (day 90)", minutes: 90 * D, purpose: "final check-in" },
  ],
};

/** When an approved step should go out, given when step 1 was sent (null = not yet). */
export function scheduleFor(step: number, minutes: number, firstSentAt: string | null, now = new Date()): string | null {
  if (step === 0) return new Date(now.getTime() + minutes * 60000).toISOString();
  if (!firstSentAt) return null;
  return new Date(new Date(firstSentAt).getTime() + minutes * 60000).toISOString();
}

export type ChannelStatus = "draft" | "approved" | "sending" | "sent" | "failed" | "skipped";

/** Overall row status from the two independent channel statuses. */
export function summaryStatus(email: string, whatsapp: string): ChannelStatus {
  const s = [email, whatsapp];
  if (s.some((x) => x === "approved" || x === "sending")) return "approved";
  if (s.includes("draft")) return "draft";
  if (s.includes("sent")) return "sent";
  if (s.includes("failed")) return "failed";
  return "skipped";
}

import { describe, expect, it } from "vitest";
import { STAGES, messagingStage, matchesSequenceStage } from "../lib/crm";
import { mappedStage, TOUCHES } from "../lib/offer-chain";
import { organisationReport, type ReportData } from "../lib/funnel-report";

describe("Backlog messaging compatibility", () => {
  it("places Backlog before Outreach", () => {
    expect(STAGES.slice(0, 2).map(s => s.id)).toEqual(["backlog", "outreach"]);
  });
  it("drafts the Outreach introduction and follow-ups without advancing Backlog", () => {
    expect(mappedStage("backlog")).toBe("outreach");
    expect(TOUCHES[messagingStage("backlog")]?.map(t => t.id)).toEqual(["OUT-1", "OUT-2", "OUT-3"]);
  });
  it("keeps Outreach sequences active before and after the first send", () => {
    expect(matchesSequenceStage("backlog", "outreach")).toBe(true);
    expect(matchesSequenceStage("outreach", "outreach")).toBe(true);
    expect(matchesSequenceStage("discovery", "outreach")).toBe(false);
  });
  it("counts already-approved introductions for Backlog organisations in schedules", () => {
    const data = { firms: [{ id: "firm", stage: "backlog" }], messages: [], sequences: [{ id: "intro", firm_id: "firm", stage: "outreach", step: 0, label: "Introduction", email_status: "approved", whatsapp_status: "draft", scheduled_at: "2026-11-01T08:00:00Z" }], tasks: [], contacts: [], profiles: [] } as unknown as ReportData;
    expect(organisationReport(data, null, "2026-11-01T09:00:00Z")[0]?.scheduled).toBe(1);
  });
});
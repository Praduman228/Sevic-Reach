import { describe, expect, it } from "vitest";
import { organisationReport, reportTotals, reportDrilldown, type ReportData } from "@/lib/funnel-report";
import type { Firm } from "@/lib/crm";

const now = "2026-10-24T09:17:00Z";
const firm = (id: string, owner_id: string): Firm => ({ id, owner_id, name: id, stage: "outreach" } as Firm);
const fixture = (): ReportData => ({ firms: [firm("a", "one"), firm("b", "two")], messages: [], sequences: [], contacts: [], profiles: [], tasks: [] });
describe("Funnel organisation reporting", () => {
  it("lists exactly the 19 organisations included in a sent organisation tile", () => {
    const data = fixture();
    data.firms = Array.from({ length: 20 }, (_, i) => firm(String(i), "one"));
    data.messages = data.firms.slice(0, 19).flatMap((f) => [0, 1].map((i) => ({ id: `${f.id}-${i}`, firm_id: f.id, direction: "out", status: "sent", created_at: now, sent_by: "two", channel: "email" as const, stage: "outreach" as const })));
    const rows = organisationReport(data, null, now);
    const included = reportDrilldown(rows, (r) => Number(r.sent > 0));
    expect(included).toHaveLength(19);
    expect(included.map((item) => item.report.firm.id)).toEqual(data.firms.slice(0, 19).map((f) => f.id));
    expect(included.reduce((n, item) => n + item.count, 0)).toBe(reportTotals(rows).sentOrgs);
    expect(reportDrilldown(rows.filter((r) => r.firm.owner_id === "two"), (r) => r.sent)).toEqual([]);
  });
  it("counts organisations once while counting every accepted message and excluding failures", () => {
    const data = fixture();
    data.messages = ["sent", "submitted", "failed"].map((status, i) => ({ id: String(i), firm_id: "a", direction: "out", status, created_at: now, sent_by: "two", channel: "whatsapp", stage: "outreach" }));
    const rows = organisationReport(data, null, now);
    expect(reportTotals(rows).sentOrgs).toBe(1);
    expect(reportTotals(rows).sent).toBe(2);
    expect(rows[0]?.failed).toBe(1);
    expect(rows[0]?.firm.owner_id).toBe("one");
  });
  it("counts independently approved channels across both contact schedules without counting introductions as follow-ups", () => {
    const data = fixture();
    data.sequences = [0, 1, 2].map((step) => ({ id: String(step), firm_id: "a", stage: "outreach", step, label: "Message", contact_id: String(step), email_status: "approved", whatsapp_status: step === 2 ? "draft" : "approved", scheduled_at: now }));
    const row = organisationReport(data, null, now)[0];
    expect(row?.scheduled).toBe(5);
    expect(row?.followups).toBe(2);
    expect(row?.drafts).toBe(1);
    expect(reportTotals(organisationReport(data, null, now)).scheduledOrgs).toBe(1);
  });
  it("excludes draft, skipped and old-stage channels from queued sends", () => {
    const data = fixture();
    data.sequences = [{ id: "x", firm_id: "a", stage: "demo", step: 1, label: "Earlier", email_status: "approved", whatsapp_status: "skipped", scheduled_at: now }];
    expect(organisationReport(data, null, now)[0]?.scheduled).toBe(0);
  });
  it("counts replies by organisation and preserves current schedules when filtering message history", () => {
    const data = fixture();
    data.messages = ["out", "in", "in"].map((direction, i) => ({ id: String(i), firm_id: "a", direction, status: "sent", created_at: "2026-10-23T09:00:00Z", sent_by: null, channel: "email", stage: "outreach" }));
    const totals = reportTotals(organisationReport(data, null, now));
    expect(totals.repliedOrgs).toBe(1); expect(totals.replies).toBe(2); expect(totals.replyRate).toBe(1);
    expect(reportTotals(organisationReport(data, now, now)).replies).toBe(0);
  });
});
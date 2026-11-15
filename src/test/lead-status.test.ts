import { describe, expect, it } from "vitest";
import { matchesLeadStatus } from "@/lib/crm";

describe("independent per-firm lead status", () => {
  for (const status of ["hot", "cold", "junk"] as const) {
    it(`filters ${status} firms without including other statuses`, () => {
      const firms = [{ lead_status: "hot" }, { lead_status: "cold" }, { lead_status: "junk" }, { lead_status: null }] as const;
      expect(firms.filter((f) => matchesLeadStatus(f, status))).toEqual([{ lead_status: status }]);
    });
  }
  it("keeps unclassified firms visible until assigned", () => {
    expect(matchesLeadStatus({ lead_status: null }, "all")).toBe(true);
    expect(matchesLeadStatus({ lead_status: null }, "unclassified")).toBe(true);
    expect(matchesLeadStatus({ lead_status: "hot" }, "unclassified")).toBe(false);
  });
});
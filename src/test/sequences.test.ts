import { describe, expect, it } from "vitest";
import { CADENCE, scheduleFor } from "@/lib/sequences";

describe("stage cadence", () => {
  it("outreach is intro, day 3, day 7", () => {
    expect(CADENCE.outreach!.map((s) => s.minutes / 1440)).toEqual([0, 3, 7]);
  });
  it("follow-ups count from first send", () => {
    expect(scheduleFor(1, 3 * 1440, "2026-01-01T00:00:00.000Z")).toBe("2026-01-04T00:00:00.000Z");
    expect(scheduleFor(1, 3 * 1440, null)).toBeNull();
  });
});

import { summaryStatus } from "@/lib/sequences";
describe("summaryStatus", () => {
  it("is approved while either channel waits to send", () => expect(summaryStatus("sent", "approved")).toBe("approved"));
  it("is draft while a channel is unapproved", () => expect(summaryStatus("sent", "draft")).toBe("draft"));
  it("is sent when one sent and the other skipped", () => expect(summaryStatus("skipped", "sent")).toBe("sent"));
});

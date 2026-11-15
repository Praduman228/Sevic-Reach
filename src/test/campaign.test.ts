import { describe, expect, it } from "vitest";
import { channelReadiness, isPausingError, nextPhase, readyForNextFirm, MAX_TEST_FIRMS } from "@/lib/campaign";

const firm = { name: "Studio", contact_name: "Asha", email: "a@studio.in", phone: "+919876543210", whatsapp_opt_in: true };

describe("campaign rules", () => {
  it("collects firms with no email when email is selected", () => {
    expect(channelReadiness({ ...firm, email: null }, [], ["email", "whatsapp"])).toEqual({ usable: ["whatsapp"], missing: ["No email"] });
  });
  it("collects firms with no phone when WhatsApp is selected", () => {
    expect(channelReadiness({ ...firm, phone: null }, [], ["whatsapp"])).toEqual({ usable: [], missing: ["No phone number"] });
  });
  it("never sends WhatsApp without consent", () => {
    expect(channelReadiness({ ...firm, whatsapp_opt_in: false }, [], ["whatsapp"]).usable).toEqual([]);
  });
  it("ignores channels the campaign did not select", () => {
    expect(channelReadiness({ ...firm, phone: null }, [], ["email"])).toEqual({ usable: ["email"], missing: [] });
  });
  it("waits about one minute between firms", () => {
    const now = Date.parse("2026-11-02T10:00:00Z");
    expect(readyForNextFirm("2026-11-02T09:59:30Z", now)).toBe(false);
    expect(readyForNextFirm("2026-11-02T09:59:00Z", now)).toBe(true);
  });
  it("researches, then drafts, then sends", () => {
    expect(nextPhase("research")).toBe("draft");
    expect(nextPhase("draft")).toBe("send");
    expect(nextPhase("send")).toBeNull();
  });
  it("pauses on credit or permission errors", () => {
    expect(isPausingError("AI request failed (402): Not enough credits")).toBe(true);
    expect(isPausingError("Zoho timeout")).toBe(false);
  });
  it("allows testing on up to three firms", () => {
    expect(MAX_TEST_FIRMS).toBe(3);
  });
});

import { fitScore, isLowFit, sendErrorReason } from "@/lib/campaign";
describe("campaign fit and error rules", () => {
  it("reads the fit score from the research verdict", () => {
    expect(fitScore("Verdict: Low-confidence prospect; fit score 2/5 (Tier C).")).toBe(2);
  });
  it("skips firms scoring 3/5 and below", () => {
    expect(isLowFit(2)).toBe(true);
    expect(isLowFit(3)).toBe(true);
    expect(isLowFit(4)).toBe(false);
  });
  it("still sends when no score is found", () => {
    expect(isLowFit(fitScore("No verdict"))).toBe(false);
  });
  it("explains WhatsApp 131049 and 131026", () => {
    expect(sendErrorReason("(#131049) healthy ecosystem")).toMatch(/too many business messages/);
    expect(sendErrorReason("Message undeliverable, (#131026)")).toMatch(/not on WhatsApp/);
  });
});

import { groupSentByFirm } from "@/lib/campaign";
describe("campaign sent list", () => {
  it("lists each firm once with the channels and addresses it was sent to", () => {
    const sent = groupSentByFirm([
      { firmId: "a", channel: "email", to: "a@studio.in", at: "2026-11-04T09:00:00Z" },
      { firmId: "a", channel: "whatsapp", to: "+919876543210", at: "2026-11-04T09:02:00Z" },
      { firmId: "b", channel: "email", to: "b@studio.in", at: "2026-11-04T09:01:00Z" },
    ]);
    expect(sent.map((s) => s.firmId)).toEqual(["a", "b"]);
    expect(sent[0]).toMatchObject({ channels: ["email", "whatsapp"], sends: 2, lastSentAt: "2026-11-04T09:02:00Z" });
    expect(sent[0]!.addresses).toEqual(["a@studio.in", "+919876543210"]);
  });
  it("counts a repeat send to the same address without listing it twice", () => {
    const sent = groupSentByFirm([
      { firmId: "a", channel: "whatsapp", to: "+919876543210", at: "2026-11-04T09:00:00Z" },
      { firmId: "a", channel: "whatsapp", to: "+919876543210", at: "2026-11-04T09:30:00Z" },
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ sends: 2, lastSentAt: "2026-11-04T09:30:00Z" });
    expect(sent[0]!.addresses).toEqual(["+919876543210"]);
  });
  it("returns nobody when the campaign has sent nothing", () => {
    expect(groupSentByFirm([])).toEqual([]);
  });
});

import { filterSentByChannel, sentChannelCounts } from "@/lib/campaign";
describe("campaign sent channel filter", () => {
  const sent = groupSentByFirm([
    { firmId: "a", channel: "email", to: "a@studio.in", at: "2026-11-04T09:00:00Z" },
    { firmId: "a", channel: "whatsapp", to: "+919876543210", at: "2026-11-04T09:02:00Z" },
    { firmId: "b", channel: "email", to: "b@studio.in", at: "2026-11-04T09:01:00Z" },
    { firmId: "c", channel: "whatsapp", to: "+919876500000", at: "2026-11-04T09:03:00Z" },
  ]);
  it("keeps only firms messaged by WhatsApp", () => {
    expect(filterSentByChannel(sent, "whatsapp").map((s) => s.firmId)).toEqual(["c", "a"]);
  });
  it("keeps only firms messaged by email", () => {
    expect(filterSentByChannel(sent, "email").map((s) => s.firmId)).toEqual(["a", "b"]);
  });
  it("keeps every firm under all channels", () => {
    expect(filterSentByChannel(sent, "all").map((s) => s.firmId)).toEqual(["c", "a", "b"]);
  });
  it("counts firms per channel for the filter chips", () => {
    expect(sentChannelCounts(sent)).toEqual({ all: 3, email: 2, whatsapp: 2 });
  });
});

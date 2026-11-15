import { describe, expect, it } from "vitest";
import { AUTO_RESUME_MS, shouldAutoResume } from "@/lib/campaign";

const pausedAt = "2026-11-04T05:00:00.000Z";
const t0 = Date.parse(pausedAt);

describe("campaign auto-resume", () => {
  it("restarts a web search 403 pause after 5 minutes", () => {
    expect(AUTO_RESUME_MS).toBe(5 * 60_000);
    expect(shouldAutoResume("Web search failed (403)", pausedAt, t0 + 5 * 60_000)).toBe(true);
  });
  it("waits before restarting", () => {
    expect(shouldAutoResume("Web search failed (403)", pausedAt, t0 + 60_000)).toBe(false);
  });
  it("never restarts credit problems", () => {
    expect(shouldAutoResume("Out of credits for web search — check Settings → Plans & credits", pausedAt, t0 + 60 * 60_000)).toBe(false);
    expect(shouldAutoResume("AI request failed (402): Not enough credits", pausedAt, t0 + 60 * 60_000)).toBe(false);
  });
  it("never restarts a manual pause", () => {
    expect(shouldAutoResume(null, pausedAt, t0 + 60 * 60_000)).toBe(false);
  });
});

describe("AI service forbidden errors", () => {
  it("retries a plain Forbidden rejection", () => {
    expect(shouldAutoResume("Forbidden", pausedAt, t0 + 5 * 60_000)).toBe(true);
  });
  it("never retries a forbidden credit problem", () => {
    expect(shouldAutoResume("Forbidden: credit limit reached", pausedAt, t0 + 60 * 60_000)).toBe(false);
  });
});

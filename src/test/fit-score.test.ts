import { describe, expect, it } from "vitest";
import { fitBucket, fitBucketLabel, fitLabel, fitRatio, fitTone, matchesFit, matchesTeam, teamBucket, teamBucketLabel, teamSizeLabel } from "@/lib/fit";

const firm = (fit_score: number | null, fit_max: number | null, fit_tier: string | null = null) => ({ fit_score, fit_max, fit_tier });

describe("pipeline fit display", () => {
  it("shows the score on the scale the brief used", () => {
    expect(fitLabel(firm(8, 10))).toBe("Fit 8/10");
    expect(fitLabel(firm(2, 5))).toBe("Fit 2/5");
    expect(fitLabel(firm(65, 100))).toBe("Fit 65/100");
    expect(fitLabel(firm(9.8, 10))).toBe("Fit 9.8/10");
  });

  it("stays silent when the brief quoted no score", () => {
    expect(fitLabel(firm(null, null))).toBeNull();
    expect(fitRatio(firm(null, null))).toBeNull();
  });

  it("colours strong fits green, middling amber and weak red", () => {
    expect(fitTone(firm(9.8, 10))).toBe("success");
    expect(fitTone(firm(5, 10))).toBe("warning");
    expect(fitTone(firm(2, 5))).toBe("destructive");
    expect(fitTone(firm(null, null))).toBe("outline");
  });

  it("labels team size only when a headcount exists", () => {
    expect(teamSizeLabel(60)).toBe("60 people");
    expect(teamSizeLabel(1)).toBe("1 person");
    expect(teamSizeLabel(null)).toBeNull();
    expect(teamSizeLabel(0)).toBeNull();
  });

  it("bands research fit by strength on whatever scale the brief used", () => {
    expect(fitBucket(firm(9.1, 10))).toBe("strong");
    expect(fitBucket(firm(70, 100))).toBe("strong");
    expect(fitBucket(firm(5, 10))).toBe("middling");
    expect(fitBucket(firm(65, 100))).toBe("middling");
    expect(fitBucket(firm(2, 5))).toBe("weak");
    expect(fitBucket(firm(null, null))).toBe("none");
  });

  it("filters firms by the selected fit band", () => {
    expect(matchesFit(firm(9.1, 10), "strong")).toBe(true);
    expect(matchesFit(firm(2, 5), "strong")).toBe(false);
    expect(matchesFit(firm(null, null), "none")).toBe(true);
    expect(matchesFit(firm(2, 5), "none")).toBe(false);
    expect(matchesFit(firm(2, 5), "all")).toBe(true);
  });

  it("bands headcount at 5, 15 and 50 people", () => {
    expect(teamBucket(3)).toBe("1-5");
    expect(teamBucket(5)).toBe("1-5");
    expect(teamBucket(6)).toBe("6-15");
    expect(teamBucket(15)).toBe("6-15");
    expect(teamBucket(16)).toBe("16-50");
    expect(teamBucket(50)).toBe("16-50");
    expect(teamBucket(51)).toBe("50+");
    expect(teamBucket(null)).toBe("none");
    expect(teamBucket(0)).toBe("none");
  });

  it("filters firms by the selected headcount band", () => {
    expect(matchesTeam({ team_size: 8 }, "6-15")).toBe(true);
    expect(matchesTeam({ team_size: 8 }, "1-5")).toBe(false);
    expect(matchesTeam({ team_size: null }, "none")).toBe(true);
    expect(matchesTeam({ team_size: 800 }, "50+")).toBe(true);
    expect(matchesTeam({ team_size: 8 }, "all")).toBe(true);
  });

  it("names each band for the active-filter chips", () => {
    expect(fitBucketLabel("strong")).toBe("Strong fit (70%+)");
    expect(fitBucketLabel("none")).toBe("No fit score yet");
    expect(teamBucketLabel("50+")).toBe("50+ people");
    expect(teamBucketLabel("none")).toBe("No team size on file");
  });
});

import { describe, expect, it } from "vitest";
import { isPageLoadError } from "@/lib/page-load-recovery";

describe("page load recovery", () => {
  it("recognises failed Pipeline split-module imports", () => {
    expect(isPageLoadError(new TypeError("Failed to fetch dynamically imported module: /src/routes/_authenticated/board.tsx?tsr-split=component"))).toBe(true);
  });
  it("does not reload for ordinary application failures", () => {
    expect(isPageLoadError(new Error("Could not save firm"))).toBe(false);
  });
});
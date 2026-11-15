import { describe, expect, it } from "vitest";
import { SOURCES } from "@/lib/crm";

describe("Notion lead source", () => {
  it("supports storing Notion as the source for imported leads", () => {
    expect(SOURCES.some((source) => source.id === "notion")).toBe(true);
  });
});
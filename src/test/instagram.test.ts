import { describe, expect, it } from "vitest";
import { normalizeInstagram } from "@/lib/instagram";

describe("normalizeInstagram", () => {
  it("extracts username from profile URL", () => expect(normalizeInstagram("https://www.instagram.com/Studio.Lotus/?hl=en")).toBe("studio.lotus"));
  it("strips @", () => expect(normalizeInstagram("@harshi_arch")).toBe("harshi_arch"));
  it("rejects post links", () => expect(normalizeInstagram("https://instagram.com/p/abc123")).toBeNull());
});

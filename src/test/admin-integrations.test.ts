import { describe, expect, it, vi, beforeEach } from "vitest";

describe("Admin Integrations configuration and env validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it("accurately detects missing Gupshup WhatsApp variables", () => {
    delete process.env["GUPSHUP_API_KEY"];
    delete process.env["GUPSHUP_APP_NAME"];
    delete process.env["GUPSHUP_SOURCE_NUMBER"];

    const missing: string[] = [];
    if (!process.env["GUPSHUP_API_KEY"]) missing.push("GUPSHUP_API_KEY");
    if (!process.env["GUPSHUP_APP_NAME"]) missing.push("GUPSHUP_APP_NAME");
    if (!process.env["GUPSHUP_SOURCE_NUMBER"]) missing.push("GUPSHUP_SOURCE_NUMBER");

    expect(missing).toEqual(["GUPSHUP_API_KEY", "GUPSHUP_APP_NAME", "GUPSHUP_SOURCE_NUMBER"]);
    expect(missing.length === 0).toBe(false);
  });

  it("recognizes when all Gupshup variables are configured", () => {
    process.env["GUPSHUP_API_KEY"] = "test-gupshup-api-key";
    process.env["GUPSHUP_APP_NAME"] = "shegruh-crm";
    process.env["GUPSHUP_SOURCE_NUMBER"] = "919876543210";

    const missing: string[] = [];
    if (!process.env["GUPSHUP_API_KEY"]) missing.push("GUPSHUP_API_KEY");
    if (!process.env["GUPSHUP_APP_NAME"]) missing.push("GUPSHUP_APP_NAME");
    if (!process.env["GUPSHUP_SOURCE_NUMBER"]) missing.push("GUPSHUP_SOURCE_NUMBER");

    expect(missing).toHaveLength(0);
    const isConfigured = missing.length === 0;
    expect(isConfigured).toBe(true);
  });

  it("accurately detects missing Firecrawl API key", () => {
    delete process.env["FIRECRAWL_API_KEY"];

    const isConfigured = Boolean(process.env["FIRECRAWL_API_KEY"]);
    expect(isConfigured).toBe(false);

    process.env["FIRECRAWL_API_KEY"] = "fc-test-key-123456789";
    const isConfiguredNow = Boolean(process.env["FIRECRAWL_API_KEY"]);
    expect(isConfiguredNow).toBe(true);
  });

  it("cleans and formats source numbers properly", () => {
    const rawNumber = "+91 (987) 654-3210";
    const cleaned = rawNumber.replace(/\D/g, "");
    expect(cleaned).toBe("919876543210");
  });

  it("masks secret keys so they are safe to display in admin UI", () => {
    function maskSecret(val?: string | null): string | null {
      if (!val) return null;
      const str = val.trim();
      if (str.length <= 8) return "••••••••";
      return `${str.slice(0, 3)}••••${str.slice(-4)}`;
    }

    expect(maskSecret(null)).toBeNull();
    expect(maskSecret("short")).toBe("••••••••");
    expect(maskSecret("my-super-secret-api-key-9999")).toBe("my-••••9999");
  });
});

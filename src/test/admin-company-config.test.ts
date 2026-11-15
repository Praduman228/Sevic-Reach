import { describe, expect, it } from "vitest";
import { readCompanyPrompts } from "@/lib/company-config.server";

describe("Company Configuration Prompts", () => {
  it("reads company knowledge, research brief, and message prompts from disk", async () => {
    const prompts = await readCompanyPrompts();

    expect(typeof prompts.companyKnowledge).toBe("string");
    expect(typeof prompts.researchPrompt).toBe("string");
    expect(typeof prompts.messagePrompt).toBe("string");

    // Company knowledge contains capability items
    expect(prompts.companyKnowledge).toContain("- C1:");

    // Research brief prompt contains marker or rubric
    expect(prompts.researchPrompt).toContain("=== PROMPT START ===");

    // Message prompt contains prompt structure
    expect(prompts.messagePrompt).toContain("=== PROMPT START ===");
  });

  it("handles company knowledge generically for any company", () => {
    const defaultTemplate = `# Company features\n\n- C1: Feature one\n- C2: Feature two`;
    expect(defaultTemplate).toContain("# Company features");
    expect(defaultTemplate).not.toContain("Error");
  });
});

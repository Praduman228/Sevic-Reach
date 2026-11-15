import fs from "node:fs/promises";
import path from "node:path";

export type CompanyPrompts = {
  companyKnowledge: string;
  researchPrompt: string;
  messagePrompt: string;
};

export async function readCompanyPrompts(): Promise<CompanyPrompts> {
  const root = process.cwd();
  const [knowledge, research, message] = await Promise.all([
    fs.readFile(path.resolve(root, "src/lib/product/company-knowledge.md"), "utf-8").catch(async () => {
      return fs.readFile(path.resolve(root, "src/lib/product/prompts/company-knowledge.md"), "utf-8").catch(() => "");
    }),
    fs.readFile(path.resolve(root, "src/lib/product/research-brief-prompt.md"), "utf-8").catch(() => ""),
    fs.readFile(path.resolve(root, "src/lib/product/prompts/product-message-prompt.md"), "utf-8").catch(async () => {
      return fs.readFile(path.resolve(root, "src/lib/product/product-message-prompt.md"), "utf-8").catch(() => "");
    }),
  ]);

  return {
    companyKnowledge: knowledge,
    researchPrompt: research,
    messagePrompt: message,
  };
}

export async function writeCompanyPrompts(data: {
  companyKnowledge?: string | undefined;
  researchPrompt?: string | undefined;
  messagePrompt?: string | undefined;
}): Promise<void> {
  const root = process.cwd();
  const writes: Promise<void>[] = [];

  if (typeof data.companyKnowledge === "string") {
    writes.push(
      fs.writeFile(path.resolve(root, "src/lib/product/company-knowledge.md"), data.companyKnowledge, "utf-8"),
      fs.writeFile(path.resolve(root, "src/lib/product/prompts/company-knowledge.md"), data.companyKnowledge, "utf-8")
    );
  }

  if (typeof data.researchPrompt === "string") {
    writes.push(
      fs.writeFile(path.resolve(root, "src/lib/product/research-brief-prompt.md"), data.researchPrompt, "utf-8")
    );
  }

  if (typeof data.messagePrompt === "string") {
    writes.push(
      fs.writeFile(path.resolve(root, "src/lib/product/prompts/product-message-prompt.md"), data.messagePrompt, "utf-8"),
      fs.writeFile(path.resolve(root, "src/lib/product/product-message-prompt.md"), data.messagePrompt, "utf-8")
    );
  }

  await Promise.all(writes);
}

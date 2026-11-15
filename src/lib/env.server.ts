import fs from "node:fs/promises";
import path from "node:path";

export async function writeEnvUpdates(updates: Record<string, string>) {
  const envPath = path.resolve(process.cwd(), ".env");

  let content = "";
  try {
    content = await fs.readFile(envPath, "utf-8");
  } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (err.code !== "ENOENT") throw err;
  }

  const lines = content ? content.split(/\r?\n/) : [];
  const handledKeys = new Set<string>();

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed.includes("=")) {
      return line;
    }
    const eqIdx = line.indexOf("=");
    const key = line.slice(0, eqIdx).trim();
    if (key in updates) {
      handledKeys.add(key);
      const val = updates[key] ?? "";
      const escaped = val.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `${key}="${escaped}"`;
    }
    return line;
  });

  for (const [key, val] of Object.entries(updates)) {
    if (!handledKeys.has(key)) {
      const escaped = val.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      newLines.push(`${key}="${escaped}"`);
    }
  }

  const output = newLines.join("\n").trimEnd() + "\n";
  await fs.writeFile(envPath, output, "utf-8");

  // Keep runtime process.env updated immediately
  for (const [key, val] of Object.entries(updates)) {
    process.env[key] = val;
  }
}

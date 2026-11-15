import { createAnthropic } from "@ai-sdk/anthropic";
import { jsonSchema, Output, streamText } from "ai";
import { createAiGatewayRunIdFetch } from "./ai-run-id.server";

/** Final-only drafting consumes Claude's native stream on the server. */
export async function callMessageAI(schema: object | null, instructions: string, input: string): Promise<unknown> {
  const key = process.env["AI_API_KEY"] || process.env["ANTHROPIC_API_KEY"];
  if (!key) throw new Error("AI isn't configured");
  const runIdFetch = createAiGatewayRunIdFetch();
  const baseURL = process.env["AI_GATEWAY_URL"] || "https://api.anthropic.com/v1";
  const anthropic = createAnthropic({
    baseURL,
    apiKey: key,
    fetch: runIdFetch.fetch,
  });
  let streamError: unknown;
  const result = streamText({
    model: anthropic("anthropic/claude-haiku-4-5"),
    // Claude requires a budget; preserve the previously uncapped generation
    // using Haiku's supported maximum instead of a smaller message cap.
    maxOutputTokens: 64000,
    maxRetries: 0,
    onError: ({ error }) => { streamError = error; },
    system: instructions,
    messages: [{ role: "user", content: input }],
    ...(schema ? { output: Output.object({ schema: jsonSchema(schema as Parameters<typeof jsonSchema>[0]) }) } : {}),
  });
  try {
    if (await result.finishReason === "content-filter") throw new Error("The AI provider declined this request; no draft was generated.");
    return schema ? await result.output : await result.text;
  } catch (error) {
    throw streamError ?? error;
  }
}

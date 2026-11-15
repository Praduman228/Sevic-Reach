import { afterEach, describe, expect, it, vi } from "vitest";
import { callMessageAI } from "../lib/message-ai.server";

const schema = { type: "object", additionalProperties: false, required: ["message"], properties: { message: { type: "string" } } };

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Haiku message generation", () => {
  it("uses native streaming Haiku and consumes separated metadata and text chunks", async () => {
    vi.stubEnv("AI_API_KEY", "test-key");
    let request: Record<string, unknown> = {};
    const events = [
      { type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", content: [], model: "anthropic/claude-haiku-4-5", stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } },
      { type: "ping" },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: '{"message":' } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: '"Hello Srishty"}' } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 12 } },
      { type: "message_stop" },
    ];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
      request = JSON.parse(init.body);
      let index = 0;
      return new Response(new ReadableStream({
        pull(controller) {
          const event = events[index++];
          if (!event) { controller.close(); return; }
          const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
          // Split SSE frames as real network reads can do.
          const bytes = new TextEncoder().encode(frame);
          controller.enqueue(bytes.slice(0, 13));
          controller.enqueue(bytes.slice(13));
        },
      }), { headers: { "Content-Type": "text/event-stream" } });
    }));
    expect(await callMessageAI(schema, "Keep the approved tone", "Contact: Srishty")).toEqual({ message: "Hello Srishty" });
    expect(request["model"]).toBe("anthropic/claude-haiku-4-5");
    expect(request["stream"]).toBe(true);
    expect(request["system"]).toEqual(expect.arrayContaining([expect.objectContaining({ text: "Keep the approved tone" })]));
    expect(request["output_config"]).toEqual(expect.objectContaining({ format: expect.objectContaining({ type: "json_schema" }) }));
  });

  it("does not retry a provider denial", async () => {
    vi.stubEnv("AI_API_KEY", "test-key");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ type: "error", error: { type: "permission_error", message: "Provider access denied" } }), { status: 403, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(callMessageAI(schema, "Tone", "Input")).rejects.toThrow("Provider access denied");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("ends a provider refusal without generating a fallback or retry", async () => {
    vi.stubEnv("AI_API_KEY", "test-key");
    const events = [{ type: "message_start", message: { id: "refusal", type: "message", role: "assistant", content: [], model: "anthropic/claude-haiku-4-5", stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } }, { type: "message_delta", delta: { stop_reason: "refusal", stop_sequence: null }, usage: { output_tokens: 0 } }, { type: "message_stop" }];
    const fetchMock = vi.fn(async () => new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(callMessageAI(null, "Tone", "Input")).rejects.toThrow("declined"); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

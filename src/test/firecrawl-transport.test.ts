import { afterEach, describe, expect, it, vi } from "vitest";
import { firecrawl } from "@/lib/firecrawl.server";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Firecrawl transport", () => {
  it("calls api.firecrawl.dev with Firecrawl's own key, never the connector gateway", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-key");
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: [] })));
    vi.stubGlobal("fetch", request);

    await firecrawl("/search", { query: "Studio Lotus architecture firm", limit: 5 });

    const call = request.mock.calls[0];
    if (!call) throw new Error("Expected a Firecrawl request");
    expect(call[0]).toBe("https://api.firecrawl.dev/v2/search");
    const headers = (call[1] as { headers: Record<string, string> }).headers;
    expect(headers["Authorization"]).toBe("Bearer fc-test-key");
    expect(headers["X-Connection-Api-Key"]).toBeUndefined();
  });

  it("refuses to search when no Firecrawl key is linked", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);

    await expect(firecrawl("/scrape", { url: "https://example.com" })).rejects.toThrow("Web search isn't connected");
    expect(request).not.toHaveBeenCalled();
  });
});

describe("Firecrawl temporary rejections", () => {
  it("retries a 403 and succeeds on the next try", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-key");
    const request = vi.fn()
      .mockResolvedValueOnce(new Response('{"type":"api_key_not_registered"}', { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [] })));
    vi.stubGlobal("fetch", request);
    await expect(firecrawl("/search", { query: "x" }, [0, 0])).resolves.toEqual({ success: true, data: [] });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("gives up after 3 tries", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-key");
    const request = vi.fn().mockImplementation(async () => new Response("Forbidden", { status: 403 }));
    vi.stubGlobal("fetch", request);
    await expect(firecrawl("/search", { query: "x" }, [0, 0])).rejects.toThrow("Web search failed (403)");
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("never retries a credit limit", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-key");
    const request = vi.fn().mockImplementation(async () => new Response("Credit limit reached", { status: 403 }));
    vi.stubGlobal("fetch", request);
    await expect(firecrawl("/search", { query: "x" }, [0, 0])).rejects.toThrow("Out of credits");
    expect(request).toHaveBeenCalledTimes(1);
  });
});

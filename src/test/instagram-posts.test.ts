import { describe, expect, it, vi } from "vitest";
import { businessDiscoveryFields, fetchRecentInstagramPosts } from "@/lib/instagram-posts";

describe("lead Instagram posts", () => {
  it("returns only the five most recent posts", async () => {
    const read = vi.fn(async () => ({ business_discovery: { media: { data: Array.from({ length: 7 }, (_, index) => ({ id: String(index), caption: "Courtyard project", permalink: `https://www.instagram.com/p/${index}/`, media_type: "IMAGE", timestamp: `2026-10-${20 + index}T10:00:00Z` })) } } }));
    const posts = await fetchRecentInstagramPosts("@studio", read);
    expect(posts.map((post) => post.id)).toEqual(["6", "5", "4", "3", "2"]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith("business_discovery.username(studio){username,media.limit(5){id,caption,media_type,permalink,timestamp}}");
  });
  it("fetches without generating any AI comment", async () => {
    const posts = await fetchRecentInstagramPosts("studio", async () => ({ business_discovery: { media: { data: [{ id: "1", caption: "New project", permalink: "https://www.instagram.com/p/1/", timestamp: "2026-10-27T10:00:00Z", media_type: "IMAGE" }] } } }));
    expect(posts).toHaveLength(1);
    expect(Object.keys(posts[0] ?? {})).toEqual(["id", "caption", "permalink", "timestamp", "media_type"]);
  });
  it("rejects invalid handles before reading Meta", () => {
    expect(() => businessDiscoveryFields("studio){malicious}")).toThrow("valid Instagram");
  });
});
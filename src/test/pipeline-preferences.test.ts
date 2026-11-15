import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PIPELINE_PREFERENCES, pipelinePreferencesKey, usePipelinePreferences } from "@/lib/pipeline-preferences";

const storage = new Map<string, string>();
const mockStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, String(value)); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => { storage.clear(); },
  get length() { return storage.size; },
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
};

Object.defineProperty(window, "localStorage", { value: mockStorage, configurable: true, writable: true });
Object.defineProperty(globalThis, "localStorage", { value: mockStorage, configurable: true, writable: true });

describe("remembered pipeline filters", () => {
  beforeEach(() => { mockStorage.clear(); vi.restoreAllMocks(); });

  it("restores every filter and selected view after leaving and returning", async () => {
    const saved = { q: "Studio", stage: "outreach", leadStatus: "hot", source: "notion", owner: "team-member", stateF: "Chhattisgarh", cityF: "Raipur", fitF: "strong", teamF: "6-15", listF: "tag-id", view: "list", groupBy: "city" } as const;
    const first = renderHook(() => usePipelinePreferences("member-a"));
    act(() => {
      for (const key of Object.keys(saved) as (keyof typeof saved)[]) first.result.current.setFilter(key, saved[key]);
    });
    first.unmount();
    const returned = renderHook(() => usePipelinePreferences("member-a"));
    await waitFor(() => expect(returned.result.current.preferences).toEqual(saved));
  });

  it("keeps saved filters separate for each signed-in member", async () => {
    mockStorage.setItem(pipelinePreferencesKey("member-a"), JSON.stringify({ cityF: "Raipur" }));
    const hook = renderHook(({ userId }) => usePipelinePreferences(userId), { initialProps: { userId: "member-a" } });
    await waitFor(() => expect(hook.result.current.preferences.cityF).toBe("Raipur"));
    hook.rerender({ userId: "member-b" });
    await waitFor(() => expect(hook.result.current.preferences).toEqual(DEFAULT_PIPELINE_PREFERENCES));
    expect(JSON.parse(mockStorage.getItem(pipelinePreferencesKey("member-a")) ?? "{}").cityF).toBe("Raipur");
  });

  it("clears custom filters and search along with the other saved filters", () => {
    const hook = renderHook(() => usePipelinePreferences("member-a"));
    act(() => { hook.result.current.setFilter("listF", "tag-id"); hook.result.current.setFilter("q", "Studio"); });
    act(() => hook.result.current.clearFilters());
    expect(hook.result.current.preferences).toEqual(DEFAULT_PIPELINE_PREFERENCES);
    expect(JSON.parse(mockStorage.getItem(pipelinePreferencesKey("member-a")) ?? "{}").listF).toBe("all");
  });

  it("uses defaults if saved browser data is corrupt", () => {
    mockStorage.setItem(pipelinePreferencesKey("member-a"), "invalid json");
    const hook = renderHook(() => usePipelinePreferences("member-a"));
    expect(hook.result.current.preferences).toEqual(DEFAULT_PIPELINE_PREFERENCES);
  });
});

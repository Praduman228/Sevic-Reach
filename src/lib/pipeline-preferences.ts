import { useEffect, useState } from "react";
import { z } from "zod";

const preferencesSchema = z.object({
  q: z.string().catch(""),
  stage: z.string().catch("all"),
  leadStatus: z.string().catch("all"),
  source: z.string().catch("all"),
  owner: z.string().catch("all"),
  stateF: z.string().catch("all"),
  cityF: z.string().catch("all"),
  fitF: z.string().catch("all"),
  teamF: z.string().catch("all"),
  listF: z.string().catch("all"),
  view: z.enum(["board", "list", "groups"]).catch("board"),
  groupBy: z.enum(["state", "city"]).catch("state"),
});

export type PipelinePreferences = z.infer<typeof preferencesSchema>;
export const DEFAULT_PIPELINE_PREFERENCES = preferencesSchema.parse({});
export const pipelinePreferencesKey = (userId: string) => `sevicreach:pipeline:${userId}`;

export function usePipelinePreferences(userId: string) {
  const [preferences, setPreferences] = useState(DEFAULT_PIPELINE_PREFERENCES);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    let restored = DEFAULT_PIPELINE_PREFERENCES;
    try {
      const saved = localStorage.getItem(pipelinePreferencesKey(userId));
      if (saved) restored = preferencesSchema.parse(JSON.parse(saved));
    } catch {
      // Corrupt or unavailable browser storage must not block the pipeline.
    }
    setPreferences(restored);
    setLoadedFor(userId);
  }, [userId]);

  useEffect(() => {
    if (loadedFor !== userId) return;
    try {
      localStorage.setItem(pipelinePreferencesKey(userId), JSON.stringify(preferences));
    } catch {
      // Filters still work in memory when browser storage is disabled.
    }
  }, [preferences, loadedFor, userId]);

  function setFilter<K extends keyof PipelinePreferences>(key: K, value: PipelinePreferences[K]) {
    setPreferences((previous) => ({ ...previous, [key]: value }));
  }

  function clearFilters() {
    setPreferences((previous) => ({ ...DEFAULT_PIPELINE_PREFERENCES, view: previous.view, groupBy: previous.groupBy }));
  }

  return { preferences, setFilter, clearFilters };
}
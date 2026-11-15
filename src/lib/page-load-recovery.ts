export function isPageLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /reading 'component'|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
}

export function reloadPageOnce(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const key = "chunk-reload-at";
    const last = Number(window.sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 10_000) return false;
    window.sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // When storage is unavailable, leave the manual refresh action available.
    return false;
  }
  window.location.reload();
  return true;
}
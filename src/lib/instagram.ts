const RESERVED = new Set(["p", "reel", "reels", "explore", "stories", "accounts", "tv"]);

/** Opens an Instagram URL in a real new browser tab. The embedded preview intercepts plain anchor clicks, and Instagram blocks being framed there (ERR_BLOCKED_BY_RESPONSE). */
export function openInstagramUrl(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}


/** Returns a bare Instagram username from a handle or profile URL, or null if invalid. */
export function normalizeInstagram(input: string | null | undefined): string | null {
  let s = String(input ?? "").trim();
  if (!s) return null;
  const m = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) s = m[1] ?? "";
  s = s.replace(/^@/, "").replace(/\/$/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(s) || RESERVED.has(s)) return null;
  return s;
}

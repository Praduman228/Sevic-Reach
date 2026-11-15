// Firecrawl transport for lead enrichment.
//
// The linked FIRECRAWL_API_KEY is Firecrawl's own key and goes directly to api.firecrawl.dev.
const FC = "https://api.firecrawl.dev/v2";

/** Waits between retries of a temporary rejection (403 that isn't a credit limit, 429, 5xx). */
export const RETRY_DELAYS_MS = [1500, 4000];

const isCreditError = (status: number, body: string) => status === 402 || (status === 403 && body.includes("Credit limit"));
const isRetryable = (status: number, body: string) => !isCreditError(status, body) && (status === 403 || status === 429 || status >= 500);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function firecrawl(path: string, body: unknown, delays: number[] = RETRY_DELAYS_MS): Promise<any> {
  const fk = process.env["FIRECRAWL_API_KEY"];
  if (!fk) throw new Error("Web search isn't connected");
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${FC}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${fk}` },
      body: JSON.stringify(body),
    });
    if (r.ok) return r.json();
    const t = await r.text();
    console.error(`Firecrawl ${path} [${r.status}] attempt ${attempt + 1}: ${t}`);
    if (isCreditError(r.status, t)) throw new Error("Out of credits for web search — check Settings → Plans & credits");
    const wait = delays[attempt];
    if (!isRetryable(r.status, t) || wait === undefined) throw new Error(`Web search failed (${r.status})`);
    await sleep(wait);
  }
}

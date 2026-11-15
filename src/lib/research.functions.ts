import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { researchInstructions } from "@/lib/product-messaging";
import { normalizePhone } from "@/lib/contacts";
import { TOUCHES } from "./offer-chain";
import { firecrawl } from "./firecrawl.server";


export type ResearchBrief = {
  summary: string;
  website: string | null;
  instagram?: string | null;
  founders_or_leaders: string[];
  design_style: string;
  notable_projects: string[];
  recent_news: string[];
  pain_points: string[];
  talking_points: string[];
  contact_emails?: string[];
  contact_phones?: string[];
  found_details?: FoundDetails;
  mismatches?: { field: string; in_crm: string; found: string }[];
  filled_fields?: string[];
};

export type FoundDetails = {
  contact_name: string | null;
  city: string | null;
  state: string | null;
  team_size: number | null;
  address: string | null;
};

export type EmailDraft = {
  email_subject: string;
  email_body: string;
};


const briefSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "website", "instagram", "founders_or_leaders", "design_style", "notable_projects", "recent_news", "pain_points", "talking_points", "contact_emails", "contact_phones", "found_details"],
  properties: {
    summary: { type: "string" },
    website: { type: ["string", "null"] },
    instagram: { type: ["string", "null"], description: "The firm's own Instagram username or profile URL if seen in the sources, else null" },
    founders_or_leaders: { type: "array", items: { type: "string" } },
    design_style: { type: "string" },
    notable_projects: { type: "array", items: { type: "string" } },
    recent_news: { type: "array", items: { type: "string" } },
    pain_points: { type: "array", items: { type: "string" } },
    talking_points: { type: "array", items: { type: "string" } },
    contact_emails: { type: "array", items: { type: "string" } },
    contact_phones: { type: "array", items: { type: "string" } },
    found_details: {
      type: "object",
      additionalProperties: false,
      required: ["contact_name", "city", "state", "team_size", "address"],
      properties: {
        contact_name: { type: ["string", "null"] },
        city: { type: ["string", "null"] },
        state: { type: ["string", "null"] },
        team_size: { type: ["integer", "null"] },
        address: { type: ["string", "null"] },
      },
    },
  },
};

async function callResponses(schema: object, schemaName: string, instructions: string, input: string): Promise<unknown> {
  const key = process.env["AI_API_KEY"] || process.env["OPENAI_API_KEY"];
  if (!key) throw new Error("AI isn't configured");
  const endpoint = process.env["AI_RESPONSES_URL"] || "https://api.openai.com/v1/responses";
  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-6-luna",
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      instructions,
      input,
      text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
    }),
  });
  if (!r.ok || !r.body) {
    const t = await r.text();
    console.error(`AI [${r.status}]: ${t}`);
    if (r.status === 402) throw new Error("Out of AI credits — add more in Settings → Plans & credits");
    if (r.status === 429) throw new Error("Too many requests — try again in a minute");
    throw new Error(`AI request failed (${r.status})`);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim();
      if (!d || d === "[DONE]") continue;
      try {
        const ev = JSON.parse(d);
        if (ev.type === "response.output_text.delta") text += ev.delta;
        else if (ev.type === "response.failed" || ev.type === "error") throw new Error(ev.response?.error?.message ?? ev.message ?? "AI failed");
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  if (!text) throw new Error("AI returned no result");
  return JSON.parse(text);
}

async function writeBrief(instructions: string, input: string): Promise<ResearchBrief> {
  return (await callResponses(briefSchema, "brief", instructions, input)) as ResearchBrief;
}

export const enrichFirm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ firmId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => enrichFirmCore(context.supabase as unknown as Sb, data.firmId, context.userId, { draftSequence: true }));

/** Research a firm, fill blank details and save a brief. Shared by the firm page and campaigns. */
export async function enrichFirmCore(sb: Sb, firmId: string, userId: string, opts: { draftSequence: boolean }) {
    const { data: firm, error } = await sb.from("firms").select("*").eq("id", firmId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!firm) throw new Error("Firm not found");

    const query = `${firm.name} ${firm.city ?? ""} architecture firm`.trim();
    const search = await firecrawl("/search", { query, limit: 5, country: "IN", scrapeOptions: { formats: ["markdown"], onlyMainContent: true } });
    const results: { url: string; title?: string; markdown?: string }[] = (search.data?.web ?? search.data ?? []) as never;
    const sources = results.map((x) => ({ url: x.url, title: x.title ?? x.url }));
    const chunks = results.map((x) => `SOURCE: ${x.url}\n${x.title ?? ""}\n${(x.markdown ?? "").slice(0, 4000)}`);

    if (firm.website) {
      try {
        const s = await firecrawl("/scrape", { url: firm.website, formats: ["markdown"], onlyMainContent: true });
        const md: string = s.data?.markdown ?? s.markdown ?? "";
        if (md) {
          chunks.unshift(`OFFICIAL WEBSITE: ${firm.website}\n${md.slice(0, 6000)}`);
          sources.unshift({ url: firm.website, title: "Official website" });
        }
      } catch (e) {
        console.error("website scrape failed", e);
      }
    }
    if (chunks.length === 0) throw new Error("Nothing found on the web for this firm");

    const input = `FIRM: ${firm.name}\nCITY: ${firm.city ?? "unknown"}\nCONTACT: ${firm.contact_name ?? "unknown"}\nTEAM SIZE: ${firm.team_size ?? "unknown"}\nCRM NOTES: ${firm.notes ?? ""}\n\nWEB RESEARCH:\n\n${chunks.join("\n\n---\n\n")}`;
    const brief = await writeBrief(researchInstructions({ name: firm.name, website: firm.website, city: firm.city, contact: firm.contact_name, notes: firm.notes, source: firm.source }), input);

    const fd = brief.found_details;
    const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    const patch: Record<string, string | number> = {};
    const mismatches: { field: string; in_crm: string; found: string }[] = [];
    const filled: string[] = [];
    const check = (field: string, label: string, crm: unknown, found: string | number | null | undefined, same?: (a: string, b: string) => boolean) => {
      if (found === null || found === undefined || String(found).trim() === "") return;
      const c = String(crm ?? "").trim();
      if (!c) { patch[field] = found; filled.push(label); return; }
      const a = norm(c), b = norm(found);
      if (!(same ? same(a, b) : a === b || a.includes(b) || b.includes(a))) mismatches.push({ field: label, in_crm: c, found: String(found) });
    };
    const em = (brief.contact_emails ?? []).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e));
    const phs = (brief.contact_phones ?? []).map((p) => normalizePhone(p)).filter((p): p is string => !!p);
    check("website", "Website", firm.website, brief.website);
    {
      const { normalizeInstagram } = await import("./instagram");
      const fromBrief = normalizeInstagram(brief.instagram);
      const fromSources = results.map((x) => normalizeInstagram(x.url?.includes("instagram.com") ? x.url : null)).find(Boolean) ?? null;
      check("instagram", "Instagram", firm.instagram, fromBrief ?? fromSources, (a, b) => a === b);
    }
    if (em.length) check("email", "Email", firm.email, firm.email && em.includes(firm.email.trim().toLowerCase()) ? firm.email : em[0], (a, b) => a === b);
    if (phs.length) check("phone", "Phone", firm.phone, firm.phone && phs.includes(normalizePhone(firm.phone) ?? "") ? firm.phone : phs[0], (a, b) => a.replace(/\D/g, "").slice(-10) === b.replace(/\D/g, "").slice(-10));
    check("contact_name", "Contact name", firm.contact_name, fd?.contact_name);
    check("city", "City", firm.city, fd?.city);
    check("state", "State", firm.state, fd?.state);
    check("address", "Address", firm.address, fd?.address, () => true);
    if (fd?.team_size && fd.team_size > 0) {
      if (!firm.team_size) { patch["team_size"] = fd.team_size; filled.push("Team size"); }
      else if (Math.abs(firm.team_size - fd.team_size) / Math.max(firm.team_size, fd.team_size) > 0.5) mismatches.push({ field: "Team size", in_crm: String(firm.team_size), found: String(fd.team_size) });
    }
    let applied = filled;
    if (Object.keys(patch).length) {
      const { error: upErr } = await sb.from("firms").update(patch as never).eq("id", firm.id);
      if (upErr) { console.error("detail fill failed", upErr.message); applied = []; }
    }
    brief.mismatches = mismatches;
    brief.filled_fields = applied;
    const { error: insErr } = await sb.from("firm_research").insert({ firm_id: firm.id, brief: brief as never, sources: sources as never, created_by: userId });
    if (insErr) throw new Error(insErr.message);
    let followups = 0;
    if (opts.draftSequence) { try { followups = await generateSequence(sb, firm.id, undefined, userId); } catch (e) { console.error("sequence draft failed", e); } }
    return { ok: true, filled: applied, mismatches: mismatches.length, followups };
}

type Sb = { from: (t: string) => any };

const singleInput = z.object({ firmId: z.string().uuid(), language: z.enum(["en", "hinglish"]).optional() });
export const draftFirmEmail = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(singleInput.parse)
  .handler(async ({data,context}) => {
    const {runDraftChain}=await import("./offer-drafting.server");
    const run=await runDraftChain(context.supabase,context.userId,data.firmId,{kind:"single",channels:["email"],language:data.language});
    const message=run.output.messages[0];
    return {email_subject:message?.email?.subject??"",email_body:message?.email?.body??"",runJson:JSON.stringify(run)};
  });
export const draftFirmWhatsApp = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(singleInput.parse)
  .handler(async ({data,context}) => {
    const {runDraftChain}=await import("./offer-drafting.server");
    const run=await runDraftChain(context.supabase,context.userId,data.firmId,{kind:"single",channels:["whatsapp"],language:data.language});
    return {message:run.output.messages[0]?.whatsapp?.body??"",runJson:JSON.stringify(run)};
  });
export async function generateSequence(sb:Sb,firmId:string,contactId?:string,userId?:string):Promise<number>{
  if(!userId)throw new Error("Signed-in sender required");
  const {persistSequenceRun}=await import("./offer-drafting.server");
  return (await persistSequenceRun(sb,userId,firmId,contactId)).count;
}
export const draftStageSequence=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator(z.object({firmId:z.string().uuid(),contactId:z.string().uuid().optional(),touchId:z.string().max(40).optional()}).parse)
 .handler(async({data,context})=>{
   const {persistSequenceRun}=await import("./offer-drafting.server");
   const result=await persistSequenceRun(context.supabase,context.userId,data.firmId,data.contactId,data.touchId);
   return {count:result.count,runJson:JSON.stringify(result.run)};
 });
export const redraftSequenceStep=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator(z.object({id:z.string().uuid(),contactSequence:z.boolean().optional(),hint:z.string().max(500).optional()}).parse)
 .handler(async({data,context})=>{
   const table=data.contactSequence?"contact_sequence_messages":"sequence_messages";
   const {data:m,error}=await context.supabase.from(table).select("*").eq("id",data.id).single();
   if(error||!m)throw new Error(error?.message??"Message not found");
   if(m.email_status!=="draft"&&m.whatsapp_status!=="draft")throw new Error("Move a channel back to draft first");
   const touch=m.ai_touch_id??TOUCHES[m.stage]?.[m.step]?.id??`${TOUCHES[m.stage]?.[0]?.id.split("-")[0]??"OUT"}-CUSTOM-${m.step}`;
   const {data:siblings}=await context.supabase.from(table).select("email_body,whatsapp_body,ai_touch_id").eq("firm_id",m.firm_id).eq("stage",m.stage).neq("id",m.id);
   const {runDraftChain}=await import("./offer-drafting.server");
   const run=await runDraftChain(context.supabase,context.userId,m.firm_id,{contactId:"contact_id" in m?m.contact_id??undefined:undefined,stage:m.stage,touchId:touch,kind:"redraft",hint:data.hint,siblings,channels:[...(m.email_status==="draft"?["email" as const]:[]),...(m.whatsapp_status==="draft"?["whatsapp" as const]:[])]});
   const out=run.output.messages[0];
   if(!out)return {runJson:JSON.stringify(run)};
   const patch={ai_touch_id:touch,...(m.email_status==="draft"?{email_subject:out.email?.subject??"",email_body:out.email?.body??"",email_ai_run_id:run.id}:{}),...(m.whatsapp_status==="draft"?{whatsapp_body:out.whatsapp?.body??"",whatsapp_ai_run_id:run.id,whatsapp_status:out.whatsapp?.body?"draft":"skipped"}:{}),updated_at:new Date().toISOString()};
   const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
   const {error:upError}=await supabaseAdmin.from(table).update(patch).eq("id",m.id).eq("updated_at",m.updated_at);
   if(upError)throw new Error(upError.message);
   return {runJson:JSON.stringify(run)};
 });

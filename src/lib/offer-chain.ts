import { z } from "zod";
import { messagingStage, type Stage } from "./crm";

export const optionalOffers = ["guided_pilot", "design_partner", "plans", "migration_help", "guarantee"] as const;
export const catalogItemSchema = z.object({ id: z.string().min(1), available: z.boolean(), terms_text: z.string().max(5000), pilot_days: z.number().positive().nullable().optional(), price_text: z.string().max(1000).optional() });
export const catalogSchema = z.array(catalogItemSchema).max(20);
export type CatalogItem = z.infer<typeof catalogItemSchema>;
export const defaultCatalog = (): CatalogItem[] => optionalOffers.map(id => ({ id, available: false, terms_text: "", pilot_days: null, price_text: "" }));
export const availableFactsPolicy = {
  missing_information: "Generate now from available lead facts and the supplied Shegruh knowledge. Do not ask the operator for needs_input, persona, designation or enrichment. Omit unavailable details and use a conservative relevant message instead; never invent facts, prices, project names, meetings, payment, timing or scarcity.",
  offer_selection: "Use confirmed default offers from the offer prompt and Shegruh knowledge; optional catalog offers remain unavailable. Fit recommendations are internal cautions, not reasons to omit requested drafts. For poor fit, write an honest exploratory message without promising suitability.",
  message_tone: "Follow the product-message prompt tone and framing. Do not put placeholders, questions to the operator, missing-input lists or internal uncertainty into the prospect message. Normal prospect-facing CTAs remain allowed.",
  output: "This is draft-only, never a send. Return needs_input as empty arrays and a usable draft for every requested touch, even after a reply, with missing event facts, or a do_not_pitch recommendation. Write a WhatsApp body for review even when eligible is false; retain false eligibility and its reason for the sending boundary. Omit unconfirmed event/payment/price claims, and record cautions in warnings, never in the prospect body. Provider refusals and access restrictions must still be respected.",
} as const;
export function applyAvailableFacts(plan: OfferPlan, output?: MessageOutput) {
  plan.needs_input = [];
  if (plan.status === "needs_input") plan.status = "ok";
  if (output) {
    output.needs_input = [];
    for (const message of output.messages) message.needs_input = [];
  }
}
export function extractPrompt(source: string, knowledge: string) {
  const lines = source.split(/\r?\n/);
  const starts = lines.flatMap((line, i) => line === "=== PROMPT START ===" ? [i] : []);
  const ends = lines.flatMap((line, i) => line === "=== PROMPT END ===" ? [i] : []);
  const start = starts[0], end = ends[0];
  if (starts.length !== 1 || ends.length !== 1 || start === undefined || end === undefined || end <= start) throw new Error("Invalid prompt markers");
  return lines.slice(start + 1, end).join("\n").replaceAll("{{SHEGRUH_MD}}", knowledge);
}
export function mappedStage(stage: Stage) { return stage === "paid" ? "customer" : messagingStage(stage); }
export const TOUCHES: Partial<Record<Stage, { id: string; minutes: number }[]>> = {
  outreach: [0,3,7].map((d,i)=>({id:`OUT-${i+1}`,minutes:d*1440})),
  discovery: [0,2,5,10].map((d,i)=>({id:`DIS-${i+1}`,minutes:d*1440})),
  demo: [0,1,3,7].map((d,i)=>({id:`DEM-${i+1}`,minutes:d*1440})),
  pilot: [60,1440,4320,10080,14400].map((minutes,i)=>({id:`PIL-${i+1}`,minutes})),
  paid: [{id:"CUS-0",minutes:0}],
  customer: [{id:"CUS-0",minutes:0}, ...[30,60,90].map(d=>({id:`CUS-${d}`,minutes:d*1440})), {id:"CUS-M11",minutes:330*1440}],
  nurture: [30,60,90].map(d=>({id:`NUR-${d}`,minutes:d*1440})),
};
const strings = z.array(z.string());
const record = z.record(z.string(), z.unknown());
export const offerPlanSchema = z.object({ schema_version:z.enum(["1.0","1.1"]), stage:z.string(), status:z.enum(["ok","needs_input","do_not_pitch"]), prospect:record, fit:record, stage_offers:z.array(record), offer_for_messages:record.nullable().optional(), offer:record.nullable().optional(), needs_input:strings, warnings:strings, claims_used:strings }).passthrough();
export type OfferPlan = z.infer<typeof offerPlanSchema>;
export function parseOffer(raw:string) {
  const blocks = [...raw.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  if (blocks.length !== 1 || !blocks[0]) throw new Error("Offer step must return one Part B JSON block");
  const offer_plan = offerPlanSchema.parse(JSON.parse(blocks[0][1] ?? ""));
  return {offer_plan, offer_card:raw.slice(0,blocks[0].index).trim()};
}
export const generatedMessageSchema = z.object({ touch_id:z.string(), send_after:z.string(), email:z.object({subject:z.string(),subject_alt:z.string(),body:z.string(),words:z.number()}).nullable(), whatsapp:z.object({eligible:z.boolean(),reason_if_not:z.string().nullable(),body:z.string().nullable(),words:z.number()}).nullable(), needs_input:strings, warnings:strings }).passthrough();
export const messagesOutputSchema = z.object({request:record,messages:z.array(generatedMessageSchema),skipped:z.array(z.object({touch_id:z.string(),reason:z.string()})),needs_input:strings.optional(),warnings:strings.optional()}).passthrough();
export type MessageOutput = z.infer<typeof messagesOutputSchema>;
export type DraftRun = {id:string;firm_id:string;stage:string;contact_id:string|null;offer_card:string;offer_plan:OfferPlan;output:MessageOutput;needs_input:string[];warnings:string[];acknowledged_at:string|null;created_at?:string};
export function collectReview(plan:OfferPlan, output:MessageOutput) {
  return {needs_input:[...new Set([...plan.needs_input,...(output.needs_input??[]),...output.messages.flatMap(m=>m.needs_input)])],warnings:[...new Set([...plan.warnings,...(output.warnings??[]),...output.messages.flatMap(m=>m.warnings),...output.skipped.map(s=>`${s.touch_id}: ${s.reason}`),...output.messages.flatMap(m=>m.whatsapp?.eligible===false?[`${m.touch_id}: WhatsApp — ${m.whatsapp.reason_if_not??"not eligible"}`]:[])])]};
}
export function reviewBlock(run:DraftRun|null|undefined, channel:"email"|"whatsapp", touch?:string, whatsappConsent?:boolean) {
  if (!run) return "";
  if (run.offer_plan.status === "do_not_pitch") return String(run.offer_plan.fit["honest_fit_line"] || (run.offer_plan.fit["reasons"] as string[]|undefined)?.join("; ") || "Do not pitch");
  const message = touch ? run.output.messages.find(m=>m.touch_id===touch) : run.output.messages[0];
  if (!message) return "No generated message for this touch";
  if(channel==="whatsapp" && whatsappConsent!==true && !message.whatsapp?.eligible) return message.whatsapp?.reason_if_not || "WhatsApp is not eligible";
  return "";
}
export function validateOfferCatalog(plan:OfferPlan,catalog:CatalogItem[]) {
  const offer=plan.offer??plan.offer_for_messages??{};
  const live=(id:string)=>catalog.find(c=>c.id===id&&c.available);
  for(const [field,id] of [["price_text","plans"],["plans","plans"],["guarantee_text","guarantee"]] as const){
    if(offer[field] && offer[field] !== (field==="price_text"?live(id)?.price_text:live(id)?.terms_text)) throw new Error(`Offer plan contains unavailable or changed ${field}`);
  }
  if(offer["design_partner"]===true&&!live("design_partner")) throw new Error("Design partner offer is unavailable");
  if(offer["pilot_days"]!=null&&offer["pilot_days"]!==live("guided_pilot")?.pilot_days) throw new Error("Pilot duration is not confirmed in the prompt inputs");
  const terms=offer["pilot_terms"];
  const parts=["live_project_trial","guided_pilot","design_partner","migration_help"].flatMap(id=>live(id)?.terms_text?[live(id)?.terms_text as string]:[]);
  if(typeof terms==="string"&&terms){
    let remaining=terms;for(const part of parts)remaining=remaining.replace(part,"");
    if(!parts.length||remaining.replace(/[\s,;.+&-]/g,"").length)throw new Error("Pilot terms are not confirmed in the prompt inputs");
  }
  for(const stage of plan.stage_offers){
    for(const key of ["lead","supporting"]){const item=stage[key] as {id?:string;terms_text?:string}|null;
      if(item?.id&&optionalOffers.includes(item.id as typeof optionalOffers[number])&&(!live(item.id)||item.terms_text!==live(item.id)?.terms_text)) throw new Error("Offer uses unavailable catalog terms");}
  }
}
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { zohoRegion, zohoSend } from "./zoho.server";
import { firmEmails } from "./contacts";

const STAGE_IDS = ["backlog", "outreach", "discovery", "demo", "pilot", "paid", "customer", "nurture", "lost"] as const;

const sendInput = z.object({
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20000),
  stage: z.enum(STAGE_IDS).nullable().optional(),
  firmIds: z.array(z.string().uuid()).max(500).optional(),
  toEmails: z.array(z.string().email()).max(10).optional(),
  aiRunId: z.string().uuid().optional(),
});

function render(t: string, name: string, studio: string) {
  return t.replaceAll("{{name}}", name).replaceAll("{{studio}}", studio);
}

export const emailConfigStatus = createServerFn({ method: "GET" }).handler(async () => {
  const configured = Boolean(
    process.env['ZOHO_CLIENT_ID'] &&
      process.env['ZOHO_CLIENT_SECRET'] &&
      process.env['ZOHO_REFRESH_TOKEN'] &&
      process.env['ZOHO_SENDER_EMAIL'],
  );
  return { configured, sender: process.env['ZOHO_SENDER_EMAIL'] ?? null, region: zohoRegion() };
});

export const sendBulkEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(sendInput.parse)
  .handler(async ({ data, context }) => {
    const { assertDraftSend } = await import("./offer-drafting.server");
    for (const firmId of data.firmIds ?? []) await assertDraftSend(context.supabase, firmId, "email", data.body, data.aiRunId);
    if (data.aiRunId && data.firmIds?.length !== 1) throw new Error("AI draft must be sent to its reviewed lead");
    const pick = data.toEmails?.length && data.firmIds?.length === 1;
    let q = context.supabase.from("firms").select("id, name, contact_name, email, notes");
    if (!pick) q = q.neq("email", "");
    if (data.firmIds?.length) q = q.in("id", data.firmIds);
    else if (data.stage) q = q.eq("stage", data.stage);
    const { data: firms, error } = await q;
    if (error) throw new Error(error.message);
    let list: { id: string; name: string; contact_name: string | null; email: string }[];
    if (pick) {
      const f = firms?.[0];
      if (!f) throw new Error("Firm not found");
      const known = firmEmails(f);
      const wanted = [...new Set((data.toEmails ?? []).map((e) => e.trim().toLowerCase()))];
      if (wanted.some((e) => !known.includes(e))) throw new Error("Email does not belong to this firm");
      list = wanted.map((email) => ({ id: f.id, name: f.name, contact_name: f.contact_name, email }));
    } else {
      list = (firms ?? [])
        .filter((f) => Boolean(f.email))
        .map((f) => ({ id: f.id, name: f.name, contact_name: f.contact_name, email: f.email as string }));
    }
    if (list.length === 0) return { sent: 0, failed: 0, results: [] as SendResult[] };

    const results: SendResult[] = [];
    let sent = 0;
    let failed = 0;
    for (const f of list) {
      const name = f.contact_name?.trim() || "there";
      const subject = render(data.subject, name, f.name);
      const body = render(data.body, name, f.name);
      let status = "failed";
      let providerId: string | null = null;
      let err: string | null = null;
      try {
        const r = await zohoSend({ to: f.email, subject, body });
        if (r.ok) {
          status = "sent";
          providerId = r.id;
          sent++;
        } else {
          err = r.error;
        }
      } catch (e) {
        err = (e as Error).message;
      }
      if (status !== "sent") {
        failed++;
        err = err ?? "Unknown error";
      }
      const { error: insErr } = await context.supabase.from("email_messages").insert({
        firm_id: f.id,
        direction: "out",
        to_email: f.email,
        subject,
        body,
        status,
        provider_message_id: providerId,
        error: err,
        sent_by: context.userId,
      });
      if (insErr) throw new Error(insErr.message);
      results.push({ firmId: f.id, name: f.name, email: f.email, ok: status === "sent", error: err });
    }
    return { sent, failed, results };
  });

export type SendResult = { firmId: string; name: string; email: string; ok: boolean; error: string | null };

export const checkEmailReplies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { firmId?: string } | undefined) => z.object({ firmId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { zohoSearchFrom, zohoMessageText } = await import("./zoho.server");
    let q = context.supabase.from("email_messages").select("firm_id, to_email, created_at")
      .eq("direction", "out").eq("status", "sent").order("created_at", { ascending: true }).limit(500);
    if (data.firmId) q = q.eq("firm_id", data.firmId);
    const { data: outs, error } = await q;
    if (error) throw new Error(error.message);
    // earliest send per (firm, address)
    const pairs = new Map<string, { firmId: string; email: string; since: number }>();
    for (const o of outs ?? []) {
      if (!o.firm_id) continue;
      const k = `${o.firm_id}|${o.to_email.toLowerCase()}`;
      if (!pairs.has(k)) pairs.set(k, { firmId: o.firm_id, email: o.to_email.toLowerCase(), since: new Date(o.created_at).getTime() });
    }
    const list = [...pairs.values()].slice(0, 40);
    const me = process.env["ZOHO_SENDER_EMAIL"] ?? "";
    let found = 0;
    for (const p of list) {
      const msgs = (await zohoSearchFrom(p.email)).filter((m) => m.receivedTime >= p.since - 60_000);
      if (!msgs.length) continue;
      const ids = msgs.map((m) => m.messageId);
      const { data: have } = await context.supabase.from("email_messages").select("provider_message_id").in("provider_message_id", ids);
      const known = new Set((have ?? []).map((h) => h.provider_message_id));
      for (const m of msgs) {
        if (known.has(m.messageId)) continue;
        const body = (await zohoMessageText(m.folderId, m.messageId)) ?? m.summary;
        const { error: insErr } = await context.supabase.from("email_messages").insert({
          firm_id: p.firmId, direction: "in", to_email: me, from_email: p.email,
          subject: m.subject || "(no subject)", body: body || "(empty)", status: "received",
          provider_message_id: m.messageId, sent_by: context.userId,
          created_at: new Date(m.receivedTime || Date.now()).toISOString(),
        });
        if (!insErr) found++;
      }
    }
    return { checked: list.length, found };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { firmPhones, normalizePhone } from "./contacts";
import { sendGupshupWhatsApp } from "./whatsapp.server";

export const sendWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      firmId: z.string().uuid(),
      text: z.string().trim().min(1).max(4000),
      phones: z.array(z.string().max(30)).max(10).optional(),
      aiRunId: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertDraftSend } = await import("./offer-drafting.server");
    await assertDraftSend(supabase, data.firmId, "whatsapp", data.text, data.aiRunId);
    const { data: firm, error } = await supabase.from("firms").select("id, name, contact_name, phone, notes, whatsapp_opt_in").eq("id", data.firmId).maybeSingle();
    if (error || !firm) throw new Error("Firm not found");
    if (!firm.whatsapp_opt_in) throw new Error("This firm has not opted in to WhatsApp");

    const known = firmPhones(firm);
    let targets: string[];
    if (data.phones?.length) {
      targets = [...new Set(data.phones.map(normalizePhone).filter((p): p is string => !!p))];
      if (targets.some((p) => !known.includes(p))) throw new Error("Number does not belong to this firm");
    } else {
      targets = firm.phone ? [normalizePhone(firm.phone) ?? firm.phone] : [];
    }
    if (targets.length === 0) throw new Error("This firm has no phone number");

    const errors: string[] = [];
    for (const phone of targets) {
      const { data: inbound, error: inboundError } = await supabase.from("whatsapp_messages").select("created_at").eq("firm_id", firm.id).eq("phone", phone).eq("direction", "in").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (inboundError) throw new Error(inboundError.message);
      const result = await sendGupshupWhatsApp({ phone, text: data.text, firm, lastInboundAt: inbound?.created_at });
      const err = result.error;

      const { error: insErr } = await supabase.from("whatsapp_messages").insert({
        firm_id: firm.id, direction: "out", phone, body: result.body,
        status: result.id ? "submitted" : "failed", provider_message_id: result.id, error: err, sent_by: userId,
      });
      if (insErr) throw new Error(insErr.message);
      if (err) errors.push(`${phone}: ${err}`);
    }
    if (errors.length === targets.length) throw new Error(errors.join("; "));
    return { ok: true, sent: targets.length - errors.length, failed: errors };
  });

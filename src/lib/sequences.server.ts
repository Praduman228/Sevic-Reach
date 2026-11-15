import { zohoSend } from "./zoho.server";
import { selectedRecipients, personaliseForContact } from "./sequence-recipients";
import { sendGupshupWhatsApp } from "./whatsapp.server";
import { summaryStatus } from "./sequences";
import { matchesSequenceStage } from "./crm";
import { reviewBlock, type DraftRun } from "./offer-chain";

type Patch = { email_status?: string; whatsapp_status?: string; email_sent_at?: string; whatsapp_sent_at?: string; sent_at?: string };
type Sb = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Send approved, due sequence messages. Email and WhatsApp are approved and sent independently; each channel is claimed before sending. */
async function sendTable(sb: Sb, table: "sequence_messages" | "contact_sequence_messages", opts: { firmId?: string; userId?: string | null; limit?: number } = {}) {
  const deliveryTable = table === "sequence_messages" ? "sequence_deliveries" : "contact_sequence_deliveries";
  const scope = (q: any, m: any) => table === "contact_sequence_messages" ? q.eq("contact_id", m.contact_id) : q;
  let q = sb.from(table).select("*").or("email_status.eq.approved,whatsapp_status.eq.approved").lte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(opts.limit ?? 25);
  if (opts.firmId) q = q.eq("firm_id", opts.firmId);
  const { data: due, error } = await q;
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const m of due ?? []) {
    const finish = async (patch: Patch, note: string) => {
      const { data: cur } = await sb.from(table).select("email_status, whatsapp_status, result").eq("id", m.id).maybeSingle();
      const e = patch.email_status ?? cur?.email_status ?? m.email_status;
      const w = patch.whatsapp_status ?? cur?.whatsapp_status ?? m.whatsapp_status;
      const result = [cur?.result, note].filter(Boolean).join(" · ").slice(-500);
      const { error } = await sb.from(table).update({ ...patch, status: summaryStatus(e, w), result, updated_at: new Date().toISOString() }).eq("id", m.id);
      if (error) throw new Error(error.message);
    };
    // One blocked or broken message must not stop the rest of the batch.
    try {
    const { data: firm, error: firmError } = await sb.from("firms").select("id, name, contact_name, stage, email, phone, whatsapp_opt_in").eq("id", m.firm_id).maybeSingle();
    if(firmError)throw new Error(firmError.message);
    const claim = async (col: "email_status" | "whatsapp_status") => {
      if (m[col] !== "approved") return false;
      const runId = col === "email_status" ? m.email_ai_run_id : m.whatsapp_ai_run_id;
      if (runId) {
        const {data:run,error:reviewError}=await sb.from("ai_draft_runs").select("*").eq("id",runId).single();
        if(reviewError)throw new Error(reviewError.message);
        const block=reviewBlock(run as DraftRun,col==="email_status"?"email":"whatsapp",m.ai_touch_id,firm?.whatsapp_opt_in===true);
        if(block)throw new Error(block);
      }
      const { data, error } = await sb.from(table).update({ [col]: "sending", updated_at: new Date().toISOString() }).eq("id", m.id).eq(col, "approved").select("id");
      if (error) throw new Error(error.message);
      return !!data?.length;
    };
    const doEmail = await claim("email_status");
    const doWa = await claim("whatsapp_status");
    if (!doEmail && !doWa) continue;
    const skipClaimed = (reason: string) => finish({ ...(doEmail ? { email_status: "skipped" } : {}), ...(doWa ? { whatsapp_status: "skipped" } : {}) }, reason);

    if (!firm || !matchesSequenceStage(firm.stage, m.stage)) { await skipClaimed("Firm moved to another stage"); continue; }
    // Stop follow-ups once the firm has replied after the first message.
    if (m.step > 0) {
      const { data: first } = await scope(sb.from(table).select("sent_at").eq("firm_id", m.firm_id).eq("stage", m.stage).eq("step", 0), m).maybeSingle();
      if (first?.sent_at) {
        const { data: target } = m.contact_id ? await sb.from("firm_contacts").select("email, phone").eq("id", m.contact_id).eq("firm_id", m.firm_id).maybeSingle() : { data: null };
        if (table === "contact_sequence_messages" && !target) { await skipClaimed("Contact was removed"); continue; }
        const replyScope = (q: any, ch: "email" | "phone") => target ? q.eq(ch === "email" ? "from_email" : "phone", target[ch] ?? "") : q;
        const [e, w] = await Promise.all([
          replyScope(sb.from("email_messages").select("id").eq("firm_id", m.firm_id).eq("direction", "in").gte("created_at", first.sent_at), "email").limit(1),
          replyScope(sb.from("whatsapp_messages").select("id").eq("firm_id", m.firm_id).eq("direction", "in").gte("created_at", first.sent_at), "phone").limit(1),
        ]);
        if (e.data?.length || w.data?.length) { await skipClaimed("Firm replied — follow-up stopped"); continue; }
      }
    }
    const notes: string[] = [];
    const patch: Patch = {};
    const now = new Date().toISOString();
    let ok = 0;
    const { data: contacts, error: contactsError } = await sb.from("firm_contacts").select("id, name, email, phone").eq("firm_id", firm.id);
    for (const channel of ["email", "whatsapp"] as const) {
      if (!(channel === "email" ? doEmail : doWa)) continue;
      const statusCol = channel === "email" ? "email_status" : "whatsapp_status";
      try {
        if (contactsError) throw new Error(contactsError.message);
        if (table === "contact_sequence_messages" && !m.contact_id) throw new Error("Contact was removed");
        const recipients = selectedRecipients(firm, contacts ?? [], channel, channel === "email" ? m.email_contact_ids : m.whatsapp_contact_ids);
        if (table === "contact_sequence_messages" && recipients.some((r) => r.id !== m.contact_id)) throw new Error("Select only this sequence’s contact");
        const text = channel === "email" ? m.email_body : m.whatsapp_body;
        if (!recipients.length || !text.trim() || (channel === "whatsapp" && !firm.whatsapp_opt_in)) {
          patch[statusCol] = "skipped";
          notes.push(`${channel}: ${!recipients.length ? "No selected recipients" : !text.trim() ? "Empty message" : "No WhatsApp opt-in"}`);
          continue;
        }
        let succeeded = 0, failed = 0;
        for (const recipient of recipients) {
          const address = recipient.address;
          const { data: previous, error: readError } = await sb.from(deliveryTable).select("*").eq("sequence_id", m.id).eq("channel", channel).eq("address", address).maybeSingle();
          if (readError) throw new Error(readError.message);
          // Never resend successful or ambiguous attempts when retrying a partly failed channel.
          if (previous?.status === "sent") { succeeded++; continue; }
          if (previous && previous.status !== "failed") { failed++; notes.push(`${address}: unresolved attempt — check history before retrying`); continue; }
          let deliveryId: string;
          if (previous) {
            const { data: claimed, error } = await sb.from(deliveryTable).update({ status: "sending", error: null }).eq("id", previous.id).eq("status", "failed").select("id").maybeSingle();
            if (error) throw new Error(error.message);
            if (!claimed) { failed++; continue; }
            deliveryId = claimed.id;
          } else {
            const { data: reserved, error } = await sb.from(deliveryTable).insert({ sequence_id: m.id, channel, address, contact_name: recipient.name, status: "sending" }).select("id").single();
            if (error || !reserved) throw new Error(error?.message ?? "Could not reserve recipient send");
            deliveryId = reserved.id;
          }
          const body = personaliseForContact(text, recipient.name, firm.name, true);
          const subject = personaliseForContact(m.email_subject || "Hello from Shegruh", recipient.name, firm.name);
          // A transport exception leaves a durable unresolved attempt, not a blind retry.
          let providerId: string | null = null, sendError: string | null = null;
          try {
            if (channel === "email") {
              const r = await zohoSend({ to: address, subject, body });
              providerId = r.id; sendError = r.ok ? null : r.error || "Email request rejected";
              const { error } = await sb.from("email_messages").insert({ firm_id: firm.id, direction: "out", to_email: address, subject, body, status: r.ok ? "sent" : "failed", provider_message_id: r.id, error: sendError, sent_by: opts.userId ?? null });
              if (error) throw new Error(error.message);
            } else {
              const { data: inbound, error } = await sb.from("whatsapp_messages").select("created_at").eq("firm_id", firm.id).eq("phone", address).eq("direction", "in").order("created_at", { ascending: false }).limit(1).maybeSingle();
              if (error) throw new Error(error.message);
              const r = await sendGupshupWhatsApp({ phone: address, text: body, firm: { ...firm, contact_name: recipient.name }, lastInboundAt: inbound?.created_at, template: m.whatsapp_template });
              providerId = r.id; sendError = r.id ? null : r.error || "WhatsApp request rejected";
              const { error: logError } = await sb.from("whatsapp_messages").insert({ firm_id: firm.id, direction: "out", phone: address, body: r.body, status: r.id ? "submitted" : "failed", provider_message_id: r.id, error: sendError, sent_by: opts.userId ?? null });
              if (logError) throw new Error(logError.message);
            }
            const success = !sendError;
            const { error } = await sb.from(deliveryTable).update({ status: success ? "sent" : "failed", provider_message_id: providerId, error: sendError, sent_at: success ? now : null }).eq("id", deliveryId);
            if (error) throw new Error(error.message);
            if (success) { succeeded++; ok++; } else { failed++; notes.push(`${address}: ${sendError}`); }
          } catch (e) {
            const { error } = await sb.from(deliveryTable).update({ status: "unknown", provider_message_id: providerId, error: `Outcome requires review: ${(e as Error).message}` }).eq("id", deliveryId);
            if (error) throw new Error(error.message);
            failed++; notes.push(`${address}: outcome requires review`);
          }
        }
        patch[statusCol] = failed ? "failed" : "sent";
        if (succeeded) { if (channel === "email") patch.email_sent_at = now; else patch.whatsapp_sent_at = now; }
        notes.push(`${channel}: ${succeeded}/${recipients.length} accepted${failed ? `, ${failed} failed or unresolved` : ""}`);
      } catch (e) { patch[statusCol] = "failed"; notes.push(`${channel}: ${(e as Error).message}`); }
    }
    const firstOut = ok > 0 && !m.sent_at;
    if (firstOut) patch.sent_at = now;
    await finish(patch, notes.join(" · "));
    if (ok) sent++;
    // First message out → schedule the already-approved follow-ups from its send time.
    if (firstOut && m.step === 0) {
      const { data: rest } = await scope(sb.from(table).select("id, offset_minutes").eq("firm_id", m.firm_id).eq("stage", m.stage).gt("step", 0).or("email_status.eq.approved,whatsapp_status.eq.approved"), m);
      for (const r of rest ?? []) await sb.from(table).update({ scheduled_at: new Date(Date.parse(now) + r.offset_minutes * 60000).toISOString() }).eq("id", r.id);
    }
    } catch (e) {
      // Mark only the still-approved channels failed with the reason; claimed channels keep their state.
      const patch: Patch = {};
      if (m.email_status === "approved") patch.email_status = "failed";
      if (m.whatsapp_status === "approved") patch.whatsapp_status = "failed";
      await finish(patch, `Send stopped: ${(e as Error).message}`).catch(() => {});
    }
  }
  return { sent, checked: due?.length ?? 0 };
}

export async function sendDueSequenceMessages(sb: Sb, opts: { firmId?: string; userId?: string | null; limit?: number } = {}) {
  const legacy = await sendTable(sb, "sequence_messages", opts);
  const contacts = await sendTable(sb, "contact_sequence_messages", opts);
  return { sent: legacy.sent + contacts.sent, checked: legacy.checked + contacts.checked };
}

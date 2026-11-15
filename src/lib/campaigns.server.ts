import { fitScore, isLowFit, channelReadiness, isPausingError, isAutoResumePause, shouldAutoResume, MAX_ATTEMPTS, nextPhase, readyForNextFirm, type Channel, type Phase } from "./campaign";
import { matchesSequenceStage, type Stage } from "./crm";

type Sb = { from: (t: string) => any; rpc?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const LOCK_MS = 2 * 60_000;

type Campaign = { id: string; channels: Channel[]; created_by: string | null; status: string; motto: string | null };
type Row = { id: string; firm_id: string; status: string; phase: Phase; attempts: number; started_at: string | null; missing: string[] };

async function readiness(sb: Sb, firmId: string, channels: Channel[]) {
  const [{ data: firm, error }, { data: contacts, error: cErr }] = await Promise.all([
    sb.from("firms").select("id, name, contact_name, email, phone, whatsapp_opt_in, stage").eq("id", firmId).maybeSingle(),
    sb.from("firm_contacts").select("id, name, email, phone").eq("firm_id", firmId),
  ]);
  if (error || cErr) throw new Error((error ?? cErr).message);
  if (!firm) throw new Error("Firm was deleted");
  // Campaigns that include WhatsApp turn on the firm's WhatsApp opt-in when it has a phone number (owner's choice).
  if (channels.includes("whatsapp") && firm.whatsapp_opt_in !== true && firm.phone?.trim()) {
    await update(sb, "firms", firmId, { whatsapp_opt_in: true });
    firm.whatsapp_opt_in = true;
  }
  return { firm, ...channelReadiness(firm, contacts ?? [], channels) };
}

async function update(sb: Sb, table: string, id: string, patch: Record<string, unknown>) {
  const { error } = await sb.from(table).update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Runs one bounded phase (research, draft or send) for one firm. */
async function runPhase(sb: Sb, campaign: Campaign, row: Row) {
  const userId = campaign.created_by;
  if (!userId) throw new Error("Campaign has no creator to send as");
  const now = new Date().toISOString();
  if (row.phase === "research") {
    const { data: existing } = await sb.from("firm_research").select("id").eq("firm_id", row.firm_id).limit(1);
    if (!existing?.length) {
      const { enrichFirmCore } = await import("./research.functions");
      try { await enrichFirmCore(sb, row.firm_id, userId, { draftSequence: false }); }
      catch (e) { if (!/Nothing found/i.test((e as Error).message)) throw e; }
    }
    const { data: brief } = await sb.from("firm_research").select("brief").eq("firm_id", row.firm_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const score = fitScore(brief?.brief?.summary);
    if (isLowFit(score)) return update(sb, "campaign_firms", row.id, { status: "low_fit", fit_score: score, processed_at: now, error: null });
    const r = await readiness(sb, row.firm_id, campaign.channels);
    if (!r.usable.length) return update(sb, "campaign_firms", row.id, { status: "missing_contact", fit_score: score, missing: r.missing, processed_at: now, error: null });
    return update(sb, "campaign_firms", row.id, { fit_score: score, phase: nextPhase("research"), missing: r.missing, attempts: 0, error: null });
  }
  if (row.phase === "draft") {
    const { persistSequenceRun } = await import("./offer-drafting.server");
    await persistSequenceRun(sb, userId, row.firm_id, undefined, undefined, campaign.motto ?? undefined);
    return update(sb, "campaign_firms", row.id, { phase: nextPhase("draft"), attempts: 0, error: null });
  }
  // send: approve this firm's drafted follow-ups on usable channels; Day 0 goes now, later ones after it is sent.
  const r = await readiness(sb, row.firm_id, campaign.channels);
  if (!r.usable.length) return update(sb, "campaign_firms", row.id, { status: "missing_contact", missing: r.missing, processed_at: now });
  const { data: msgs, error } = await sb.from("sequence_messages").select("id, stage, step, email_status, whatsapp_status, email_body, whatsapp_body").eq("firm_id", row.firm_id);
  if (error) throw new Error(error.message);
  let approved = 0;
  for (const m of (msgs ?? []).filter((m: any) => matchesSequenceStage(r.firm.stage as Stage, m.stage))) {
    const patch: Record<string, unknown> = {};
    if (r.usable.includes("email") && m.email_status === "draft" && m.email_body?.trim()) patch["email_status"] = "approved";
    if (r.usable.includes("whatsapp") && m.whatsapp_status === "draft" && m.whatsapp_body?.trim()) patch["whatsapp_status"] = "approved";
    if (!Object.keys(patch).length) continue;
    approved++;
    await update(sb, "sequence_messages", m.id, { ...patch, status: "approved", approved_at: now, ...(m.step === 0 ? { scheduled_at: now } : {}), updated_at: now });
  }
  if (!approved) return update(sb, "campaign_firms", row.id, { status: "failed", error: "No drafted messages to send", processed_at: now });
  const { sendDueSequenceMessages } = await import("./sequences.server");
  await sendDueSequenceMessages(sb, { firmId: row.firm_id, userId });
  return update(sb, "campaign_firms", row.id, { status: "scheduled", missing: r.missing, processed_at: now, error: null });
}

/** One step for one running campaign. Single-flight per campaign via a lease row; at most one firm in progress. */
async function tickCampaign(sb: Sb, campaign: Campaign) {
  const nowMs = Date.now();
  const { data: claimed, error } = await sb.from("campaigns").update({ lock_until: new Date(nowMs + LOCK_MS).toISOString(), last_run_at: new Date(nowMs).toISOString() })
    .eq("id", campaign.id).eq("status", "running").or(`lock_until.is.null,lock_until.lt.${new Date(nowMs).toISOString()}`).select("id");
  if (error) throw new Error(error.message);
  if (!claimed?.length) return "busy";
  try {
    const { data: rows, error: rErr } = await sb.from("campaign_firms").select("*").eq("campaign_id", campaign.id).in("status", ["pending", "processing"]).order("created_at");
    if (rErr) throw new Error(rErr.message);
    let row: Row | undefined = (rows ?? []).find((r: Row) => r.status === "processing");
    if (!row) {
      const { data: last } = await sb.from("campaign_firms").select("started_at").eq("campaign_id", campaign.id).not("started_at", "is", null).order("started_at", { ascending: false }).limit(1);
      const next = (rows ?? []).find((r: Row) => r.status === "pending");
      if (!next) { await update(sb, "campaigns", campaign.id, { status: "completed", completed_at: new Date().toISOString() }); return "completed"; }
      if (!readyForNextFirm(last?.[0]?.started_at, nowMs)) return "waiting";
      row = { ...next, status: "processing", phase: "research", attempts: 0 } as Row;
      await update(sb, "campaign_firms", next.id, { status: "processing", phase: "research", attempts: 0, started_at: new Date().toISOString() });
    }
    const current = row as Row;
    return await advance(sb, campaign, current);
  } finally {
    await sb.from("campaigns").update({ lock_until: null }).eq("id", campaign.id);
  }
}

async function advance(sb: Sb, campaign: Campaign, row: Row) {
    if (row.attempts >= MAX_ATTEMPTS) {
      await update(sb, "campaign_firms", row.id, { status: "failed", processed_at: new Date().toISOString() });
      return "failed";
    }
    await update(sb, "campaign_firms", row.id, { attempts: row.attempts + 1 });
    try { await runPhase(sb, campaign, row); return "progressed"; }
    catch (e) {
      const msg = (e as Error).message.slice(0, 500);
      // Temporary web search rejections: keep the campaign running and retry the same firm on the next tick,
      // without using up one of its attempts.
      if (isAutoResumePause(msg)) {
        await update(sb, "campaign_firms", row.id, { attempts: row.attempts, error: `${msg} — retrying automatically` });
        return "retrying";
      }
      if (isPausingError(msg)) {
        await update(sb, "campaigns", campaign.id, { status: "paused", pause_reason: msg, updated_at: new Date().toISOString() });
        await update(sb, "campaign_firms", row.id, { attempts: row.attempts, error: msg });
        return "paused";
      }
      const final = row.attempts + 1 >= MAX_ATTEMPTS;
      await update(sb, "campaign_firms", row.id, final ? { status: "failed", error: msg, processed_at: new Date().toISOString() } : { error: msg });
      return "error";
    }
}

/** Campaigns paused by a temporary web search rejection restart themselves after a short wait. */
async function autoResume(sb: Sb, campaignId?: string) {
  let q = sb.from("campaigns").select("id, pause_reason, updated_at").eq("status", "paused").or("pause_reason.ilike.%web search failed%,pause_reason.ilike.forbidden");
  if (campaignId) q = q.eq("id", campaignId);
  const { data } = await q;
  for (const c of data ?? []) {
    if (!shouldAutoResume(c.pause_reason, c.updated_at)) continue;
    // Only flips a campaign that is still paused for the same reason, so a manual pause is never undone.
    await sb.from("campaigns").update({ status: "running", pause_reason: null, updated_at: new Date().toISOString() })
      .eq("id", c.id).eq("status", "paused").eq("pause_reason", c.pause_reason);
  }
}

export async function runCampaignTick(sb: Sb, campaignId?: string) {
  await autoResume(sb, campaignId);
  let q = sb.from("campaigns").select("id, channels, created_by, status, motto").eq("status", "running").order("launched_at").limit(5);
  if (campaignId) q = q.eq("id", campaignId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const results: Record<string, string> = {};
  for (const c of data ?? []) results[c.id] = await tickCampaign(sb, c as Campaign);
  return results;
}


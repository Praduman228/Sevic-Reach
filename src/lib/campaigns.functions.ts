import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertTeam(context: { supabase: any; userId: string }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data, error } = await context.supabase.rpc("is_team_member", { _user_id: context.userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only team members can run campaigns");
}

/** Test a campaign on one firm: research it if needed and draft its three messages. Saves nothing to the follow-up queue and sends nothing. */
export const previewCampaignFirm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ firmId: z.string().uuid(), channels: z.array(z.enum(["email", "whatsapp"])).min(1).max(2), motto: z.string().max(500).optional() }).parse)
  .handler(async ({ data, context }) => {
    await assertTeam(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as never;
    const { data: existing } = await supabaseAdmin.from("firm_research").select("id").eq("firm_id", data.firmId).limit(1);
    let researchNote: string | null = null;
    if (!existing?.length) {
      const { enrichFirmCore } = await import("./research.functions");
      try { await enrichFirmCore(sb, data.firmId, context.userId, { draftSequence: false }); researchNote = "Researched now"; }
      catch (e) { researchNote = `Research unavailable: ${(e as Error).message}`; }
    }
    const { runDraftChain } = await import("./offer-drafting.server");
    const run = await runDraftChain(sb, context.userId, data.firmId, { channels: data.channels, kind: "campaign_preview", motto: data.motto });
    const [{ data: firm }, { data: contacts }] = await Promise.all([
      supabaseAdmin.from("firms").select("name, contact_name, email, phone, whatsapp_opt_in").eq("id", data.firmId).single(),
      supabaseAdmin.from("firm_contacts").select("id, name, email, phone").eq("firm_id", data.firmId),
    ]);
    const { channelReadiness, fitScore, isLowFit } = await import("./campaign");
    const { data: brief } = await supabaseAdmin.from("firm_research").select("brief").eq("firm_id", data.firmId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const score = fitScore((brief?.brief as { summary?: string } | null)?.summary);
    const ready = firm ? channelReadiness(firm, contacts ?? [], data.channels) : { usable: [], missing: ["Firm not found"] };
    return {
      researchNote,
      fitScore: score,
      lowFit: isLowFit(score),
      missing: ready.missing,
      messages: run.output.messages.map((m) => ({
        touch: m.touch_id,
        emailSubject: m.email?.subject ?? "",
        emailBody: m.email?.body ?? "",
        whatsapp: m.whatsapp?.body ?? "",
      })),
    };
  });

/** Advance running campaigns by one step while the app is open (the scheduler also does this). */
export const processCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ campaignId: z.string().uuid().optional() }).parse)
  .handler(async ({ data, context }) => {
    await assertTeam(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runCampaignTick } = await import("./campaigns.server");
    return runCampaignTick(supabaseAdmin as never, data.campaignId);
  });

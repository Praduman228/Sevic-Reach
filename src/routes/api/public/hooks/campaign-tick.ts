import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Called every minute by the scheduler. Advances each running campaign by one bounded step.
export const Route = createFileRoute("/api/public/hooks/campaign-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runCampaignTick } = await import("@/lib/campaigns.server");
        try {
          return Response.json({ ok: true, results: await runCampaignTick(supabaseAdmin as never) });
        } catch (e) {
          console.error("campaign-tick failed", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});

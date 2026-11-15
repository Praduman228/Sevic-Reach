import { createFileRoute } from "@tanstack/react-router";

// Called hourly by the scheduler. Only sends messages a team member already approved
// and whose time has come, each claimed once — so a stray call can't send anything extra.
export const Route = createFileRoute("/api/public/hooks/send-sequences")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace("Bearer ", "");
        if (!token) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendDueSequenceMessages } = await import("@/lib/sequences.server");
        try {
          const r = await sendDueSequenceMessages(supabaseAdmin as never, { limit: 100 });
          return Response.json({ ok: true, sent: r.sent });
        } catch (e) {
          console.error("send-sequences failed", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});

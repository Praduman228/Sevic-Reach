import { createFileRoute } from "@tanstack/react-router";

const ORDER = ["queued", "submitted", "enqueued", "sent", "delivered", "read"];

export const Route = createFileRoute("/api/public/gupshup-webhook")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async ({ request }) => {
        let body: any;
        try { body = await request.json(); } catch { return new Response("ok"); }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const p = body?.payload;
        if (!p || typeof p !== "object") return new Response("ok");

        if (body.type === "message-event") {
          const id = String(p.gsId ?? p.id ?? "").slice(0, 100);
          const t = String(p.type ?? "");
          if (!id || !t) return new Response("ok");
          const { data: msg } = await supabaseAdmin.from("whatsapp_messages").select("id, status").eq("provider_message_id", id).maybeSingle();
          if (!msg) return new Response("ok");
          if (t === "failed") {
            await supabaseAdmin.from("whatsapp_messages").update({ status: "failed", error: String(p.payload?.reason ?? "Failed").slice(0, 300), updated_at: new Date().toISOString() }).eq("id", msg.id);
          } else if (ORDER.indexOf(t) > ORDER.indexOf(msg.status)) {
            await supabaseAdmin.from("whatsapp_messages").update({ status: t, updated_at: new Date().toISOString() }).eq("id", msg.id);
          }
        } else if (body.type === "message") {
          const phone = String(p.source ?? p.sender?.phone ?? "").replace(/\D/g, "").slice(0, 20);
          const text = String(p.payload?.text ?? p.payload?.caption ?? `[${p.type ?? "message"}]`).slice(0, 4000);
          if (!phone) return new Response("ok");
          const { data: firm } = await supabaseAdmin.from("firms").select("id").eq("phone", `+${phone}`).limit(1).maybeSingle();
          const { data: contacts, error: contactError } = !firm ? await supabaseAdmin.from("firm_contacts").select("firm_id").eq("phone", `+${phone}`).limit(2) : { data: [], error: null };
          if (contactError) return new Response("Contact lookup failed", { status: 500 });
          const matchedId = firm?.id ?? (contacts?.length === 1 ? contacts[0]?.firm_id : null);
          if (!matchedId) return new Response("ok"); // ignore unknown or ambiguous numbers
          await supabaseAdmin.from("whatsapp_messages").upsert({
            firm_id: matchedId, direction: "in", phone: `+${phone}`, body: text, status: "received",
            provider_message_id: p.id ? String(p.id).slice(0, 100) : null,
          }, { onConflict: "provider_message_id", ignoreDuplicates: true });
        }
        return new Response("ok");
      },
    },
  },
});

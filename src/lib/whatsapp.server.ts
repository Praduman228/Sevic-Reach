import { hasWhatsAppWindow, personalisedTemplate } from "./whatsapp-template";

type SendInput = {
  phone: string;
  text: string;
  firm: { name: string; contact_name?: string | null };
  lastInboundAt?: string | null | undefined;
  /** Approved template to use outside the 24-hour window: shegruhmessage (intro) or outreach1 (follow-up). */
  template?: string | null | undefined;
};

/** One transport for manual messages and approved follow-ups. */
export async function sendGupshupWhatsApp(input: SendInput) {
  const apiKey = process.env["GUPSHUP_API_KEY"];
  const appName = process.env["GUPSHUP_APP_NAME"];
  const source = process.env["GUPSHUP_SOURCE_NUMBER"];
  const template = !hasWhatsAppWindow(input.lastInboundAt);
  let body = input.text;
  try {
    const form = new URLSearchParams({ channel: "whatsapp", source: source ?? "", destination: input.phone.replace(/\D/g, ""), "src.name": appName ?? "" });
    if (template) {
      const filled = personalisedTemplate(input.text, input.firm, input.template);
      body = filled.body;
      form.set("template", JSON.stringify({ id: filled.template.id, params: filled.params }));
      const doc = "document" in filled.template ? filled.template.document : null;
      if (doc) form.set("message", JSON.stringify({ type: "document", document: { link: doc.link, filename: doc.filename } }));
    } else form.set("message", JSON.stringify({ type: "text", text: input.text }));
    if (!apiKey || !appName || !source) return { id: null, error: "WhatsApp is not configured", body };
    const res = await fetch(template ? "https://api.gupshup.io/wa/api/v1/template/msg" : "https://api.gupshup.io/wa/api/v1/msg", {
      method: "POST", headers: { apikey: apiKey, "Content-Type": "application/x-www-form-urlencoded" }, body: form,
    });
    const raw = await res.text();
    if (!res.ok) return { id: null, error: `Gupshup error ${res.status}: ${raw}`, body };
    const json = JSON.parse(raw) as { messageId?: string; message?: string; status?: string };
    if (!json.messageId || json.status === "error") return { id: null, error: `Gupshup error ${res.status}: ${raw}`, body };
    return { id: json.messageId, error: null, body };
  } catch (e) { return { id: null, error: (e as Error).message, body }; }
}
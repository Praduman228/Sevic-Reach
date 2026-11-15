const SHARED = {
  language: "en",
  footer: "Shegruh, AI-SaaS for Interior & Architect studios",
  buttonText: "Try For Shegruh Free",
  buttonUrl: "https://shegruh.com/",
} as const;

/** Approved Gupshup templates. Both share the same 2-variable body: {{1}} first name, {{2}} personalised content. */
export const WA_TEMPLATES = {
  shegruhmessage: {
    ...SHARED,
    name: "shegruhmessage",
    id: "3ff6f96d-0b65-4363-a71b-9385c6e91669",
    label: "Introduction (shegruhmessage)",
    /** Template has a DOCUMENT header; every send must attach this public PDF. */
    document: {
      link: process.env["BROCHURE_PDF_URL"] ?? "https://assets.sevicreach.com/brochure.pdf",
      filename: "SevicReach.pdf",
    },
  },
  outreach1: {
    ...SHARED,
    name: "outreach1",
    id: "0bfefde5-bb05-4286-bad0-393aca205265",
    label: "Follow-up (outreach1)",
  },
} as const;

export type WaTemplateKey = keyof typeof WA_TEMPLATES;

export const SHEGRUH_TEMPLATE = WA_TEMPLATES.shegruhmessage;

export function waTemplate(key: string | null | undefined) {
  return WA_TEMPLATES[(key as WaTemplateKey) in WA_TEMPLATES ? (key as WaTemplateKey) : "shegruhmessage"];
}

export function personalisedTemplate(text: string, firm: { name: string; contact_name?: string | null }, templateKey?: string | null) {
  const tpl = waTemplate(templateKey);
  // Remove leading honorifics only; never discard an unknown word that may be a name.
  let contact = firm.contact_name?.trim() || "";
  const title = /^(?:ar|arch|architect|mr|mrs|ms|miss|dr|prof|professor|er|engineer|shri|smt|sir|madam)(?:\.\s*|\s+|$)/i;
  while (title.test(contact)) contact = contact.replace(title, "").trim();
  const name = contact.split(/\s+/)[0] || firm.name.trim() || "team";
  const content = text.trim()
    .replace(/^(?:hi|hello|hey)\s+[^\n,!]+[,!]\s*(?:this is Team Shegruh[.!]?\s*)?/i, "")
    .replace(/\s*(?:(?:thanks|regards|best regards|thank you)[,!]?\s*)?Team Shegruh[.!]?\s*$/i, "")
    .trim();
  if (!content) throw new Error("Write a personalised message before sending");
  // Text template variables cannot contain newlines or tabs.
  const params = [name.replace(/\s+/g, " "), content.replace(/\s+/g, " ")];
  return {
    params,
    template: tpl,
    body: `Hi ${params[0]}, this is Team Shegruh.\n\n${params[1]}\n\nThanks Team Shegruh\n\n${tpl.footer}\n${tpl.buttonText}: ${tpl.buttonUrl}`,
  };
}

export function hasWhatsAppWindow(receivedAt: string | null | undefined, now = Date.now()) {
  if (!receivedAt) return false;
  const age = now - Date.parse(receivedAt);
  return age >= 0 && age < 24 * 60 * 60 * 1000;
}

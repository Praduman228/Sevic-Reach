import { normalizePhone } from "./contacts";

export const PRIMARY_CONTACT_ID = "00000000-0000-0000-0000-000000000000";
export type NamedContact = { id: string; name: string; designation?: string | null; email: string | null; phone: string | null };
export type ContactFirm = { name: string; contact_name?: string | null; email?: string | null; phone?: string | null };
export type Recipient = { id: string; name: string; address: string };

export function recipientOptions(firm: ContactFirm, contacts: NamedContact[], channel: "email" | "whatsapp"): Recipient[] {
  const rows = [{ id: PRIMARY_CONTACT_ID, name: firm.contact_name || firm.name, email: firm.email ?? null, phone: firm.phone ?? null }, ...contacts];
  return rows.flatMap((row) => {
    const raw = channel === "email" ? row.email : row.phone;
    const address = channel === "email" ? raw?.trim().toLowerCase() : raw ? normalizePhone(raw) : null;
    return address ? [{ id: row.id, name: row.name || firm.name, address }] : [];
  });
}

/** Null preserves legacy primary-only sends; an explicit empty selection never sends. */
export function selectedRecipients(firm: ContactFirm, contacts: NamedContact[], channel: "email" | "whatsapp", ids: string[] | null): Recipient[] {
  const wanted = ids ?? [PRIMARY_CONTACT_ID];
  const options = recipientOptions(firm, contacts, channel);
  if (wanted.some((id) => !options.some((r) => r.id === id))) throw new Error("A selected contact is missing an address or no longer belongs to this lead. Select recipients again.");
  const seen = new Set<string>();
  return options.filter((r) => {
    if (!wanted.includes(r.id) || seen.has(r.address)) return false;
    seen.add(r.address);
    return true;
  });
}

export function contactFirstName(raw: string) {
  let name = raw.trim();
  const title = /^(?:ar|arch|architect|mr|mrs|ms|miss|dr|prof|professor|er|engineer|shri|smt|sir|madam)(?:\.\s*|\s+|$)/i;
  while (title.test(name)) name = name.replace(title, "").trim();
  return name.split(/\s+/)[0] || "there";
}

/** Replace a draft's salutation, not other prospect facts or names in its body. */
export function personaliseForContact(text: string, name: string, studio: string, greeting = false) {
  const first = contactFirstName(name);
  const rendered = text.replaceAll("{{name}}", first).replaceAll("{{studio}}", studio);
  const salutation = /^(\s*(?:hi|hello|hey|dear))\s+[^\n,!]+([,!])/i;
  if (salutation.test(rendered)) return rendered.replace(salutation, `$1 ${first}$2`);
  return greeting ? `Hi ${first},\n\n${rendered}` : rendered;
}
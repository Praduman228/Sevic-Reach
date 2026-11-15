import { describe, expect, it, vi, beforeEach } from "vitest";
import { zohoSend } from "../lib/zoho.server";
import { sendGupshupWhatsApp } from "../lib/whatsapp.server";
import { sendDueSequenceMessages } from "../lib/sequences.server";

vi.mock("../lib/zoho.server", () => ({ zohoSend: vi.fn() }));
vi.mock("../lib/whatsapp.server", () => ({ sendGupshupWhatsApp: vi.fn() }));

function database(existing: Record<string, unknown>[] = [], contactMessages: Record<string, unknown>[] = []) {
  const message = { id: "sequence", firm_id: "firm", stage: "outreach", step: 0, email_status: "approved", whatsapp_status: "draft", email_contact_ids: ["s", "r"], whatsapp_contact_ids: [], email_body: "Hello Ankur,\nYour studio looks great.", email_subject: "Hello {{name}}", sent_at: null, result: null };
  const tables: Record<string, Record<string, unknown>[]> = {
    sequence_messages: [message], firms: [{ id: "firm", name: "Studio Test", stage: "outreach", contact_name: "Ankur", email: "primary@example.com", whatsapp_opt_in: true }],
    firm_contacts: [{ id: "s", firm_id: "firm", name: "Srishty", email: "s@example.com", phone: "+919876543211" }, { id: "r", firm_id: "firm", name: "Rohan", email: "r@example.com", phone: "+919876543212" }],
    sequence_deliveries: existing, email_messages: [], whatsapp_messages: [], contact_sequence_messages: contactMessages, contact_sequence_deliveries: [],
  };
  let nextId = 0;
  const sb = { from(table: string) {
    let rows = tables[table] ?? [], action = "read", patch: Record<string, unknown> = {}, added: Record<string, unknown>[] = [], single = false;
    const query = {
      select: (_columns?: string) => query,
      eq: (key: string, value: unknown) => { rows = rows.filter((r) => r[key] === value); return query; },
      gt: (key: string, value: number) => { rows = rows.filter((r) => Number(r[key]) > value); return query; },
      gte: (key: string, value: string) => { rows = rows.filter((r) => String(r[key]) >= value); return query; },
      or: (_value: string) => query, lte: (key: string, value: string) => { rows = rows.filter((r) => r[key] === undefined || (r[key] !== null && String(r[key]) <= value)); return query; }, order: (_key: string, _opts?: unknown) => query, limit: (_n: number) => query,
      update: (value: Record<string, unknown>) => { action = "update"; patch = value; return query; },
      insert: (value: Record<string, unknown>) => { action = "insert"; added = [{ id: `delivery-${++nextId}`, ...value }]; return query; },
      maybeSingle: () => { single = true; return query; }, single: () => { single = true; return query; },
      then(resolve: (value: { data: unknown; error: null }) => unknown) {
        if (action === "update") rows.forEach((r) => Object.assign(r, patch));
        if (action === "insert") { tables[table]?.push(...added); rows = added; }
        return Promise.resolve(resolve({ data: single ? rows[0] ?? null : rows, error: null }));
      },
    };
    return query;
  } };
  return { sb, tables, message };
}

describe("sequence selected-contact sends", () => {
  it("sends an approved Outreach introduction while the firm is still in Backlog", async () => {
    const { sb, tables } = database();
    const firm = tables['firms']?.[0];
    if (!firm) throw new Error("Missing fixture firm");
    firm['stage'] = "backlog";
    vi.mocked(zohoSend).mockResolvedValue({ ok: true, id: "provider-id", error: null });
    await sendDueSequenceMessages(sb);
    expect(tables['email_messages']?.map(r => r['status'])).toEqual(["sent", "sent"]);
  });
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(zohoSend).mockResolvedValue({ ok: true, id: "provider-id", error: null }); });
  it("sends one individually named email to each selected contact, never WhatsApp", async () => {
    const { sb, tables } = database();
    await sendDueSequenceMessages(sb, { firmId: "firm", userId: "team" });
    expect(zohoSend).toHaveBeenCalledTimes(2);
    expect(zohoSend).toHaveBeenNthCalledWith(1, { to: "s@example.com", subject: "Hello Srishty", body: "Hello Srishty,\nYour studio looks great." });
    expect(zohoSend).toHaveBeenNthCalledWith(2, { to: "r@example.com", subject: "Hello Rohan", body: "Hello Rohan,\nYour studio looks great." });
    expect(sendGupshupWhatsApp).not.toHaveBeenCalled();
    expect(tables['email_messages']?.map((r) => r['to_email'])).toEqual(["s@example.com", "r@example.com"]);
  });
  it("does not resend a successful recipient while retrying a failed recipient", async () => {
    const { sb } = database([{ id: "done", sequence_id: "sequence", channel: "email", address: "s@example.com", status: "sent" }, { id: "retry", sequence_id: "sequence", channel: "email", address: "r@example.com", status: "failed" }]);
    await sendDueSequenceMessages(sb);
    expect(zohoSend).toHaveBeenCalledTimes(1);
    expect(zohoSend).toHaveBeenCalledWith(expect.objectContaining({ to: "r@example.com" }));
  });
  it("keeps an ambiguous recipient unresolved rather than sending twice", async () => {
    const { sb } = database([{ id: "unknown", sequence_id: "sequence", channel: "email", address: "s@example.com", status: "unknown" }, { id: "done", sequence_id: "sequence", channel: "email", address: "r@example.com", status: "sent" }]);
    await sendDueSequenceMessages(sb);
    expect(zohoSend).not.toHaveBeenCalled();
  });
  it("sending one contact's introduction schedules only their follow-ups", async () => {
    const intro = { id: "intro-s", firm_id: "firm", contact_id: "s", stage: "outreach", step: 0, email_status: "approved", whatsapp_status: "draft", email_contact_ids: ["s"], email_body: "Hello Srishty,\nFor your role.", email_subject: "Hello", sent_at: null };
    const own = { id: "follow-s", firm_id: "firm", contact_id: "s", stage: "outreach", step: 1, offset_minutes: 1440, email_status: "approved", whatsapp_status: "draft", scheduled_at: null };
    const other = { ...own, id: "follow-r", contact_id: "r" };
    const { sb, message } = database([], [intro, own, other]);
    message.email_status = "sent";
    await sendDueSequenceMessages(sb);
    expect(zohoSend).toHaveBeenCalledTimes(1);
    expect(zohoSend).toHaveBeenCalledWith(expect.objectContaining({ to: "s@example.com" }));
    expect(own.scheduled_at).not.toBeNull();
    expect(other.scheduled_at).toBeNull();
    expect(other.email_status).toBe("approved");
  });
  it("a different contact's reply does not stop this contact's follow-up", async () => {
    const first = { id: "intro-s", firm_id: "firm", contact_id: "s", stage: "outreach", step: 0, sent_at: "2026-10-20T00:00:00Z", email_status: "sent", whatsapp_status: "draft" };
    const follow = { id: "follow-s", firm_id: "firm", contact_id: "s", stage: "outreach", step: 1, email_status: "approved", whatsapp_status: "draft", email_contact_ids: ["s"], email_body: "Hello Srishty,\nFollow-up.", email_subject: "Follow-up" };
    const { sb, tables, message } = database([], [first, follow]);
    message.email_status = "sent";
    tables['email_messages']?.push({ firm_id: "firm", direction: "in", from_email: "r@example.com", created_at: "2026-10-21T00:00:00Z" });
    await sendDueSequenceMessages(sb);
    expect(zohoSend).toHaveBeenCalledTimes(1);
    expect(follow.email_status).toBe("sent");
  });
  it("the selected contact's reply stops their follow-up", async () => {
    const first = { id: "intro-s", firm_id: "firm", contact_id: "s", stage: "outreach", step: 0, sent_at: "2026-10-20T00:00:00Z", email_status: "sent", whatsapp_status: "draft" };
    const follow = { id: "follow-s", firm_id: "firm", contact_id: "s", stage: "outreach", step: 1, email_status: "approved", whatsapp_status: "draft", email_contact_ids: ["s"], email_body: "Follow-up" };
    const { sb, tables, message } = database([], [first, follow]);
    message.email_status = "sent";
    tables['email_messages']?.push({ firm_id: "firm", direction: "in", from_email: "s@example.com", created_at: "2026-10-21T00:00:00Z" });
    await sendDueSequenceMessages(sb);
    expect(zohoSend).not.toHaveBeenCalled();
    expect(follow.email_status).toBe("skipped");
  });
});
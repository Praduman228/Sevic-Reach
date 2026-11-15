import { describe, expect, it } from "vitest";
import { PRIMARY_CONTACT_ID, selectedRecipients, personaliseForContact } from "../lib/sequence-recipients";

const firm = { name: "Studio Test", contact_name: "Ankur", email: "ankur@example.com", phone: "+919876543210" };
const contacts: [import("../lib/sequence-recipients").NamedContact, import("../lib/sequence-recipients").NamedContact] = [
  { id: "a", name: "Ar. Srishty Agrawal", email: "srishty@example.com", phone: "+919876543211" },
  { id: "b", name: "Rohan", email: "rohan@example.com", phone: "+919876543212" },
];
describe("named contact sequence recipients", () => {
  it("sends only to selected email contacts", () => {
    expect(selectedRecipients(firm, contacts, "email", ["a"]).map((r) => r.address)).toEqual(["srishty@example.com"]);
  });
  it("keeps WhatsApp selection independent of email", () => {
    expect(selectedRecipients(firm, contacts, "whatsapp", ["b"]).map((r) => r.address)).toEqual(["+919876543212"]);
  });
  it("personalises each selected name without replacing project facts", () => {
    expect(personaliseForContact("Hello Ankur,\nWe loved Ankur Gallery.", contacts[0].name, firm.name, true)).toBe("Hello Srishty,\nWe loved Ankur Gallery.");
    expect(personaliseForContact("Hello Ankur,\nWe loved Ankur Gallery.", contacts[1].name, firm.name, true)).toBe("Hello Rohan,\nWe loved Ankur Gallery.");
  });
  it("never sends an explicitly empty selection", () => {
    expect(selectedRecipients(firm, contacts, "email", [])).toEqual([]);
  });
  it("preserves primary-only recipients for legacy follow-ups", () => {
    expect(selectedRecipients(firm, contacts, "email", null).map((r) => r.id)).toEqual([PRIMARY_CONTACT_ID]);
  });
  it("rejects a contact belonging to another lead", () => {
    expect(() => selectedRecipients(firm, contacts, "email", ["foreign-contact"])).toThrow("no longer belongs to this lead");
  });
  it("deduplicates the same destination selected twice", () => {
    expect(selectedRecipients(firm, [...contacts, { ...contacts[0], id: "duplicate" }], "email", ["a", "duplicate"])).toHaveLength(1);
  });
});
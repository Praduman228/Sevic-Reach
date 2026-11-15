import { expect, it } from "vitest";
import { contactDraftContext } from "../lib/contact-sequences";

it("passes the selected contact name and designation into drafting context", () => {
  const context = contactDraftContext({ name: "Rohan", designation: "Principal Architect" });
  expect(context).toContain('"name":"Rohan"');
  expect(context).toContain('"designation":"Principal Architect"');
});
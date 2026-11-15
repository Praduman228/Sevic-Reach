import { afterEach, describe, expect, it, vi } from "vitest";
import { personalisedTemplate, hasWhatsAppWindow } from "@/lib/whatsapp-template";
import { sendGupshupWhatsApp } from "@/lib/whatsapp.server";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("approved personalised WhatsApp template", () => {
  it("maps the contact and personalised content to the two variables", () => {
    const r = personalisedTemplate("Hi Asha, this is Team Shegruh.\nYour projects could benefit from SheAI.\nThanks Team Shegruh", { name: "Studio", contact_name: "Asha Rao" });
    expect(r.params).toEqual(["Asha", "Your projects could benefit from SheAI."]);
    expect(r.body).toContain("Hi Asha, this is Team Shegruh.\n\nYour projects could benefit from SheAI.\n\nThanks Team Shegruh");
  });
  it("uses the firm when no contact is known", () => {
    expect(personalisedTemplate("Could we talk?", { name: "Studio Lotus" }).params).toEqual(["Studio Lotus", "Could we talk?"]);
  });
  it.each(["Ar. Srishty Agrawal", "Ar Srishty Agrawal", "AR. Srishty Agrawal", "Ar.Srishty Agrawal", "Architect Srishty Agrawal", "Ms. Srishty Agrawal", "Dr. Ar. Srishty Agrawal"])("uses Srishty rather than the title in %s", (contact_name) => {
    const result = personalisedTemplate("Hello Srishty, Could we talk?", { name: "Srisa Studio", contact_name });
    expect(result.params).toEqual(["Srishty", "Could we talk?"]);
  });
  it("falls back to the firm when only a title is known", () => {
    expect(personalisedTemplate("Could we talk?", { name: "Srisa Studio", contact_name: "Ar." }).params[0]).toBe("Srisa Studio");
  });
  it("preserves names that merely start with title letters", () => {
    expect(personalisedTemplate("Could we talk?", { name: "Studio", contact_name: "Arjun Rao" }).params[0]).toBe("Arjun");
  });
  it("requires a received message less than 24 hours old for free text", () => {
    const now = Date.parse("2026-10-16T06:48:00Z");
    expect(hasWhatsAppWindow("2026-10-15T06:48:00Z", now)).toBe(false);
    expect(hasWhatsAppWindow("2026-10-15T06:48:01Z", now)).toBe(true);
    expect(hasWhatsAppWindow(null, now)).toBe(false);
  });
  it("sends the approved Gupshup template ID without a dynamic button parameter", async () => {
    vi.stubEnv("GUPSHUP_API_KEY", "test-key"); vi.stubEnv("GUPSHUP_APP_NAME", "test-app"); vi.stubEnv("GUPSHUP_SOURCE_NUMBER", "919000000000");
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "submitted", messageId: "test-message" })));
    vi.stubGlobal("fetch", request);
    const r = await sendGupshupWhatsApp({ phone: "+919000000001", text: "Could we talk?", firm: { name: "Studio", contact_name: "Asha" } });
    const call = request.mock.calls[0];
    if (!call) throw new Error("Expected a Gupshup request");
    expect(call[0]).toBe("https://api.gupshup.io/wa/api/v1/template/msg");
    const form = call[1].body as URLSearchParams;
    expect(JSON.parse(form.get("template") ?? "{}")).toEqual({ id: "3ff6f96d-0b65-4363-a71b-9385c6e91669", params: ["Asha", "Could we talk?"] });
    expect(r.id).toBe("test-message");
    expect(r.body).toContain("Try For Shegruh Free: https://shegruh.com/");
  });
  it("sends the outreach1 template ID when that template is chosen", async () => {
    vi.stubEnv("GUPSHUP_API_KEY", "test-key"); vi.stubEnv("GUPSHUP_APP_NAME", "test-app"); vi.stubEnv("GUPSHUP_SOURCE_NUMBER", "919000000000");
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "submitted", messageId: "test-message" })));
    vi.stubGlobal("fetch", request);
    await sendGupshupWhatsApp({ phone: "+919000000001", text: "Following up on my earlier note.", firm: { name: "Studio", contact_name: "Asha" }, template: "outreach1" });
    const form = request.mock.calls[0]?.[1].body as URLSearchParams;
    expect(JSON.parse(form.get("template") ?? "{}")).toEqual({ id: "0bfefde5-bb05-4286-bad0-393aca205265", params: ["Asha", "Following up on my earlier note."] });
  });
  it("falls back to the intro template for an unknown template name", () => {
    expect(personalisedTemplate("Could we talk?", { name: "Studio" }, "no-such-template").template.id).toBe("3ff6f96d-0b65-4363-a71b-9385c6e91669");
  });
});
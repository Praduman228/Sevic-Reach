/** WhatsApp copy and sending permission are separate: every requested touch gets a draft. */
export const whatsappDraftInstructions = {
  draft_required: true,
  eligibility_applies_to: "sending_only",
  style: "Write a WhatsApp-native message, not a shortened email: 3 short paragraphs, 45–75 words, one easy question. No formal sign-off or feature list.",
  structure: "One verified research detail → one relevant workflow challenge framed as a possibility → one concrete SheAI action and practical benefit → one low-effort question.",
  introduction: "Introduce the sender briefly only on the first touch. Avoid repeating the introduction in follow-ups. Do not ask for a 20-minute meeting by default; offer a relevant example first.",
  personalisation: "Use the contact's role and saved research. Mention a project only when verified; otherwise use practice focus or services. Do not invent pains. Keep the body complete even if eligible=false.",
  followups: "Add a different useful AI action or question each time; never repeat the first pitch. Do not imply previous contact, a meeting or a reply unless history confirms it.",
};

export type WhatsAppResearchContext = { project?: string | undefined; practice?: string | undefined };

export function whatsappResearchContext(brief: Record<string, unknown>): WhatsAppResearchContext {
  const projects = Array.isArray(brief['projects']) ? brief['projects'] : Array.isArray(brief['notable_projects']) ? brief['notable_projects'] : [];
  const project = projects.map((item: unknown) => {
    if (typeof item === "string") return item.trim();
    if (!item || typeof item !== "object") return "";
    const record = item as Record<string, unknown>;
    return record['use_in_outreach'] === false ? "" : typeof record['name'] === "string" ? record['name'].trim() : "";
  }).find(Boolean);
  const practice = typeof brief['design_style'] === "string" ? brief['design_style'].trim() : undefined;
  return { project, practice };
}

export function fallbackWhatsApp(firm: string, contact: string, sender: string, position: number, research: WhatsAppResearchContext = {}): string {
  const greeting = contact.trim() ? `Hi ${contact.trim()},` : "Hello,";
  const intro = position === 0 ? ` ${sender.trim() ? `I'm ${sender.trim()} from Shegruh.` : "I'm reaching out from Team Shegruh."}` : "";
  const context = research.project ? `I noticed ${firm}'s work on ${research.project}.` : research.practice ? `I noticed ${firm}'s ${research.practice} approach.` : `I'm reaching out about ${firm}'s project workflow.`;
  const angles = [
    "Turning a design brief into a quotation can mean rebuilding line items. SheAI, Shegruh's AI assistant, drafts editable quotations from reference images and a brief, for your team to review.\n\nWould a quotation example be useful?",
    "Mapping scope into a project schedule can involve repeated planning. SheAI, Shegruh's AI assistant, generates a starting timeline from scope, budget and duration. Your team can review it before planning the work.\n\nWould a timeline example be useful?",
    "Recording tasks after discussions can mean repeated entry. SheAI, Shegruh's AI assistant, lets your team create tasks through chat, giving them a starting point to review.\n\nWould a task-creation example be useful for your team?",
  ];
  return `${greeting}${intro}\n\n${context} ${angles[position % angles.length] ?? angles[0]}`;
}
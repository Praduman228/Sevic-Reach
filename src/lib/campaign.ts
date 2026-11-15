import { recipientOptions, type ContactFirm, type NamedContact } from "./sequence-recipients";

export type Channel = "email" | "whatsapp";
export type CampaignFirmStatus = "pending" | "processing" | "scheduled" | "missing_contact" | "failed";
export type Phase = "research" | "draft" | "send";

/** Minimum gap between starting one firm and the next. */
export const FIRM_GAP_MS = 60_000;
/** A firm step that has been "processing" longer than this is considered abandoned and retried. */
export const STALE_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 3;
export const MAX_TEST_FIRMS = 3;

export type ContactCheckFirm = ContactFirm & { whatsapp_opt_in?: boolean | null };

/** Which selected channels can be used for this firm, and what is missing for the rest. */
export function channelReadiness(firm: ContactCheckFirm, contacts: NamedContact[], channels: Channel[]) {
  const usable: Channel[] = [];
  const missing: string[] = [];
  for (const channel of channels) {
    // Campaign sends go to the firm's primary contact, like firm follow-ups.
    const primary = recipientOptions(firm, contacts, channel).find((r) => r.id === "00000000-0000-0000-0000-000000000000");
    if (!primary) { missing.push(channel === "email" ? "No email" : "No phone number"); continue; }
    if (channel === "whatsapp" && firm.whatsapp_opt_in !== true) { missing.push("No WhatsApp consent"); continue; }
    usable.push(channel);
  }
  return { usable, missing };
}

/** AI credit/permission problems pause the whole campaign instead of failing every firm. */
export function isPausingError(message: string) {
  return /\b(402|403)\b|credit|payment required|forbidden|not enabled|access denied|refus/i.test(message);
}

/** How long a campaign paused by a temporary web search rejection waits before resuming itself. */
export const AUTO_RESUME_MS = 5 * 60_000;

/** Temporary rejections of the web search or AI service (not credit problems) are retried by the campaign on its own. */
export function isAutoResumePause(reason: string | null | undefined) {
  const r = reason ?? "";
  if (/credit|payment/i.test(r)) return false;
  return /web search failed \((403|429|5\d\d)\)/i.test(r) || /^\s*forbidden\s*$/i.test(r);
}

export function shouldAutoResume(reason: string | null | undefined, pausedAt: string | null | undefined, now = Date.now()) {
  if (!isAutoResumePause(reason)) return false;
  return !pausedAt || now - Date.parse(pausedAt) >= AUTO_RESUME_MS;
}

export function nextPhase(phase: Phase): Phase | null {
  return phase === "research" ? "draft" : phase === "draft" ? "send" : null;
}

export function readyForNextFirm(lastStartedAt: string | null | undefined, now = Date.now()) {
  return !lastStartedAt || now - Date.parse(lastStartedAt) >= FIRM_GAP_MS;
}

/** Campaigns send only to firms whose research fit score is above this (scores are out of 5). */
export const MIN_FIT_SCORE_TO_SKIP = 3;

/** Reads "fit score 2/5" from a research brief summary; null when the brief has no score. */
export function fitScore(summary: string | null | undefined): number | null {
  const m = /fit\s*score[^0-9]{0,12}([1-5])\s*\/\s*5/i.exec(summary ?? "");
  return m ? Number(m[1]) : null;
}

/** Unknown scores still send; 3/5 and below are skipped. */
export function isLowFit(score: number | null) {
  return score !== null && score <= MIN_FIT_SCORE_TO_SKIP;
}

/** Plain-language reason for common WhatsApp delivery errors. */
export function sendErrorReason(error: string) {
  if (/131049/.test(error)) return "Meta held this message: the number has received too many business messages recently.";
  if (/131026/.test(error)) return "This number is not on WhatsApp (or cannot receive WhatsApp messages).";
  return error;
}

export type SentMessage = { firmId: string; channel: Channel; to: string; at: string };
export type SentFirm = { firmId: string; channels: Channel[]; addresses: string[]; lastSentAt: string; sends: number };

/** One entry per firm the campaign actually sent to, newest first, with the addresses used. */
export function groupSentByFirm(rows: SentMessage[]): SentFirm[] {
  const byFirm = new Map<string, SentFirm>();
  for (const r of rows) {
    const f = byFirm.get(r.firmId) ?? { firmId: r.firmId, channels: [], addresses: [], lastSentAt: r.at, sends: 0 };
    if (!f.channels.includes(r.channel)) f.channels.push(r.channel);
    if (!f.addresses.includes(r.to)) f.addresses.push(r.to);
    if (r.at > f.lastSentAt) f.lastSentAt = r.at;
    f.sends++;
    byFirm.set(r.firmId, f);
  }
  return [...byFirm.values()].sort((a, b) => b.lastSentAt.localeCompare(a.lastSentAt));
}

export type SentChannelFilter = "all" | Channel;

/** Sent firms that used this channel; "all" keeps every firm. */
export function filterSentByChannel(sent: SentFirm[], filter: SentChannelFilter): SentFirm[] {
  if (filter === "all") return sent;
  return sent.filter((s) => s.channels.includes(filter));
}

/** How many sent firms used each channel. */
export function sentChannelCounts(sent: SentFirm[]) {
  return {
    all: sent.length,
    email: sent.filter((s) => s.channels.includes("email")).length,
    whatsapp: sent.filter((s) => s.channels.includes("whatsapp")).length,
  };
}


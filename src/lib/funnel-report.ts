import { matchesSequenceStage, type Firm, type Stage } from "./crm";

export type ReportMessage = { id: string; firm_id: string | null; direction: string; status: string; created_at: string; sent_by: string | null; channel: "email" | "whatsapp"; stage: Stage | null };
export type ReportSequence = { id: string; firm_id: string; stage: Stage; step: number; label: string; contact_id?: string | null; email_status: string; whatsapp_status: string; scheduled_at: string | null };
export type ReportTask = { firm_id: string; due_at: string; completed_at: string | null };
export type ReportContact = { id: string; firm_id: string; name: string; designation: string | null };
export type ReportData = { firms: Firm[]; messages: ReportMessage[]; sequences: ReportSequence[]; tasks: ReportTask[]; contacts: ReportContact[]; profiles: { id: string; full_name: string | null; email: string | null }[] };
export const acceptedStatuses = new Set(["sent", "submitted", "enqueued", "delivered", "read"]);

export function organisationReport(data: ReportData, since: string | null, now: string) {
  const messages = data.messages.filter((m) => !since || m.created_at >= since);
  const groupedMessages = new Map<string, ReportMessage[]>();
  const groupedSequences = new Map<string, ReportSequence[]>();
  for (const m of messages) if (m.firm_id) groupedMessages.set(m.firm_id, [...(groupedMessages.get(m.firm_id) ?? []), m]);
  for (const s of data.sequences) groupedSequences.set(s.firm_id, [...(groupedSequences.get(s.firm_id) ?? []), s]);
  return data.firms.map((firm) => {
    const history = groupedMessages.get(firm.id) ?? [];
    const sequences = groupedSequences.get(firm.id) ?? [];
    const out = history.filter((m) => m.direction === "out");
    const sent = out.filter((m) => acceptedStatuses.has(m.status));
    const replies = history.filter((m) => m.direction === "in");
    // Only independently approved channels with a due date are queued sends.
    const scheduled = sequences.flatMap((s) => ["email", "whatsapp"].flatMap((channel) => {
      const status = channel === "email" ? s.email_status : s.whatsapp_status;
      return status === "approved" && s.scheduled_at && matchesSequenceStage(firm.stage, s.stage) ? [{ channel, at: s.scheduled_at }] : [];
    })).sort((a, b) => a.at.localeCompare(b.at));
    const states = sequences.flatMap((s) => [s.email_status, s.whatsapp_status]);
    const openTasks = data.tasks.filter((t) => t.firm_id === firm.id && !t.completed_at);
    return {
      firm, history, sequences, sent: sent.length,
      emailSent: sent.filter((m) => m.channel === "email").length,
      whatsappSent: sent.filter((m) => m.channel === "whatsapp").length,
      attempted: out.length, failed: out.filter((m) => m.status === "failed").length,
      pending: out.filter((m) => ["submitted", "enqueued", "queued", "sending"].includes(m.status)).length,
      delivered: out.filter((m) => ["delivered", "read"].includes(m.status)).length,
      read: out.filter((m) => m.status === "read").length,
      replies: replies.length, emailReplies: replies.filter((m) => m.channel === "email").length,
      whatsappReplies: replies.filter((m) => m.channel === "whatsapp").length,
      scheduled: scheduled.length, overdue: scheduled.filter((s) => s.at <= now).length,
      nextAt: scheduled[0]?.at ?? null,
      followups: sequences.filter((s) => s.step > 0).length,
      drafts: states.filter((s) => s === "draft").length,
      skipped: states.filter((s) => s === "skipped").length,
      openTasks: openTasks.length, overdueTasks: openTasks.filter((t) => t.due_at < now).length,
      lastReplyAt: replies.map((m) => m.created_at).sort().at(-1) ?? null,
    };
  });
}
export type OrganisationReport = ReturnType<typeof organisationReport>[number];
export function reportDrilldown(rows: OrganisationReport[], contribution: (row: OrganisationReport) => number) {
  return rows.map((report) => ({ report, count: contribution(report) })).filter((item) => item.count > 0);
}
export function reportTotals(rows: OrganisationReport[]) {
  return {
    firms: rows.length, contacted: rows.filter((r) => r.attempted > 0).length,
    sentOrgs: rows.filter((r) => r.sent > 0).length, scheduledOrgs: rows.filter((r) => r.scheduled > 0).length,
    repliedOrgs: rows.filter((r) => r.replies > 0).length,
    sent: rows.reduce((n, r) => n + r.sent, 0), scheduled: rows.reduce((n, r) => n + r.scheduled, 0),
    replies: rows.reduce((n, r) => n + r.replies, 0), failed: rows.reduce((n, r) => n + r.failed, 0),
    overdue: rows.reduce((n, r) => n + r.overdue, 0), drafts: rows.reduce((n, r) => n + r.drafts, 0),
    delivered: rows.reduce((n, r) => n + r.delivered, 0), read: rows.reduce((n, r) => n + r.read, 0),
    followups: rows.reduce((n, r) => n + r.followups, 0), overdueTasks: rows.reduce((n, r) => n + r.overdueTasks, 0),
    replyRate: rows.some((r) => r.sent > 0) ? rows.filter((r) => r.sent > 0 && r.replies > 0).length / rows.filter((r) => r.sent > 0).length : 0,
  };
}
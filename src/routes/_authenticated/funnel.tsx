import { createFileRoute } from "@tanstack/react-router";
import { FunnelReport } from "@/components/crm/FunnelReport";

export const Route = createFileRoute("/_authenticated/funnel")({
  head: () => ({ meta: [
    {"title": "Funnel — Sevic Reach"},
    {"name": "description", "content": "Review organisation outreach, team performance, scheduled follow-ups, replies and sales conversion targets."},
    {"property": "og:title", "content": "Funnel — Sevic Reach"},
    {"property": "og:description", "content": "Review organisation outreach, team performance, scheduled follow-ups, replies and sales conversion targets."},
    {"property": "og:type", "content": "website"},
    {"name": "twitter:card", "content": "summary"},
  ] }),
  component: FunnelReport,
});


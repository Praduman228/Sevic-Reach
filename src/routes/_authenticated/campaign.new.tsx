import { createFileRoute } from "@tanstack/react-router";
import { CampaignEditor } from "@/components/crm/CampaignEditor";

export const Route = createFileRoute("/_authenticated/campaign/new")({
  head: () => ({
    meta: [
      { title: "New campaign — Sevic Reach" },
      { name: "description", content: "Configure a campaign, test drafts on a few firms and launch it." },
      { property: "og:title", content: "New campaign — Sevic Reach" },
      { property: "og:description", content: "Configure a campaign, test drafts on a few firms and launch it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <CampaignEditor />,
});

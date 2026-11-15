import { createFileRoute } from "@tanstack/react-router";
import { CampaignEditor } from "@/components/crm/CampaignEditor";

export const Route = createFileRoute("/_authenticated/campaign/$id/edit")({
  head: () => ({
    meta: [
      { title: "Edit campaign — Sevic Reach" },
      { name: "description", content: "Change a campaign's details and firms." },
      { property: "og:title", content: "Edit campaign — Sevic Reach" },
      { property: "og:description", content: "Change a campaign's details and firms." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditCampaign,
});

function EditCampaign() {
  const { id } = Route.useParams();
  return <CampaignEditor id={id} />;
}

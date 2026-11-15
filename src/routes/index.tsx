import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sevic Reach — Pipeline for architecture firms" },
      { name: "description", content: "Track outreach, demos, pilots and WhatsApp follow-ups for Indian architecture studios." },
      { property: "og:title", content: "Sevic Reach" },
      { property: "og:description", content: "Pipeline, funnel and follow-up tracker for selling to architecture firms." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Sevic Reach</p>
      <h1 className="mt-3 text-4xl font-semibold sm:text-6xl">Pipeline OS</h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        Every studio, every stage, every follow-up — in one calm place.
      </p>
      <Button asChild size="lg" className="mt-8">
        <Link to="/board">Open pipeline</Link>
      </Button>
    </main>
  );
}

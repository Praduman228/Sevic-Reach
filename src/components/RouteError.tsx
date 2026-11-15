import { useEffect } from "react";
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { isPageLoadError, reloadPageOnce } from "@/lib/page-load-recovery";
import { reportAppError } from "@/lib/error-reporting";

export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const pageLoadError = isPageLoadError(error);

  useEffect(() => {
    if (pageLoadError && reloadPageOnce()) return;
    reportAppError(error, { boundary: "tanstack_route_error_component" });
  }, [error, pageLoadError]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Refresh the page to try again.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => {
            if (pageLoadError) {
              window.location.reload();
              return;
            }
            void router.invalidate();
            reset();
          }}>Try again</Button>
          <Button variant="outline" asChild><a href="/">Go home</a></Button>
        </div>
      </div>
    </div>
  );
}
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RouteError } from "@/components/RouteError";
import { isPageLoadError, reloadPageOnce } from "@/lib/page-load-recovery";

// After a new version is published, an open tab may request old page files
// that no longer exist. Reload once to pick up the new version.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    reloadPageOnce();
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (isPageLoadError(e.reason)) {
      reloadPageOnce();
    }
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    defaultErrorComponent: RouteError,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

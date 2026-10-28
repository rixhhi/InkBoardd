import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { lazyPage } from "./-lazy-page";

export const Route = createFileRoute("/live/")({
  errorComponent: AppErrorComponent,
  head: () => ({ meta: [{ title: "Inkboard — live classes" }] }),
  component: lazyPage(() => import("@/pages/live-feed-page"), "Opening live classes"),
});

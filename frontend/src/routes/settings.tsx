import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { lazyPage } from "./-lazy-page";

export const Route = createFileRoute("/settings")({
  errorComponent: AppErrorComponent,
  head: () => ({ meta: [{ title: "Inkboard — settings" }] }),
  component: lazyPage(() => import("@/pages/settings-page"), "Opening settings"),
});

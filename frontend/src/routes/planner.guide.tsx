import { createFileRoute } from "@tanstack/react-router";
import { lazyPage } from "./-lazy-page";
import { AppErrorComponent } from "@/lib/error-component";
export const Route = createFileRoute("/planner/guide")({
  errorComponent: AppErrorComponent,
  component: lazyPage(() => import("@/pages/planner-guide-page"), "Opening the guide"),
});

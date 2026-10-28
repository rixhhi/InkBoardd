import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { lazyPage } from "./-lazy-page";

export const Route = createFileRoute("/planner/settings")({
  errorComponent: AppErrorComponent,
  component: lazyPage(() => import("@/components/planner/settings-page.tsx").then((m) => ({ default: m.PlannerSettingsPage })), "Opening settings"),
});

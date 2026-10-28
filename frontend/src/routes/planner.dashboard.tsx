import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { lazyPage } from "./-lazy-page";

export const Route = createFileRoute("/planner/dashboard")({
  errorComponent: AppErrorComponent,
  component: lazyPage(() => import("@/components/planner/dashboard-page.tsx").then((m) => ({ default: m.PlannerDashboard })), "Opening the desk"),
});

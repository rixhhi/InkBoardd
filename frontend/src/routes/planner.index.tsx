import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { lazyPage } from "./-lazy-page";

export const Route = createFileRoute("/planner/")({
  validateSearch: (s: Record<string, unknown>) => ({
    day: typeof s.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.day) ? s.day : undefined,
  }),
  errorComponent: AppErrorComponent,
  component: lazyPage(() => import("@/components/planner/calendar-page.tsx").then((m) => ({ default: m.PlannerPage })), "Opening the planner"),
});

import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { lazyPage } from "./-lazy-page";

export const Route = createFileRoute("/planner/today")({
  // Both keys optional so existing links that only pass `add` (or nothing) keep typechecking.
  validateSearch: (s: Record<string, unknown>): { add?: 1; day?: string } => {
    const out: { add?: 1; day?: string } = {};
    if (s.add === 1 || s.add === "1" || s.add === true) out.add = 1;
    if (typeof s.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.day)) out.day = s.day;
    return out;
  },
  errorComponent: AppErrorComponent,
  component: lazyPage(() => import("@/components/planner/today-page.tsx").then((m) => ({ default: m.PlannerTodayPage })), "Opening your tasks"),
});

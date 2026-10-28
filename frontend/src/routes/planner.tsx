import { createFileRoute, Outlet } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteFallback } from "@/components/fetching";
import { AppErrorComponent } from "@/lib/error-component";

const PlannerShell = lazy(() => import("@/components/planner/planner-shell.tsx").then((m) => ({ default: m.PlannerShell })));

export const Route = createFileRoute("/planner")({
  errorComponent: AppErrorComponent,
  component: PlannerLayout,
});

function PlannerLayout() {
  return (
    <Suspense fallback={<RouteFallback label="Opening the planner" />}>
      <PlannerShell>
        <Outlet />
      </PlannerShell>
    </Suspense>
  );
}

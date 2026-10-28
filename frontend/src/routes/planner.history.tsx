import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { lazyPage } from "./-lazy-page";

export const Route = createFileRoute("/planner/history")({
  errorComponent: AppErrorComponent,
  component: lazyPage(() => import("@/components/planner/history-page.tsx").then((m) => ({ default: m.HistoryPage })), "Opening history"),
});

import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteFallback } from "@/components/fetching";
import { AppErrorComponent } from "@/lib/error-component";

const OfflineApp = lazy(() => import("@/features/offline/app.tsx").then((m) => ({ default: m.OfflineApp })));

export const Route = createFileRoute("/offline")({
  errorComponent: AppErrorComponent,
  component: OfflinePage,
  head: () => ({
    meta: [{ title: "Inkboard — saved classes" }],
  }),
});

function OfflinePage() {
  return (
    <Suspense fallback={<RouteFallback label="Opening saved classes" />}>
      <OfflineApp embedded />
    </Suspense>
  );
}

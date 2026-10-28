import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { lazyPage } from "./-lazy-page";
export const Route = createFileRoute("/exam/$goalId")({
  errorComponent: AppErrorComponent,
  component: lazyPage(() => import("@/pages/exam-page"), "Fetching this exam"),
});
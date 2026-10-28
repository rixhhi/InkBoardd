import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { lazyPage } from "./-lazy-page";

export const Route = createFileRoute("/")({
  errorComponent: AppErrorComponent,
  component: lazyPage(() => import("@/pages/home-page"), "Opening the wall"),
});
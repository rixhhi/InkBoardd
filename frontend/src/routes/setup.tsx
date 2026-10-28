import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { lazyPage } from "./-lazy-page";

export const Route = createFileRoute("/setup")({
  errorComponent: AppErrorComponent,
  head: () => ({ meta: [{ title: "Inkboard — first-time setup" }] }),
  component: lazyPage(() => import("@/pages/auth-page").then((m) => ({ default: m.SetupRoutePage })), "Opening setup"),
});

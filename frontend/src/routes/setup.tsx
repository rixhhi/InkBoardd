import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { SetupRoutePage } from "@/pages/auth-page";

export const Route = createFileRoute("/setup")({
  errorComponent: AppErrorComponent,
  head: () => ({ meta: [{ title: "Inkboard — first-time setup" }] }),
  // Eager, same reason as /login: it shares the ~8 KB auth page and is the very first screen.
  component: SetupRoutePage,
});

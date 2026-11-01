import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { LoginRoutePage } from "@/pages/auth-page";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({ next: typeof s.next === "string" ? s.next : undefined }),
  errorComponent: AppErrorComponent,
  head: () => ({ meta: [{ title: "Inkboard — sign in" }] }),
  // Eager on purpose. The sign-in form is the first paint for every signed-out visitor and
  // the whole auth page is ~8 KB; routing it through lazyPage added a second network hop
  // after the route chunk ran and pushed LCP from ~0.8 s to 1.8 s (Lighthouse on main, fd810d5).
  component: LoginRoutePage,
});

import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { lazyPage } from "./-lazy-page";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({ next: typeof s.next === "string" ? s.next : undefined }),
  errorComponent: AppErrorComponent,
  head: () => ({ meta: [{ title: "Inkboard — sign in" }] }),
  component: lazyPage(() => import("@/pages/auth-page").then((m) => ({ default: m.LoginRoutePage })), "Opening sign in"),
});

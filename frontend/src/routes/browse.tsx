import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { lazyPage } from "./-lazy-page";

export const Route = createFileRoute("/browse")({
  errorComponent: AppErrorComponent,
  head: () => ({ meta: [{ title: "Inkboard — browse exams" }] }),
  component: lazyPage(() => import("@/pages/browse-page"), "Opening exams"),
});

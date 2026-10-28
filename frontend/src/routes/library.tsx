import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { lazyPage } from "./-lazy-page";

type LibrarySearch = { tab?: "saved" | "later" | "downloads" | "history" };

export const Route = createFileRoute("/library")({
  validateSearch: (s: Record<string, unknown>): LibrarySearch => ({
    tab: s.tab === "later" || s.tab === "downloads" || s.tab === "history" ? s.tab : s.tab === "saved" ? "saved" : undefined,
  }),
  errorComponent: AppErrorComponent,
  head: () => ({ meta: [{ title: "Inkboard — library" }] }),
  component: lazyPage(() => import("@/pages/library-page"), "Opening your library"),
});

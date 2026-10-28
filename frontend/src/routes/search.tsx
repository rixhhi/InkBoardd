import { createFileRoute } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { lazyPage } from "./-lazy-page";
import type { TeacherTab } from "@/components/educator-catalog";
type SearchParams = {
  q: string;
  topic?: string;
  sort?: "latest" | "popular";
  tab?: TeacherTab;
};
export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    q: typeof s.q === "string" ? s.q : "",
    topic: typeof s.topic === "string" ? s.topic : undefined,
    sort: s.sort === "popular" ? "popular" : s.sort === "latest" ? "latest" : undefined,
    tab: s.tab === "batches" || s.tab === "free" || s.tab === "courses" ? s.tab : undefined,
  }),
  errorComponent: AppErrorComponent,
  component: lazyPage(() => import("@/pages/search-page"), "Opening search"),
});

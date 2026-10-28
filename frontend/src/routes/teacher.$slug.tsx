import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { lazyPage } from "./-lazy-page";
import type { TeacherTab } from "@/components/educator-catalog";
type TeacherSearch = { topic?: string; sort?: "latest" | "popular"; tab?: TeacherTab };
function parseTab(v: unknown): TeacherTab {
  return v === "batches" || v === "free" ? v : "courses";
}
/** Unacademy handles are case-insensitive but their APIs only match the lowercase form; keep one canonical URL. */
export function canonicalTeacherSlug(slug: string) {
  return slug.trim().replace(/^@+/, "").toLowerCase();
}
export const Route = createFileRoute("/teacher/$slug")({
  validateSearch: (s: Record<string, unknown>): TeacherSearch => ({
    topic: typeof s.topic === "string" ? s.topic : undefined,
    sort: s.sort === "popular" ? "popular" : s.sort === "latest" ? "latest" : undefined,
    tab: parseTab(s.tab),
  }),
  beforeLoad: ({ params, search }) => {
    const canonical = canonicalTeacherSlug(params.slug);
    if (canonical && canonical !== params.slug) {
      throw redirect({ to: "/teacher/$slug", params: { slug: canonical }, search, replace: true });
    }
  },
  errorComponent: AppErrorComponent,
  component: lazyPage(() => import("@/pages/teacher-page"), "Opening this teacher"),
});

import { createFileRoute } from "@tanstack/react-router";
import { lazyPage } from "./-lazy-page";
import { AppErrorComponent } from "@/lib/error-component";
type CourseSearch = { slug?: string; teacher?: string };
export const Route = createFileRoute("/course/$courseId")({
  validateSearch: (s: Record<string, unknown>): CourseSearch => ({
    slug: typeof s.slug === "string" ? s.slug : undefined,
    teacher: typeof s.teacher === "string" ? s.teacher : undefined,
  }),
  errorComponent: AppErrorComponent,
  component: lazyPage(() => import("@/pages/course-page"), "Fetching classes"),
});

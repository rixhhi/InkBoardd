import { createFileRoute } from "@tanstack/react-router";
import { lazyPage } from "./-lazy-page";
import { AppErrorComponent } from "@/lib/error-component";
type PlaySearch = { title?: string; teacher?: string; course?: string; slug?: string; notes?: string; t?: number; focus?: number; fromCourse?: string; similar?: number };
export const Route = createFileRoute("/play/$lessonId")({
  head: () => ({
    links: [
      { rel: "preconnect", href: "https://static.uacdn.net" },
      { rel: "preconnect", href: "https://player.uacdn.net" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): PlaySearch => ({
    title: typeof s.title === "string" ? s.title : undefined,
    teacher: typeof s.teacher === "string" ? s.teacher : undefined,
    course: typeof s.course === "string" ? s.course : undefined,
    slug: typeof s.slug === "string" ? s.slug : undefined,
    fromCourse: typeof s.fromCourse === "string" ? s.fromCourse : undefined,
    similar: s.similar === true || s.similar === 1 || s.similar === "1" ? 1 : undefined,
    notes: typeof s.notes === "string" ? s.notes : undefined,
    t: (() => {
      const n = typeof s.t === "number" ? s.t : typeof s.t === "string" ? Number(s.t) : NaN;
      return Number.isFinite(n) && n > 0 ? n : undefined;
    })(),
    focus: s.focus === true || s.focus === 1 || s.focus === "1" ? 1 : undefined,
  }),
  errorComponent: AppErrorComponent,
  component: lazyPage(() => import("@/pages/play-page"), "Opening this class"),
});

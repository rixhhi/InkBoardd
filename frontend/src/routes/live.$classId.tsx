import { createFileRoute } from "@tanstack/react-router";
import { lazyPage } from "./-lazy-page";
import { AppErrorComponent } from "@/lib/error-component";

/**
 * A live class door. Shows the waiting room until the class is on air, the live
 * stage while it is, and forwards to /play once the recording lands.
 */
export const Route = createFileRoute("/live/$classId")({
  validateSearch: (s: Record<string, unknown>) => ({
    slug: typeof s.slug === "string" ? s.slug : undefined,
    course: typeof s.course === "string" ? s.course : undefined,
  }),
  errorComponent: AppErrorComponent,
  component: lazyPage(() => import("@/pages/live-page"), "Opening this class"),
});

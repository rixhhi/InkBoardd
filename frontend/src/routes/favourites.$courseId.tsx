import { createFileRoute } from "@tanstack/react-router";
import { lazyPage } from "./-lazy-page";
import { AppErrorComponent } from "@/lib/error-component";

export const Route = createFileRoute("/favourites/$courseId")({
  errorComponent: AppErrorComponent,
  component: lazyPage(() => import("@/pages/favourite-course-page"), "Opening this course"),
});

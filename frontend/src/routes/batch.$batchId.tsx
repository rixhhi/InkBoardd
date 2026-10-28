import { createFileRoute } from "@tanstack/react-router";
import { lazyPage } from "./-lazy-page";
import { AppErrorComponent } from "@/lib/error-component";
type BatchSearch = { slug?: string };
export const Route = createFileRoute("/batch/$batchId")({
  validateSearch: (s: Record<string, unknown>): BatchSearch => ({
    slug: typeof s.slug === "string" ? s.slug : undefined,
  }),
  errorComponent: AppErrorComponent,
  component: lazyPage(() => import("@/pages/batch-page"), "Fetching this batch"),
});

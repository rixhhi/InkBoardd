import { lazy, Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { PageBody, PageHeader, Skeleton } from "@/components/ui";

const HomeExams = lazy(() => import("@/components/home-exams").then((m) => ({ default: m.HomeExams })));

/** Exam picker. Was the home page; Home is now a dashboard. */
export default function BrowsePage() {
  return (
    <AppShell>
      <PageHeader eyebrow="Browse" title="Pick an exam" subline="Every teacher, course and class is grouped under an exam. Your pick is remembered." />
      <PageBody>
        <Suspense fallback={<Skeleton className="h-64" />}>
          <HomeExams />
        </Suspense>
      </PageBody>
    </AppShell>
  );
}

import { Link, useParams, useSearch } from "@tanstack/react-router";

import { useQuery } from "@tanstack/react-query";

import { lazy, Suspense } from "react";

import { ArchivedLesson } from "@/components/archived-lesson";

import { AppShell } from "@/components/app-shell";

import { Button, ErrorState, PageBody, Skeleton } from "@/components/ui";
import { softFailure } from "@/components/failure-notice";
import { Fetching, RouteFallback } from "@/components/fetching";

import { getTeacher, lessonByUnacademyId } from "@inkboard/shared/catalog";

import { PlayerErrorBoundary } from "@/lib/error-component";

import { isArchivedLessonError, loadLessonTimeline } from "@/lib/lesson-api";

import { ApiError, describeError } from "@/lib/api-client";

import { COPY } from "@inkboard/shared/copy";

const ClassPlayer = lazy(() => import("@/components/class-player").then((m) => ({ default: m.ClassPlayer })));

export default function PlayPage() {
  const { lessonId } = useParams({ from: "/play/$lessonId" });
  const search = useSearch({ from: "/play/$lessonId" });
  const catalog = lessonByUnacademyId(lessonId);
  const teacher = getTeacher(search.teacher ?? catalog?.teacherSlug ?? "");
  const title = search.title ?? catalog?.title ?? "Live class";
  const educatorName = teacher?.name ?? search.teacher;

  const q = useQuery({
    queryKey: ["lesson", "v2", lessonId],
    queryFn: ({ signal }) => loadLessonTimeline({ data: { id: lessonId }, signal }),
  });

  const back = search.course
    ? `/course/${search.course}`
    : teacher
      ? `/teacher/${teacher.slug}`
      : "/";

  if (q.isLoading && !q.data) {
    return (
      <AppShell immersive>
        <div className="grid h-[calc(100dvh-3rem)] grid-rows-[1fr_auto]">
          <div className="relative m-2 overflow-hidden rounded-md bg-surface">
            <Skeleton className="absolute inset-0 rounded-md" />
            <div className="absolute inset-0 grid place-items-center">
              <Fetching label="Fetching this class" />
            </div>
          </div>
          <div aria-hidden="true" className="flex h-16 items-center gap-3 border-t border-line px-4">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-1 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (q.isError || !q.data) {
    if (isArchivedLessonError(q.error)) {
      return (
        <ArchivedLesson
          lessonId={lessonId}
          title={title}
          educator={educatorName}
          backTo={back}
          notesUrl={search.notes}
        />
      );
    }
    const soft = softFailure(q.error);
    const described = describeError(q.error);
    const missing = q.error instanceof ApiError && (q.error.status === 404 || q.error.code === "NOT_FOUND");
    const locked = q.error instanceof ApiError && (q.error.code === "NOT_SHARED" || q.error.code === "FEATURE_OFF");
    return (
      <AppShell>
        <PageBody className="grid min-h-[70dvh] place-items-center py-16">
          <ErrorState
            error={q.error}
            heading
            title={missing ? "Class not found" : locked ? described.title : soft?.title ?? COPY.classDidNotOpen}
            body={missing ? "This class has no recording, or the link is wrong. Go back and pick another class." : locked ? described.body : soft?.body ?? described.body}
            onRetry={missing || locked ? undefined : () => void q.refetch()}
            retryAfterSec={described.kind === "ratelimit" ? 8 : undefined}
            action={
              <Button variant="ghost" asChild>
                <Link to={back}>{COPY.backToTheWall}</Link>
              </Button>
            }
          />
        </PageBody>
      </AppShell>
    );
  }

  return (
    <PlayerErrorBoundary>
      <Suspense fallback={<RouteFallback label="Opening this class" />}>
      <ClassPlayer
        key={lessonId}
        timeline={{ ...q.data, title }}
        title={title}
        educator={educatorName}
        teacherSlug={search.teacher ?? teacher?.slug}
        courseId={search.course}
        courseSlug={search.slug}
        fromCourse={search.fromCourse}
        similar={Boolean(search.similar)}
        backTo={back}
        notesUrl={search.notes}
        startAt={search.t}
        focus={Boolean(search.focus)}
      />
      </Suspense>
    </PlayerErrorBoundary>
  );
}

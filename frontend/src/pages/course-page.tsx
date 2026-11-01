import { Link, useParams, useSearch } from "@tanstack/react-router";
import {
  Button,
  ErrorState,
  PageBody,
  PageHeader,
  Skeleton,
} from "@/components/ui";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";




import { getCourse, getTeacher, lessonsForCourse } from "@inkboard/shared/catalog";

import { describeError } from "@/lib/api-client";
import { rememberCourse } from "@inkboard/shared/catalog-cache";
import { drainCoursePages } from "@/lib/course-rest";
import { catalogState } from "@/lib/catalog-status";
import { schedulePrefetch } from "@/lib/prefetch";


import { localGet } from "@inkboard/shared/local-cache";

import { loadLessonTimeline, probeReplayMedia } from "@/lib/lesson-api";


import { COPY } from "@inkboard/shared/copy";

import { collectNotesFiles, notesFileCounts } from "@inkboard/shared/notes-zip";

import {
  altReplayFootnote,
  coverageRatio,
  lineState,
  nextOpenIndex,
} from "@inkboard/shared/shelf";

import { courseSeal } from "@inkboard/shared/exam-wall";

import { courseQueryOptions, type loadCourseDetail, loadCourseLessons, type UaLesson } from "@/lib/unacademy";

import { useCatalogRoot } from "@/lib/session";

import { peekProgress } from "@inkboard/shared/watch-history";

import { readWatchLogs } from "@inkboard/shared/planner/watch-store";

import { groupLessons, mergeUid } from "./course/helpers";
import { CatalogShelf } from "./course/catalog-shelf";
import { LiveShelf } from "./course/live-shelf";

export default function CoursePage() {
  const root = useCatalogRoot();
  const { courseId } = useParams({ from: "/course/$courseId" });
  const search = useSearch({ from: "/course/$courseId" });
  const qc = useQueryClient();
  const catalogCourse = getCourse(courseId);
  const catalogTeacher = catalogCourse ? getTeacher(catalogCourse.teacherSlug) : undefined;
  const catalogLessons = catalogCourse ? lessonsForCourse(courseId) : [];
  const liveId = /^[A-Za-z0-9]{4,16}$/.test(courseId);
  const [rest, setRest] = useState<UaLesson[]>([]);
  const [restStatus, setRestStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [restError, setRestError] = useState("");
  const [restTry, setRestTry] = useState(0);
  const restRef = useRef<UaLesson[]>([]);
  const failedAt = useRef<number | null>(null);
  const [bootNext, setBootNext] = useState<number | null | undefined>(undefined);
  const cacheKey = `course-v10:${courseId}:${search.slug ?? ""}:${search.teacher ?? ""}`;
  const [q, setQ] = useState("");
  const cached = liveId ? localGet<Awaited<ReturnType<typeof loadCourseDetail>>>(cacheKey) : undefined;
  const live = useQuery({
    ...courseQueryOptions(courseId, search.slug, search.teacher),
    enabled: liveId,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.at,
  });
  useEffect(() => {
    if (!live.data) return;
    try {
      rememberCourse(courseId, search.slug, search.teacher, live.data);
    } catch {
      /* a full cache must not fail the page */
    }
  }, [live.data, courseId, search.slug, search.teacher]);
  const rawLessons = useMemo(() => mergeUid(live.data?.lessons ?? [], rest), [live.data?.lessons, rest]);
  const replayIds = useMemo(() => rawLessons.map((l) => l.replayId).filter((id): id is string => Boolean(id)), [rawLessons]);
  const media = useQuery({
    queryKey: ["replay-media", courseId, replayIds.join(",")],
    enabled: replayIds.length > 0,
    staleTime: 21_600_000,
    queryFn: ({ signal }) => probeReplayMedia({ data: { ids: replayIds }, signal }),
  });
  const lessons = useMemo(() => {
    const hits = media.data;
    if (!hits) return rawLessons;
    return rawLessons.map((lesson) => {
      if (!lesson.replayId) return lesson;
      if (!hits[lesson.replayId]?.archived) return lesson;
      return { ...lesson, status: "archived" as const };
    });
  }, [rawLessons, media.data]);

  useEffect(() => {
    restRef.current = [];
    failedAt.current = null;
    setRest([]);
    setRestStatus("idle");
    setRestError("");
    setBootNext(undefined);
  }, [courseId]);

  useEffect(() => {
    if (bootNext !== undefined || !live.data) return;
    setBootNext(live.data.nextOffset ?? null);
  }, [courseId, live.data, bootNext]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the drain restarts on courseId / bootNext / restTry only; live.data fields are read at call time so a refetch does not abort an in-flight drain
  useEffect(() => {
    const start = failedAt.current ?? bootNext;
    if (start == null) return;
    const ac = new AbortController();
    const seen = new Set((live.data?.lessons ?? []).map((lesson) => lesson.uid));
    for (const lesson of restRef.current) seen.add(lesson.uid);
    setRestStatus("loading");
    setRestError("");
    void drainCoursePages({
      start,
      seen,
      signal: ac.signal,
      initial: restRef.current,
      load: (offset, signal) =>
        loadCourseLessons({
          data: { uid: courseId, offset, total: live.data?.total, slug: search.slug || live.data?.course.slug },
          signal,
        }),
      onPage: (acc) => {
        restRef.current = acc;
        setRest(acc);
      },
    }).then((result) => {
      if (ac.signal.aborted) return;
      restRef.current = result.acc;
      setRest(result.acc);
      if (result.status === "error") {
        failedAt.current = result.failedOffset;
        setRestStatus("error");
        setRestError(describeError(result.error).body);
        return;
      }
      failedAt.current = null;
      setRestStatus("done");
    });
    return () => ac.abort();
  }, [courseId, bootNext, restTry]);

  if (!liveId && catalogCourse && catalogTeacher) {
    return <CatalogShelf courseId={courseId} />;
  }

  if (live.isLoading) {
    return (
      <AppShell>
        <PageHeader title={<Skeleton className="h-8 w-80" />} eyebrow={<Skeleton className="h-3 w-24" />} subline={<Skeleton className="h-4 w-56" />} />
        <PageBody className="grid gap-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </PageBody>
      </AppShell>
    );
  }

  if (!live.data) {
    const described = describeError(live.error);
    const playlist = described.kind === "notfound" || /playlist/i.test(live.error instanceof Error ? live.error.message : "");
    return (
      <AppShell>
        <PageBody className="pt-8">
          <ErrorState
            error={live.error}
            heading
            title={described.title || COPY.shelfDidNotLoad}
            body={`${described.body}${playlist ? " Some lists are not courses — open the teacher, or pick a course from the exam." : ""}`}
            onRetry={() => void live.refetch()}
            action={
              <>
                {search.teacher ? (
                  <Button variant="ghost" asChild>
                    <Link to="/teacher/$slug" params={{ slug: search.teacher }}>
                      @{search.teacher}
                    </Link>
                  </Button>
                ) : null}
                <Button variant="ghost" asChild>
                  <Link to={root.to}>{root.back}</Link>
                </Button>
              </>
            }
          />
        </PageBody>
      </AppShell>
    );
  }

  const { course } = live.data;
  const teacher = course.authorUsername || search.teacher;
  const liveCount = lessons.filter((l) => l.status === "live").length;
  const upcomingCount = lessons.filter((l) => l.status === "upcoming").length;
  const archivedCount = lessons.filter((l) => l.status === "archived").length;
  // Ended classes with no replay to play. Unacademy marks these "unavailable"; the row shows a
  // badge, but a whole course of them looked like 6 playable classes until you scrolled.
  const unavailableCount = lessons.filter((l) => !l.replayId && l.status !== "live" && l.status !== "upcoming").length;
  const needle = q.trim().toLowerCase();
  const filtered = lessons.filter((lesson) => {
    if (needle && !lesson.title.toLowerCase().includes(needle)) return false;
    return true;
  });
  const groups = groupLessons(filtered);
  const stillLoading = restStatus === "loading" && rest.length === 0;
  const logs = typeof window === "undefined" ? [] : readWatchLogs();
  const states = filtered.map((lesson) =>
    lineState({
      watchedSec: lesson.replayId ? peekProgress(lesson.replayId) : 0,
      durationSec: lesson.durationSec,
      coverage: lesson.replayId ? coverageRatio(logs, lesson.replayId, lesson.durationSec) : 0,
    }),
  );
  const nextIdx = nextOpenIndex(states.map((s, i) => (filtered[i]?.playable || filtered[i]?.status === "live" ? s : "struck")));
  const nextLesson = nextIdx >= 0 ? filtered[nextIdx] : undefined;
  const notesFiles = collectNotesFiles(lessons);
  const notesCounts = notesFileCounts(notesFiles);
  const topic = courseSeal(course.topics, course.language, course.name);
  const footnote = [
    altReplayFootnote(lessons),
    archivedCount ? `${archivedCount} archived` : "",
    course.language || "",
  ]
    .filter(Boolean)
    .join(" · ");

  void catalogLessons;

  return (
    <LiveShelf
      courseName={course.name}
      topic={topic}
      teacher={teacher}
      teacherName={course.authorName}
      courseId={course.uid}
      total={live.data.total || lessons.length}
      liveCount={liveCount}
      upcomingCount={upcomingCount}
      unavailableCount={unavailableCount}
      footnote={footnote}
      description={course.description}
      stillLoading={stillLoading}
      restError={restError}
      retryRest={() => setRestTry((n) => n + 1)}
      lessons={lessons}
      notesCount={notesCounts.known}
      notesGuessed={notesCounts.guessed}
      nextTitle={nextLesson?.title}
      slug={search.slug || live.data.course.slug}
      q={q}
      setQ={setQ}
      groups={groups}
      filtered={filtered}
      states={states}
      nextIdx={nextIdx}
      prefetch={(id, archived) => {
        if (!id || archived || catalogState().status === "down") return;
        schedulePrefetch(() =>
          qc.prefetchQuery({
            queryKey: ["lesson", "v2", id],
            queryFn: ({ signal }) => loadLessonTimeline({ data: { id }, signal }),
          }),
        );
      }}
    />
  );
}

import { Link, useParams } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ExamHubView } from "@/components/exam-hub";
import { Button, ErrorState, PageBody, PageHeader, Skeleton } from "@/components/ui";
import { softFailure } from "@/components/failure-notice";
import { writeExamId } from "@inkboard/shared/exam-pref";
import { getExam } from "@inkboard/shared/exams";
import { COPY } from "@inkboard/shared/copy";
import { readHub, rememberHub } from "@inkboard/shared/catalog-cache";
import { describeError } from "@/lib/api-client";
import { appendMore, blankMore, failMore, visibleNext, type More } from "@/lib/exam-more";
import { examHubQuery, loadExamCourses, loadExamTeachers, type ExamCourse, type ExamHub, type ExamTeacher } from "@/lib/unacademy";
import { useCatalogRoot } from "@/lib/session";

/** Inline "some of this didn't refresh" line: the hub still renders from cache underneath. */
function SoftNotice({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <p role="status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface-raised px-3 py-2 text-sm text-fg-muted">
      <span>{text}</span>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        {COPY.tryAgain}
      </Button>
    </p>
  );
}

export default function ExamPage() {
  const root = useCatalogRoot();
  const { goalId } = useParams({ from: "/exam/$goalId" });
  const exam = getExam(goalId);
  const [teachersMore, setTeachersMore] = useState<More<ExamTeacher>>(blankMore);
  const [coursesMore, setCoursesMore] = useState<More<ExamCourse>>(blankMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);

  useEffect(() => {
    setTeachersMore(blankMore());
    setCoursesMore(blankMore());
    setLoadingMore(false);
    setLoadingCourses(false);
    if (exam) writeExamId(exam.id);
  }, [goalId]);

  const cached = exam ? readHub<ExamHub>(exam.id) : undefined;

  const q = useQuery({
    ...examHubQuery(exam?.id ?? ""),
    enabled: Boolean(exam),
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.at,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!exam || !q.data) return;
    try {
      rememberHub(exam.id, q.data);
    } catch {
      /* a full cache must not fail the page */
    }
  }, [exam, q.data]);

  const teacherNext = visibleNext(q.data?.nextOffset, teachersMore);
  const courseNext = visibleNext(q.data?.coursesNext, coursesMore);

  const loadMore = useCallback(async () => {
    if (teacherNext == null || loadingMore || !exam) return;
    setLoadingMore(true);
    try {
      const page = await loadExamTeachers({ data: { goalId: exam.id, offset: teacherNext } });
      setTeachersMore((prev) => appendMore(prev, page.teachers, page.nextOffset));
    } catch (err) {
      setTeachersMore((prev) => failMore(prev, describeError(err).body));
    } finally {
      setLoadingMore(false);
    }
  }, [teacherNext, loadingMore, exam]);

  const loadMoreCourses = useCallback(async () => {
    if (courseNext == null || loadingCourses || !exam) return;
    setLoadingCourses(true);
    try {
      const page = await loadExamCourses({ data: { goalId: exam.id, offset: courseNext } });
      setCoursesMore((prev) => appendMore(prev, page.courses, page.nextOffset));
    } catch (err) {
      setCoursesMore((prev) => failMore(prev, describeError(err).body));
    } finally {
      setLoadingCourses(false);
    }
  }, [courseNext, loadingCourses, exam]);

  if (!exam) {
    return (
      <AppShell>
        <PageBody className="pt-8">
          <ErrorState
            kind="not-found"
            heading
            title={COPY.examNotOnWall}
            body="Pick another exam from Browse."
            action={
              <Button variant="ghost" asChild>
                <Link to={root.to}>{root.back}</Link>
              </Button>
            }
          />
        </PageBody>
      </AppShell>
    );
  }

  const described = q.isError ? describeError(q.error) : null;
  const soft = q.isError ? softFailure(q.error) : null;
  const crumbs = [{ label: root.label, to: root.to }, { label: exam.name }];

  if (q.isLoading && !q.data) {
    return (
      <AppShell>
        <PageHeader crumbs={crumbs} eyebrow={exam.group} title={exam.name} subline={<Skeleton className="h-4 w-72" />} />
        <PageBody>
          <div role="status" aria-label="Fetching this exam" className="grid gap-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-[4.5rem] w-full" />
              ))}
            </div>
            <Skeleton className="mt-6 h-5 w-32" />
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={`r${i}`} className="h-14 w-full" />
            ))}
          </div>
        </PageBody>
      </AppShell>
    );
  }

  if (!q.data) {
    return (
      <AppShell>
        <PageBody className="pt-8">
          <ErrorState
            error={q.error}
            heading
            title={soft?.title || described?.title || COPY.wallDidNotLoad}
            body={soft?.body || described?.body}
            onRetry={() => void q.refetch()}
            action={
              <Button variant="ghost" asChild>
                <Link to={root.to}>{root.back}</Link>
              </Button>
            }
          />
        </PageBody>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <nav aria-label="Breadcrumb" className="page-pad pt-6 sm:pt-8">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-fg-muted">
          <li>
            <Link to={root.to} className="rounded-sm hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {root.label}
            </Link>
          </li>
          <li aria-hidden="true" className="text-fg-faint">
            ›
          </li>
          <li>
            <span aria-current="page">{exam.name}</span>
          </li>
        </ol>
      </nav>
      <PageBody>
        {soft ? (
          <SoftNotice text={`${soft.title} ${soft.body}`.trim()} onRetry={() => void q.refetch()} />
        ) : described || q.data.partial?.length ? (
          <SoftNotice text="Couldn’t refresh every section." onRetry={() => void q.refetch()} />
        ) : null}
        {teachersMore.error || coursesMore.error ? (
          <SoftNotice
            text={teachersMore.error || coursesMore.error || ""}
            onRetry={() => void (teachersMore.error ? loadMore() : loadMoreCourses())}
          />
        ) : null}
        <ExamHubView
          hub={q.data}
          extraTeachers={teachersMore.items}
          extraCourses={coursesMore.items}
          loadingMore={loadingMore}
          loadingCourses={loadingCourses}
          onLoadMore={teacherNext != null ? () => void loadMore() : undefined}
          onLoadMoreCourses={courseNext != null ? () => void loadMoreCourses() : undefined}
        />
        <p className="mt-10 pb-16">
          <Button variant="ghost" size="sm" asChild>
            <Link to={root.to} onClick={() => writeExamId("")}>
              {root.back}
            </Link>
          </Button>
        </p>
      </PageBody>
    </AppShell>
  );
}

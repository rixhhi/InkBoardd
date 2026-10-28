import { Link, useNavigate } from "@tanstack/react-router";
import { ShareButton } from "@/components/admin/share-dialog";
import { Bookmark, BookmarkCheck, CalendarPlus } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Chip,
  Dot,
  EmptyState,
  ErrorState,
  List,
  ListRow,
  PageBody,
  PageHeader,
  SearchInput,
  Section,
  Skeleton,
  Tabs,
  Thumb,
  Toolbar,
  type TabDef,
} from "@/components/ui";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { InfiniteTrigger } from "@/components/infinite-trigger";
import { useShelfLedger } from "@/components/folio/shelf";
import { courseOnTopic, coursePrimaryTopic, isGenericTopic, topicsTaught } from "@inkboard/shared/exam-wall";
import { useSelectedExam } from "@inkboard/shared/exam-pref";
import { examMatchesGoal } from "@inkboard/shared/exams";
import { isSaved, toggleSaved } from "@inkboard/shared/library";
import { localGet, localSet } from "@inkboard/shared/local-cache";
import { teacherShelfEmpty, type TeacherTab } from "@inkboard/shared/shelf";
import {
  courseQueryOptions,
  loadEducatorBatches,
  loadEducatorPage,
  loadEducatorSpecials,
  type EducatorPage,
  type SpecialCourse,
  type UaBatch,
  type UaCourse,
} from "@/lib/unacademy";
import { schedulePrefetch } from "@/lib/prefetch";
import { useCatalogRoot } from "@/lib/session";

export type { TeacherTab };

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function EducatorCatalog({
  username,
  topicUid,
  sort = "latest",
  tab = "courses",
  onTopic,
  onSort,
  onTab,
  exam: examProp,
}: {
  username: string;
  topicUid?: string;
  sort?: "latest" | "popular";
  tab?: TeacherTab;
  onTopic?: (uid?: string) => void;
  onSort?: (sort: "latest" | "popular") => void;
  onTab?: (tab: TeacherTab) => void;
  backTo?: string;
  backLabel?: string;
  exam?: { id: string; name: string } | null;
}) {
  const root = useCatalogRoot();
  const selectedExam = useSelectedExam();
  const exam = examProp ?? selectedExam;
  const [extra, setExtra] = useState<UaCourse[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allTopics, setAllTopics] = useState(false);
  const [extraBatches, setExtraBatches] = useState<UaBatch[]>([]);
  const [batchOffset, setBatchOffset] = useState<number | null>(null);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [extraSpecials, setExtraSpecials] = useState<SpecialCourse[]>([]);
  const [specialOffset, setSpecialOffset] = useState<number | null>(null);
  const [loadingSpecials, setLoadingSpecials] = useState(false);
  const [courseFilter, setCourseFilter] = useState("");

  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setSaved(isSaved(username));
  }, [username]);

  useEffect(() => {
    setExtra([]);
    setNextOffset(null);
    setCourseFilter("");
  }, [username, sort]);

  useEffect(() => {
    setExtraBatches([]);
    setBatchOffset(null);
    setExtraSpecials([]);
    setSpecialOffset(null);
  }, [username]);
  const cacheKey = `edu3:${username.toLowerCase()}:${sort}`;
  const cached = localGet<EducatorPage>(cacheKey);

  const q = useQuery({
    queryKey: ["educator", "v3", username.toLowerCase(), sort],
    placeholderData: keepPreviousData,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.at,
    queryFn: async ({ signal }) => {
      const page = await loadEducatorPage({ data: { username, sort, offset: 0 }, signal });
      setExtra([]);
      setNextOffset(page.nextOffset);
      localSet(cacheKey, page);
      return page;
    },
  });

  const batchesQ = useQuery({
    queryKey: ["educator-batches", username.toLowerCase()],
    queryFn: async ({ signal }) => {
      const page = await loadEducatorBatches({ data: { username, offset: 0 }, signal });
      setExtraBatches([]);
      setBatchOffset(page.nextOffset);
      return page;
    },
    enabled: tab === "batches" || Boolean(q.data),
  });

  const specialsQ = useQuery({
    queryKey: ["educator-specials", username.toLowerCase()],
    queryFn: async ({ signal }) => {
      const page = await loadEducatorSpecials({ data: { username, offset: 0 }, signal });
      setExtraSpecials([]);
      setSpecialOffset(page.nextOffset);
      return page;
    },
    enabled: tab === "free" || Boolean(q.data),
  });

  const courses = useMemo(() => [...(q.data?.courses ?? []), ...extra], [q.data?.courses, extra]);
  const batches = useMemo(
    () => [...(batchesQ.data?.batches ?? []), ...extraBatches],
    [batchesQ.data?.batches, extraBatches],
  );
  const specials = useMemo(
    () => [...(specialsQ.data?.courses ?? []), ...extraSpecials],
    [specialsQ.data?.courses, extraSpecials],
  );
  const batchesNext = extraBatches.length > 0 ? batchOffset : (batchesQ.data?.nextOffset ?? batchOffset);
  const specialsNext = extraSpecials.length > 0 ? specialOffset : (specialsQ.data?.nextOffset ?? specialOffset);
  const topics = useMemo(() => topicsTaught(courses), [courses]);
  const covered = topics.filter((t) => !isGenericTopic(t.name));
  const shownTopics = allTopics || covered.length <= 16 ? covered : covered.slice(0, 16);
  const activeTopic = topicUid ? topics.find((t) => t.uid === topicUid) : undefined;
  const needle = courseFilter.trim().toLowerCase();
  const visible = (activeTopic
    ? courses.filter((c) => courseOnTopic(c, activeTopic))
    : courses
  ).filter((c) => !needle || c.name.toLowerCase().includes(needle));

  const loadMore = useCallback(async () => {
    const offset = extra.length === 0 ? (q.data?.nextOffset ?? nextOffset) : nextOffset;
    if (offset == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await loadEducatorPage({ data: { username, sort, offset } });
      setExtra((prev) => [...prev, ...page.courses]);
      setNextOffset(page.nextOffset);
    } finally {
      setLoadingMore(false);
    }
  }, [extra.length, q.data?.nextOffset, nextOffset, loadingMore, username, sort]);

  const loadMoreBatches = useCallback(async () => {
    const offset = extraBatches.length > 0 ? batchOffset : (batchesQ.data?.nextOffset ?? batchOffset);
    if (offset == null || loadingBatches) return;
    setLoadingBatches(true);
    try {
      const page = await loadEducatorBatches({ data: { username, offset } });
      setExtraBatches((prev) => [...prev, ...page.batches]);
      setBatchOffset(page.nextOffset);
    } finally {
      setLoadingBatches(false);
    }
  }, [batchOffset, extraBatches.length, batchesQ.data?.nextOffset, loadingBatches, username]);

  const loadMoreSpecials = useCallback(async () => {
    const offset = extraSpecials.length > 0 ? specialOffset : (specialsQ.data?.nextOffset ?? specialOffset);
    if (offset == null || loadingSpecials) return;
    setLoadingSpecials(true);
    try {
      const page = await loadEducatorSpecials({ data: { username, offset } });
      setExtraSpecials((prev) => [...prev, ...page.courses]);
      setSpecialOffset(page.nextOffset);
    } finally {
      setLoadingSpecials(false);
    }
  }, [specialOffset, extraSpecials.length, specialsQ.data?.nextOffset, loadingSpecials, username]);

  useShelfLedger(
    q.data
      ? {
          kicker: "Teacher",
          title: q.data.educator.name,
          meta: `@${q.data.educator.username}`,
          teacher: q.data.educator.username,
          examId: exam?.id,
        }
      : null,
  );

  if (q.isLoading) {
    return (
      <>
        <PageHeader
          title={<Skeleton className="h-8 w-64" />}
          leading={<Skeleton className="size-14 rounded-full" />}
          subline={<Skeleton className="h-4 w-80" />}
        />
        <PageBody className="grid gap-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </PageBody>
      </>
    );
  }

  // A failed background refetch must not blank out a page we already have (cached or previous).
  if (!q.data) {
    return (
      <PageBody className="pt-8">
        <ErrorState
          error={q.error}
          heading
          onRetry={() => void q.refetch()}
          action={
            <Button variant="ghost" asChild>
              <Link to={root.to}>{root.back}</Link>
            </Button>
          }
        />
      </PageBody>
    );
  }

  const ed = q.data.educator;
  const examBatches = exam ? batches.filter((b) => examMatchesGoal(exam, b.goalUid)) : [];
  const otherBatches = exam ? batches.filter((b) => !examMatchesGoal(exam, b.goalUid)) : batches;
  const batchTotal = batchesQ.data?.total ?? 0;
  const tabs: TabDef[] = [
    { id: "courses", label: "Courses", count: q.data.totalCourses || undefined },
    { id: "batches", label: "Batches", count: batchTotal || undefined },
    { id: "free", label: "Free classes", count: specialsQ.data?.total || undefined },
  ];
  const empty = teacherShelfEmpty(tab, { filter: courseFilter, hasBatches: batchTotal > 0 });
  const metaBits = [
    ed.designation,
    ed.courseCount ? `${ed.courseCount} courses` : "",
    ed.languages.slice(0, 3).join(" · "),
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: root.label, to: root.to },
          ...(exam ? [{ label: exam.name, to: "/exam/$goalId", params: { goalId: exam.id } }] : []),
          { label: ed.name },
        ]}
        leading={<Avatar src={ed.avatar} name={ed.name} size="xl" decorative />}
        eyebrow={`@${ed.username}`}
        title={ed.name}
        subline={
          <>
            {metaBits.length ? <p className="text-sm text-fg-muted">{metaBits.join(" · ")}</p> : null}
            {ed.bio ? <Bio text={ed.bio} /> : null}
          </>
        }
        actions={
          <>
            <ShareButton kind="teacher" refId={ed.username} label={ed.name} />
            <Button
              variant={saved ? "secondary" : "primary"}
              icon={saved ? BookmarkCheck : Bookmark}
              aria-pressed={saved}
              onClick={() => setSaved(toggleSaved({ username: ed.username, name: ed.name, avatar: ed.avatar }))}
            >
              {saved ? "Following" : "Follow"}
            </Button>
            <Button variant="secondary" icon={CalendarPlus} asChild>
              <Link to="/planner/new" search={{ exam: exam?.id, teacher: ed.username }}>
                Add to plan
              </Link>
            </Button>
          </>
        }
        tabs={<Tabs tabs={tabs} value={tab} label="Teacher sections" onChange={(id) => onTab?.(id as TeacherTab)} />}
      />

      {tab === "courses" ? (
        <>
          <Toolbar
            trailing={
              <div className="flex items-center gap-1" role="group" aria-label="Sort">
                {(["latest", "popular"] as const).map((s) => (
                  <Chip key={s} pressed={sort === s} onClick={() => onSort?.(s)}>
                    {s === "latest" ? "Latest" : "Popular"}
                  </Chip>
                ))}
              </div>
            }
          >
            <SearchInput label="Filter courses" placeholder="Filter courses" value={courseFilter} onChange={setCourseFilter} className="w-56 shrink-0" resultCount={needle ? visible.length : null} />
            {covered.length > 0 ? (
              <>
                <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line" />
                {shownTopics.map((t) => (
                  <Chip key={t.uid} pressed={t.uid === topicUid} onClick={() => onTopic?.(t.uid === topicUid ? undefined : t.uid)}>
                    {t.name}
                  </Chip>
                ))}
                {covered.length > 16 ? (
                  <Chip pressed={allTopics} onClick={() => setAllTopics((v) => !v)}>
                    {allTopics ? "Fewer topics" : `+${covered.length - 16} more`}
                  </Chip>
                ) : null}
              </>
            ) : null}
          </Toolbar>
          <PageBody>
            <p className="mb-2 text-xs text-fg-muted" aria-live="polite">
              {activeTopic ? `${visible.length} on ${activeTopic.name}` : `${q.data.totalCourses} courses · showing ${visible.length}`}
            </p>
            {visible.length ? (
              <List label="Courses">
                {visible.map((c) => (
                  <CourseLine key={c.uid} course={c} username={ed.username} />
                ))}
              </List>
            ) : (
              <EmptyState title={empty.title} body={empty.body} />
            )}
            {!activeTopic && (extra.length === 0 ? q.data.nextOffset : nextOffset) != null ? (
              <InfiniteTrigger onVisible={() => void loadMore()} disabled={loadingMore} label="More courses" />
            ) : null}
          </PageBody>
        </>
      ) : null}

      {tab === "batches" ? (
        <PageBody>
          <p className="mb-3 text-sm text-fg-muted">
            {exam
              ? examBatches.length
                ? `${exam.name} batches first, then anything else they teach.`
                : `No ${exam.name} batch on this page — other exams they teach are below.`
              : "Year-long batches — open one for the live timetable."}
          </p>
          {batchesQ.isLoading ? (
            <div className="grid gap-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : (
            <>
              {exam && examBatches.length ? (
                <Section title={exam.name} level={3}>
                  <List label={`${exam.name} batches`}>
                    {examBatches.map((b) => (
                      <BatchLine key={b.uid} batch={b} />
                    ))}
                  </List>
                </Section>
              ) : null}
              {otherBatches.length ? (
                <Section title={exam && examBatches.length ? "Other exams" : "Batches"} level={3}>
                  <List label="Other batches">
                    {otherBatches.map((b) => (
                      <BatchLine key={b.uid} batch={b} />
                    ))}
                  </List>
                </Section>
              ) : null}
            </>
          )}
          {batchesQ.data && batches.length === 0 ? <EmptyState title={empty.title} body={empty.body} /> : null}
          {batchesNext != null ? <InfiniteTrigger onVisible={() => void loadMoreBatches()} disabled={loadingBatches} label="More batches" /> : null}
        </PageBody>
      ) : null}

      {tab === "free" ? (
        <PageBody>
          {specialsQ.isLoading ? (
            <div className="grid gap-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : specials.length ? (
            <List label="Free classes">
              {specials.map((c) => (
                <SpecialLine key={c.uid} course={c} username={ed.username} />
              ))}
            </List>
          ) : null}
          {specialsQ.data && specials.length === 0 ? <EmptyState title={empty.title} body={empty.body} /> : null}
          {specialsNext != null ? <InfiniteTrigger onVisible={() => void loadMoreSpecials()} disabled={loadingSpecials} label="More classes" /> : null}
        </PageBody>
      ) : null}
    </>
  );
}

/** Bio with a clamp and an expand toggle. */
function Bio({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 180;
  if (!text.trim()) return null;
  return (
    <div className="mt-2 text-sm text-fg-muted">
      <p className={open ? "" : "line-clamp-2"}>{text}</p>
      {long ? (
        <button type="button" className="mt-1 text-xs text-fg hover:underline" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Less" : "More"}
        </button>
      ) : null}
    </div>
  );
}

function CourseLine({ course, username }: { course: UaCourse; username: string }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const primary = coursePrimaryTopic(course.topics, course.name);
  const to = { to: "/course/$courseId" as const, params: { courseId: course.uid }, search: { slug: course.slug, teacher: username } };
  const prefetch = () => schedulePrefetch(() => qc.prefetchQuery(courseQueryOptions(course.uid, course.slug, username)));
  return (
    <ListRow
      leading={<Thumb src={course.thumbnail} />}
      title={
        <Link {...to} onMouseEnter={prefetch} onFocus={prefetch} className="hover:underline focus-visible:outline-none">
          {course.name}
        </Link>
      }
      badge={primary ? <Badge>{primary.name}</Badge> : undefined}
      meta={
        <>
          {course.itemCount ? <span>{course.itemCount === 1 ? "1 class" : `${course.itemCount} classes`}</span> : null}
          {course.language ? (
            <>
              <Dot />
              <span>{course.language}</span>
            </>
          ) : null}
          {course.startsAt ? (
            <>
              <Dot />
              <span>{fmtDate(course.startsAt)}</span>
            </>
          ) : null}
        </>
      }
      onActivate={() => void nav(to)}
    />
  );
}

function BatchLine({ batch }: { batch: UaBatch }) {
  const nav = useNavigate();
  const to = { to: "/batch/$batchId" as const, params: { batchId: batch.uid }, search: { slug: batch.slug } };
  const authors = batch.authors.slice(0, 3).map((a) => a.name).join(", ");
  return (
    <ListRow
      leading={<Thumb src={batch.thumbnail} />}
      title={
        <Link {...to} className="hover:underline focus-visible:outline-none">
          {batch.name}
        </Link>
      }
      badge={batch.goalName ? <Badge tone="info">{batch.goalName}</Badge> : undefined}
      meta={
        <>
          {batch.syllabusTag ? <span>{batch.syllabusTag}</span> : null}
          {batch.startsAt ? (
            <>
              <Dot />
              <span>{fmtDate(batch.startsAt)}</span>
            </>
          ) : null}
          {authors ? (
            <>
              <Dot />
              <span>{authors}</span>
            </>
          ) : null}
        </>
      }
      onActivate={() => void nav(to)}
    />
  );
}

function SpecialLine({ course, username }: { course: SpecialCourse; username: string }) {
  const nav = useNavigate();
  const live = course.status === "live";
  const upcoming = course.status === "upcoming";
  const replayId = course.replayId;
  const title = replayId ? (
    <Link
      to="/play/$lessonId"
      params={{ lessonId: replayId }}
      search={{ title: course.name, teacher: username, course: course.uid }}
      className="hover:underline focus-visible:outline-none"
    >
      {course.name}
    </Link>
  ) : (
    <Link to="/course/$courseId" params={{ courseId: course.uid }} search={{ slug: course.slug, teacher: username }} className="hover:underline focus-visible:outline-none">
      {course.name}
    </Link>
  );
  const open = () =>
    replayId
      ? void nav({ to: "/play/$lessonId", params: { lessonId: replayId }, search: { title: course.name, teacher: username, course: course.uid } })
      : void nav({ to: "/course/$courseId", params: { courseId: course.uid }, search: { slug: course.slug, teacher: username } });
  return (
    <ListRow
      leading={<Thumb src={course.thumbnail} />}
      title={title}
      badge={live ? <Badge tone="live">Live</Badge> : upcoming ? <Badge tone="info">Upcoming</Badge> : <Badge tone="ok">Free</Badge>}
      meta={
        <>
          {course.liveAt ? <span>{fmtDate(course.liveAt)}</span> : course.language ? <span>{course.language}</span> : null}
          {replayId ? (
            <>
              <Dot />
              <span>Replay available</span>
            </>
          ) : null}
        </>
      }
      onActivate={open}
    />
  );
}

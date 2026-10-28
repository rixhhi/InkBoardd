import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowLeft, GraduationCap, ListChecks } from "lucide-react";
import { InfiniteTrigger } from "@/components/infinite-trigger";
import { ShareButton } from "@/components/admin/share-dialog";
import { Badge, Button, Chip, EmptyState, ListRow, SearchInput, Section, Skeleton } from "@/components/ui";
import {
  CourseIndex,
  CrashDoor,
  DoorRow,
  IndexShelf,
  LiveDoor,
  PlateGrid,
  PlaylistIndex,
  StampRack,
  SubjectPlate,
  TeacherStamp,
} from "@/components/folio/wall";
import { plannedCourseIds } from "@inkboard/shared/catalog-plan";
import { daysToExamLine, isPlateSubject, matchesTopic, plateCaption, setWallLedger, fmtWhen } from "@inkboard/shared/exam-wall";
import { COPY } from "@inkboard/shared/copy";
import { AddPracticeToPlan, AddTestToPlan } from "@/components/add-to-plan";
import { examsByGroup, examSeal, familyExams, groupTeachersBySubject, iconicSubjectGoal, teacherSubject, type Exam } from "@inkboard/shared/exams";
import { minutesFromSec, quizCaption, seriesCaption, seriesShortName, sittingDate, testsPlateCaption } from "@inkboard/shared/test-series";
import { practiceCaption, practicePlateCaption } from "@inkboard/shared/practice-lines";
import { papersCaption, papersForExam, strikePapers } from "@inkboard/shared/exam-papers";
import { liveTasks } from "@inkboard/shared/planner/types";
import { diffDays, todayKey } from "@inkboard/shared/planner/dates";
import { activePlan } from "@inkboard/shared/planner/storage";
import { usePlannerSelector } from "@inkboard/shared/planner/use-planner";
import { loadExamCourses, loadExamPractice, loadExamSubjectCourses, loadExamTests, loadTestSeriesItems, type ExamCourse, type ExamHub, type ExamSubject, type ExamTeacher } from "@/lib/unacademy";
import { readHistory, subscribeHistory } from "@inkboard/shared/watch-history";

/** Numbered leading slot for ordered rows (tests, papers, practice). */
function Ordinal({ n }: { n: number | string }) {
  return (
    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-raised text-xs font-semibold tabular-nums text-fg-muted">
      {n}
    </span>
  );
}

/** Line skeletons for a shelf that is still fetching. */
function ShelfSkeleton({ rows = 4, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

function countsFor(
  name: string,
  courses: ExamCourse[],
  liveCount: number,
  playlists: { topic: string }[],
) {
  return plateCaption({
    courses: courses.filter((c) => matchesTopic(c.topic, name) || matchesTopic(c.name, name)).length,
    live: liveCount,
    playlists: playlists.filter((p) => matchesTopic(p.topic, name)).length,
  });
}

export function ExamHubView({
  hub,
  extraTeachers = [],
  extraCourses = [],
  compact,
  loadingMore,
  loadingCourses,
  onLoadMore,
  onLoadMoreCourses,
}: {
  hub: ExamHub;
  extraTeachers?: ExamTeacher[];
  extraCourses?: ExamCourse[];
  compact?: boolean;
  loadingMore?: boolean;
  loadingCourses?: boolean;
  onLoadMore?: () => void;
  onLoadMoreCourses?: () => void;
}) {
  const exam = hub.exam;
  const planned = usePlannerSelector(
    (s) => plannedCourseIds(activePlan(s)),
    (a, b) => a.size === b.size && [...a].every((id) => b.has(id)),
  );
  const daysLeft = usePlannerSelector((s) => {
    const plan = activePlan(s);
    if (!plan || plan.examId !== exam.id || !plan.prefs.examDate) return null;
    return diffDays(plan.prefs.examDate, todayKey());
  });
  const [topic, setTopic] = useState("all");
  const [filter, setFilter] = useState("");
  const [courseCap, setCourseCap] = useState(12);
  const [seriesUid, setSeriesUid] = useState<string | null>(null);
  const related = familyExams(exam);
  const onTests = topic === "tests";
  const onPapers = topic === "papers";
  const onPractice = topic === "practice";
  const faced = topic !== "all";
  const seal = examSeal(exam);
  const daysLine = daysToExamLine(daysLeft, seal);

  useEffect(() => {
    setCourseCap(12);
    setSeriesUid(null);
  }, [exam.id, topic]);

  const testsQ = useQuery({
    queryKey: ["exam-tests", "v1", exam.id],
    queryFn: ({ signal }) => loadExamTests({ data: { goalId: exam.id }, signal }),
  });
  const seriesList = testsQ.data?.series ?? [];
  const practiceQ = useQuery({
    queryKey: ["exam-practice", "v1", exam.id],
    queryFn: ({ signal }) => loadExamPractice({ data: { goalId: exam.id }, signal }),
  });
  const practiceLines = practiceQ.data?.lines ?? [];
  const crashDoors = hub.crash ?? [];
  const paperList = papersForExam(exam.id);
  const watchedTitles = useSyncExternalStore(
    subscribeHistory,
    () =>
      readHistory()
        .filter((h) => !h.examId || h.examId === exam.id)
        .map((h) => h.title)
        .join("\n"),
    () => "",
  );
  const doneTitles = usePlannerSelector(
    (s) => {
      const plan = activePlan(s);
      if (!plan || plan.examId !== exam.id) return [] as string[];
      return liveTasks(plan.tasks)
        .filter((t) => t.status === "done")
        .map((t) => t.title)
        .filter(Boolean);
    },
    (a, b) => a.length === b.length && a.every((t, i) => t === b[i]),
  );
  const struckRows = useMemo(() => {
    const watched = watchedTitles.split("\n").filter(Boolean);
    return strikePapers(paperList, [...watched, ...doneTitles]);
  }, [paperList, doneTitles, watchedTitles]);
  const openSeries = seriesList.find((s) => s.uid === seriesUid) ?? null;
  const itemsQ = useQuery({
    queryKey: ["test-items", "v1", seriesUid],
    enabled: Boolean(seriesUid),
    queryFn: ({ signal }) => loadTestSeriesItems({ data: { uid: seriesUid! }, signal }),
  });

  const teachers = useMemo(
    () => [...hub.teachers, ...extraTeachers].filter((t) => t?.username),
    [hub.teachers, extraTeachers],
  );
  const subjects = useMemo(() => {
    const seen = new Set<string>();
    const out: ExamSubject[] = [];
    for (const s of hub.subjects ?? []) {
      if (!s?.name) continue;
      const key = s.name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim() || s.uid;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out.filter((s) => isPlateSubject(s.name));
  }, [hub.subjects]);
  const hubPlaylists = useMemo(
    () => (hub.playlists ?? []).filter((p) => p?.uid),
    [hub.playlists],
  );
  const hubTrending = useMemo(
    () => (hub.trending ?? []).filter((c) => c?.uid),
    [hub.trending],
  );
  const hubCourses = useMemo(
    () => [...(hub.courses ?? []), ...extraCourses].filter((c) => c?.uid),
    [hub.courses, extraCourses],
  );
  const hubLive = hub.live ?? [];
  const subjectNames = useMemo(() => subjects.map((s) => s.name), [subjects]);
  const chips = useMemo(() => {
    const map = new Map<string, string>();
    const add = (name: string) => {
      const t = name.trim();
      if (!t || t.toLowerCase() === "general" || t.toLowerCase() === "course") return;
      const key = t.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
      if (!key) return;
      const prev = map.get(key);
      if (!prev || t.length < prev.length) map.set(key, t);
    };
    for (const s of subjectNames) add(s);
    for (const p of hubPlaylists) if (p.topic) add(p.topic);
    for (const c of hubTrending) if (c.topic) add(c.topic);
    for (const c of hubCourses) if (c.topic) add(c.topic);
    for (const t of teachers) add(teacherSubject(t.topics));
    return ["all", ...map.values()];
  }, [hubPlaylists, hubTrending, hubCourses, subjectNames, teachers]);

  const plates = subjects.length
    ? subjects
    : chips
        .filter((id) => id !== "all")
        .slice(0, compact ? 8 : 16)
        .map((name) => ({ uid: name, name, icon: "" }));

  const activeSubject = subjects.find((s) => s.name === topic);
  const paperForTopic = exam.product === "iconic_pro" && topic !== "all" ? iconicSubjectGoal(topic) : null;
  const subjectQ = useQuery({
    queryKey: ["exam-subject", activeSubject?.uid, paperForTopic],
    enabled: topic !== "all" && (Boolean(paperForTopic) || (Boolean(activeSubject?.uid) && exam.product !== "iconic_pro")),
    queryFn: ({ signal }) =>
      paperForTopic
        ? loadExamCourses({ data: { goalId: paperForTopic, offset: 0 }, signal }).then((p) => ({ courses: p.courses }))
        : loadExamSubjectCourses({ data: { topologyUid: activeSubject!.uid }, signal }),
  });

  const playlists = hubPlaylists.filter((p) => matchesTopic(p.topic, topic));
  const trending = (subjectQ.data?.courses?.length ? subjectQ.data.courses : hubTrending).filter((c) =>
    topic === "all" || Boolean(activeSubject) || matchesTopic(c.topic, topic) || matchesTopic(c.name, topic),
  );
  const paperCourses = paperForTopic && subjectQ.data?.courses?.length ? subjectQ.data.courses : hubCourses;
  const courses = paperCourses.filter((c) => {
    if (topic === "all") return true;
    if (paperForTopic && c.goalUid === paperForTopic) return true;
    return matchesTopic(c.topic, topic) || matchesTopic(c.name, topic) || matchesTopic(c.goalName || "", topic);
  });
  const shownPlaylists = compact ? playlists.slice(0, 4) : playlists;
  const shownCourses = compact ? courses.slice(0, 6) : courses.slice(0, courseCap);
  const shownIds = new Set(shownCourses.map((c) => c.uid));
  const extraTrending = (compact ? trending.slice(0, 6) : trending.slice(0, 12)).filter((c) => !shownIds.has(c.uid));
  const moreCoursesLocal = !compact && courses.length > courseCap;
  const moreCoursesRemote = !compact && Boolean(onLoadMoreCourses);
  const coursesLeft = Math.max(0, (hub.coursesTotal || courses.length) - shownCourses.length);
  const groupedCourses =
    !compact && exam.product === "iconic_pro" && topic === "all"
      ? (() => {
          const map = new Map<string, ExamCourse[]>();
          for (const c of shownCourses) {
            const key = c.goalName || c.topic || "Courses";
            const list = map.get(key) ?? [];
            list.push(c);
            map.set(key, list);
          }
          return [...map.entries()];
        })()
      : [];
  const needle = filter.trim().toLowerCase();
  const shownTeachers = teachers.filter((t) => {
    if (topic !== "all" && !matchesTopic(t.topics, topic) && !matchesTopic(t.bio, topic) && !matchesTopic(teacherSubject(t.topics), topic)) {
      return false;
    }
    if (!needle) return true;
    return (
      t.name.toLowerCase().includes(needle) ||
      t.username.toLowerCase().includes(needle) ||
      String(t.topics ?? "").toLowerCase().includes(needle) ||
      String(t.bio ?? "").toLowerCase().includes(needle)
    );
  });
  const teacherSlice = compact ? shownTeachers.slice(0, 12) : shownTeachers;
  const groupedTeachers = !compact && topic === "all" && !needle ? groupTeachersBySubject(shownTeachers) : [];
  const live = compact ? hubLive.slice(0, 4) : hubLive;
  const showCourseShelf = !onTests && !onPapers && !onPractice && (faced || subjects.length === 0);
  const liveForPlate = (name: string) => hubLive.filter((s) => matchesTopic(s.title, name)).length;

  useEffect(() => {
    const last = readHistory().find((h) => h.teacher);
    const door = hubLive[0] ?? (hub.later ?? [])[0];
    setWallLedger({
      faced,
      examId: exam.id,
      upcomingTitle: door?.title,
      upcomingWhen: door ? (door.status === "live" ? "Live" : fmtWhen(door.liveAt) || "Soon") : undefined,
      upcomingLive: door?.status === "live",
      upcomingClassId: door?.classUid,
      upcomingReplayId: door?.replayId ?? undefined,
      upcomingSlug: door?.classSlug,
      lastTeacherName: last?.teacher,
      lastTeacherSlug: last?.teacher,
    });
    return () => setWallLedger(null);
  }, [faced, exam.id, hubLive, hub.later]);

  const plateChips = (
    <>
      <Chip pressed={!faced} onClick={() => setTopic("all")}>
        Overview
      </Chip>
      {plates.map((s) => (
        <Chip key={s.uid || s.name} pressed={topic === s.name} onClick={() => setTopic(s.name)}>
          {s.name}
        </Chip>
      ))}
      {seriesList.length ? (
        <Chip pressed={onTests} onClick={() => setTopic("tests")}>
          {COPY.tests}
        </Chip>
      ) : null}
      {paperList.length ? (
        <Chip pressed={onPapers} onClick={() => setTopic("papers")}>
          {COPY.papers}
        </Chip>
      ) : null}
      {practiceLines.length || practiceQ.isPending ? (
        <Chip pressed={onPractice} onClick={() => setTopic("practice")}>
          {COPY.practice}
        </Chip>
      ) : null}
    </>
  );

  const title = onTests
    ? openSeries
      ? seriesShortName(openSeries.name)
      : COPY.tests
    : onPapers
      ? COPY.papers
      : onPractice
        ? COPY.practice
        : faced
          ? topic
          : exam.name;
  const caption = onTests
    ? openSeries
      ? seriesCaption(openSeries)
      : testsPlateCaption(seriesList.length)
    : onPapers
      ? papersCaption(struckRows)
      : onPractice
        ? practicePlateCaption(practiceLines.length)
        : faced
          ? countsFor(topic, [...courses, ...trending], liveForPlate(topic), playlists)
          : exam.blurb;

  return (
    <div key={faced ? topic : "wall"} className="[animation:ui-fade-in_var(--dur-base)_var(--ease-out)]">
      <header className={compact ? "pb-3" : "pt-2 pb-4"}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">{exam.group}</p>
          <div className="flex items-center gap-3">
            {daysLine ? <p className="text-xs tabular-nums text-fg-muted">{daysLine}</p> : null}
            {!faced && !compact ? <ShareButton kind="exam" refId={exam.id} label={exam.name} /> : null}
          </div>
        </div>
        {faced ? (
          <Button
            variant="ghost"
            size="sm"
            icon={ArrowLeft}
            className="mt-3 -ml-2"
            onClick={() => {
              if (onTests && seriesUid) setSeriesUid(null);
              else setTopic("all");
            }}
          >
            {onTests && seriesUid ? COPY.tests : exam.name}
          </Button>
        ) : null}
        <h1 className={compact ? "mt-1 font-serif text-xl text-fg [text-wrap:balance] sm:text-2xl" : "mt-1 font-serif text-2xl text-fg [text-wrap:balance] sm:text-3xl"}>
          {title}
        </h1>
        {caption ? <p className="mt-2 max-w-[var(--measure)] text-sm text-fg-muted sm:text-base">{caption}</p> : null}
        {related.length > 1 ? (
          <nav aria-label="Related exams" className="mt-3 flex flex-wrap gap-1.5">
            {related.map((r) => (
              <Link
                key={r.id}
                to="/exam/$goalId"
                params={{ goalId: r.id }}
                aria-current={r.id === exam.id ? "page" : undefined}
                className={`inline-flex h-8 items-center rounded-full px-3 text-sm whitespace-nowrap transition-colors duration-[var(--dur-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  r.id === exam.id ? "bg-fg text-bg" : "bg-surface-raised text-fg-muted hover:text-fg"
                }`}
              >
                {r.name}
              </Link>
            ))}
          </nav>
        ) : null}
        {faced && plates.length ? (
          <div role="group" aria-label="Sections" className="mt-4 flex flex-wrap gap-1.5">
            {plateChips}
          </div>
        ) : null}
      </header>

      {!faced && (live.length || crashDoors.length) ? (
        <Section title={live.length ? COPY.liveAtDoor : COPY.crash} level={2}>
          <DoorRow>
            {live.map((s) => (
              <LiveDoor key={s.classUid} slot={s} />
            ))}
            {crashDoors.map((d) => (
              <CrashDoor key={d.uid} door={d} />
            ))}
          </DoorRow>
        </Section>
      ) : null}

      {!faced && plates.length ? (
        <Section title="Subjects" level={2}>
          <PlateGrid>
            {plates.map((s) => (
              <SubjectPlate
                key={s.uid || s.name}
                name={s.name}
                caption={countsFor(s.name, hubCourses, liveForPlate(s.name), hubPlaylists)}
                selected={topic === s.name}
                onSelect={() => setTopic(s.name)}
              />
            ))}
            {seriesList.length ? (
              <SubjectPlate name={COPY.tests} caption={testsPlateCaption(seriesList.length)} selected={false} onSelect={() => setTopic("tests")} />
            ) : null}
            {paperList.length ? (
              <SubjectPlate name={COPY.papers} caption={papersCaption(struckRows)} selected={false} onSelect={() => setTopic("papers")} />
            ) : null}
            {practiceLines.length || practiceQ.isPending ? (
              <SubjectPlate name={COPY.practice} caption={practicePlateCaption(practiceLines.length)} selected={false} onSelect={() => setTopic("practice")} />
            ) : null}
          </PlateGrid>
        </Section>
      ) : null}

      {showCourseShelf && (shownCourses.length || shownPlaylists.length) ? (
        <Section title={faced ? `Courses in ${topic}` : "Courses"} level={2}>
          {groupedCourses.length > 1 ? (
            <div className="space-y-6">
              {groupedCourses.map(([paper, list]) => (
                <div key={paper}>
                  <h3 className="mb-2 text-base font-semibold text-fg">{paper}</h3>
                  <IndexShelf label={paper}>
                    {list.map((c) => (
                      <CourseIndex key={c.uid} c={c} inPlan={planned.has(c.uid)} />
                    ))}
                  </IndexShelf>
                </div>
              ))}
            </div>
          ) : (
            <IndexShelf label="Courses">
              {shownCourses.map((c) => (
                <CourseIndex key={c.uid} c={c} inPlan={planned.has(c.uid)} />
              ))}
              {shownPlaylists.map((p) => (
                <PlaylistIndex key={p.uid} p={p} />
              ))}
            </IndexShelf>
          )}
          {!compact && (moreCoursesLocal || moreCoursesRemote) ? (
            <InfiniteTrigger
              auto={false}
              onVisible={() => {
                setCourseCap((n) => n + 12);
                if (!moreCoursesLocal) onLoadMoreCourses?.();
              }}
              disabled={loadingCourses && !moreCoursesLocal}
              label={coursesLeft > 0 && coursesLeft < 80 ? `Show more courses · ${coursesLeft} left` : "Show more courses"}
            />
          ) : null}
        </Section>
      ) : null}

      {showCourseShelf && extraTrending.length ? (
        <Section title={activeSubject ? `More in ${activeSubject.name}` : "Opening now"} level={2}>
          <IndexShelf label={activeSubject ? activeSubject.name : "Opening now"}>
            {extraTrending.map((c) => (
              <CourseIndex key={c.uid} c={c} inPlan={planned.has(c.uid)} />
            ))}
          </IndexShelf>
        </Section>
      ) : null}

      {onTests ? (
        <Section title={openSeries ? seriesShortName(openSeries.name) : COPY.tests} level={2}>
          {openSeries ? (
            <>
              {itemsQ.isPending ? (
                <ShelfSkeleton label="Fetching tests" />
              ) : (
                <IndexShelf label={seriesShortName(openSeries.name)}>
                  {(itemsQ.data?.items ?? []).map((item, i) => (
                    <ListRow
                      key={item.uid}
                      leading={<Ordinal n={item.rank || i + 1} />}
                      title={item.title}
                      meta={
                        <>
                          <span>{quizCaption(item)}</span>
                          {item.startAt ? <span>{fmtWhen(item.startAt, true)}</span> : null}
                        </>
                      }
                      trailing={
                        <AddTestToPlan
                          title={item.title}
                          minutes={minutesFromSec(item.durationSec)}
                          date={sittingDate(item.startAt, todayKey())}
                        />
                      }
                    />
                  ))}
                </IndexShelf>
              )}
              {itemsQ.isError ? (
                <p role="alert" className="mt-3 text-sm text-fg-muted">
                  {COPY.shelfDidNotLoad}
                </p>
              ) : null}
            </>
          ) : (
            <IndexShelf label={COPY.tests}>
              {seriesList.map((s, i) => (
                <ListRow
                  key={s.uid}
                  leading={<Ordinal n={i + 1} />}
                  title={
                    <button type="button" onClick={() => setSeriesUid(s.uid)} className="text-left font-medium text-fg after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-0 focus-visible:after:outline-ring">
                      {seriesShortName(s.name)}
                    </button>
                  }
                  meta={
                    <>
                      <span>{seriesCaption(s)}</span>
                      {s.nextTitle ? <span>Next · {s.nextTitle}</span> : null}
                    </>
                  }
                  badge={<Badge tone="info">{COPY.tests}</Badge>}
                  onActivate={() => setSeriesUid(s.uid)}
                />
              ))}
            </IndexShelf>
          )}
        </Section>
      ) : null}

      {onPapers ? (
        <Section title={COPY.papers} description={papersCaption(struckRows)} level={2}>
          <IndexShelf label={COPY.papers}>
            {struckRows.map((p, i) => (
              <ListRow
                key={p.id}
                leading={<Ordinal n={i + 1} />}
                title={p.name}
                struck={p.struck}
                meta={<span>{p.struck ? p.hit : "Not covered yet"}</span>}
                badge={p.struck ? <Badge tone="ok">Covered</Badge> : null}
              />
            ))}
          </IndexShelf>
        </Section>
      ) : null}

      {onPractice ? (
        <Section title={COPY.practice} level={2}>
          {practiceQ.isPending ? (
            <ShelfSkeleton label="Fetching practice" />
          ) : practiceLines.length ? (
            <IndexShelf label={COPY.practice}>
              {practiceLines.map((line, i) => (
                <ListRow
                  key={line.uid}
                  leading={<Ordinal n={i + 1} />}
                  title={line.title}
                  meta={<span>{practiceCaption(line)}</span>}
                  trailing={<AddPracticeToPlan title={line.title} questions={line.questions} />}
                />
              ))}
            </IndexShelf>
          ) : (
            <EmptyState icon={ListChecks} title="No practice sets yet" body="Check back after the next catalog refresh." />
          )}
          {practiceQ.isError ? (
            <p role="alert" className="mt-3 text-sm text-fg-muted">
              {COPY.shelfDidNotLoad}
            </p>
          ) : null}
        </Section>
      ) : null}

      {!onTests && !onPapers && !onPractice ? (
        <Section
          title={faced ? `Teachers for ${topic}` : COPY.stamps}
          level={2}
          action={
            !compact ? (
              <SearchInput
                label={COPY.writeATeacher}
                placeholder={COPY.writeATeacher}
                value={filter}
                onChange={setFilter}
                onClear={() => setFilter("")}
                resultCount={needle ? shownTeachers.length : null}
                className="w-48 sm:w-60"
              />
            ) : null
          }
        >
          {groupedTeachers.length > 1 ? (
            <div className="space-y-6">
              {groupedTeachers.map(([subject, list]) => (
                <div key={subject}>
                  <h3 className="mb-2 text-base font-semibold text-fg">{subject}</h3>
                  <StampRack>
                    {list.map((t) => (
                      <TeacherStamp key={t.uid || t.username} t={t} />
                    ))}
                  </StampRack>
                </div>
              ))}
            </div>
          ) : teacherSlice.length ? (
            <StampRack>
              {teacherSlice.map((t) => (
                <TeacherStamp key={t.uid || t.username} t={t} />
              ))}
            </StampRack>
          ) : (
            <EmptyState
              icon={GraduationCap}
              title={needle || faced ? COPY.noStampsMatch : COPY.rackEmpty}
              action={
                needle || faced ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setFilter("");
                      setTopic("all");
                    }}
                  >
                    {needle ? "Clear search" : "Show all teachers"}
                  </Button>
                ) : undefined
              }
            />
          )}
          {compact && hub.total > teacherSlice.length ? (
            <div className="mt-3">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/exam/$goalId" params={{ goalId: exam.id }}>
                  {COPY.restOfTheRack}
                </Link>
              </Button>
            </div>
          ) : null}
          {!compact && onLoadMore ? (
            <InfiniteTrigger auto={false} onVisible={onLoadMore} disabled={loadingMore} label={COPY.restOfTheRack} />
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}

export function ExamPickerGrid({ current }: { current?: Exam | null }) {
  return (
    <div className="space-y-8">
      {examsByGroup().map(({ group, families }) => (
        <section key={group} aria-labelledby={`exam-group-${group.replace(/\W+/g, "-")}`}>
          <h2 id={`exam-group-${group.replace(/\W+/g, "-")}`} className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">
            {group}
          </h2>
          <div className="mt-3 space-y-4">
            {families.map((fam) => (
              <div key={`${group}-${fam.label || fam.exams[0]?.id}`}>
                {fam.label && fam.exams.length > 1 ? <p className="mb-1 text-xs text-fg-faint">{fam.label}</p> : null}
                <ul className="m-0 grid list-none gap-0.5 p-0">
                  {fam.exams.map((e) => (
                    <li key={e.id}>
                      <Link
                        to="/exam/$goalId"
                        params={{ goalId: e.id }}
                        aria-current={e.id === current?.id ? "page" : undefined}
                        className={`flex min-h-11 items-center justify-between gap-4 rounded-md px-3 py-2 transition-colors duration-[var(--dur-fast)] hover:bg-surface-raised/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                          e.id === current?.id ? "bg-accent-subtle text-fg" : "text-fg"
                        }`}
                      >
                        <span className="font-medium">{e.name}</span>
                        {e.id === current?.id ? <Badge tone="accent">Current</Badge> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

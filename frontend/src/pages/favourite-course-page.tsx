import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { getCourse, getTeacher, lessonsForCourse } from "@inkboard/shared/catalog";
import {
  chapterIsComplete,
  combinedScore,
  continuePick,
  emptyChecks,
  finishedPlace,
  lectureScore,
  readAllChecks,
  readFavourites,
  readPlaces,
  removeFavourite,
  setChapterDone,
  subscribeFavourites,
  type LectureChecks,
} from "@inkboard/shared/favourites";
import { MarkDoneButton } from "@/components/mark-done";
import { Fetching } from "@/components/fetching";
import { parseClock } from "@inkboard/shared/shelf";
import { courseQueryOptions } from "@/lib/unacademy";

type Row = {
  id: string;
  title: string;
  duration: number;
  playable: boolean;
  week: number | null;
};

function clock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function pct(rows: LectureChecks[]) {
  if (!rows.length) return 0;
  return Math.round(combinedScore(rows) * 100);
}

export default function FavouriteCoursePage() {
  const { courseId } = useParams({ from: "/favourites/$courseId" });
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeFavourites(() => setTick((n) => n + 1)), []);
  void tick;

  const saved = readFavourites().find((c) => c.courseId === courseId);
  const catalog = getCourse(courseId);
  const liveId = /^[A-Za-z0-9]{4,16}$/.test(courseId) && !catalog;
  const live = useQuery({
    ...courseQueryOptions(courseId, saved?.slug, saved?.teacher),
    enabled: liveId,
  });

  const rows: Row[] = useMemo(() => {
    if (catalog) {
      return lessonsForCourse(courseId).map((lesson) => ({
        id: lesson.lessonId || lesson.id,
        title: lesson.title,
        duration: parseClock(lesson.duration),
        playable: Boolean(lesson.lessonId) && !lesson.live,
        week: null,
      }));
    }
    return (live.data?.lessons ?? []).map((lesson) => ({
      id: lesson.replayId || lesson.uid,
      title: lesson.title,
      duration: lesson.durationSec,
      playable: Boolean(lesson.playable && lesson.replayId),
      week: lesson.week,
    }));
  }, [catalog, courseId, live.data]);

  const checks = readAllChecks();
  const places = readPlaces();
  const title = saved?.title || live.data?.course.name || catalog?.title || "Saved course";
  const teacherName = saved?.teacherName || live.data?.course.authorName || (catalog ? getTeacher(catalog.teacherSlug)?.name : "") || "";
  const teacher = saved?.teacher || live.data?.course.authorUsername || catalog?.teacherSlug || "";
  const pick = continuePick(rows, places);
  const groups = groupRows(rows);
  const doneKeys = new Set(saved?.chaptersDone ?? []);

  const completed = groups.filter((group) =>
    chapterIsComplete(
      doneKeys.has(group.key),
      group.rows.filter((row) => row.playable).map((row) => row.id),
      checks,
    ),
  );

  return (
    <AppShell>
      <div className="board-pad pb-16">
        <Link to="/favourites" className="ink-underline text-sm text-fg-muted">
          ← Saved courses
        </Link>
        <h1 className="mt-4 text-2xl font-medium">{title}</h1>
        <p className="mt-2 text-sm text-fg-muted">
          {teacherName || (teacher ? `@${teacher}` : "Course")}
          {rows.length ? ` · ${rows.length} classes` : ""}
          {rows.some((row) => lectureScore(checks[row.id] ?? emptyChecks()) > 0)
            ? ` · ${pct(rows.map((row) => checks[row.id] ?? emptyChecks()))}% done`
            : " · nothing marked yet"}
        </p>
        <p className="mt-2 max-w-[68ch] text-xs text-fg-muted">
          Open a class and mark what you finished: notes, questions, the teacher’s questions, and a revision. Each one is a quarter of that class. This percent is the average.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {pick ? (
            <Link
              to="/play/$lessonId"
              params={{ lessonId: pick.lessonId }}
              search={{
                title: pick.title,
                teacher,
                course: courseId,
                t: pick.t > 8 && !pick.finished ? pick.t : undefined,
              }}
              className="text-sm text-accent"
            >
              {pick.finished ? "Watch again" : "Continue"}
              {pick.finished ? "" : ` · ${pick.title}`}
              {pick.t > 8 && !pick.finished ? ` · ${clock(pick.t)}` : ""}
            </Link>
          ) : null}
          <Link to="/course/$courseId" params={{ courseId }} search={{ slug: saved?.slug, teacher: teacher || undefined }} className="ink-underline text-sm text-fg-muted">
            Course page
          </Link>
          <button type="button" className="ink-underline text-xs text-fg-muted" onClick={() => removeFavourite(courseId)}>
            Remove
          </button>
        </div>

        {live.isLoading ? <Fetching label="Fetching classes" compact /> : null}
        {live.isError ? <p className="mt-8 text-sm text-fg-muted">The class list did not load. Open the course page and try again.</p> : null}

        <section className="mt-10">
          <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">COMPLETED CHAPTERS</p>
          {completed.length === 0 ? (
            <p className="mt-2 text-sm text-fg-muted">None yet. Mark every class in a chapter, or mark the chapter done.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {completed.map((group) => (
                <li key={group.key} className="flex items-baseline justify-between gap-3 py-3 text-sm">
                  <span>{group.label}</span>
                  <span className="text-xs text-fg-muted">{pct(group.rows.map((row) => checks[row.id] ?? emptyChecks()))}%</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-10 space-y-10">
          {groups.map((group) => {
            const ids = group.rows.filter((row) => row.playable).map((row) => row.id);
            const manual = doneKeys.has(group.key);
            const complete = chapterIsComplete(manual, ids, checks);
            return (
              <section key={group.key}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">
                    {group.label.toUpperCase()} · {pct(group.rows.map((row) => checks[row.id] ?? emptyChecks()))}%
                    {complete ? " · DONE" : ""}
                  </p>
                  {saved ? (
                    <button type="button" className="ink-underline text-xs text-fg-muted" onClick={() => setChapterDone(courseId, group.key, !manual)}>
                      {manual ? "Chapter marked done" : "Mark chapter done"}
                    </button>
                  ) : null}
                </div>
                <ul className="divide-y divide-line border-y border-line">
                  {group.rows.map((row) => (
                    <LectureRow key={row.id} row={row} courseId={courseId} teacher={teacher} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

function groupRows(rows: Row[]) {
  if (!rows.some((row) => row.week != null)) return [{ key: "all", label: "Classes", rows }];
  const map = new Map<number, Row[]>();
  const rest: Row[] = [];
  for (const row of rows) {
    if (row.week == null) rest.push(row);
    else {
      const list = map.get(row.week) ?? [];
      list.push(row);
      map.set(row.week, list);
    }
  }
  const groups = [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, list]) => ({ key: `week-${week}`, label: `Week ${week}`, rows: list }));
  if (rest.length) groups.push({ key: "rest", label: "Other classes", rows: rest });
  return groups;
}

function LectureRow({ row, courseId, teacher }: { row: Row; courseId: string; teacher: string }) {
  const place = readPlaces().find((p) => p.lessonId === row.id);
  const stopped = place && place.t > 8 ? clock(place.t) : "";
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {row.playable ? (
          <Link
            to="/play/$lessonId"
            params={{ lessonId: row.id }}
            search={{ title: row.title, teacher, course: courseId, t: place && place.t > 8 && !finishedPlace(place) ? place.t : undefined }}
            className="min-w-0 text-sm"
          >
            {row.title}
          </Link>
        ) : (
          <span className="min-w-0 text-sm text-fg-muted">{row.title}</span>
        )}
        <span className="text-xs text-fg-muted">
          {stopped ? `Stopped ${stopped}` : "Not started"}
          {row.duration ? ` · ${clock(row.duration)}` : ""}
        </span>
      </div>
      <div className="mt-2">
        <MarkDoneButton lessonId={row.id} title={row.title} />
      </div>
    </li>
  );
}

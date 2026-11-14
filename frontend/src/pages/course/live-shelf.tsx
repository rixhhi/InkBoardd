import { Link, useNavigate, } from "@tanstack/react-router";
import { Link2, Play } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Chip,
  Dot,
  EmptyState,
  List,
  ListRow,
  PageBody,
  MetaLine,
  PageHeader,
  Progress,
  Ring,
  SearchInput,
  Section,
  Toast,
  Toolbar,
} from "@/components/ui";


import { useState } from "react";

import { AppShell } from "@/components/app-shell";

import { LessonResources } from "@/components/lesson-resources";


import { NotesLocker } from "@/components/notes-locker";


import { LaterButton } from "@/components/watch-later";


import { COPY } from "@inkboard/shared/copy";


import {
  fmtDur,
  lessonStatusCaption,
  similarCaption,
  type lineState,
  shelfCoverageCopy,
} from "@inkboard/shared/shelf";

import type { UaLesson } from "@/lib/unacademy";

import { SaveChapterButton, SaveClassButton, SaveCourseButton } from "@/components/save-chapter";
import { FavouriteCourseButton } from "@/components/favourite-course";
import { ShareButton } from "@/components/admin/share-dialog";
import { useAccess, useCatalogRoot } from "@/lib/session";
import { Brief, useShelfLedger, } from "@/components/folio/shelf";

import { peekProgress } from "@inkboard/shared/watch-history";


import { fmtWhen, } from "./helpers";

export function LiveShelf({
  courseName,
  topic,
  teacher,
  teacherName,
  courseId,
  total,
  liveCount,
  upcomingCount,
  unavailableCount = 0,
  footnote,
  description,
  stillLoading,
  restError,
  retryRest,
  lessons,
  notesCount,
  notesGuessed,
  nextTitle,
  slug,
  q,
  setQ,
  groups,
  filtered,
  states,
  nextIdx,
  prefetch,
}: {
  courseName: string;
  topic: string;
  teacher?: string;
  teacherName?: string;
  courseId: string;
  total: number;
  liveCount: number;
  upcomingCount: number;
  /** Ended classes with no replay. */
  unavailableCount?: number;
  footnote: string;
  description?: string;
  stillLoading: boolean;
  restError?: string;
  retryRest?: () => void;
  lessons: UaLesson[];
  notesCount: number;
  notesGuessed?: number;
  nextTitle?: string;
  slug?: string;
  q: string;
  setQ: (v: string) => void;
  groups: { week: number | null; lessons: UaLesson[] }[];
  filtered: UaLesson[];
  states: ReturnType<typeof lineState>[];
  nextIdx: number;
  prefetch: (id: string, archived: boolean) => void;
}) {
  const root = useCatalogRoot();
  const access = useAccess();
  const nav = useNavigate();
  const [filter, setFilter] = useState<"all" | "unwatched" | "replays" | "notes">("all");
  const struck = states.filter((s) => s === "struck").length;
  useShelfLedger({
    kicker: "Course",
    title: courseName,
    meta: `${total} classes`,
    teacher,
    course: courseId,
    next: nextTitle,
    notes: notesCount || undefined,
    notesGuessed: notesGuessed || undefined,
    coverage: shelfCoverageCopy(struck, Math.max(filtered.length, 1)),
  });

  const nextLesson = nextIdx >= 0 ? filtered[nextIdx] : undefined;
  const overallPct = filtered.length ? Math.round((struck / filtered.length) * 100) : 0;
  const totalSec = lessons.reduce((n, l) => n + (l.durationSec || 0), 0);

  const keep = (lesson: UaLesson, state: ReturnType<typeof lineState>) => {
    if (filter === "unwatched") return state !== "struck";
    if (filter === "replays") return Boolean(lesson.replayId) && lesson.status !== "archived";
    if (filter === "notes") return Boolean(lesson.notesUrl);
    return true;
  };

  let running = 0;
  let shownTotal = 0;

  return (
    <AppShell>
      <PageHeader
        crumbs={[
          { label: root.label, to: root.to },
          ...(teacher ? [{ label: teacherName || teacher, to: "/teacher/$slug", params: { slug: teacher } }] : []),
          { label: courseName },
        ]}
        eyebrow={topic}
        title={courseName}
        subline={
          <>
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
              <span>{total} classes</span>
              {totalSec ? (
                <>
                  <Dot />
                  <span>{fmtDur(totalSec)}</span>
                </>
              ) : null}
              {liveCount ? (
                <>
                  <Dot />
                  <Badge tone="live">{liveCount} live</Badge>
                </>
              ) : null}
              {upcomingCount ? (
                <>
                  <Dot />
                  <span>{upcomingCount} upcoming</span>
                </>
              ) : null}
              {unavailableCount ? (
                <>
                  <Dot />
                  <span className="text-warn" title="These classes ended without a replay being published.">
                    {unavailableCount === total ? "No replays yet" : `${unavailableCount} without replay`}
                  </span>
                </>
              ) : null}
            </p>
            {footnote ? <p className="mt-1 text-xs text-fg-faint">{footnote}</p> : null}
            {description ? <Brief text={description} /> : null}
            {filtered.length ? (
              <div className="mt-3 flex items-center gap-3">
                <Progress value={overallPct} label={`${struck} of ${filtered.length} classes watched`} className="max-w-xs" />
                <span className="font-mono text-xs text-fg-muted tabular-nums">{overallPct}%</span>
              </div>
            ) : null}
          </>
        }
        actions={
          <>
            <ShareButton kind="course" refId={courseId} label={courseName} />
            <FavouriteCourseButton courseId={courseId} title={courseName} teacher={teacher} teacherName={teacherName} slug={slug} />
            {access.perms.downloads ? <SaveCourseButton courseId={courseId} courseTitle={courseName} groups={groups} /> : null}
            <NotesLocker lessons={lessons} courseName={courseName} />
          </>
        }
      />

      {nextLesson?.replayId ? (
        <div className="page-pad mb-2">
          <Card padded className="flex flex-wrap items-center gap-4 bg-accent-subtle">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">{states[nextIdx] === "resume" ? "Continue" : "Up next"}</p>
              <p className="mt-0.5 truncate font-medium text-fg">{nextLesson.title}</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                {[lessonStatusCaption(nextLesson.status, nextLesson.durationSec), nextLesson.durationSec ? fmtDur(nextLesson.durationSec) : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Button icon={Play} asChild>
              <Link
                to="/play/$lessonId"
                params={{ lessonId: nextLesson.replayId }}
                search={{ title: nextLesson.title, teacher: teacher || "", course: courseId, slug }}
                onMouseEnter={() => prefetch(nextLesson.replayId!, nextLesson.status === "archived")}
              >
                {states[nextIdx] === "resume" ? "Resume" : "Play"}
              </Link>
            </Button>
          </Card>
        </div>
      ) : null}

      <Toolbar trailing={<SearchInput label="Find a class" placeholder="Find a class" value={q} onChange={setQ} className="w-52" resultCount={q.trim() ? filtered.length : null} />}>
        <fieldset aria-label="Show" className="flex items-center gap-1">
          {(
            [
              ["all", "All"],
              ["unwatched", "Unwatched"],
              ["replays", "Replays"],
              ["notes", "Has notes"],
            ] as const
          ).map(([id, label]) => (
            <Chip key={id} pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </Chip>
          ))}
        </fieldset>
      </Toolbar>

      <PageBody>
        {stillLoading ? (
          <p className="mb-3 flex items-center gap-2 text-xs text-fg-muted" role="status">
            <span aria-hidden="true" className="size-3 rounded-full border-2 border-fg-faint border-t-fg [animation:ui-spin_0.8s_linear_infinite]" />
            Fetching the rest of the classes
          </p>
        ) : null}
        {restError ? (
          <div className="mb-3">
            <Toast
              tone="warn"
              title={restError}
              body={
                <button type="button" className="font-medium text-fg hover:underline" onClick={retryRest}>
                  {COPY.tryAgain}
                </button>
              }
            />
          </div>
        ) : null}

        <div className="space-y-8">
          {groups.map((group) => {
            const rows = group.lessons.map((lesson) => {
              const idx = running;
              running += 1;
              return { lesson, idx, state: states[idx] ?? "unwatched" };
            });
            const shown = rows.filter((r) => keep(r.lesson, r.state));
            shownTotal += shown.length;
            if (!shown.length) return null;
            return (
              <Section
                key={group.week ?? "all"}
                level={2}
                title={group.week != null ? `Week ${group.week}` : "Classes"}
                action={
                  <SaveChapterButton
                    courseId={courseId}
                    courseTitle={courseName}
                    chapterId={group.week != null ? `${courseId}-week-${group.week}` : `${courseId}-all`}
                    chapterTitle={group.week != null ? `Week ${group.week}` : courseName}
                    lessons={group.lessons}
                  />
                }
              >
                <List label={group.week != null ? `Week ${group.week} classes` : "Classes"}>
                  {shown.map(({ lesson, idx, state }) => {
                    const struckLine = state === "struck";
                    const next = idx === nextIdx;
                    const watched = lesson.replayId ? peekProgress(lesson.replayId) : 0;
                    const pct = lesson.durationSec ? Math.min(100, Math.round((watched / lesson.durationSec) * 100)) : 0;
                    const playable = Boolean(lesson.replayId) && (lesson.playable || lesson.status === "live");
                    const liveNow = lesson.status === "live";
                    const replayId = lesson.replayId;
                    const badge = liveNow ? (
                      <Badge tone="live">Live</Badge>
                    ) : lesson.status === "upcoming" ? (
                      <Badge tone="info">Upcoming</Badge>
                    ) : lesson.status === "archived" ? (
                      <Badge tone="warn">Archived</Badge>
                    ) : !replayId ? (
                      <Badge>Unavailable</Badge>
                    ) : struckLine ? (
                      <Badge tone="ok">Done</Badge>
                    ) : state === "resume" ? (
                      <Badge tone="accent">Resume</Badge>
                    ) : undefined;
                    const open =
                      replayId && playable
                        ? () =>
                            void nav({
                              to: "/play/$lessonId",
                              params: { lessonId: replayId },
                              search: { title: lesson.title, teacher: teacher || "", course: courseId, slug },
                            })
                        : undefined;
                    return (
                      <ListRow
                        key={lesson.uid}
                        current={next}
                        struck={!playable && !liveNow}
                        leading={
                          playable && pct > 0 ? (
                            <Ring value={struckLine ? 100 : pct} label={`${pct}% watched`} />
                          ) : (
                            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-raised font-mono text-xs text-fg-muted tabular-nums">
                              {lesson.rank || idx + 1}
                            </span>
                          )
                        }
                        title={
                          replayId && playable ? (
                            <Link
                              to="/play/$lessonId"
                              params={{ lessonId: replayId }}
                              search={{ title: lesson.title, teacher: teacher || "", course: courseId, slug }}
                              onMouseEnter={() => prefetch(replayId, lesson.status === "archived")}
                              className="hover:underline focus-visible:outline-none"
                            >
                              {lesson.title}
                            </Link>
                          ) : (
                            <span>{lesson.title}</span>
                          )
                        }
                        badge={badge}
                        meta={
                          <MetaLine
                            parts={[
                              !struckLine ? lessonStatusCaption(lesson.status, lesson.durationSec) : "",
                              lesson.playable && lesson.durationSec ? fmtDur(lesson.durationSec) : "",
                              lesson.liveAt ? fmtWhen(lesson.liveAt) : "",
                              lesson.notesUrl ? "Notes" : "",
                            ]}
                          />
                        }
                        trailing={
                          <>
                            {replayId ? <SaveClassButton lessonId={replayId} title={lesson.title} variant="line" /> : null}
                            {!replayId && lesson.similar?.replayId ? <SimilarLecture similar={lesson.similar} teacher={teacher} /> : null}
                            {replayId ? <LaterButton lessonId={replayId} title={lesson.title} teacher={teacher} course={courseId} /> : null}
                            <LessonResources lesson={lesson} />
                          </>
                        }
                        onActivate={open}
                      />
                    );
                  })}
                </List>
              </Section>
            );
          })}
        </div>
        {filtered.length === 0 || shownTotal === 0 ? (
          <EmptyState
            title={lessons.length === 0 ? "No classes on this course yet" : "No classes match that"}
            body={lessons.length === 0 ? "This course has no timetable yet." : "Clear the filter or search."}
            action={
              q || filter !== "all" ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQ("");
                    setFilter("all");
                  }}
                >
                  Clear
                </Button>
              ) : undefined
            }
          />
        ) : null}
      </PageBody>
    </AppShell>
  );
}

/** A same-titled lecture in another course. It opens in the player only; it is never saved or counted with this course. */
function SimilarLecture({ similar, teacher }: { similar: NonNullable<UaLesson["similar"]>; teacher?: string }) {
  const label = similarCaption(similar.courseName);
  return (
    <Link
      to="/play/$lessonId"
      params={{ lessonId: similar.replayId }}
      search={{ title: similar.title, teacher: teacher || "", fromCourse: similar.courseName || undefined, similar: 1 }}
      onClick={(e) => e.stopPropagation()}
      title={`${label}: \u201c${similar.title}\u201d. Plays only \u2014 not saved or downloaded with this course.`}
      className="inline-flex max-w-[16rem] items-center gap-1 truncate rounded-md px-2 py-1 text-xs text-fg-muted hover:bg-surface-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Link2 aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

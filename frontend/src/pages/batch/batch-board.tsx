import { Link, } from "@tanstack/react-router";
import { ShareButton } from "@/components/admin/share-dialog";
import { CalendarDays, ChevronLeft, ChevronRight, List as ListIcon, Radio } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  Button,
  Card,
  Chip,
  Dot,
  EmptyState,
  List,
  PageBody,
  PageHeader,
  SearchInput,
  Section,
  Toolbar,
} from "@/components/ui";
import { Brief, useShelfLedger } from "@/components/folio/shelf";
import { Fetching } from "@/components/fetching";
import { cn } from "@/lib/cn";
import { coverageRatio, lineState, nextOpenIndex } from "@inkboard/shared/shelf";
import type { BatchSession } from "@/lib/unacademy";
import { peekProgress } from "@inkboard/shared/watch-history";
import { readWatchLogs } from "@inkboard/shared/planner/watch-store";
import { COPY } from "@inkboard/shared/copy";
import { useCatalogRoot } from "@/lib/session";

import { type ViewMode, type Range, startOfDay, startOfWeek, addDays, } from "./helpers";
import { SessionRow, WeekCard } from "./session-rows";

export function BatchBoard({
  batchId,
  batch,
  teacher,
  live,
  upcoming,
  past,
  filtered,
  view,
  setView,
  range,
  setRange,
  setWeekStart,
  weekStart,
  weekLabel,
  isThisWeek,
  weekDays,
  authors,
  teacherFilter,
  setTeacherFilter,
  classQ,
  setClassQ,
  pastRank,
  loadingPast,
  pastError,
  loadOlder,
  sessionsCount,
}: {
  batchId: string;
  batch: { name: string; goalName: string; syllabusTag?: string; description?: string; lessonsCount: number; liveClasses: number; authors: { username: string; name: string }[] };
  teacher?: string;
  live: BatchSession[];
  upcoming: BatchSession[];
  past: BatchSession[];
  filtered: BatchSession[];
  view: ViewMode;
  setView: (v: ViewMode) => void;
  range: Range;
  setRange: (v: Range) => void;
  setWeekStart: (fn: (d: Date) => Date) => void;
  weekStart: Date;
  weekLabel: string;
  isThisWeek: boolean;
  weekDays: { day: Date; key: string; list: BatchSession[] }[];
  authors: { username: string; name: string }[];
  teacherFilter: string;
  setTeacherFilter: (v: string) => void;
  classQ: string;
  setClassQ: (v: string) => void;
  pastRank: number | null;
  loadingPast: boolean;
  pastError: string | null;
  loadOlder: () => void;
  sessionsCount: number;
}) {
  const root = useCatalogRoot();
  const logs = typeof window === "undefined" ? [] : readWatchLogs();
  const listed = [...live, ...upcoming, ...past];
  const progress = listed.map((s) => (s.replayId ? peekProgress(s.replayId) : 0));
  const states = listed.map((s, i) =>
    lineState({
      watchedSec: progress[i] ?? 0,
      durationSec: s.durationSec,
      coverage: s.replayId ? coverageRatio(logs, s.replayId, s.durationSec) : 0,
    }),
  );
  const nextIdx = nextOpenIndex(states);
  const nextTitle = nextIdx >= 0 ? listed[nextIdx]?.title : undefined;
  const nextSession = nextIdx >= 0 ? listed[nextIdx] : undefined;
  const countLine = batch.lessonsCount ? `${batch.lessonsCount} classes` : `${sessionsCount} on the timetable`;
  useShelfLedger({
    kicker: "Batch",
    title: batch.name,
    meta: countLine,
    teacher,
    next: nextTitle,
  });

  function lineOf(s: BatchSession, fallback: number) {
    const i = listed.findIndex((x) => x.uid === s.uid);
    const watched = i >= 0 ? (progress[i] ?? 0) : 0;
    const pct = s.durationSec > 0 ? Math.min(100, Math.round((watched / s.durationSec) * 100)) : 0;
    return (
      <SessionRow
        key={s.uid}
        s={s}
        teacher={teacher}
        n={s.rank || fallback}
        struck={i >= 0 && states[i] === "struck"}
        next={i === nextIdx}
        pct={pct}
      />
    );
  }

  const olderControl =
    pastRank != null ? (
      loadingPast ? (
        <Fetching label="Fetching older classes" compact />
      ) : (
        <Button variant="ghost" size="sm" onClick={() => void loadOlder()}>
          Older classes
        </Button>
      )
    ) : null;

  return (
    <AppShell>
      <PageHeader
        crumbs={[
          { label: root.label, to: root.to },
          ...(teacher ? [{ label: batch.authors[0]?.name || "Teacher", to: "/teacher/$slug", params: { slug: teacher }, search: { tab: "batches" } }] : []),
          { label: batch.name },
        ]}
        eyebrow={`${batch.goalName || "Batch"}${batch.syllabusTag ? ` · ${batch.syllabusTag}` : ""}`}
        title={batch.name}
        subline={
          <>
            <span className="flex flex-wrap items-center gap-x-2">
              <span>{countLine}</span>
              {batch.liveClasses ? (
                <>
                  <Dot />
                  <span>{batch.liveClasses} live planned</span>
                </>
              ) : null}
              {batch.authors.length ? (
                <>
                  <Dot />
                  <span>{batch.authors.map((a) => a.name).join(", ")}</span>
                </>
              ) : null}
            </span>
            {batch.description ? <Brief text={batch.description} /> : null}
          </>
        }
        actions={
          <>
          <ShareButton kind="batch" refId={batchId} label={batch.name} />
          {nextSession?.replayId ? (
            <Button icon={Radio} asChild>
              <Link
                to="/play/$lessonId"
                params={{ lessonId: nextSession.replayId }}
                search={{ title: nextSession.title, teacher: nextSession.authorUsername || teacher, course: nextSession.courseUid }}
              >
                {COPY.onTheBoard}
              </Link>
            </Button>
          ) : null}
          </>
        }
      />

      <Toolbar trailing={<SearchInput label="Find a class" placeholder="Find a class" value={classQ} onChange={setClassQ} className="w-52" resultCount={classQ.trim() ? filtered.length : null} />}>
        <div role="group" aria-label="View" className="flex items-center gap-1">
          <Chip pressed={view === "list"} onClick={() => setView("list")}>
            <ListIcon aria-hidden="true" className="size-3.5" />
            List
          </Chip>
          <Chip pressed={view === "week"} onClick={() => setView("week")}>
            <CalendarDays aria-hidden="true" className="size-3.5" />
            Week
          </Chip>
        </div>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
        <div role="group" aria-label="When" className="flex items-center gap-1">
          {(
            [
              ["all", "All"],
              ["today", "Today"],
              ["week", "This week"],
            ] as const
          ).map(([id, label]) => (
            <Chip
              key={id}
              pressed={range === id}
              onClick={() => {
                setRange(id);
                if (id === "week" || id === "today") setWeekStart(() => startOfWeek(new Date()));
              }}
            >
              {label}
            </Chip>
          ))}
        </div>
        {authors.length > 1 ? (
          <>
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
            <div role="group" aria-label="Teacher" className="flex items-center gap-1">
              <Chip pressed={teacherFilter === "all"} onClick={() => setTeacherFilter("all")}>
                All teachers
              </Chip>
              {authors.map((a) => (
                <Chip key={a.username} pressed={teacherFilter === a.username} onClick={() => setTeacherFilter(a.username)}>
                  {a.name}
                </Chip>
              ))}
            </div>
          </>
        ) : null}
      </Toolbar>

      <PageBody>
        {view === "week" ? (
          <Section
            title={weekLabel}
            description={isThisWeek ? "This week" : "Timetable"}
            action={
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" icon={ChevronLeft} aria-label="Previous week" onClick={() => setWeekStart((d) => addDays(d, -7))} />
                {!isThisWeek ? (
                  <Button variant="ghost" size="sm" onClick={() => setWeekStart(() => startOfWeek(new Date()))}>
                    Today
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" icon={ChevronRight} aria-label="Next week" onClick={() => setWeekStart((d) => addDays(d, 7))} />
              </div>
            }
          >
            <div className="grid gap-2 md:grid-cols-7">
              {weekDays.map(({ day, key, list }) => {
                const today = startOfDay(new Date()).getTime() === startOfDay(day).getTime();
                return (
                  <Card key={key} padded={false} interactive={false} className={cn("min-h-36 p-2", today && "shadow-[0_0_0_2px_var(--color-accent)]")}>
                    <p className={cn("px-2 pt-1 text-xs font-semibold", today ? "text-accent" : "text-fg-muted")}>
                      {day.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })}
                    </p>
                    <div className="mt-1 grid gap-0.5">
                      {list.length ? list.map((s) => <WeekCard key={s.uid} s={s} teacher={teacher} />) : <p className="py-6 text-center text-xs text-fg-faint">—</p>}
                    </div>
                  </Card>
                );
              })}
            </div>
            {olderControl ? <div className="mt-4">{olderControl}</div> : null}
          </Section>
        ) : (
          <>
            {live.length ? (
              <Section title="Live now">
                <List label="Live now">{live.map((s, i) => lineOf(s, i + 1))}</List>
              </Section>
            ) : null}
            {upcoming.length ? (
              <Section title="Upcoming">
                <List label="Upcoming">{upcoming.map((s, i) => lineOf(s, i + 1))}</List>
              </Section>
            ) : null}
            {past.length ? (
              <Section title="Classes" description={`${past.length} listed`}>
                <List label="Classes">{past.map((s, i) => lineOf(s, i + 1))}</List>
                {pastError ? (
                  <p role="alert" className="mt-3 text-sm text-danger">
                    {pastError}
                  </p>
                ) : null}
                <div className="mt-4">{olderControl ?? <p className="text-xs text-fg-faint">All recorded classes are listed.</p>}</div>
              </Section>
            ) : filtered.length === 0 ? (
              <EmptyState
                title="No classes match that"
                body="Try All, or another teacher on this batch."
                action={
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setClassQ("");
                      setRange("all");
                      setTeacherFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : null}
          </>
        )}
      </PageBody>
    </AppShell>
  );
}

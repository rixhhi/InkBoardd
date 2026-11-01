import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { LogStudyDialog } from "@/components/planner/log-study.tsx";
import { PlannerOnboarding } from "@/components/planner/onboarding.tsx";
import { AddTaskForm } from "@/components/planner/add-task.tsx";
import { TaskRow } from "@/components/planner/task-row.tsx";
import { PomodoroCard } from "@/components/planner/pomodoro-panel.tsx";
import { HelpButton } from "@/components/help/help-button";

import { InlineAlert } from "@/components/ui/planner/kit.tsx";
import { Badge, Button, EmptyState, IconButton, Menu, Ring, Skeleton, toast } from "@/components/ui";
import { orderQueue, queueClockTimes, queueRemaining, shortenDay } from "@inkboard/shared/planner/daily";
import { dayRemainCopy, slotCaption } from "@inkboard/shared/planner/day-board";
import { canStepDay, dayFromSearch, dayNavLabel, dayPlanCopy, dayStrip, tasksForDay } from "@inkboard/shared/planner/day-nav";
import { addDaysKey, formatDay } from "@inkboard/shared/planner/dates";
import { clearSessionSummary, readSessionSummary, type SessionSummary } from "@inkboard/shared/planner/focus";
import { cacheTodayPlan } from "@inkboard/shared/planner/offline";
import { DEFAULT_PROFILE, readProfile } from "@inkboard/shared/planner/profile";
import { scheduleInAppBanner } from "@inkboard/shared/planner/reminders";
import { moveTasks, reorderDay, skipTasks, undoLast } from "@inkboard/shared/planner/storage";
import { nextAction } from "@inkboard/shared/planner/next-action";
import { usePlanner } from "@inkboard/shared/planner/use-planner";
import { streakDaysCopy } from "@inkboard/shared/copy";

const todayRoute = getRouteApi("/planner/today");

/**
 * Tasks — the day board. Today by default; page to tomorrow, next week, or back through what was done.
 * Every mutation goes through the same storage calls the rest of the planner uses, so moving a task
 * to "the day you are looking at" is the same as moving it to today.
 */
export function PlannerTodayPage() {
  const { plan, overdue, streak, sync, retrySync, atRisk, date: today } = usePlanner();
  const search = todayRoute.useSearch();
  const nav = useNavigate();
  const date = dayFromSearch(search.day, today);
  const isToday = date === today;
  const [logOpen, setLogOpen] = useState(false);
  const [adding, setAdding] = useState(() => Boolean(search.add));
  const [hour12, setHour12] = useState(DEFAULT_PROFILE.hour12);
  const dayTasks = useMemo(() => tasksForDay(plan, date), [plan, date]);
  const queue = useMemo(() => orderQueue(dayTasks), [dayTasks]);
  const clocks = useMemo(
    () => queueClockTimes(queue, plan?.prefs.timeSlot ?? "evening", hour12),
    [queue, plan?.prefs.timeSlot, hour12],
  );
  const remaining = queueRemaining(queue);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const reminder = plan && isToday ? scheduleInAppBanner(plan.prefs, queue) : null;
  const pending = queue.filter((t) => t.status === "pending");
  const done = queue.filter((t) => t.status === "done").length;
  const dayPct = queue.length ? Math.round((done / queue.length) * 100) : 0;
  const nextId = isToday ? pending[0]?.id : undefined;
  const action = nextAction({
    overdue: overdue.length,
    pending: pending.map((task) => ({ title: task.title, lessonId: task.lessonId })),
    resume: null,
  });
  const short = shortenDay(queue, plan?.prefs.hardMaxLecturesPerDay ?? 5);
  const strip = useMemo(() => dayStrip(plan, date, today), [plan, date, today]);
  const label = dayNavLabel(date, today);

  useEffect(() => {
    setHour12(readProfile().hour12);
    setSummary(readSessionSummary());
  }, []);

  useEffect(() => {
    cacheTodayPlan(plan, today);
  }, [plan, today]);

  useEffect(() => {
    setSelected([]);
  }, [date]);

  const goTo = useCallback(
    (key: string) => {
      void nav({ to: "/planner/today", search: { add: undefined, day: key === today ? undefined : key }, replace: true });
    },
    [nav, today],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === "[" && canStepDay(date, today, -1, plan)) goTo(addDaysKey(date, -1));
      else if (e.key === "]" && canStepDay(date, today, 1, plan)) goTo(addDaysKey(date, 1));
      else if (e.key === "t" && !isToday) goTo(today);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [date, today, isToday, plan, goTo]);

  if ((sync === "syncing" || sync === "offline") && !plan) {
    return (
      <div className="max-w-[72ch] space-y-3 py-8">
        <Skeleton className="h-10" />
        <Skeleton className="h-16" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  if (!plan) return <PlannerOnboarding />;

  const planId = plan.id;

  function move(id: string, dir: -1 | 1) {
    const ids = queue.map((t) => t.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    const [hit] = next.splice(i, 1);
    if (hit) next.splice(j, 0, hit);
    reorderDay(planId, date, next);
  }

  function shorten() {
    if (!short.dropIds.length) {
      toast.message(short.reason);
      return;
    }
    skipTasks(planId, short.dropIds);
    toast.success(short.reason, { action: { label: "Undo", onClick: () => undoLast() } });
  }

  const dayActions = [
    { id: "add", label: "Write a task", onSelect: () => setAdding(true) },
    { id: "log", label: "Log study", onSelect: () => setLogOpen(true) },
    ...(isToday ? [{ id: "shorten", label: "Shorten", onSelect: shorten }] : []),
    ...(!isToday && pending.length
      ? [
          {
            id: "pull",
            label: `Move all ${pending.length} to today`,
            onSelect: () => {
              moveTasks(planId, pending.map((t) => t.id), today);
              toast.success(pending.length === 1 ? "1 class moved to today" : `${pending.length} classes moved to today`, { action: { label: "Undo", onClick: () => undoLast() } });
            },
          },
        ]
      : []),
  ];

  return (
    <div className="max-w-[72ch] py-6">
      {/* Day header with paging */}
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-fg-faint uppercase">
            {label.relative ?? ""}
            {isToday ? ` · ${slotCaption(plan.prefs.timeSlot)}` : ""}
          </p>
          <div className="flex items-center gap-1">
            <h1 className="font-serif text-2xl font-semibold sm:text-3xl">{formatDay(date, "EEEE d MMMM")}</h1>
            <HelpButton topic="today" size="md" />
          </div>
          <p className="mt-2 text-sm text-fg-muted tabular-nums">
            {isToday
              ? !pending.length && overdue.length
                ? `Nothing left today · ${overdue.length} missed ${overdue.length === 1 ? "class" : "classes"} waiting`
                : dayRemainCopy(remaining.pending, remaining.minutes)
              : dayPlanCopy(queue, date, today)}
          </p>
          {isToday && streak.current ? <Badge tone="ok" className="mt-2">{streakDaysCopy(streak.current)}</Badge> : null}
        </div>
        {queue.length ? (
          <div className="flex shrink-0 items-center gap-2">
            <Ring value={dayPct} label={`${label.relative ?? formatDay(date)} ${dayPct}% done`} size={48} />
          </div>
        ) : null}
      </header>

      <nav aria-label="Day" className="mt-4 flex items-center gap-2">
        <IconButton label="Previous day" icon={ChevronLeft} disabled={!canStepDay(date, today, -1, plan)} onClick={() => goTo(addDaysKey(date, -1))} />
        <ol className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]" aria-label="This week">
          {strip.map((cell) => (
            <li key={cell.key} className="min-w-0 flex-1">
              <button
                type="button"
                aria-current={cell.isCurrent ? "date" : undefined}
                onClick={() => goTo(cell.key)}
                className={`flex w-full flex-col items-center rounded-md px-1 py-1.5 text-xs transition-colors ${
                  cell.isCurrent ? "bg-fg text-bg" : cell.isToday ? "bg-accent-subtle text-fg" : "text-fg-muted hover:bg-surface-raised hover:text-fg"
                }`}
              >
                <span className="uppercase tracking-wide">{cell.dow}</span>{" "}
                <span className="font-mono text-base leading-tight tabular-nums">{cell.dom}</span>
                <span className="sr-only">{` ${formatDay(cell.key, "MMMM")}${cell.total ? `, ${cell.done} of ${cell.total} done` : cell.rest ? ", rest day" : ""}`}</span>
                <span className={`mt-0.5 h-1 w-4 rounded-full ${cell.total ? (cell.done === cell.total ? "bg-current" : "bg-current/40") : cell.rest ? "bg-warn/60" : "bg-transparent"}`} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
        <IconButton label="Next day" icon={ChevronRight} disabled={!canStepDay(date, today, 1, plan)} onClick={() => goTo(addDaysKey(date, 1))} />
        <HelpButton topic="today-strip" />
      </nav>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!isToday ? (
          <Button size="sm" variant="secondary" icon={CalendarDays} onClick={() => goTo(today)}>
            Back to today
          </Button>
        ) : null}
        <Menu
          label="Day actions"
          align="start"
          items={dayActions}
          trigger={(props) => (
            <Button variant="secondary" size="sm" {...props}>
              Day actions
            </Button>
          )}
        />
        <span className="ml-auto text-xs text-fg-faint touch:hidden">[ and ] page days · T jumps to today</span>
      </div>

      {isToday ? (
        <div className="mt-5">
          <PomodoroCard tasks={queue} planId={planId} />
        </div>
      ) : null}

      {isToday && atRisk ? <p className="mt-3 text-xs text-warn">Mark at risk — nothing logged today.</p> : null}
      {sync === "error" ? (
        <div className="mt-4">
          <InlineAlert
            title="Not synced"
            body="Changes are still saved on this device."
            action={
              <Button type="button" quiet onClick={() => void retrySync()}>
                Retry
              </Button>
            }
          />
        </div>
      ) : null}
      {reminder ? <p className="mt-3 text-xs text-fg-muted">{reminder}</p> : null}
      {isToday && overdue.length ? (
        <div className="mt-3">
          <Button
            type="button"
            onClick={() => {
              moveTasks(planId, overdue.map((task) => task.id), today);
              toast.success(overdue.length === 1 ? "1 class moved to today" : `${overdue.length} classes moved to today`);
            }}
          >
            {action.label}
          </Button>
        </div>
      ) : isToday && (action.kind === "start" || action.kind === "resume") ? (
        <p className="mt-3">
          <a href={action.href} className="inline-flex h-11 items-center text-sm font-semibold text-accent">
            {action.label}
          </a>
        </p>
      ) : null}
      {isToday && summary ? (
        <p className="mt-4 text-sm text-fg-muted">
          Session complete · {summary.tasksDone}/{summary.queue} struck
          {streak.current ? ` · ${streakDaysCopy(streak.current)}` : ""}{" "}
          <button
            type="button"
            className="ink-underline text-xs"
            onClick={() => {
              clearSessionSummary();
              setSummary(null);
            }}
          >
            Dismiss
          </button>
        </p>
      ) : null}

      {logOpen ? <LogStudyDialog open onClose={() => setLogOpen(false)} /> : null}

      <ol className="mt-6">
        {selected.length ? (
          <li className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="tabular">{selected.length} selected</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                skipTasks(planId, selected);
                setSelected([]);
                toast.success("Skipped", { action: { label: "Undo", onClick: () => undoLast() } });
              }}
            >
              Skip
            </Button>
            {!isToday ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  moveTasks(planId, selected, today);
                  setSelected([]);
                  toast.success("Moved to today", { action: { label: "Undo", onClick: () => undoLast() } });
                }}
              >
                Move to today
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                moveTasks(planId, selected, addDaysKey(date, 1));
                setSelected([]);
                toast.success("Moved to the next day", { action: { label: "Undo", onClick: () => undoLast() } });
              }}
            >
              Push a day
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          </li>
        ) : null}
        {queue.length ? (
          queue.map((t, i) => (
            <li key={t.id}>
              <TaskRow
                plan={plan}
                task={t}
                clock={isToday ? clocks.get(t.id) : undefined}
                index={i + 1}
                next={t.id === nextId}
                selected={selected.includes(t.id)}
                onToggleSelect={(id) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
                onMove={(dir) => move(t.id, dir)}
                canMoveUp={i > 0}
                canMoveDown={i < queue.length - 1}
              />
            </li>
          ))
        ) : (
          <li>
            <EmptyState
              title={isToday ? (overdue.length ? "Nothing scheduled today" : "Queue clear") : dayPlanCopy(queue, date, today)}
              body={
                isToday
                  ? overdue.length
                    ? `${overdue.length} ${overdue.length === 1 ? "class" : "classes"} from earlier days ${overdue.length === 1 ? "is" : "are"} still waiting. Move them in above, or write a task.`
                    : "Rest, or log study you already did."
                  : "Write a task for this day, or move one here from another day."
              }
            />
          </li>
        )}
        <li>
          {adding ? (
            <div className="border-b border-line py-3">
              <AddTaskForm plan={plan} date={date} onDone={() => setAdding(false)} />
            </div>
          ) : (
            <button type="button" className="write-task" title="Press N" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" className="mr-1 inline size-3.5" />
              Write a task
            </button>
          )}
        </li>
      </ol>
    </div>
  );
}

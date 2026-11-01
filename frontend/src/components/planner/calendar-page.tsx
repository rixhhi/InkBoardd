import { Link, getRouteApi } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, Fragment } from "react";
import { toast } from "sonner";
import { StrikeTitle } from "@/components/folio/shelf.tsx";
import { AddTaskForm } from "@/components/planner/add-task.tsx";
import { CatchUpLines, PaceCatchUpButton } from "@/components/planner/behind-banner.tsx";
import { BlankInstrument } from "@/components/planner/onboarding.tsx";
import { TaskRow } from "@/components/planner/task-row.tsx";
import { InlineAlert, KitSelect, SkeletonBlock } from "@/components/ui/planner/kit.tsx";
import { HelpButton } from "@/components/help/help-button";
import { Button, Dialog, IconButton, Tabs } from "@/components/ui";
import { CalendarDays, ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import { COPY } from "@inkboard/shared/copy";
import { chalkDust, studiedMinutesForDay } from "@inkboard/shared/planner/day-board";
import {
  addMonthsKey,
  addWeeksKey,
  formatDay,
  monthGrid,
  parseKey,
  todayKey,
  weekKeys,
} from "@inkboard/shared/planner/dates";
import { downloadIcs } from "@inkboard/shared/planner/ics";
import { createRecoveryPoint } from "@inkboard/shared/planner/recovery";
import { describeDiff, previewReschedule } from "@inkboard/shared/planner/scheduler/catchup";
import { slotCopy } from "@inkboard/shared/planner/scheduler";
import { getServerSessions, liveSessions, subscribeSessions } from "@inkboard/shared/planner/sessions";
import { paceLabel, planPace } from "@inkboard/shared/planner/streaks";
import {
  liveTasks,
  moveTask,
  moveTasks,
  replacePlanTasks,
  skipTasks,
  snapshotUndo,
  undoLast,
} from "@inkboard/shared/planner/storage";
import type { PlanTask } from "@inkboard/shared/planner/types";
import { subjectIdOf, subjectVar } from "@inkboard/shared/planner/subjects";
import { usePlanner } from "@inkboard/shared/planner/use-planner";

const plannerRoute = getRouteApi("/planner/");

export function PlannerPage() {
  const search = plannerRoute.useSearch();
  const { plan, overdue, sync, retrySync, quotaError, atRisk, freezeLeft, savedByFreeze, state, date: today } = usePlanner();
  const [view, setView] = useState<"month" | "week" | "agenda">("month");
  const [cursor, setCursor] = useState(() => todayKey());
  const [open, setOpen] = useState<string>(() => search.day ?? todayKey());
  const [strategy, setStrategy] = useState(false);
  const [subject, setSubject] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [catchUp, setCatchUp] = useState(false);
  const sessions = useSyncExternalStore(subscribeSessions, liveSessions, getServerSessions);
  const todayRef = useRef(today);
  useEffect(() => {
    if (todayRef.current === today) return;
    const previous = todayRef.current;
    todayRef.current = today;
    setCursor((c) => (c === previous ? today : c));
    if (!search.day) setOpen((d) => (d === previous ? today : d));
  }, [today, search.day]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setView(mq.matches ? "agenda" : "month");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const month = parseKey(cursor).getMonth();
  const year = parseKey(cursor).getFullYear();
  const cells = view === "month" ? monthGrid(year, month) : weekKeys(cursor);
  const byDate = useMemo(() => {
    const map = new Map<string, PlanTask[]>();
    for (const t of liveTasks(plan?.tasks ?? [])) {
      if (subject && (t.subject || t.teacher) !== subject) continue;
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    }
    return map;
  }, [plan, subject]);
  const dayTasks = (open ? byDate.get(open) : undefined) ?? [];
  const daySessions = open ? sessions.filter((s) => s.date === open && !s.deletedAt) : [];
  const subjects = [...new Set(liveTasks(plan?.tasks ?? []).map((t) => t.subject || t.teacher).filter(Boolean))];
  const agendaDays = view === "agenda" ? weekKeys(cursor) : [];
  const nextId = dayTasks.find((t) => t.status === "pending")?.id;
  const goal = plan?.prefs.dailyMinutes ?? 90;

  function shift(dir: number) {
    setCursor(view === "month" ? addMonthsKey(cursor, dir) : addWeeksKey(cursor, dir));
  }

  function applyStrategy(kind: "spread" | "push" | "skip") {
    if (!plan) return;
    if (!createRecoveryPoint("reschedule overdue")) {
      toast.error(`${COPY.recoveryMarkFail} Export a backup first.`);
      return;
    }
    const { tasks: next, diff } = previewReschedule(plan.tasks, plan.prefs, today, kind);
    snapshotUndo();
    replacePlanTasks(plan.id, next, next[next.length - 1]?.date);
    setStrategy(false);
    toast.success(describeDiff(diff), { action: { label: "Undo", onClick: () => undoLast() } });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") {
        setStrategy(false);
        setAdding(false);
        return;
      }
      if (!open) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = cells.indexOf(open);
        if (i > 0) setOpen(cells[i - 1]!);
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const i = cells.indexOf(open);
        if (i >= 0 && i < cells.length - 1) setOpen(cells[i + 1]!);
      }
      if (e.key === "Enter" && open) {
        e.preventDefault();
        document.getElementById("planner-day-panel")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, cells]);

  if ((sync === "syncing" || sync === "offline") && !plan) {
    return (
      <div className="space-y-4 py-8">
        <SkeletonBlock className="h-16" />
        <SkeletonBlock className="h-80" />
      </div>
    );
  }

  if (!plan) return <BlankInstrument kicker={COPY.month} />;

  const livePlan = plan;
  const pace = planPace(livePlan, today, state.days);
  const monthTitle = view === "month" ? formatDay(cursor, "MMMM yyyy") : `Week of ${formatDay(weekKeys(cursor)[0]!)}`;

  // A render helper, not a component: a component declared here would remount every cell on each render.
  function miniBoard(date: string) {
    const list = byDate.get(date) ?? [];
    const overdueDay = list.some((t) => t.status === "pending" && date < today);
    const inMonth = date.slice(0, 7) === `${year}-${String(month + 1).padStart(2, "0")}`;
    const minutes = studiedMinutesForDay(date, sessions, list);
    const dust = chalkDust(minutes, goal);
    const hasExam = list.some((t) => t.eventKind === "exam") || date === livePlan.prefs.examDate;
    const hasHoliday = list.some((t) => t.eventKind === "holiday") || livePlan.prefs.holidays.includes(date);
    const struck = list.filter((t) => t.status === "done").length;
    return (
      <button
        type="button"
        onClick={() => setOpen(date)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const id = e.dataTransfer.getData("text/task-id");
          if (id) moveTask(livePlan.id, id, date);
        }}
        className={`mini-board${date === today ? " is-today" : ""}${open === date ? " is-open" : ""}${hasExam ? " is-exam" : ""}${overdueDay ? " is-overdue" : ""}${view === "month" && !inMonth ? " is-out" : ""}${view === "week" ? " is-week" : ""}`}
        style={{ ["--dust" as string]: String(dust) }}
      >
        <span className="dust" aria-hidden="true" />
        <span className="day-num tabular">{date.slice(8)}</span>
        {view === "week" && list.length ? (
          <span className="day-titles" aria-hidden="true">
            {list.slice(0, 3).map((t) => (
              <span key={t.id} className={t.status === "done" ? "is-struck" : undefined}>
                {t.title}
              </span>
            ))}
          </span>
        ) : null}
        {list.length ? (
          <span className="day-marks" aria-hidden="true">
            {list.slice(0, 4).map((t) => (
              <i key={t.id} className={t.status === "done" ? "is-struck" : t.status === "skipped" ? "is-skipped" : undefined} style={{ background: subjectVar(subjectIdOf(t.subject)) }} />
            ))}
            {list.length > 4 ? <b>+{list.length - 4}</b> : null}
          </span>
        ) : null}
        <span className="day-count text-xs text-fg-muted">
          {list.length ? `${struck}/${list.length}` : hasHoliday ? "rest" : ""}
        </span>
        <span className="sr-only">
          {`, ${formatDay(date, "EEEE d MMMM")}, ${list.length ? `${list.length} ${list.length === 1 ? "class" : "classes"}, ${struck} done` : "nothing planned"}${hasExam ? ", exam" : ""}${hasHoliday ? ", holiday" : ""}`}
        </span>
      </button>
    );
  }

  return (
    <div className="py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-fg-faint uppercase">{view === "month" ? COPY.month : view === "week" ? "Week" : "Agenda"}</p>
          <div className="flex items-center gap-1">
            <h1 className="font-serif text-2xl font-semibold sm:text-3xl">{monthTitle}</h1>
            <HelpButton topic="month" size="md" />
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {plan.name} · {slotCopy(plan.prefs.timeSlot)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pace.status === "behind" ? (
            <PaceCatchUpButton label={paceLabel(pace)} warn onOpen={() => setCatchUp(true)} />
          ) : null}
          <Button variant="secondary" size="sm" icon={Download} onClick={() => downloadIcs(plan)}>
            Export .ics
          </Button>
        </div>
      </header>
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
      {quotaError ? <p className="mt-3 text-sm text-danger">{quotaError}</p> : null}
      <div className="mt-4">
        <CatchUpLines
          planId={plan.id}
          tasks={plan.tasks}
          prefs={plan.prefs}
          today={today}
          force={catchUp || pace.status === "behind"}
        />
      </div>
      {overdue.length || atRisk || savedByFreeze ? (
        <ul className="plan-status mt-4" aria-label="Plan status">
          {overdue.length ? (
            <li className="is-warn">
              <span>
                {overdue.length} overdue class{overdue.length === 1 ? "" : "es"}
              </span>
              <Button size="sm" variant="secondary" onClick={() => setStrategy(true)}>
                Reschedule
              </Button>
            </li>
          ) : null}
          {atRisk ? (
            <li className="is-warn">
              <span>Mark at risk — nothing logged today</span>
            </li>
          ) : null}
          {savedByFreeze ? (
            <li className="is-warn">
              <span>Saved by freeze · {freezeLeft} left this week</span>
            </li>
          ) : null}
        </ul>
      ) : null}
      {!savedByFreeze ? (
        <p className="mt-3 text-xs text-fg-muted">
          {freezeLeft} freeze{freezeLeft === 1 ? "" : "s"} left this week
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <IconButton label={view === "month" ? "Previous month" : "Previous week"} icon={ChevronLeft} onClick={() => shift(-1)} />
          <Button variant="secondary" size="sm" icon={CalendarDays} onClick={() => { setCursor(today); setOpen(today); }}>
            Today
          </Button>
          <IconButton label={view === "month" ? "Next month" : "Next week"} icon={ChevronRight} onClick={() => shift(1)} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {subjects.length > 1 ? (
            <KitSelect
              value={subject}
              onChange={setSubject}
              ariaLabel="Filter by subject"
              options={[{ id: "", label: "All subjects" }, ...subjects.map((s) => ({ id: s, label: s }))]}
            />
          ) : null}
          <Tabs
            label="Calendar view"
            size="sm"
            value={view}
            onChange={(id) => setView(id as "month" | "week" | "agenda")}
            tabs={[
              { id: "month", label: "Month" },
              { id: "week", label: "Week" },
              { id: "agenda", label: "Agenda" },
            ]}
          />
        </div>
      </div>

      {view !== "agenda" ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-fg-muted" aria-label="Calendar legend">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="mini-board inline-block size-4 rounded-[3px]" style={{ "--dust": 0.9 } as never}>
              <span className="dust" />
            </span>
            Hatched · minutes studied
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block border-b-2 border-warn px-0.5 font-mono text-[10px] leading-none text-fg">
              12
            </span>
            Underlined · overdue
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="mini-board is-exam inline-block size-4 rounded-[3px]" />
            Ringed · exam day
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="mini-board is-today inline-block size-4 rounded-[3px]" />
            Bold edge · today
          </li>
        </ul>
      ) : null}

      {view === "agenda" ? (
        <ol className="mt-4">
          {agendaDays.map((date) => {
            const list = byDate.get(date) ?? [];
            return (
              <li key={date} className="border-b border-line py-3">
                <button type="button" className="text-left" onClick={() => setOpen(date)}>
                  <p className="font-serif text-base font-semibold">{formatDay(date, "EEEE d MMM")}</p>
                  <p className="text-xs text-fg-muted">{list.length ? `${list.length} ${list.length === 1 ? "class" : "classes"}` : "Nothing planned"}</p>
                </button>
                <ul className="mt-2 space-y-1">
                  {list.slice(0, 4).map((t) => (
                    <li key={t.id} className="truncate text-sm">
                      <StrikeTitle done={t.status === "done"} className="truncate">
                        {t.title}
                      </StrikeTitle>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className={`mt-4 grid gap-1.5 ${view === "month" ? "grid-cols-7" : "grid-cols-1 sm:grid-cols-7"}`}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="px-1 text-center text-xs text-fg-muted">
              {d}
            </div>
          ))}
          {cells.map((date) => (
            <Fragment key={date}>{miniBoard(date)}</Fragment>
          ))}
        </div>
      )}

      <section id="planner-day-panel" tabIndex={-1} className="mt-10 max-w-[72ch] outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-fg-faint uppercase">{open === today ? "today" : open ? "day" : ""}</p>
            <h2 className="text-lg font-semibold">{open ? formatDay(open, "EEEE d MMM") : "Pick a day"}</h2>
            {daySessions.length ? (
              <p className="mt-1 text-xs text-fg-muted">
                {daySessions.length} session{daySessions.length === 1 ? "" : "s"} ·{" "}
                {daySessions.reduce((n, s) => n + s.durationMin, 0)} min logged
              </p>
            ) : null}
          </div>
          {open ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={Plus} onClick={() => setAdding((v) => !v)}>
                Write a task
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link to="/planner/today" search={{ add: undefined, day: open === today ? undefined : open }}>
                  Open in Tasks
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
        {adding && open ? (
          <div className="mt-1 border-t border-line py-3">
            <AddTaskForm plan={plan} date={open} onDone={() => setAdding(false)} />
          </div>
        ) : null}
        {selected.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="tabular">{selected.length} selected</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                skipTasks(plan.id, selected);
                setSelected([]);
                toast.success("Skipped", { action: { label: "Undo", onClick: () => undoLast() } });
              }}
            >
              Skip selected
            </Button>
            {open ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  moveTasks(plan.id, selected, open);
                  setSelected([]);
                  toast.success("Moved", { action: { label: "Undo", onClick: () => undoLast() } });
                }}
              >
                Move selected here
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        ) : null}
        {!dayTasks.length ? (
          <p className="mt-4 text-sm text-fg-muted">Nothing scheduled this day.</p>
        ) : (
          <ul className="mt-4">
            {dayTasks.map((t, i) => (
              <li key={t.id}>
                <TaskRow
                  plan={plan}
                  task={t}
                  index={i + 1}
                  next={t.id === nextId}
                  selected={selected.includes(t.id)}
                  onToggleSelect={(id) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {strategy ? (
        <Dialog
          open
          onOpenChange={(o) => !o && setStrategy(false)}
          title="Reschedule overdue"
          kicker={`${overdue.length} overdue`}
          description="Completed classes stay put. Everything is undoable."
          footer={<Button variant="ghost" onClick={() => setStrategy(false)}>Cancel</Button>}
        >
          <div className="grid gap-2">
            {(
              [
                ["spread", "Spread into spare days", "Fills the lightest upcoming days first; the end date holds."],
                ["push", "Push everything forward", "Keeps the order you planned; the end date moves out."],
                ["skip", "Skip overdue", "Marks them skipped so the week starts clean."],
              ] as const
            ).map(([kind, title, body]) => (
              <button
                key={kind}
                type="button"
                className="rounded-md bg-surface-raised px-4 py-3 text-left shadow-1 transition-shadow hover:shadow-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onClick={() => applyStrategy(kind)}
              >
                <p className="text-sm font-medium text-fg">{title}</p>
                <p className="mt-0.5 text-xs text-fg-muted">{body}</p>
              </button>
            ))}
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

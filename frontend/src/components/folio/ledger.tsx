import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { IndexCard } from "@/components/folio/index-card";
import { PlanSwitcher } from "@/components/planner/plan-switcher.tsx";
import { AddToPlanButton } from "@/components/add-to-plan";
import { COPY } from "@inkboard/shared/copy";
import { useSelectedExam } from "@inkboard/shared/exam-pref";
import { WALL_LEDGER_EVENT, type WallLedgerPayload } from "@inkboard/shared/exam-wall";
import { formatRemain, folioDateParts, isPlannerMode, peekCopy, type FolioMode, type LedgerFocus } from "@inkboard/shared/folio";
import { daysToExamCopy, FORM_LEDGER_EVENT, instrumentFigures, minutesCopy, tallyCopy, type FormLedger } from "@inkboard/shared/planner/instruments";
import { planPace } from "@inkboard/shared/planner/streaks";
import { readLater, readSaved } from "@inkboard/shared/library";
import { coachNext, queueRemaining } from "@inkboard/shared/planner/daily";
import { openBoardSession } from "@inkboard/shared/planner/day-board";
import { revisionHealth } from "@inkboard/shared/planner/revision-health";
import { usePlanner } from "@inkboard/shared/planner/use-planner";
import { SHELF_LEDGER_EVENT, sheetsCopy, takeSheets, type ShelfLedgerPayload } from "@inkboard/shared/shelf";
import { patchTask } from "@inkboard/shared/planner/storage";
import { readHistory } from "@inkboard/shared/watch-history";

const PLAN_BOARDS = [
  { to: "/planner/today" as const, label: "Today" },
  { to: "/planner" as const, label: "Month" },
  { to: "/planner/dashboard" as const, label: "Pace" },
  { to: "/planner/settings" as const, label: "Settings" },
] as const;

function boardActive(pathname: string, to: string) {
  if (to === "/planner") return pathname === "/planner";
  return pathname.startsWith(to);
}

function DeskDate() {
  const parts = folioDateParts();
  return (
    <header className="folio-desk-head">
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">{parts.weekday}</p>
      <p className="mt-1 font-serif text-sm">{parts.dayMonth}</p>
    </header>
  );
}

export function LedgerBody({ mode, focus }: { mode: FolioMode; focus: LedgerFocus }) {
  const exam = useSelectedExam();
  const { plan, today, overdue, streak, state, date } = usePlanner();
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const libraryRef = useRef<HTMLElement | null>(null);
  const [tick, setTick] = useState(0);
  const history = useMemo(() => {
    void tick;
    return readHistory().slice(0, 3);
  }, [tick]);
  const later = useMemo(() => {
    void tick;
    return readLater().slice(0, 4);
  }, [tick]);
  const saved = useMemo(() => {
    void tick;
    return readSaved().slice(0, 4);
  }, [tick]);
  const [shelf, setShelf] = useState<ShelfLedgerPayload>(null);
  const [wall, setWall] = useState<WallLedgerPayload>(null);
  const [form, setForm] = useState<FormLedger>(null);

  useEffect(() => {
    const sync = () => setTick((n) => n + 1);
    const onShelf = (e: Event) => setShelf((e as CustomEvent<ShelfLedgerPayload>).detail ?? null);
    const onWall = (e: Event) => setWall((e as CustomEvent<WallLedgerPayload>).detail ?? null);
    const onForm = (e: Event) => setForm((e as CustomEvent<FormLedger>).detail ?? null);
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    window.addEventListener(SHELF_LEDGER_EVENT, onShelf);
    window.addEventListener(WALL_LEDGER_EVENT, onWall);
    window.addEventListener(FORM_LEDGER_EVENT, onForm);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener(SHELF_LEDGER_EVENT, onShelf);
      window.removeEventListener(WALL_LEDGER_EVENT, onWall);
      window.removeEventListener(FORM_LEDGER_EVENT, onForm);
    };
  }, []);

  useEffect(() => {
    if (focus !== "library") return;
    libraryRef.current?.scrollIntoView({ block: "start" });
  }, [focus, later.length, saved.length]);

  const remaining = queueRemaining(today);
  const coach = coachNext(today, overdue);
  const health = plan ? revisionHealth(plan, date) : null;
  const planner = isPlannerMode(mode);
  const doneToday = today.some((t) => t.status === "done");
  const pace = plan ? planPace(plan, date, state.days) : null;
  const figures =
    plan && pace
      ? instrumentFigures({
          streak: streak.current,
          minutes: state.days.reduce((n, d) => n + d.minutesStudied, 0),
          coverage: pace.percentLessons,
          examDate: plan.prefs.examDate,
          today: date,
        })
      : null;

  const showHistory = history.length > 0 && mode === "wall" && !exam;
  const showFolded = focus === "library" || (mode === "wall" && !exam && (later.length > 0 || saved.length > 0));
  const showToday = mode === "day";
  const showBoards = planner && mode !== "day" && mode !== "instrument";
  const showPaceFigs = mode === "instrument" && figures;
  const faced = Boolean(wall?.faced);
  const showExamDesk = mode === "wall" && Boolean(exam) && !faced;
  const showPlateDesk = mode === "wall" && faced;
  const deskToday = mode === "wall" || mode === "shelf";

  function startBoard() {
    if (!plan) {
      void nav({ to: "/planner/new" });
      return;
    }
    const run = openBoardSession(
      plan.id,
      today.filter((t) => t.status === "pending"),
    );
    if (!run) {
      void nav({ to: "/planner/today", search: { add: undefined } });
      if (remaining.pending) toast.message(COPY.nothingPlayable);
      return;
    }
    void nav({
      to: "/play/$lessonId",
      params: { lessonId: run.lessonId },
      search: { title: run.title, teacher: run.teacher, course: run.course, focus: 1 },
    });
  }

  return (
    <div className="folio-desk min-h-0 flex-1 overflow-y-auto">
      <DeskDate />

      <div className="folio-desk-body">
      {(mode === "wall" || mode === "shelf") && (
        <section>
          <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">{COPY.savedClasses}</p>
          <Link to="/offline" className="mt-2 inline-flex h-11 items-center text-sm text-accent">
            {COPY.openFromThisDevice}
          </Link>
        </section>
      )}
      {deskToday && plan ? (
        <section>
          <p className="font-serif text-sm tabular">
            {remaining.pending} left · {formatRemain(remaining.minutes)}
          </p>
          <p className="mt-1 text-xs text-fg-muted">{coach.reason}</p>
          {remaining.pending ? (
            <button
              type="button"
              onClick={startBoard}
              className="mt-2 inline-flex h-10 items-center text-sm font-semibold text-accent"
            >
              {doneToday ? COPY.resumeBoard : COPY.startBoard}
            </button>
          ) : (
            <Link
              to="/planner/today"
              search={{ add: undefined }}
              className="mt-2 inline-flex h-10 items-center text-sm text-accent"
            >
              {COPY.openToday}
            </Link>
          )}
        </section>
      ) : null}
      {deskToday && !plan ? (
        <section>
          <p className="text-sm text-fg-muted">{COPY.boardBlank}</p>
          <Link to="/planner/new" className="mt-2 inline-flex h-10 items-center text-sm font-semibold text-accent">
            {COPY.layOutAPlan}
          </Link>
        </section>
      ) : null}

      {mode === "shelf" && shelf ? (
        <section>
          <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">{shelf.kicker}</p>
          <p className="mt-2 font-serif text-base font-semibold">{shelf.title}</p>
          {shelf.coverage ? <p className="mt-1 tabular text-sm text-fg-muted">{shelf.coverage}</p> : null}
          {shelf.meta && !shelf.coverage ? <p className="mt-1 text-xs text-fg-muted">{shelf.meta}</p> : null}
          {shelf.next ? <p className="mt-2 text-sm text-fg-muted">Next · {shelf.next}</p> : null}
          {shelf.notes ? (
            <button type="button" onClick={() => takeSheets()} className="mt-2 block text-sm text-accent">
              {sheetsCopy(shelf.notes, shelf.notesGuessed)}
            </button>
          ) : null}
          {shelf.teacher || shelf.course ? (
            <div className="mt-3">
              <AddToPlanButton
                examId={shelf.examId}
                teacher={shelf.teacher}
                course={shelf.course}
                label="Add to plan"
                className="inline-flex h-11 items-center text-sm font-semibold text-accent"
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {showPlateDesk && exam ? (
        <section>
          <AddToPlanButton
            examId={exam.id}
            label="Add to plan"
            className="inline-flex h-11 items-center text-sm font-semibold text-accent"
          />
        </section>
      ) : null}

      {showExamDesk && exam ? (
        <>
          {wall?.upcomingTitle ? (
            <section>
              <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">Upcoming</p>
              {wall.upcomingReplayId && !wall.upcomingLive ? (
                <Link
                  to="/play/$lessonId"
                  params={{ lessonId: wall.upcomingReplayId }}
                  search={{ title: wall.upcomingTitle }}
                  className="mt-2 block text-sm hover:text-accent"
                >
                  <span className="text-xs tabular text-fg-muted">{wall.upcomingWhen || "Soon"}</span>
                  <span className="mt-0.5 block line-clamp-2">{wall.upcomingTitle}</span>
                </Link>
              ) : (
                <p className="mt-2 text-sm">
                  <span className="text-xs tabular text-fg-muted">{wall.upcomingWhen || "Soon"}</span>
                  <span className="mt-0.5 block line-clamp-2">{wall.upcomingTitle}</span>
                </p>
              )}
            </section>
          ) : null}
          <section>
            <AddToPlanButton
              examId={exam.id}
              label="Add to plan"
              className="inline-flex h-11 items-center text-sm font-semibold text-accent"
            />
          </section>
          {wall?.lastTeacherSlug ? (
            <section>
              <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">Last stamp</p>
              <Link
                to="/teacher/$slug"
                params={{ slug: wall.lastTeacherSlug }}
                className="mt-2 block font-serif text-sm hover:text-accent"
              >
                {wall.lastTeacherName || wall.lastTeacherSlug}
              </Link>
            </section>
          ) : null}
        </>
      ) : null}

      {showHistory ? (
        <section>
          <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">Recent</p>
          <div className="ledger-stack mt-2">
            {history.map((item, i) => {
              const pct = item.duration > 0 ? Math.min(100, (item.t / item.duration) * 100) : 0;
              return (
                <Link
                  key={item.lessonId}
                  to="/play/$lessonId"
                  params={{ lessonId: item.lessonId }}
                  search={{
                    title: item.title,
                    teacher: item.teacher,
                    course: item.course,
                    t: Math.floor(item.t),
                  }}
                >
                  <IndexCard
                    title={item.title}
                    meta={item.teacher}
                    progress={pct}
                    tilt={i === 1 ? 1.5 : i === 2 ? -1.5 : 0}
                  />
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {showFolded ? (
        <section ref={libraryRef} id="folio-library">
          <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">Folded</p>
          {later.length === 0 && saved.length === 0 ? (
            <p className="mt-2 text-xs text-fg-muted">Nothing folded yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {later.map((item) => (
                <li key={item.lessonId}>
                  <Link
                    to="/play/$lessonId"
                    params={{ lessonId: item.lessonId }}
                    search={{ title: item.title, teacher: item.teacher, course: item.course }}
                    className="block py-2.5 text-sm hover:text-accent"
                  >
                    {item.title}
                    {item.teacher ? <span className="mt-0.5 block text-xs text-fg-muted">{item.teacher}</span> : null}
                  </Link>
                </li>
              ))}
              {saved.map((t) => (
                <li key={t.username}>
                  <Link to="/teacher/$slug" params={{ slug: t.username }} className="block py-2.5 text-sm hover:text-accent">
                    {t.name}
                    <span className="mt-0.5 block text-xs text-fg-muted">@{t.username}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <span ref={libraryRef} id="folio-library" className="sr-only" />
      )}

      {showToday ? (
        <section>
          <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">Today</p>
          {plan ? (
            <div className="mt-2">
              <p className="font-serif text-base font-semibold tabular">
                {remaining.pending} left · {formatRemain(remaining.minutes)}
              </p>
              <p className="mt-1 text-xs text-fg-muted">{coach.reason}</p>
              {health && health.due.length + health.overdue.length > 0 ? (
                <p className="mt-1 text-xs text-warn">
                  {health.overdue.length
                    ? `${health.overdue.length} revision overdue`
                    : `${health.due.length} revision due`}
                </p>
              ) : null}
              {overdue.length ? (
                <button
                  type="button"
                  className="mt-2 inline-flex h-11 items-center text-sm text-accent"
                  onClick={() => {
                    for (const task of overdue) patchTask(plan.id, task.id, { date });
                    toast.success(overdue.length === 1 ? "1 class moved to today" : `${overdue.length} classes moved to today`);
                  }}
                >
                  Move missed to today
                </button>
              ) : null}
              {remaining.pending ? (
                <button
                  type="button"
                  onClick={startBoard}
                  className="mt-3 inline-flex h-11 items-center text-sm font-semibold text-accent"
                >
                  {doneToday ? "Resume the board" : "Start the board"}
                </button>
              ) : (
                <Link
                  to="/planner/today"
                  search={{ add: undefined }}
                  className="mt-3 inline-flex h-11 items-center text-sm text-accent"
                >
                  Open today’s tasks
                </Link>
              )}
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-sm text-fg-muted">No plan yet.</p>
              <Link to="/planner/new" className="mt-3 inline-flex h-11 items-center text-sm font-semibold text-accent">
                Lay out a plan
              </Link>
            </div>
          )}
        </section>
      ) : null}

      {showPaceFigs && figures ? (
        <section>
          <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">Pace</p>
          <dl className="mt-2 space-y-2">
            <div className="flex justify-between gap-3 text-sm">
              <dt className="text-fg-muted">Tally</dt>
              <dd className="tabular">{tallyCopy(figures.tally)}</dd>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <dt className="text-fg-muted">Minutes</dt>
              <dd className="tabular">{minutesCopy(figures.minutes)}</dd>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <dt className="text-fg-muted">Coverage</dt>
              <dd className="tabular">{figures.coverage}%</dd>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <dt className="text-fg-muted">Exam</dt>
              <dd className="tabular">{daysToExamCopy(figures.daysToExam)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {mode === "form" && form ? (
        <section>
          <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">{form.kicker}</p>
          <p className="mt-2 font-serif text-base font-semibold">{form.title}</p>
          <ul className="mt-2 space-y-1 text-sm text-fg-muted">
            {form.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {form.warn ? <p className="mt-2 text-xs text-warn">{form.warn}</p> : null}
        </section>
      ) : null}

      {showBoards ? (
        <section>
          <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">Boards</p>
          <div className="mt-2">
            <PlanSwitcher />
          </div>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {PLAN_BOARDS.map((item) => {
              const on = boardActive(pathname, item.to);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={`flex h-11 items-center text-sm ${on ? "text-accent" : "text-fg-muted hover:text-fg"}`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      </div>

      <footer className="folio-desk-foot">
        <Link to="/planner/today" search={{ add: undefined }} className={pathname.startsWith("/planner/today") ? "is-on" : ""}>
          Today
        </Link>
        <Link to="/planner" search={{ day: undefined }} className={pathname === "/planner" ? "is-on" : ""}>
          Month
        </Link>
        <Link to="/planner/dashboard" className={pathname.startsWith("/planner/dashboard") ? "is-on" : ""}>
          Pace
        </Link>
        <Link to="/planner/badges" className={pathname.startsWith("/planner/badges") ? "is-on" : ""}>
          Badges
        </Link>
      </footer>
    </div>
  );
}

export function PeekBar({
  onOpen,
  pending,
  minutes,
  hasPlan,
  seal,
}: {
  onOpen: () => void;
  pending: number;
  minutes: number;
  hasPlan: boolean;
  seal?: string;
}) {
  return (
    <button type="button" className="folio-peek text-xs font-semibold tracking-[0.14em] uppercase" onClick={onOpen} aria-label="Open the folio">
      {peekCopy(pending, minutes, hasPlan, seal)}
    </button>
  );
}

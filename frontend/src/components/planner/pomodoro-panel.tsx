import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Pause, Play, SkipForward, Square, Timer } from "lucide-react";
import { Button, Dialog, IconButton, Ring, Select, toast } from "@/components/ui";
import { HelpButton } from "@/components/help/help-button";

import { SUBJECT_IDS, subjectIdOf, type SubjectId } from "@inkboard/shared/planner/subjects";
import {
  POMODORO_PRESETS,
  advancePomodoro,
  bindFromSubject,
  bindFromTask,
  customPreset,
  formatClock,
  getServerPomodoro,
  pausePomodoro,
  phaseLabel,
  pomodoroClock,
  pomodoroLine,
  readPomodoro,
  rebindPomodoro,
  resumePomodoro,
  startPomodoro,
  stopPomodoro,
  subjectTitle,
  subscribePomodoro,
  type PomodoroBind,
  type PomodoroPreset,
  type PomodoroState,
} from "@inkboard/shared/planner/pomodoro";
import type { PlanTask } from "@inkboard/shared/planner/types";

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function usePomodoro(): PomodoroState | null {
  return useSyncExternalStore(subscribePomodoro, readPomodoro, getServerPomodoro);
}

/** Rolls the clock over when a phase ends and keeps the tab title honest while a block runs. */
function usePhaseRollover(state: PomodoroState | null, now: number) {
  useEffect(() => {
    if (state?.status !== "running") return;
    const clock = pomodoroClock(state, now);
    if (!clock.over) return;
    const { state: next, logged } = advancePomodoro(now);
    if (!next) return;
    if (logged) toast.success(`${logged.durationMin} min logged · ${phaseLabel(next.phase)} now`);
    else toast.message(`${phaseLabel(next.phase)} now`);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(next.phase === "work" ? "Back to it" : phaseLabel(next.phase), { body: next.bind.title, silent: true });
      }
    } catch {
      /* no notifications */
    }
  }, [state, now]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!state) return;
    const base = document.title.replace(/^\d+:\d{2} · .*? — /, "");
    document.title = `${pomodoroLine(state, now)} — ${base}`;
    return () => {
      document.title = base;
    };
  }, [state, now]);
}

/**
 * The live timer card. Shows on the Tasks page; when nothing is running it offers to start a block
 * bound to the next pending task (or a category when the board is empty).
 */
export function PomodoroCard({ tasks, planId, compact = false }: { tasks: PlanTask[]; planId: string | null; compact?: boolean }) {
  const state = usePomodoro();
  const now = useNow(Boolean(state));
  usePhaseRollover(state, now);
  const [pickOpen, setPickOpen] = useState(false);

  if (!state) {
    const next = tasks.find((t) => t.status === "pending") ?? null;
    return (
      <>
        <section aria-label="Focus timer" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-raised px-4 py-3 shadow-1">
          <div className="flex min-w-0 items-center gap-3">
            <Timer aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-sm font-medium text-fg">
                Focus timer
                <HelpButton topic="pomodoro" />
              </p>
              <p className="truncate text-xs text-fg-muted">{next ? `Next up: ${next.title}` : "Pick a lecture or a subject and start a block."}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {next ? (
              <Button size="sm" icon={Play} onClick={() => startPomodoro(bindFromTask(next, planId))}>
                Start on {shortTitle(next.title)}
              </Button>
            ) : null}
            <Button size="sm" variant={next ? "secondary" : "primary"} onClick={() => setPickOpen(true)}>
              {next ? "Choose…" : "Start a block"}
            </Button>
          </div>
        </section>
        <PomodoroPicker open={pickOpen} onOpenChange={setPickOpen} tasks={tasks} planId={planId} />
      </>
    );
  }

  const clock = pomodoroClock(state, now);
  const working = state.phase === "work";
  const paused = state.status === "paused";
  return (
    <>
      <section
        aria-label="Focus timer"
        aria-live="off"
        className={`rounded-lg px-4 py-3 shadow-1 ${working ? "bg-fg text-bg" : "bg-accent-subtle text-fg"} ${compact ? "" : "sm:px-5 sm:py-4"}`}
      >
        <div className="flex flex-wrap items-center gap-4">
          <Ring value={clock.pct} label={`${phaseLabel(state.phase)} ${clock.pct}% through`} size={compact ? 44 : 56} className={working ? "text-bg" : ""} />
          <div className="min-w-0 flex-1">
            <p className={`font-mono text-3xl leading-none tabular-nums ${compact ? "" : "sm:text-4xl"}`}>
              <span aria-hidden="true">{formatClock(clock.leftSec)}</span>
              <span className="sr-only">{`${formatClock(clock.leftSec)} left`}</span>
            </p>
            <p className={`mt-1 truncate text-sm ${working ? "text-bg/80" : "text-fg-muted"}`}>
              {paused ? "Paused · " : ""}
              {phaseLabel(state.phase)} · round {state.round}
              {working ? ` · ${state.bind.title || subjectTitle(state.bind.subject)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <IconButton
              label={paused ? "Resume" : "Pause"}
              icon={paused ? Play : Pause}
              onClick={() => (paused ? resumePomodoro() : pausePomodoro())}
              className={working ? "text-bg hover:bg-bg/10" : ""}
            />
            <IconButton
              label={working ? "Finish this block early" : "Skip the break"}
              icon={SkipForward}
              onClick={() => {
                const { logged, state: next } = advancePomodoro();
                if (logged) toast.success(`${logged.durationMin} min logged`);
                if (next) toast.message(`${phaseLabel(next.phase)} now`);
              }}
              className={working ? "text-bg hover:bg-bg/10" : ""}
            />
            <IconButton
              label="Stop the timer"
              icon={Square}
              onClick={() => {
                const { logged, totalWorkSec } = stopPomodoro();
                const mins = Math.round(totalWorkSec / 60);
                toast.success(mins ? `Stopped · ${mins} min on the log` : "Stopped", logged ? undefined : undefined);
              }}
              className={working ? "text-bg hover:bg-bg/10" : ""}
            />
          </div>
        </div>
        {working ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-bg/70">
            <span>{state.preset.label} · {state.preset.rounds} rounds then a long break</span>
            <button type="button" className="underline-offset-2 hover:underline" onClick={() => setPickOpen(true)}>
              Switch what you’re on
            </button>
          </div>
        ) : null}
      </section>
      <PomodoroPicker open={pickOpen} onOpenChange={setPickOpen} tasks={tasks} planId={planId} rebind />
    </>
  );
}

function shortTitle(title: string, max = 26) {
  return title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title;
}

/** Choose what the block is for (a task on the board or a bare subject) and how long the rhythm is. */
export function PomodoroPicker({
  open,
  onOpenChange,
  tasks,
  planId,
  rebind = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: PlanTask[];
  planId: string | null;
  rebind?: boolean;
}) {
  const pending = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);
  const [target, setTarget] = useState<string>(() => (pending[0] ? `task:${pending[0].id}` : "subject:other"));
  const [presetId, setPresetId] = useState<PomodoroPreset["id"]>("classic");
  const [workMin, setWorkMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);

  useEffect(() => {
    if (!open) return;
    setTarget(pending[0] ? `task:${pending[0].id}` : "subject:other");
  }, [open, pending]);

  const options = [
    ...pending.map((t) => ({ value: `task:${t.id}`, label: `${t.title}${t.subject ? ` · ${t.subject}` : ""}` })),
    ...SUBJECT_IDS.map((s) => ({ value: `subject:${s}`, label: `Just ${subjectTitle(s)}` })),
  ];

  function resolveBind(): PomodoroBind {
    if (target.startsWith("task:")) {
      const t = pending.find((x) => `task:${x.id}` === target);
      if (t) return bindFromTask(t, planId);
    }
    const s = target.replace("subject:", "") as SubjectId;
    return bindFromSubject(SUBJECT_IDS.includes(s) ? s : subjectIdOf(s));
  }

  function go() {
    const bind = resolveBind();
    if (rebind) {
      rebindPomodoro(bind);
      toast.message(`Now on ${bind.title}`);
    } else {
      const preset = presetId === "custom" ? customPreset(workMin, breakMin) : (POMODORO_PRESETS.find((p) => p.id === presetId) ?? POMODORO_PRESETS[0]!);
      startPomodoro(bind, preset);
      void Notification?.requestPermission?.().catch?.(() => {});
    }
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={rebind ? "Switch what you’re on" : "Start a focus block"}
      kicker="Focus timer"
      description={rebind ? "The clock keeps running; only the label on the log changes." : "Each finished block goes on the study log under this subject and lecture."}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button icon={Play} onClick={go}>{rebind ? "Switch" : "Start"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select label="Working on" value={target} onChange={setTarget} options={options} />
        {!rebind ? (
          <fieldset>
            <legend className="text-sm font-medium text-fg">Rhythm</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {[...POMODORO_PRESETS, { id: "custom" as const, label: "Custom", workMin, breakMin, longBreakMin: breakMin * 3, rounds: 4 }].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={presetId === p.id}
                  onClick={() => setPresetId(p.id)}
                  className={`h-9 rounded-full px-3 text-sm transition-colors ${presetId === p.id ? "bg-fg text-bg" : "bg-surface-raised text-fg-muted hover:text-fg"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {presetId === "custom" ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-fg">Work (min)</span>
                  <input type="number" min={1} max={180} value={workMin} onChange={(e) => setWorkMin(Number(e.target.value) || 25)} className="h-10 rounded-md bg-surface px-3 shadow-1" />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-fg">Break (min)</span>
                  <input type="number" min={1} max={60} value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value) || 5)} className="h-10 rounded-md bg-surface px-3 shadow-1" />
                </label>
              </div>
            ) : null}
          </fieldset>
        ) : null}
      </div>
    </Dialog>
  );
}

/** Tiny chip for the app shell: `12:34 · Focus`. Renders nothing when idle. */
export function PomodoroChip({ onClick }: { onClick?: () => void }) {
  const state = usePomodoro();
  const now = useNow(Boolean(state));
  usePhaseRollover(state, now);
  if (!state) return null;
  const clock = pomodoroClock(state, now);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Focus timer: ${pomodoroLine(state, now)}`}
      className={`inline-flex h-8 items-center gap-2 rounded-full px-3 font-mono text-xs tabular-nums ${state.phase === "work" ? "bg-fg text-bg" : "bg-accent-subtle text-fg"}`}
    >
      <Timer aria-hidden="true" className="size-3.5" />
      {formatClock(clock.leftSec)}
    </button>
  );
}

import { useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { RevisionHealthPanel } from "@/components/planner/revision-panel.tsx";
import { BarChart, LineChart, SegmentedControl } from "@/components/ui/planner/kit.tsx";
import { Button, Card, Ring } from "@/components/ui";
import { analyticsFor } from "@inkboard/shared/planner/analytics";
import { formatClock } from "@inkboard/shared/planner/daily";
import { formatDay, todayKey } from "@inkboard/shared/planner/dates";
import { allHistoryRows, previousPeriod, rangeBounds } from "@inkboard/shared/planner/history";
import { subjectHatchClassFor, subjectMark } from "@inkboard/shared/planner/subjects";
import { readProfile } from "@inkboard/shared/planner/profile";
import { getServerSessions, liveSessions, subscribeSessions, type SessionSource } from "@inkboard/shared/planner/sessions";
import { moveTasks, skipTasks, undoLast } from "@inkboard/shared/planner/storage";
import { usePlanner } from "@inkboard/shared/planner/use-planner";
import type { StudyPlan } from "@inkboard/shared/planner/types";
import { isApplyReady, weeklyApplyDiff } from "@inkboard/shared/planner/weekly-apply";
import { HelpButton } from "@/components/help/help-button";

const SOURCE_LABEL: Record<SessionSource, string> = { watch: "Watched here", focus: "Focus blocks", manual: "Logged by hand" };

/**
 * Instruments. One headline insight, then the charts that back it:
 * minutes per day (line), weekday pattern, subject split, session length, and how the time was earned.
 */
export default function AnalyticsPage() {
  const { plan, state } = usePlanner();
  const today = todayKey();
  const hour12 = readProfile().hour12;
  const [rangeId, setRangeId] = useState<"7d" | "30d" | "90d">("30d");
  const range = rangeBounds(rangeId, today);
  const prev = previousPeriod(range.from, range.to);
  const sessions = useSyncExternalStore(subscribeSessions, liveSessions, getServerSessions);
  const rows = useMemo(() => allHistoryRows(plan, sessions), [plan, sessions]);
  const report = useMemo(
    () =>
      analyticsFor({
        plan,
        days: state.days,
        rows,
        range,
        prev,
        today,
      }),
    [plan, state.days, rows, range, prev, today],
  );
  const bySource = useMemo(() => {
    const acc: Record<SessionSource, number> = { watch: 0, focus: 0, manual: 0 };
    for (const r of rows) {
      if (r.date < range.from || r.date > range.to || r.deletedAt) continue;
      acc[r.source] += r.durationMin;
    }
    return acc;
  }, [rows, range]);
  const sourceTotal = bySource.watch + bySource.focus + bySource.manual;
  const insight = useMemo(() => {
    if (report.bestHour != null) {
      const start = formatClock(report.bestHour * 60, hour12);
      const end = formatClock((report.bestHour + 2) * 60, hour12);
      return `You study best ${start}–${end}.`;
    }
    const weak = [...report.subjectSplit].sort((a, b) => a.minutes - b.minutes)[0];
    if (weak && report.subjectSplit.length > 1 && weak.minutes < (report.subjectSplit[0]?.minutes ?? 0) / 2) {
      return `${weak.label} is falling behind.`;
    }
    if (report.revision.overdue > 0) {
      return `${report.revision.overdue} revision${report.revision.overdue === 1 ? "" : "s"} overdue.`;
    }
    return "Keep the current pace.";
  }, [report, hour12]);
  const splitMax = Math.max(1, ...report.subjectSplit.map((s) => s.minutes));
  const deltaPct = report.prevMinutes > 0 ? Math.round((report.minutesDelta / report.prevMinutes) * 100) : null;
  const quiet = report.sessions === 0 && report.minutes === 0;

  return (
    <div className="max-w-[80ch] py-6">
      <p className="flex items-center gap-1 text-xs font-semibold tracking-wide text-fg-faint uppercase">
        Instruments
        <HelpButton topic="analytics" />
      </p>
      <h1 className="chalk-draw mt-1 font-serif text-display">{insight}</h1>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm tabular text-fg-muted">
          {quiet
            ? `No study logged in the last ${rangeId.replace("d", " days")}`
            : `${report.minutes} min this range · ${report.minutesDelta >= 0 ? "+" : ""}${report.minutesDelta}${
                deltaPct != null ? ` (${deltaPct >= 0 ? "+" : ""}${deltaPct}%)` : ""
              } vs previous${report.lecturesPlanned ? ` · ${Math.round(report.completionRate * 100)}% struck` : ""}`}
        </p>
        <SegmentedControl
          ariaLabel="Range"
          value={rangeId}
          onChange={setRangeId}
          options={[
            { id: "7d", label: "7d" },
            { id: "30d", label: "30d" },
            { id: "90d", label: "90d" },
          ]}
        />
      </div>

      {quiet ? (
        <div role="status" className="mt-6 rounded-lg border border-dashed border-line p-5 text-sm text-fg-muted">
          <p className="font-serif text-lg text-fg">Nothing to measure yet.</p>
          <p className="mt-1 max-w-prose">
            Finish a class, run a focus block, or log study from the Tasks page. Completion, goal hits and session length fill in from there.
          </p>
          <Link to="/planner/today" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-fg underline-offset-2 hover:underline">
            Go to Tasks
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
      ) : null}

      {/* Figures */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure
          label="Struck"
          value={report.lecturesPlanned ? `${Math.round(report.completionRate * 100)}%` : "—"}
          ring={report.lecturesPlanned ? report.completionRate * 100 : undefined}
          hint={report.lecturesPlanned ? `${report.lecturesDone}/${report.lecturesPlanned} lectures` : "no lectures in range"}
        />
        <Figure
          label="Goal hit"
          value={quiet ? "—" : `${Math.round(report.goalHitRate * 100)}%`}
          ring={quiet ? undefined : report.goalHitRate * 100}
          hint="days at or over the daily minutes"
        />
        <Figure label="Sessions" value={String(report.sessions)} hint={quiet ? "none logged yet" : `${sourceTotal} min across sources`} />
        <Figure
          label="Late finishes"
          value={report.lecturesDone ? `${Math.round(report.procrastinationIndex * 100)}%` : "—"}
          hint="done after the planned day"
          tone={report.procrastinationIndex > 0.3 ? "warn" : undefined}
        />
      </div>

      {!quiet ? (
        <section className="mt-8 rounded-lg border border-line bg-surface p-4" aria-labelledby="week-review">
          <h2 id="week-review" className="text-xs font-semibold tracking-wide text-fg-faint uppercase">
            This week
          </h2>
          <p className="mt-2 text-sm tabular text-fg-muted">
            {report.weeklyReview.hours}h · {report.weeklyReview.done}/{report.weeklyReview.planned} tasks
            {report.weeklyReview.bestDay ? ` · best ${formatDay(report.weeklyReview.bestDay)}` : ""}
          </p>
          {report.weeklyReview.suggestion !== insight ? <p className="mt-2 text-sm text-fg">{report.weeklyReview.suggestion}</p> : null}
          {plan ? <WeeklyApplyButton plan={plan} suggestion={report.weeklyReview.suggestion} today={today} /> : null}
        </section>
      ) : null}

      {!quiet ? (
        <section className="mt-10" aria-labelledby="chart-minutes">
          <h2 id="chart-minutes" className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Minutes per day</h2>
          <div className="mt-4">
            <LineChart
              values={report.minutesPerDay.map((d) => d.minutes)}
              goal={report.minutesPerDay[0]?.goal}
              labels={report.minutesPerDay.map((d) => d.date)}
            />
          </div>
        </section>
      ) : null}

      <div className="mt-10 grid gap-10 md:grid-cols-2">
        {report.dayOfWeek.some((d) => d.minutes) ? (
          <section aria-labelledby="chart-weekday">
            <h2 id="chart-weekday" className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Weekday pattern</h2>
            <div className="mt-4">
              <BarChart values={report.dayOfWeek.map((d) => d.minutes)} labels={report.dayOfWeek.map((d) => d.day)} />
            </div>
          </section>
        ) : null}

        {report.buckets.some((b) => b.count) ? (
          <section aria-labelledby="chart-length">
            <h2 id="chart-length" className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Session length</h2>
            <div className="mt-4">
              <BarChart values={report.buckets.map((b) => b.count)} labels={report.buckets.map((b) => `${b.label} min`)} />
            </div>
          </section>
        ) : null}
      </div>

      {report.subjectSplit.length ? (
        <section className="mt-10" aria-labelledby="chart-subjects">
          <h2 id="chart-subjects" className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Subjects</h2>
          <ul className="mt-3">
            {report.subjectSplit.map((s) => (
              <li key={s.label} className="split-hatch">
                <span className={`inline-grid size-6 place-items-center ${subjectHatchClassFor(s.label)} hatch-mark`} aria-hidden="true">
                  {subjectMark(s.label)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{s.label}</span>
                <span className="bar" style={{ width: `${Math.max(8, (s.minutes / splitMax) * 40)}%` }} aria-hidden="true" />
                <span className="tabular text-xs text-fg-muted">{s.minutes}m</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sourceTotal > 0 ? (
        <section className="mt-10" aria-labelledby="chart-sources">
          <h2 id="chart-sources" className="text-xs font-semibold tracking-wide text-fg-faint uppercase">How the time was earned</h2>
          <div
            className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-surface-raised"
            role="img"
            aria-label={(["watch", "focus", "manual"] as const).map((k) => `${SOURCE_LABEL[k]} ${bySource[k]} min`).join(", ")}
          >
            <span className="bg-fg" style={{ width: `${(bySource.watch / sourceTotal) * 100}%` }} />
            <span className="bg-accent" style={{ width: `${(bySource.focus / sourceTotal) * 100}%` }} />
            <span className="bg-fg/30" style={{ width: `${(bySource.manual / sourceTotal) * 100}%` }} />
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-muted">
            {(["watch", "focus", "manual"] as const).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span aria-hidden="true" className={`inline-block size-2.5 rounded-full ${k === "watch" ? "bg-fg" : k === "focus" ? "bg-accent" : "bg-fg/30"}`} />
                {SOURCE_LABEL[k]} · <span className="tabular">{bySource[k]}m</span> · {Math.round((bySource[k] / sourceTotal) * 100)}%
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plan ? (
        <div className="mt-10">
          <a href="#revision-health" className="text-xs font-semibold tracking-wide text-fg-faint uppercase hover:text-fg">
            Revision health
          </a>
          <div className="mt-4">
            <RevisionHealthPanel plan={plan} today={today} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Figure({ label, value, hint, ring, tone }: { label: string; value: string; hint?: string; ring?: number; tone?: "warn" }) {
  return (
    <Card padded className="flex items-center gap-3">
      {ring != null ? <Ring value={ring} label={`${label} ${value}`} size={40} /> : null}
      <dl className="min-w-0">
        <dt className="text-xs text-fg-muted">{label}</dt>
        <dd className={`font-mono text-xl leading-tight tabular-nums ${tone === "warn" ? "text-warn" : "text-fg"}`}>{value}</dd>
        {hint ? <dd className="truncate text-xs text-fg-faint">{hint}</dd> : null}
      </dl>
    </Card>
  );
}

function WeeklyApplyButton({ plan, suggestion, today }: { plan: StudyPlan; suggestion: string; today: string }) {
  const apply = weeklyApplyDiff(plan, today, suggestion);
  if (!isApplyReady(apply)) return null;
  return (
    <Button
      size="sm"
      className="mt-3"
      onClick={() => {
        if (apply.kind === "skip-extra-lecture") skipTasks(plan.id, apply.taskIds);
        if (apply.kind === "move-revision-today") moveTasks(plan.id, apply.taskIds, today);
        toast.success(apply.label, { action: { label: "Undo", onClick: () => undoLast() } });
      }}
    >
      Apply
    </Button>
  );
}

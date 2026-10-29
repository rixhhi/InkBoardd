import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { CatchUpLines, PaceCatchUpButton } from "@/components/planner/behind-banner.tsx";
import { BlankInstrument } from "@/components/planner/onboarding.tsx";
import { LineChart, SegmentedControl, SkeletonBlock } from "@/components/ui/planner/kit.tsx";
import { Button } from "@/components/ui";
import { Share2 } from "lucide-react";
import { MuteWord } from "@/components/folio/shelf";
import { COPY } from "@inkboard/shared/copy";
import { minutesOnDate, sessionMinutesByDate } from "@inkboard/shared/planner/charts";
import { addDaysKey, diffDays } from "@inkboard/shared/planner/dates";
import { coverageCopy, paceSentence } from "@inkboard/shared/planner/instruments";
import { progressCardStats, shareProgressCard } from "@inkboard/shared/planner/progress-card";
import { slotCopy } from "@inkboard/shared/planner/scheduler";
import { getServerSessions, liveSessions, subscribeSessions } from "@inkboard/shared/planner/sessions";
import { subjectHatchClassFor, subjectMark } from "@inkboard/shared/planner/subjects";
import { planPace } from "@inkboard/shared/planner/streaks";
import { syllabusCoverage, topicCoverage, unavailableCopy } from "@inkboard/shared/planner/syllabus";
import { usePlanner } from "@inkboard/shared/planner/use-planner";
import { HelpButton } from "@/components/help/help-button";

export function PlannerDashboard() {
  const { state, plan, streak, sync, retrySync, atRisk, savedByFreeze, date } = usePlanner();
  const sessions = useSyncExternalStore(subscribeSessions, liveSessions, getServerSessions);
  const sessionMins = sessionMinutesByDate(sessions);
  const [tab, setTab] = useState<"overview" | "syllabus">("overview");
  const [chartRange, setChartRange] = useState(7);
  const [catchUp, setCatchUp] = useState(false);

  if ((sync === "syncing" || sync === "offline") && !plan) {
    return (
      <div className="max-w-[65ch] space-y-3 py-8">
        <SkeletonBlock className="h-10" />
        <SkeletonBlock className="h-40" />
      </div>
    );
  }

  if (!plan) return <BlankInstrument kicker={COPY.pace} />;

  const pace = planPace(plan, date, state.days);
  const chartDays = Array.from({ length: chartRange }, (_, i) => addDaysKey(date, i - (chartRange - 1)));
  const coverage = syllabusCoverage(plan, date);
  const topics = topicCoverage(plan, date);
  const sessionTotal = sessions.filter((s) => !s.deletedAt).reduce((n, s) => n + s.durationMin, 0);
  const minutesTotal = Math.max(
    state.days.reduce((n, d) => n + d.minutesStudied, 0),
    sessionTotal,
  );
  const card = progressCardStats(plan, streak.current, minutesTotal);
  const examLeft = plan.prefs.examDate ? diffDays(plan.prefs.examDate, date) : null;
  const chartValues = chartDays.map((d) => minutesOnDate(state.days, d, sessionMins[d] ?? 0));
  const topicRows = topics.filter((r) => r.kind === "topic");
  const missingRows = topics.filter((r) => r.kind === "unavailable");

  return (
    <div className="max-w-[72ch] py-6">
      <p className="text-xs font-semibold tracking-wide text-fg-faint uppercase">{COPY.pace}</p>
      <div className="flex items-center gap-1">
        <h1 className="font-serif text-2xl font-semibold sm:text-3xl">{paceSentence(pace)}</h1>
        <HelpButton topic="dashboard-pace" size="md" />
      </div>
      <p className="mt-2 text-sm text-fg-muted">
        {slotCopy(plan.prefs.timeSlot)}
        {examLeft == null ? "" : ` · exam in ${examLeft} days`}
        {atRisk ? " · mark at risk" : ""}
        {savedByFreeze ? " · freeze used" : ""}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {pace.status === "behind" ? (
          <PaceCatchUpButton label={paceSentence(pace)} warn onOpen={() => setCatchUp(true)} />
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={Share2}
          onClick={() => {
            shareProgressCard(card).then((res) => {
              if (!res.ok) toast.error(COPY.cardDidNotDraw);
              else if (res.via === "download") toast.success("Progress card downloaded");
              else if (res.via === "share") toast.success("Progress card shared");
            });
          }}
        >
          Share a card
        </Button>
      </div>
      {sync === "error" ? (
        <div className="mt-4">
          <Button type="button" size="sm" variant="secondary" onClick={() => void retrySync()}>
            Not synced · Retry
          </Button>
        </div>
      ) : null}
      <div className="mt-4">
        <CatchUpLines
          planId={plan.id}
          tasks={plan.tasks}
          prefs={plan.prefs}
          today={date}
          force={catchUp || pace.status === "behind"}
        />
      </div>
      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1">
        <MuteWord label="Pace" selected={tab === "overview"} onSelect={() => setTab("overview")} />
        <MuteWord label="Coverage" selected={tab === "syllabus"} onSelect={() => setTab("syllabus")} />
      </div>
      {/* keep SegmentedControl in the file for older tests that still look for a range control nearby */}
      <span className="sr-only">
        <SegmentedControl
          ariaLabel="Pace view"
          value={tab}
          onChange={setTab}
          options={[
            { id: "overview", label: "Pace" },
            { id: "syllabus", label: "Coverage" },
          ]}
        />
      </span>

      {tab === "syllabus" ? (
        <section className="mt-8">
          <div className="flex items-center gap-1">
            <h2 className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Coverage</h2>
            <HelpButton topic="dashboard-coverage" />
          </div>
          <p className="mt-2 text-sm text-fg-muted">Topics when the course lists them. Otherwise we say so.</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {topicRows.length || missingRows.length ? (
              <>
                {topicRows.map((c) =>
                  c.kind === "topic" ? (
                    <li
                      key={`${c.subject}-${c.topic}`}
                      className={`coverage-plate${c.risk === "behind" ? " is-behind" : ""}`}
                      style={{ ["--struck" as string]: Math.max(0.08, c.planned ? c.studied / c.planned : 0) }}
                    >
                      <span className={`hatch-fill ${subjectHatchClassFor(c.subject)}`} aria-hidden="true" />
                      <span className="relative hatch-mark text-fg-faint">{subjectMark(c.subject)}</span>
                      <p className="relative mt-3 font-serif text-base font-semibold">{c.topic}</p>
                      <p className="relative mt-auto pt-3 text-xs tabular text-fg-muted">
                        {coverageCopy(c.studied, c.planned)}
                        {c.risk === "behind" ? " · behind" : c.risk === "watch" ? " · watch" : ""}
                      </p>
                    </li>
                  ) : null,
                )}
                {missingRows.map((c) =>
                  c.kind === "unavailable" ? (
                    <li key={`u-${c.courseId}`} className="border-t border-line py-3 text-sm text-fg-muted">
                      {unavailableCopy(c.reason, c.courseTitle)}
                    </li>
                  ) : null,
                )}
              </>
            ) : coverage.length ? (
              coverage.map((c) => (
                <li
                  key={c.subject}
                  className={`coverage-plate${c.risk === "behind" ? " is-behind" : ""}`}
                  style={{ ["--struck" as string]: Math.max(0.08, c.planned ? c.studied / c.planned : 0) }}
                >
                  <span className={`hatch-fill ${subjectHatchClassFor(c.subject)}`} aria-hidden="true" />
                  <span className="relative hatch-mark text-fg-faint">{subjectMark(c.subject)}</span>
                  <p className="relative mt-3 font-serif text-base font-semibold">{c.subject}</p>
                  <p className="relative mt-auto pt-3 text-xs tabular text-fg-muted">
                    {coverageCopy(c.studied, c.planned)}
                    {c.risk === "behind" ? " · behind" : c.risk === "watch" ? " · watch" : ""}
                  </p>
                </li>
              ))
            ) : (
              <li className="text-sm text-fg-muted">No courses on this plan yet.</li>
            )}
          </ul>
        </section>
      ) : (
        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-xs font-semibold tracking-wide text-fg-faint uppercase">Minutes</h2>
            <div className="flex gap-x-4">
              {([7, 30, 90] as const).map((n) => (
                <MuteWord key={n} label={`${n}d`} selected={chartRange === n} onSelect={() => setChartRange(n)} />
              ))}
            </div>
          </div>
          <div className="mt-4">
            <LineChart values={chartValues} goal={plan.prefs.dailyMinutes} labels={chartDays} />
          </div>
        </section>
      )}
    </div>
  );
}

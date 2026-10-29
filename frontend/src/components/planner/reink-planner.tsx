/**
 * Ink -> Tasks bridge. "Re-ink the N most faded before <deadline>" as one
 * action: preview exactly which lessons land on which days, then add them to
 * the plan as revision tasks. Math in @inkboard/shared/planner/ink.
 */
import { useMemo, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { addDaysKey, diffDays, formatDay } from "@inkboard/shared/planner/dates";
import { planReinks, type InkItem, type ReinkDraft } from "@inkboard/shared/planner/ink";
import { liveTasks, type StudyPlan } from "@inkboard/shared/planner/types";
import { Button } from "@/components/ui";
import { Segmented } from "@/components/ui/controls";
import { SubjectDot } from "@/components/ui/planner/kit.tsx";

type Horizon = "week" | "fortnight" | "exam";

export function ReinkPlanner({ plan, items, today, onSchedule }: { plan: StudyPlan; items: InkItem[]; today: string; onSchedule: (drafts: ReinkDraft[]) => void }) {
  const examDate = plan.prefs.examDate;
  const examDays = examDate ? diffDays(examDate, today) : null;
  const horizons: { value: Horizon; label: string; until: string }[] = [
    { value: "week", label: "This week", until: addDaysKey(today, 6) },
    { value: "fortnight", label: "Two weeks", until: addDaysKey(today, 13) },
    ...(examDate && examDays != null && examDays > 0 ? [{ value: "exam" as const, label: "By the exam", until: examDate }] : []),
  ];
  const [horizon, setHorizon] = useState<Horizon>(horizons[horizons.length - 1]!.value);
  const [count, setCount] = useState<"3" | "5" | "8">("5");
  const until = horizons.find((h) => h.value === horizon)?.until ?? horizons[0]!.until;
  const alreadyPlanned = useMemo(
    () =>
      liveTasks(plan.tasks)
        .filter((t) => t.type === "revision" && t.status === "pending" && t.date >= today && t.date <= until)
        .flatMap((t) => (t.refLessonIds?.length ? t.refLessonIds : t.lessonId ? [t.lessonId] : [])),
    [plan.tasks, today, until],
  );
  const drafts = useMemo(() => planReinks(items, { from: today, until, prefs: plan.prefs, limit: Number(count), alreadyPlanned }), [items, today, until, plan.prefs, count, alreadyPlanned]);
  const byDay = useMemo(() => {
    const m = new Map<string, ReinkDraft[]>();
    for (const d of drafts) m.set(d.date, [...(m.get(d.date) ?? []), d]);
    return [...m.entries()];
  }, [drafts]);
  const minutes = drafts.reduce((n, d) => n + d.durationMin, 0);

  return (
    <section className="reink-planner" aria-labelledby="reink-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="reink-title" className="font-serif text-base font-semibold text-fg">
            Put the fading ones on the calendar
          </h2>
          <p className="mt-1 max-w-prose text-sm text-fg-muted">Picks what will have faded by the deadline, worst first, and spreads it over your study days as short re-ink reviews.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Deadline" hideLabel size="sm" value={horizon} onChange={setHorizon} options={horizons.map((h) => ({ value: h.value, label: h.label }))} />
          <Segmented label="How many lessons" hideLabel size="sm" value={count} onChange={setCount} options={[{ value: "3", label: "3" }, { value: "5", label: "5" }, { value: "8", label: "8" }]} />
        </div>
      </div>

      {drafts.length ? (
        <>
          <ol className="reink-days mt-4" aria-label="Proposed re-ink schedule">
            {byDay.map(([date, list]) => (
              <li key={date} className="reink-day">
                <p className="reink-day-head tabular">
                  <span className="font-medium text-fg">{date === today ? "Today" : date === addDaysKey(today, 1) ? "Tomorrow" : formatDay(date, "EEE d MMM")}</span>
                  <span className="text-fg-faint"> · {list.reduce((n, d) => n + d.durationMin, 0)} min</span>
                </p>
                <ul className="mt-1 grid gap-1">
                  {list.map((d) => (
                    <li key={d.lessonId} className="flex min-w-0 items-center gap-2 text-sm">
                      <SubjectDot subject={d.subject} />
                      <span className="min-w-0 flex-1 truncate text-fg">{d.title}</span>
                      <span className="shrink-0 text-xs text-fg-muted tabular">{Math.round(d.retentionAtUntil * 100)}% left</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-fg-muted">
              {drafts.length} {drafts.length === 1 ? "lesson" : "lessons"} · {minutes} min total · lands on Today and the calendar like any other review
            </p>
            <Button icon={CalendarPlus} onClick={() => onSchedule(drafts)}>
              Add {drafts.length} to my plan
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-fg-muted">
          {alreadyPlanned.length ? "Everything that fades by then already has a review scheduled." : `Nothing will have faded below crisp by ${formatDay(until)}.`}
        </p>
      )}
    </section>
  );
}

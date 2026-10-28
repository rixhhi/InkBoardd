import { CalendarCheck, Check, ChevronLeft, Clock3, ListChecks, Repeat } from "lucide-react";
import type { GenerateResult, PlannerPrefs, PlanTask } from "@inkboard/shared/planner/types";
import { slotCopy } from "@inkboard/shared/planner/scheduler";
import { dailyPreviewCopy, sampleDays } from "@inkboard/shared/planner/wizard";
import { Button, EmptyState, Surface } from "@/components/ui";
import { StatTile } from "@/components/admin/bits";

export function WizardSampleWeek({ tasks, compact }: { tasks: PlanTask[]; compact?: boolean }) {
  const days = sampleDays(tasks, 7);
  if (!days.length) return null;
  return (
    <ol className={`m-0 mt-3 grid list-none p-0 ${compact ? "gap-2" : "gap-3 sm:grid-cols-2"}`}>
      {days.map((d) => (
        <li key={d.date} className="rounded-md bg-surface-raised/60 px-3 py-2">
          <p className="text-xs font-semibold tracking-[0.1em] text-fg-muted uppercase">{d.label}</p>
          <ul className="m-0 mt-1 list-none p-0">
            {d.items.slice(0, compact ? 3 : 5).map((item, i) => (
              <li key={`${d.date}-${i}`} className="truncate py-0.5 text-sm text-fg">
                {item.title}
              </li>
            ))}
            {d.items.length > (compact ? 3 : 5) ? <li className="py-0.5 text-xs text-fg-muted">+{d.items.length - (compact ? 3 : 5)} more</li> : null}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/** Step 4: what the plan looks like before it's created. */
export function WizardPreview({ preview, prefs, onBack, onCreate }: { preview: GenerateResult; prefs: PlannerPrefs; onBack: () => void; onCreate: () => void }) {
  if (preview.summary.lessonCount === 0) {
    return (
      <div className="grid gap-4">
        <EmptyState title="Nothing to schedule" body={preview.summary.warning ?? "Pick courses that already have replays."} />
        <div>
          <Button type="button" variant="ghost" icon={ChevronLeft} onClick={onBack}>
            Pace
          </Button>
        </div>
      </div>
    );
  }
  const s = preview.summary;
  const fits = s.examDate ? s.fitsBeforeExam : null;

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="font-serif text-xl text-fg sm:text-2xl">{dailyPreviewCopy(preview, prefs)}</h2>
        <p className="mt-1 text-sm text-fg-muted">{slotCopy(prefs.timeSlot)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Classes" value={s.lessonCount} icon={ListChecks} />
        <StatTile label="Revision" value={s.revisionCount ?? 0} hint="sessions" icon={Repeat} />
        <StatTile label="Total" value={`${s.totalHours}h`} icon={Clock3} />
        <StatTile label="Finishes" value={s.finishDate ? s.finishDate.slice(5) : "—"} hint={s.finishDate ?? undefined} icon={CalendarCheck} />
      </div>
      {fits === true ? (
        <p role="status" className="rounded-md bg-ok-subtle px-3 py-2 text-sm text-fg">
          Fits before your exam on {s.examDate}.
        </p>
      ) : fits === false ? (
        <p role="status" className="rounded-md bg-warn-subtle px-3 py-2 text-sm text-fg">
          Runs past your exam on {s.examDate}. {s.warning ?? "Go back to Pace to speed up or drop a course."}
        </p>
      ) : null}
      <Surface>
        <p className="text-xs font-semibold tracking-[0.12em] text-fg-muted uppercase">First week</p>
        <WizardSampleWeek tasks={preview.tasks} />
      </Surface>
      <div className="sticky bottom-[calc(var(--tabbar-h,0px)+0.5rem)] z-10 flex items-center justify-between gap-3 rounded-lg bg-surface/95 p-3 shadow-2 backdrop-blur md:bottom-3">
        <Button type="button" variant="ghost" icon={ChevronLeft} onClick={onBack}>
          Pace
        </Button>
        <Button type="button" disabled={!preview.tasks.length} icon={Check} onClick={onCreate}>
          Create plan
        </Button>
      </div>
    </div>
  );
}

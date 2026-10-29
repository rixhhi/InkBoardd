import { useMemo } from "react";
import { toast } from "sonner";
import { FadingInk } from "@/components/planner/fading-ink";
import { PlannerCard } from "@/components/ui/planner/kit.tsx";
import { inkItems } from "@inkboard/shared/planner/ink";
import { reinkLesson, undoLast } from "@inkboard/shared/planner/storage";
import { usePlanner } from "@inkboard/shared/planner/use-planner";

/**
 * Ink. Your memory of every studied lesson, drawn as ink that fades at the
 * rate your revision schedule expects. Scrub forward to see exam day.
 */
export default function InkPage() {
  const { plan, state, date } = usePlanner();
  const items = useMemo(() => (plan ? inkItems(plan, state.watchLogs) : []), [plan, state.watchLogs]);
  if (!plan) {
    return (
      <PlannerCard>
        <h2 className="font-serif text-base font-semibold">No plan yet</h2>
        <p className="mt-1 text-sm text-fg-muted">Make a study plan and this board fills in as you watch classes and rate reviews.</p>
      </PlannerCard>
    );
  }
  return (
    <div className="grid gap-4">
      <header className="min-w-0">
        <h1 className="font-serif text-2xl text-fg">Ink</h1>
        <p className="mt-1 max-w-prose text-sm text-fg-muted">What you studied, drawn as ink. It fades at the rate your review schedule expects, so you can see what to re-ink before the exam.</p>
      </header>
      <PlannerCard>
        <FadingInk
          items={items}
          today={date}
          examDate={plan.prefs.examDate}
          onReink={(item, rating) => {
            reinkLesson(plan.id, item.lessonId, rating, item.title);
            toast.success(`Re-inked “${item.title}” · ${rating}`, { action: { label: "Undo", onClick: () => undoLast() } });
          }}
        />
      </PlannerCard>
    </div>
  );
}

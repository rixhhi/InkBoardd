import { useMemo } from "react";
import { toast } from "sonner";
import { FadingInk } from "@/components/planner/fading-ink";
import { ReinkPlanner } from "@/components/planner/reink-planner";
import { HelpButton } from "@/components/help/help-button";
import { PlannerCard } from "@/components/ui/planner/kit.tsx";
import { inkItems } from "@inkboard/shared/planner/ink";
import { reinkLesson, scheduleReinks, undoLast } from "@inkboard/shared/planner/storage";
import { usePlanner } from "@inkboard/shared/planner/use-planner";

/**
 * Ink. Your memory of every studied lesson, drawn as ink that fades at the
 * rate your revision schedule expects. Scrub forward to see exam day.
 */
export default function InkPage() {
  const { plan, state, date } = usePlanner();
  const items = useMemo(() => (plan ? inkItems(plan, state.watchLogs) : []), [plan, state.watchLogs]);
  // The title and its "?" stay on the page with or without a plan. A new member
  // landing here is the person most in need of the explanation; hiding the help
  // behind "make a plan first" left them with an empty card and no way to ask.
  const header = (
    <header className="min-w-0">
      <div className="flex items-center gap-1">
        <h1 className="font-serif text-2xl text-fg">Ink</h1>
        <HelpButton topic="ink" size="md" />
      </div>
      <p className="mt-1 max-w-prose text-sm text-fg-muted">What you studied, drawn as ink. It fades at the rate your review schedule expects, so you can see what to re-ink before the exam.</p>
    </header>
  );
  if (!plan) {
    return (
      <div className="grid gap-4">
        {header}
        <PlannerCard>
          <h2 className="font-serif text-base font-semibold">No plan yet</h2>
          <p className="mt-1 text-sm text-fg-muted">Make a study plan and this board fills in as you watch classes and rate reviews.</p>
        </PlannerCard>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {header}
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
      {items.length ? (
        <PlannerCard>
          <ReinkPlanner
            plan={plan}
            items={items}
            today={date}
            onSchedule={(drafts) => {
              const n = scheduleReinks(plan.id, drafts);
              if (!n) {
                toast.message("Those lessons are already on the calendar.");
                return;
              }
              toast.success(`${n} re-ink ${n === 1 ? "review" : "reviews"} added to your plan`, { action: { label: "Undo", onClick: () => undoLast() } });
            }}
          />
        </PlannerCard>
      ) : null}
    </div>
  );
}

import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarPlus, Search } from "lucide-react";
import { openCommandPalette } from "@inkboard/shared/command-palette";
import { COPY } from "@inkboard/shared/copy";
import { useSelectedExam } from "@inkboard/shared/exam-pref";
import { FIRST_SITTING } from "@inkboard/shared/planner/day-board";

export function PlannerOnboarding({ skipHref = "/planner/new" }: { skipHref?: "/planner/new" }) {
  void skipHref;
  const exam = useSelectedExam();
  const nav = useNavigate();

  function writeClass() {
    if (exam) {
      void nav({ to: "/exam/$goalId", params: { goalId: exam.id } });
    } else {
      void nav({ to: "/" });
    }
    openCommandPalette();
  }

  return (
    <div className="max-w-[65ch] py-10">
      <h1 className="font-serif text-display">{FIRST_SITTING.title}</h1>
      <p className="mt-3 text-base text-fg-muted">
        The planner turns courses into a daily list, keeps your streak, and counts focus time. Start with a plan, or add one class to today.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link
          to="/planner/new"
          className="group flex min-h-24 items-start gap-3 rounded-lg bg-surface p-4 shadow-1 transition-shadow hover:shadow-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg">
            <CalendarPlus className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-medium text-fg">{COPY.layOutAPlan}</span>
            <span className="mt-0.5 block text-sm text-fg-muted">Pick an exam, courses and a pace. Takes a minute.</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={writeClass}
          className="group flex min-h-24 items-start gap-3 rounded-lg bg-surface p-4 text-left shadow-1 transition-shadow hover:shadow-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-subtle text-accent">
            <Search className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-medium text-fg">{COPY.writeAClassFromWall}</span>
            <span className="mt-0.5 block text-sm text-fg-muted">Open a class and use “Add to plan”, suggested for {FIRST_SITTING.clock}.</span>
          </span>
        </button>
      </div>
    </div>
  );
}

/** Empty month / pace: one inscription, not a second first sitting. */
export function BlankInstrument({ kicker }: { kicker: string }) {
  return (
    <div className="max-w-[65ch] py-10">
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">{kicker}</p>
      <h1 className="chalk-draw mt-2 font-serif text-display">{COPY.boardBlank}</h1>
      <Link to="/planner/new" className="mt-6 inline-flex h-11 items-center text-sm font-semibold text-accent">
        {COPY.layOutAPlan}
      </Link>
    </div>
  );
}

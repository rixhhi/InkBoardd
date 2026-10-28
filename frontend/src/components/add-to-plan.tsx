import { Link } from "@tanstack/react-router";
import { useSelectedExam } from "@inkboard/shared/exam-pref";
import { COPY } from "@inkboard/shared/copy";
import { todayKey } from "@inkboard/shared/planner/dates";
import { activePlan, addCustomTask } from "@inkboard/shared/planner/storage";
import { usePlannerSelector } from "@inkboard/shared/planner/use-planner";

export function AddToPlanButton({
  examId,
  teacher,
  course,
  label = "Add to plan",
  className,
}: {
  examId?: string;
  teacher?: string;
  course?: string;
  label?: string;
  className?: string;
}) {
  const selected = useSelectedExam();
  const exam = examId || selected?.id;
  return (
    <Link
      to="/planner/new"
      search={{ exam, teacher, course }}
      className={className ?? "inline-flex h-11 items-center text-sm font-semibold text-accent"}
    >
      {label}
    </Link>
  );
}

/** Sit a catalog test as a mock on the Day Board. No quiz player. */
export function AddTestToPlan({
  title,
  minutes,
  date,
}: {
  title: string;
  minutes: number;
  date?: string;
}) {
  const plan = usePlannerSelector((s) => activePlan(s));
  const exam = useSelectedExam();
  if (!plan) {
    return (
      <Link to="/planner/new" search={{ exam: exam?.id }} className="text-sm text-accent">
        {COPY.layOutAPlan}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="text-sm text-accent"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        addCustomTask(plan.id, {
          title,
          date: date || todayKey(),
          durationMin: Math.max(20, minutes),
          type: "custom",
          eventKind: "mock",
        });
      }}
    >
      {COPY.sitThisTest}
    </button>
  );
}

/** Put a DPP on Today. Does not open Unacademy's quiz. */
export function AddPracticeToPlan({
  title,
  questions,
}: {
  title: string;
  questions: number;
}) {
  const plan = usePlannerSelector((s) => activePlan(s));
  const exam = useSelectedExam();
  if (!plan) {
    return (
      <Link to="/planner/new" search={{ exam: exam?.id }} className="text-sm text-accent">
        {COPY.layOutAPlan}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="text-sm text-accent"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        addCustomTask(plan.id, {
          title,
          date: todayKey(),
          durationMin: Math.max(15, Math.min(90, questions || 20)),
          type: "dpp",
          eventKind: "pyq",
        });
      }}
    >
      {COPY.doTheseQuestions}
    </button>
  );
}

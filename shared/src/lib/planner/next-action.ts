import { lectureHref } from "../local-search.ts";

export type NextAction = {
  kind: "catch-up" | "resume" | "start" | "rest";
  label: string;
  href: string;
};

/** One next step: missed work, then the lecture already started, then the next class. */
export function nextAction(input: {
  overdue: number;
  pending: { title: string; lessonId: string | null }[];
  resume: { title: string; lessonId: string; seconds: number } | null;
}): NextAction {
  if (input.overdue > 0) {
    const count = input.overdue;
    return {
      kind: "catch-up",
      label: count === 1 ? "Move 1 missed class to today" : `Move ${count} missed classes to today`,
      href: "/planner/today",
    };
  }
  const next = input.pending.find((task) => task.title.trim());
  if (input.resume && next?.lessonId && input.resume.lessonId === next.lessonId && input.resume.seconds > 0) {
    return {
      kind: "resume",
      label: `Resume ${input.resume.title || next.title}`,
      href: lectureHref(input.resume.lessonId, input.resume.seconds),
    };
  }
  if (next?.lessonId) return { kind: "start", label: `Start ${next.title}`, href: lectureHref(next.lessonId, 0) };
  if (next) return { kind: "start", label: `Start ${next.title}`, href: "/planner/today" };
  return { kind: "rest", label: "Nothing left today", href: "/planner/today" };
}

import { COPY } from "../copy.ts";
import { formatRemain } from "@inkboard/shared/folio";
import { startFocusRun } from "@inkboard/shared/planner/focus";
import type { PlanTask, TimeSlot } from "@inkboard/shared/planner/types";

export const EMPTY_BOARD = {
  title: COPY.boardBlank,
  action: COPY.layOutAPlan,
} as const;

/** First sitting: two lines, not a product tour. */
export const FIRST_SITTING = {
  title: COPY.boardBlank,
  clock: "18:00",
  write: COPY.writeAClassFromWall,
  plan: COPY.layOutAPlan,
} as const;

export function slotCaption(slot: TimeSlot): string {
  return slot;
}

export function dayRemainCopy(pending: number, minutes: number): string {
  if (pending <= 0) return "Board clear";
  return `${pending} left · ${formatRemain(minutes)}`;
}

export function chalkDust(minutes: number, goal: number): number {
  if (minutes <= 0) return 0;
  return Math.min(1, minutes / Math.max(goal, 30));
}

export function studiedMinutesForDay(
  date: string,
  sessions: { date: string; durationMin: number; deletedAt?: string | null }[],
  tasks: { date: string; status: string; durationMin: number }[],
): number {
  const logged = sessions
    .filter((s) => s.date === date && !s.deletedAt)
    .reduce((n, s) => n + s.durationMin, 0);
  if (logged > 0) return logged;
  return tasks.filter((t) => t.date === date && t.status === "done").reduce((n, t) => n + t.durationMin, 0);
}

export function historyDayLine(label: string, minutes: number, struck: number): string {
  const mark = struck === 1 ? "1 struck" : `${struck} struck`;
  return `${label} · ${formatRemain(minutes)} · ${mark}`;
}

export function openBoardSession(planId: string, pending: PlanTask[]) {
  const playable = pending.filter((t) => t.status === "pending" && t.lessonId);
  const first = playable[0];
  if (!first?.lessonId) return null;
  startFocusRun(planId, playable);
  return {
    lessonId: first.lessonId,
    title: first.title,
    teacher: first.teacher,
    course: first.courseId ?? undefined,
    count: playable.length,
  };
}

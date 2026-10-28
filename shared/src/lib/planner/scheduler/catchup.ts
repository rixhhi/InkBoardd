import { addDaysKey, compareKeys, diffDays, weekdayOf } from "../dates.ts";
import { fillPrefs, type PlanDiff, type PlannerPrefs, type PlanTask, type RescheduleStrategy } from "../types.ts";
import { isWorkDay, nextStudySessionDay, nextWorkDay } from "./days.ts";

const MAX_DAYS = 2500;

function snapToWorkDay(prefs: PlannerPrefs, date: string): string {
  return nextWorkDay(prefs, date, true);
}

export function lectureCountOn(tasks: PlanTask[], date: string): number {
  return tasks.filter((t) => t.date === date && t.type === "lesson" && t.status === "pending").length;
}

export function rescheduleOverdue(
  tasks: PlanTask[],
  prefs: PlannerPrefs,
  today: string,
  strategy: RescheduleStrategy = "spread",
): PlanTask[] {
  const p = fillPrefs(prefs);
  const overdue = tasks.filter((t) => t.status === "pending" && t.date < today && !t.deletedAt);
  if (!overdue.length) return tasks.map((t) => ({ ...t }));

  if (strategy === "skip") {
    return tasks.map((t) =>
      t.status === "pending" && t.date < today && !t.deletedAt ? { ...t, status: "skipped" as const } : { ...t },
    );
  }

  if (strategy === "push") {
    const earliest = overdue.reduce((a, t) => (t.date < a ? t.date : a), overdue[0]!.date);
    const shift = Math.max(1, diffDays(today, earliest));
    return tasks.map((t) => {
      if (t.status !== "pending" || t.deletedAt) return { ...t };
      const moved = snapToWorkDay(p, addDaysKey(t.date, shift));
      if (moved === t.date) return { ...t };
      return { ...t, date: moved, rescheduledCount: t.rescheduledCount + 1 };
    });
  }

  const remaining = tasks
    .filter((t) => t.status === "pending" && t.date >= today && !t.deletedAt)
    .sort((a, b) => compareKeys(a.date, b.date) || a.orderIdx - b.orderIdx);
  const usedMin = new Map<string, number>();
  const usedLectures = new Map<string, number>();
  for (const t of remaining) {
    usedMin.set(t.date, (usedMin.get(t.date) ?? 0) + t.durationMin);
    if (t.type === "lesson") usedLectures.set(t.date, (usedLectures.get(t.date) ?? 0) + 1);
  }

  const studyIndex = new Map<string, number>();
  {
    let k = nextStudySessionDay(p, today, true);
    for (let i = 0; i < 400; i += 1) {
      studyIndex.set(k, i);
      k = nextStudySessionDay(p, k, false);
    }
  }

  const maxLecturesOn = (date: string) => {
    const idx = studyIndex.get(date) ?? 99;
    const base = p.lecturesPerDay;
    const cap = idx < 3 ? Math.min(base + 1, p.hardMaxLecturesPerDay) : Math.min(base, p.hardMaxLecturesPerDay);
    return cap;
  };

  const pickDate = (task: PlanTask, from: string): string => {
    if (p.catchUpDay != null && task.type !== "lesson") {
      let k = from;
      for (let i = 0; i < 45; i += 1) {
        if (weekdayOf(k) === p.catchUpDay && isWorkDay(p, k)) return k;
        k = addDaysKey(k, 1);
      }
    }
    let date = nextStudySessionDay(p, from, true);
    for (let hops = 0; hops < MAX_DAYS; hops += 1) {
      const lectures = usedLectures.get(date) ?? 0;
      const filled = usedMin.get(date) ?? 0;
      const lectureOk = task.type !== "lesson" || lectures < maxLecturesOn(date);
      const minutesOk = filled === 0 || filled + task.durationMin <= p.maxNewMinutesPerDay;
      if (lessonOk(task, lectureOk, minutesOk, lectures)) return date;
      date = nextStudySessionDay(p, date, false);
    }
    return date;
  };

  function lessonOk(task: PlanTask, lectureOk: boolean, minutesOk: boolean, lectures: number) {
    if (task.type !== "lesson") return minutesOk || lectures === 0;
    if (!lectureOk) return false;
    if (minutesOk) return true;
    return lectures === 0;
  }

  const placed: PlanTask[] = [];
  let cursor = today;
  for (const task of [...overdue].sort((a, b) => a.orderIdx - b.orderIdx || compareKeys(a.date, b.date))) {
    const date = pickDate(task, cursor);
    usedMin.set(date, (usedMin.get(date) ?? 0) + task.durationMin);
    if (task.type === "lesson") usedLectures.set(date, (usedLectures.get(date) ?? 0) + 1);
    placed.push({ ...task, date, rescheduledCount: task.rescheduledCount + 1, status: "pending" });
    cursor = date;
  }

  const doneSkipped = tasks.filter((t) => t.status !== "pending" || t.deletedAt);
  return [...doneSkipped, ...placed, ...remaining.map((t) => ({ ...t }))].sort(
    (a, b) => compareKeys(a.date, b.date) || a.orderIdx - b.orderIdx,
  );
}

function finishOf(tasks: PlanTask[]): string | null {
  if (!tasks.length) return null;
  return tasks.reduce((a, t) => (t.date > a ? t.date : a), tasks[0]!.date);
}

export function diffTasks(before: PlanTask[], after: PlanTask[]): PlanDiff {
  const prev = new Map(before.map((t) => [t.id, t]));
  const next = new Map(after.map((t) => [t.id, t]));
  let moved = 0;
  let skipped = 0;
  let added = 0;
  let removed = 0;
  for (const t of after) {
    const old = prev.get(t.id);
    if (!old) added += 1;
    else if (old.date !== t.date) moved += 1;
    else if (old.status !== "skipped" && t.status === "skipped") skipped += 1;
  }
  for (const t of before) if (!next.has(t.id) && t.status === "pending") removed += 1;
  return {
    moved,
    skipped,
    added,
    removed,
    finishBefore: finishOf(before),
    finishAfter: finishOf(after),
  };
}

export function previewReschedule(
  tasks: PlanTask[],
  prefs: PlannerPrefs,
  today: string,
  strategy: RescheduleStrategy,
): { tasks: PlanTask[]; diff: PlanDiff } {
  const next = rescheduleOverdue(tasks, prefs, today, strategy);
  return { tasks: next, diff: diffTasks(tasks, next) };
}

export function describeDiff(diff: PlanDiff): string {
  const bits: string[] = [];
  if (diff.moved) bits.push(`${diff.moved} task${diff.moved === 1 ? "" : "s"} move`);
  if (diff.skipped) bits.push(`${diff.skipped} skipped`);
  if (diff.added) bits.push(`${diff.added} added`);
  if (diff.removed) bits.push(`${diff.removed} dropped`);
  if (diff.finishBefore && diff.finishAfter && diff.finishBefore !== diff.finishAfter) {
    bits.push(`finish ${diff.finishBefore} → ${diff.finishAfter}`);
  }
  return bits.length ? bits.join(", ") : "No changes";
}

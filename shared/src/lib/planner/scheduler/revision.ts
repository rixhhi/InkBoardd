import { addDaysKey, compareKeys } from "../dates.ts";
import { fillTask, type LessonReviewState, type PlannerPrefs, type PlanTask } from "../types.ts";
import { nextStudySessionDay } from "./days.ts";

export function revisionTask(titles: string[], lessonIds: string[], minutes: number, id: () => string): PlanTask {
  const recap = titles.slice(0, 3).join(", ");
  const more = titles.length > 3 ? "…" : "";
  return fillTask({
    id: id(),
    type: "revision",
    title: titles.length ? `Revise: ${recap}${more}` : "Revision",
    durationMin: minutes,
    refLessonIds: lessonIds,
  });
}

export function revisionMinutes(prefs: PlannerPrefs, newMinutes: number, itemCount: number): number {
  const share = Math.round(newMinutes * prefs.revisionShare);
  const byCount = itemCount * 8;
  return Math.min(30, Math.max(10, share || byCount || 15));
}

type PendingReview = { lessonId: string; title: string; due: string; origin: string; interval: number; lectureDate: string };

function snapReviewDate(prefs: PlannerPrefs, date: string): string {
  return nextStudySessionDay(prefs, date, true);
}

function scheduleReviews(lectureDate: string, lessonId: string, title: string, prefs: PlannerPrefs): PendingReview[] {
  const out: PendingReview[] = [];
  for (const interval of prefs.revisionIntervals) {
    const raw = addDaysKey(lectureDate, interval);
    const due = snapReviewDate(prefs, raw);
    if (due <= lectureDate) continue;
    out.push({ lessonId, title, due, origin: due, interval, lectureDate });
  }
  return out;
}

function twoIntervalsLate(review: PendingReview, date: string): boolean {
  const limit = addDaysKey(review.origin, review.interval * 2);
  return date > limit;
}

export function placeReviews(
  prefs: PlannerPrefs,
  lectureTasks: PlanTask[],
  id: () => string,
): { tasks: PlanTask[]; reviews: LessonReviewState[] } {
  if (!prefs.includeRevision) return { tasks: [], reviews: [] };
  const pending: PendingReview[] = [];
  const reviews: LessonReviewState[] = [];
  for (const t of lectureTasks) {
    if (!t.lessonId) continue;
    const scheduled = scheduleReviews(t.date, t.lessonId, t.title, prefs);
    pending.push(...scheduled);
    reviews.push({
      lessonId: t.lessonId,
      stage: 0,
      dueDate: scheduled[0]?.due ?? null,
      lastRating: null,
      lectureDate: t.date,
      lectureCompletedOn: null,
    });
  }

  pending.sort(
    (a, b) =>
      compareKeys(a.lectureDate, b.lectureDate) || compareKeys(a.due, b.due) || a.lessonId.localeCompare(b.lessonId),
  );
  const minutesByDate = new Map<string, number>();
  for (const t of lectureTasks) {
    if (t.type === "lesson") minutesByDate.set(t.date, (minutesByDate.get(t.date) ?? 0) + t.durationMin);
  }

  const bundles = new Map<string, PendingReview[]>();
  const overflow: PendingReview[] = [];

  const pushTo = (date: string, review: PendingReview) => {
    if (twoIntervalsLate(review, date)) return;
    const list = bundles.get(date) ?? [];
    if (list.length >= 3) {
      overflow.push({ ...review, due: nextStudySessionDay(prefs, date, false) });
      return;
    }
    list.push({ ...review, due: date });
    bundles.set(date, list);
  };

  for (const review of pending) pushTo(review.due, review);
  overflow.sort((a, b) => compareKeys(a.due, b.due));
  for (const review of overflow) {
    let date = snapReviewDate(prefs, review.due);
    for (let hops = 0; hops < 40; hops += 1) {
      if (twoIntervalsLate(review, date)) break;
      const list = bundles.get(date) ?? [];
      if (list.length < 3) {
        list.push({ ...review, due: date });
        bundles.set(date, list);
        break;
      }
      date = nextStudySessionDay(prefs, date, false);
    }
  }

  const tasks: PlanTask[] = [];
  for (const [date, list] of [...bundles.entries()].sort((a, b) => compareKeys(a[0], b[0]))) {
    const newMins = minutesByDate.get(date) ?? 0;
    const t = revisionTask(
      list.map((x) => x.title),
      list.map((x) => x.lessonId),
      revisionMinutes(prefs, newMins, list.length),
      id,
    );
    t.date = date;
    t.orderIdx = 0;
    tasks.push(t);
  }
  return { tasks, reviews };
}

export function weeklyRecap(
  prefs: PlannerPrefs,
  date: string,
  weekLessons: PlanTask[],
  id: () => string,
): PlanTask | null {
  if (!prefs.includeRevision || !weekLessons.length) return null;
  const titles = weekLessons.map((t) => t.title);
  const ids = weekLessons.map((t) => t.lessonId).filter((x): x is string => Boolean(x));
  const mins = revisionMinutes(prefs, weekLessons.reduce((n, t) => n + t.durationMin, 0), titles.length);
  const t = revisionTask(titles, ids, Math.min(40, Math.max(mins, 15)), id);
  t.date = date;
  t.orderIdx = 0;
  t.title = titles.length ? `Weekly recap · ${titles.slice(0, 3).join(", ")}${titles.length > 3 ? "…" : ""}` : "Weekly recap";
  return t;
}

export function mergeDayTasks(lectures: PlanTask[], reviews: PlanTask[]): PlanTask[] {
  const byDate = new Map<string, PlanTask[]>();
  const add = (t: PlanTask) => {
    const list = byDate.get(t.date) ?? [];
    list.push(t);
    byDate.set(t.date, list);
  };
  for (const t of reviews) add(t);
  for (const t of lectures) add(t);
  const out: PlanTask[] = [];
  for (const [date, list] of [...byDate.entries()].sort((a, b) => compareKeys(a[0], b[0]))) {
    const revs = list.filter((t) => t.type === "revision");
    const rest = list.filter((t) => t.type !== "revision");
    let order = 0;
    for (const t of revs) {
      t.orderIdx = order++;
      t.date = date;
      out.push(t);
    }
    for (const t of rest) {
      t.orderIdx = order++;
      t.date = date;
      out.push(t);
    }
  }
  return out;
}

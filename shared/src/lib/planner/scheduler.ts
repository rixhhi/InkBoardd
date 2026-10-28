import { addDaysKey, compareKeys, hourOfSlot } from "./dates.ts";
import { uid } from "./ids.ts";
import {
  isCatchUpOnly,
  isSchedulableLesson,
  isStudySessionDay,
  LONG_LECTURE_MIN,
  nextStudySessionDay,
  nextWorkDay,
  NOTES_BUFFER_MIN,
  sortedPlayable,
} from "./scheduler/days.ts";
import { NEVER, placeLecturesForDay, remainingCount, weekMonday, type Playlist } from "./scheduler/queue.ts";
import { mergeDayTasks, placeReviews, weeklyRecap } from "./scheduler/revision.ts";
import { summarize } from "./scheduler/feasibility.ts";
import { diffTasks } from "./scheduler/catchup.ts";
import {
  asLessons,
  fillPrefs,
  type GenerateResult,
  type PlanCourseInput,
  type PlanDiff,
  type PlannerPrefs,
  type PlanTask,
} from "./types.ts";

export {
  dayBudget,
  isCatchUpOnly,
  isHoliday,
  isSchedulableLesson,
  isStudySessionDay,
  isWorkDay,
  lectureSlots,
  lessonMinutes,
  nextStudySessionDay,
  nextWorkDay,
  rateReviewInterval,
  sortedPlayable,
  videoMinutes,
} from "./scheduler/days.ts";

export { describeDiff, lectureCountOn, previewReschedule, rescheduleOverdue } from "./scheduler/catchup.ts";
export { feasibility } from "./scheduler/feasibility.ts";
export { weekMonday } from "./scheduler/queue.ts";

const MAX_DAYS = 2500;

export function generatePlan(
  prefs: PlannerPrefs,
  courses: PlanCourseInput[],
  opts: { id?: () => string } = {},
): GenerateResult {
  const id = opts.id ?? (() => uid("t"));
  const localPrefs = fillPrefs({ ...prefs, holidays: prefs.holidays ?? [] });
  const skipped = courses.reduce((n, c) => n + asLessons(c.lessons).filter((l) => !isSchedulableLesson(l)).length, 0);
  const usable = courses.filter((c) => sortedPlayable(c).length > 0);
  const playlists: Playlist[] = usable.map((course, index) => {
    const queue = sortedPlayable(course);
    return { course, queue: [...queue], total: queue.length, index, lastDate: NEVER, usedToday: false };
  });

  const lectureTasks: PlanTask[] = [];
  let date = nextStudySessionDay(localPrefs, localPrefs.startDate, true);
  let consecutive = 0;
  let hops = 0;
  while (remainingCount(playlists) > 0 && hops < MAX_DAYS) {
    hops += 1;
    if (isCatchUpOnly(localPrefs, date)) {
      date = nextStudySessionDay(localPrefs, date, false);
      continue;
    }
    if (!isStudySessionDay(localPrefs, date)) {
      date = nextStudySessionDay(localPrefs, date, false);
      continue;
    }
    const restEvery = localPrefs.restEvery;
    const light = restEvery > 0 && consecutive >= restEvery;
    const placed = placeLecturesForDay(date, localPrefs, playlists, light, false, id);
    lectureTasks.push(...placed);
    if (light) consecutive = 0;
    else if (placed.some((t) => t.type === "lesson")) consecutive += 1;
    date = nextStudySessionDay(localPrefs, date, false);
  }

  const { tasks: reviewTasks, reviews } = placeReviews(localPrefs, lectureTasks.filter((t) => t.type === "lesson"), id);

  const recaps: PlanTask[] = [];
  if (localPrefs.includeRevision && localPrefs.catchUpDay != null) {
    const lessons = lectureTasks.filter((t) => t.type === "lesson");
    const lastLesson = lessons.reduce((a, t) => (t.date > a ? t.date : a), lessons[0]?.date ?? localPrefs.startDate);
    const horizon = addDaysKey(lastLesson, 8);
    const seen = new Set<string>();
    let cursor = nextWorkDay(localPrefs, localPrefs.startDate, true);
    for (let i = 0; i < MAX_DAYS && cursor <= horizon; i += 1) {
      if (isCatchUpOnly(localPrefs, cursor) && !seen.has(cursor)) {
        const weekStart = weekMonday(cursor);
        const weekEnd = addDaysKey(weekStart, 6);
        const weekLessons = lessons.filter((t) => t.date >= weekStart && t.date <= weekEnd);
        const recap = weeklyRecap(localPrefs, cursor, weekLessons, id);
        if (recap) recaps.push(recap);
        seen.add(cursor);
      }
      cursor = addDaysKey(cursor, 1);
    }
  }

  const tasks = mergeDayTasks([...lectureTasks, ...recaps], reviewTasks);
  const endDate = tasks.length ? tasks.reduce((a, t) => (t.date > a ? t.date : a), tasks[0]!.date) : localPrefs.startDate;
  return {
    tasks,
    startDate: localPrefs.startDate,
    endDate,
    summary: summarize(tasks, localPrefs, skipped, usable),
    reviews,
  };
}

export function regenerateRemaining(
  planTasks: PlanTask[],
  prefs: PlannerPrefs,
  courses: PlanCourseInput[],
  today: string,
  opts: { id?: () => string } = {},
): PlanTask[] {
  const completed = planTasks.filter((t) => t.status === "done" && !t.deletedAt);
  const pinned = planTasks.filter((t) => t.pinned && t.status === "pending" && !t.deletedAt);
  const keepIds = new Set(
    [...completed, ...pinned].map((t) => t.lessonId).filter((x): x is string => Boolean(x)),
  );
  const restCourses = courses.map((c) => ({
    ...c,
    lessons: asLessons(c.lessons).filter((l) => !keepIds.has(l.lessonId)),
  }));
  const next = generatePlan({ ...fillPrefs(prefs), startDate: today }, restCourses, opts);
  return [...completed, ...pinned, ...next.tasks].sort((a, b) => compareKeys(a.date, b.date) || a.orderIdx - b.orderIdx);
}

export function previewRebuild(
  planTasks: PlanTask[],
  prefs: PlannerPrefs,
  courses: PlanCourseInput[],
  today: string,
): { tasks: PlanTask[]; diff: PlanDiff } {
  const next = regenerateRemaining(planTasks, prefs, courses, today);
  return { tasks: next, diff: diffTasks(planTasks, next) };
}

export function slotCopy(slot: PlannerPrefs["timeSlot"]): string {
  const hour = hourOfSlot(slot);
  const ampm = hour >= 12 ? "pm" : "am";
  const h = hour % 12 || 12;
  const label = slot[0]!.toUpperCase() + slot.slice(1);
  return `${label} session at ~${h}${ampm}`;
}

export function isLongClass(task: PlanTask, prefs: PlannerPrefs): boolean {
  const p = fillPrefs(prefs);
  return task.type === "lesson" && (task.durationMin - NOTES_BUFFER_MIN > LONG_LECTURE_MIN || task.durationMin > p.maxNewMinutesPerDay);
}

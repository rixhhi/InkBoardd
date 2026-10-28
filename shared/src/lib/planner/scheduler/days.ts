import { addDaysKey, isStudyWeekday, weekdayOf } from "../dates.ts";
import { asLessons, fillPrefs, type PlanCourseInput, type PlanLessonInput, type PlannerPrefs, type ReviewRating } from "../types.ts";

export const NOTES_BUFFER_MIN = 10;
export const DEFAULT_VIDEO_SEC = 20 * 60;
export const LONG_LECTURE_MIN = 60;

export function isSchedulableLesson(lesson: PlanLessonInput): boolean {
  if (lesson.status === "upcoming" || lesson.status === "unavailable" || lesson.status === "archived") {
    return false;
  }
  return lesson.playable || lesson.status === "replay";
}

export function videoMinutes(durationSec: number, speed: number): number {
  const sec = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : DEFAULT_VIDEO_SEC;
  return Math.max(1, Math.ceil(sec / Math.max(1, speed) / 60));
}

export function lessonMinutes(durationSec: number, speed: number): number {
  return videoMinutes(durationSec, speed) + NOTES_BUFFER_MIN;
}

export function lectureSlots(durationSec: number, speed: number): number {
  return videoMinutes(durationSec, speed) > LONG_LECTURE_MIN ? 2 : 1;
}

export function rateReviewInterval(interval: number, rating: ReviewRating): number {
  const factor = rating === "shaky" ? 0.5 : rating === "solid" ? 1.5 : 1;
  return Math.max(1, Math.round(interval * factor));
}

/** First review matches rateReviewInterval. Later solid recalls wait longer. Shaky recalls do not. */
export function reviewGap(interval: number, rating: ReviewRating, stage: number): number {
  const base = rateReviewInterval(interval, rating);
  const step = Number.isFinite(stage) ? Math.max(1, Math.floor(stage)) : 1;
  if (step <= 1 || rating === "shaky") return base;
  const memory = rating === "solid" ? 1.35 : 1.15;
  return Math.max(base, Math.round(base * memory ** (step - 1)));
}

export function sortedPlayable(course: PlanCourseInput): PlanLessonInput[] {
  return asLessons(course.lessons)
    .filter(isSchedulableLesson)
    .sort((a, b) => a.rank - b.rank || (a.week ?? 0) - (b.week ?? 0) || a.title.localeCompare(b.title));
}

export function isHoliday(prefs: PlannerPrefs, date: string): boolean {
  return (prefs.holidays ?? []).includes(date);
}

export function isStudySessionDay(prefs: PlannerPrefs, date: string): boolean {
  if (isHoliday(prefs, date)) return false;
  return isStudyWeekday(date, prefs.studyDays);
}

export function isCatchUpOnly(prefs: PlannerPrefs, date: string): boolean {
  if (prefs.catchUpDay == null || isHoliday(prefs, date)) return false;
  return weekdayOf(date) === prefs.catchUpDay && !isStudyWeekday(date, prefs.studyDays);
}

export function isWorkDay(prefs: PlannerPrefs, date: string): boolean {
  return isStudySessionDay(prefs, date) || isCatchUpOnly(prefs, date);
}

export function dayBudget(prefs: PlannerPrefs, date: string): number {
  const p = fillPrefs(prefs);
  if (isHoliday(p, date)) return 0;
  if (isCatchUpOnly(p, date)) return Math.max(20, Math.floor(p.dailyMinutes * 0.5));
  return p.dailyMinutes;
}

export function nextWorkDay(prefs: PlannerPrefs, from: string, inclusive = true): string {
  let key = inclusive ? from : addDaysKey(from, 1);
  for (let i = 0; i < 28; i += 1) {
    if (isWorkDay(prefs, key)) return key;
    key = addDaysKey(key, 1);
  }
  return key;
}

export function nextStudySessionDay(prefs: PlannerPrefs, from: string, inclusive = true): string {
  let key = inclusive ? from : addDaysKey(from, 1);
  for (let i = 0; i < 28; i += 1) {
    if (isStudySessionDay(prefs, key)) return key;
    key = addDaysKey(key, 1);
  }
  return key;
}

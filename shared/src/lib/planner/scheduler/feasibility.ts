import { addDaysKey, diffDays } from "../dates.ts";
import {
  fillPrefs,
  HARD_MAX_LECTURES,
  PACE_LECTURES,
  type FeasibilityOptions,
  type PaceId,
  type PlanCourseInput,
  type PlannerPrefs,
  type PlanSummary,
  type PlanTask,
} from "../types.ts";
import { isWorkDay, sortedPlayable } from "./days.ts";

const MAX_DAYS = 2500;

export function workDayCount(prefs: PlannerPrefs, from: string, until: string): number {
  let n = 0;
  let k = from;
  for (let i = 0; i < MAX_DAYS && k <= until; i += 1) {
    if (isWorkDay(prefs, k)) n += 1;
    k = addDaysKey(k, 1);
  }
  return n;
}

export function feasibilityOptions(
  prefs: PlannerPrefs,
  courses: PlanCourseInput[],
  lessonCount: number,
  finishDate: string,
): FeasibilityOptions | null {
  if (!prefs.examDate || !lessonCount) return null;
  const days = Math.max(1, workDayCount(prefs, prefs.startDate, prefs.examDate));
  const required = lessonCount / days;
  const current = prefs.lecturesPerDay;
  let raisePaceTo: PaceId | null = null;
  if (required > current) {
    if (required <= 2) raisePaceTo = "relaxed";
    else if (required <= 3) raisePaceTo = "steady";
    else if (required <= 4) raisePaceTo = "intense";
    else if (required <= HARD_MAX_LECTURES) raisePaceTo = "custom";
  }
  if (raisePaceTo && PACE_LECTURES[raisePaceTo] <= current && raisePaceTo !== "custom") raisePaceTo = null;

  const dropPlaylistSuggestions: FeasibilityOptions["dropPlaylistSuggestions"] = [];
  if (finishDate > prefs.examDate) {
    const ranked = courses
      .map((c) => ({ courseId: c.courseId, title: c.title, lessonCount: sortedPlayable(c).length }))
      .filter((c) => c.lessonCount > 0)
      .sort((a, b) => b.lessonCount - a.lessonCount);
    let left = lessonCount;
    for (const c of ranked) {
      if (left / days <= current) break;
      dropPlaylistSuggestions.push(c);
      left -= c.lessonCount;
    }
  }

  return {
    raisePaceTo,
    extendExamDateBy: Math.max(0, diffDays(finishDate, prefs.examDate)),
    dropPlaylistSuggestions,
    finishDateAtCurrentPace: finishDate,
    requiredLecturesPerDay: Math.round(required * 10) / 10,
  };
}

export function summarize(
  tasks: PlanTask[],
  prefs: PlannerPrefs,
  skipped: number,
  courses: PlanCourseInput[],
): PlanSummary {
  const lessons = tasks.filter((t) => t.type === "lesson");
  const revisions = tasks.filter((t) => t.type === "revision");
  const totalMinutes = tasks.reduce((n, t) => n + t.durationMin, 0);
  const finishDate = tasks.length ? tasks.reduce((a, t) => (t.date > a ? t.date : a), tasks[0]!.date) : prefs.startDate;
  const examDate = prefs.examDate;
  let fitsBeforeExam: boolean | null = null;
  let requiredMinutesPerDay: number | null = null;
  let requiredLecturesPerDay: number | null = null;
  let warning: string | null = null;
  if (!lessons.length) {
    warning = skipped
      ? "None of the selected courses have a playable replay yet."
      : "No playable lessons in the selected courses.";
  }
  const feas = feasibilityOptions(prefs, courses, lessons.length, finishDate);
  if (examDate && lessons.length) {
    const n = Math.max(1, workDayCount(prefs, prefs.startDate, examDate));
    requiredMinutesPerDay = Math.ceil(totalMinutes / n);
    requiredLecturesPerDay = feas?.requiredLecturesPerDay ?? Math.round((lessons.length / n) * 10) / 10;
    fitsBeforeExam = finishDate <= examDate;
    if (fitsBeforeExam === false) {
      warning = `Need ~${requiredLecturesPerDay} lectures/day to finish by ${examDate}. Caps at ${prefs.lecturesPerDay}/day so you finish ${finishDate}.`;
    }
  }
  return {
    lessonCount: lessons.length,
    revisionCount: revisions.length,
    playableSkipped: skipped,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    finishDate,
    examDate,
    fitsBeforeExam,
    requiredMinutesPerDay,
    requiredLecturesPerDay,
    warning,
    feasibility: feas,
  };
}

export function feasibility(
  prefs: PlannerPrefs,
  totalMinutes: number,
): { requiredMinutesPerDay: number; studyDayCount: number } {
  const p = fillPrefs(prefs);
  if (!p.examDate) return { requiredMinutesPerDay: p.dailyMinutes, studyDayCount: 0 };
  const studyDayCount = Math.max(1, workDayCount(p, p.startDate, p.examDate));
  return { studyDayCount, requiredMinutesPerDay: Math.ceil(totalMinutes / studyDayCount) };
}

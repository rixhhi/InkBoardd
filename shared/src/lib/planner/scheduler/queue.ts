import { addDaysKey, diffDays, weekdayOf } from "../dates.ts";
import { fillTask, HARD_MAX_LECTURES, type PlanCourseInput, type PlanLessonInput, type PlannerPrefs, type PlanTask, type PlaylistMode } from "../types.ts";
import { lectureSlots, lessonMinutes } from "./days.ts";

export const NEVER = "0000-01-01";
export const DPP_MIN = 20;

export type QueueItem = { course: PlanCourseInput; lesson: PlanLessonInput };

export type Playlist = {
  course: PlanCourseInput;
  queue: PlanLessonInput[];
  total: number;
  index: number;
  lastDate: string;
  usedToday: boolean;
};

export type FitState = {
  lectureCount: number;
  slotUsed: number;
  minutesUsed: number;
  maxLectures: number;
  maxSlots: number;
  maxMinutes: number;
};

export function weekMonday(date: string): string {
  const d = weekdayOf(date);
  const offset = d === 0 ? 6 : d - 1;
  return addDaysKey(date, -offset);
}

export function makeLessonTask(item: QueueItem, speed: number, id: () => string): PlanTask {
  return fillTask({
    id: id(),
    type: "lesson",
    lessonId: item.lesson.lessonId,
    courseId: item.course.courseId,
    title: item.lesson.title,
    teacher: item.course.teacher,
    durationMin: lessonMinutes(item.lesson.durationSec, speed),
    notesUrl: item.lesson.notesUrl,
    dppUrl: item.lesson.dppUrl,
    subject: item.course.subject || item.lesson.topic,
  });
}

export function makeDppTask(item: QueueItem, id: () => string): PlanTask {
  return fillTask({
    id: id(),
    type: "dpp",
    lessonId: item.lesson.lessonId,
    courseId: item.course.courseId,
    title: `DPP · ${item.lesson.title}`,
    teacher: item.course.teacher,
    durationMin: DPP_MIN,
    dppUrl: item.lesson.dppUrl,
    refLessonIds: [item.lesson.lessonId],
    subject: item.course.subject,
  });
}

export function fitsLesson(lesson: PlanLessonInput, speed: number, fit: FitState): boolean {
  if (fit.lectureCount >= fit.maxLectures) return false;
  const cost = lectureSlots(lesson.durationSec, speed);
  const mins = lessonMinutes(lesson.durationSec, speed);
  const empty = fit.lectureCount === 0;
  if (!empty && fit.slotUsed + cost > fit.maxSlots) return false;
  if (!empty && fit.minutesUsed + mins > fit.maxMinutes) return false;
  return true;
}

export function pickRotate(playlists: Playlist[], speed: number, fit: FitState, bound: number, date: string): Playlist | null {
  const active = playlists.filter((p) => p.queue.length && !p.usedToday);
  if (!active.length) return null;
  const scored = active
    .map((p) => {
      const lesson = p.queue[0]!;
      const ok = fitsLesson(lesson, speed, fit);
      const behind = p.queue.length / Math.max(1, p.total);
      const gap = p.lastDate === NEVER ? 99 : Math.max(0, diffDays(date, p.lastDate));
      const overdue = p.lastDate === NEVER || gap >= bound;
      return { p, ok, behind, last: p.lastDate, index: p.index, overdue };
    })
    .filter((x) => x.ok)
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.behind !== b.behind) return b.behind - a.behind;
      if (a.last !== b.last) return a.last < b.last ? -1 : 1;
      return a.index - b.index;
    });
  return scored[0]?.p ?? null;
}

export function blockPlaylist(playlists: Playlist[], start: string, date: string): Playlist | null {
  const remaining = playlists.filter((p) => p.queue.length);
  if (!remaining.length) return null;
  const weeks = Math.max(0, Math.floor(diffDays(weekMonday(date), weekMonday(start)) / 7));
  const assigned = playlists[weeks % playlists.length];
  if (assigned?.queue.length) return assigned;
  return remaining[0] ?? null;
}

export function nextItem(
  mode: PlaylistMode,
  playlists: Playlist[],
  speed: number,
  fit: FitState,
  bound: number,
  start: string,
  date: string,
): QueueItem | null {
  const active = playlists.filter((p) => p.queue.length);
  if (!active.length) return null;

  let picked: Playlist | null = null;
  if (mode === "sequential" || active.length === 1) {
    picked = playlists.find((p) => p.queue.length) ?? null;
    if (picked?.usedToday && mode === "rotate" && active.length > 1) picked = null;
  } else if (mode === "blocks") {
    picked = blockPlaylist(playlists, start, date);
  } else {
    picked = pickRotate(playlists, speed, fit, bound, date);
  }
  if (!picked?.queue.length) return null;
  if (mode === "rotate" && active.length > 1 && picked.usedToday) return null;
  if (!fitsLesson(picked.queue[0]!, speed, fit)) return null;
  return { course: picked.course, lesson: picked.queue[0]! };
}

export function consume(playlists: Playlist[], item: QueueItem, date: string) {
  const p = playlists.find((x) => x.course.courseId === item.course.courseId);
  if (!p) return;
  p.queue.shift();
  p.lastDate = date;
  p.usedToday = true;
}

export function remainingCount(playlists: Playlist[]): number {
  return playlists.reduce((n, p) => n + p.queue.length, 0);
}

export function placeLecturesForDay(
  date: string,
  prefs: PlannerPrefs,
  playlists: Playlist[],
  light: boolean,
  extraLecture: boolean,
  id: () => string,
): PlanTask[] {
  for (const p of playlists) p.usedToday = false;
  const active = playlists.filter((p) => p.queue.length).length;
  const rotate = prefs.playlistMode === "rotate" && active > 1;
  const base = Math.min(prefs.lecturesPerDay, prefs.hardMaxLecturesPerDay, HARD_MAX_LECTURES);
  const boosted = extraLecture ? Math.min(base + 1, prefs.hardMaxLecturesPerDay, HARD_MAX_LECTURES) : base;
  const maxLectures = light ? 1 : rotate ? Math.min(boosted, active) : boosted;
  const fit: FitState = {
    lectureCount: 0,
    slotUsed: 0,
    minutesUsed: 0,
    maxLectures,
    maxSlots: light ? 2 : boosted,
    maxMinutes: prefs.maxNewMinutesPerDay,
  };
  const bound = Math.max(1, Math.ceil(Math.max(1, active) / Math.max(1, Math.min(boosted, active))));
  const out: PlanTask[] = [];
  let order = 0;

  while (remainingCount(playlists) > 0) {
    const item = nextItem(prefs.playlistMode, playlists, prefs.speed, fit, bound, prefs.startDate, date);
    if (!item) break;
    const task = makeLessonTask(item, prefs.speed, id);
    task.date = date;
    task.orderIdx = order++;
    out.push(task);
    const cost = lectureSlots(item.lesson.durationSec, prefs.speed);
    const mins = lessonMinutes(item.lesson.durationSec, prefs.speed);
    fit.lectureCount += 1;
    fit.slotUsed += cost;
    fit.minutesUsed += mins;
    consume(playlists, item, date);
    if (prefs.includeDpp && item.lesson.dppUrl && !light) {
      const dpp = makeDppTask(item, id);
      dpp.date = date;
      dpp.orderIdx = order++;
      out.push(dpp);
    }
  }
  return out;
}

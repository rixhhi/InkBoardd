import { format } from "date-fns";
import { addDaysKey, parseKey, todayKey } from "./dates.ts";
import { hoursForCourse } from "./syllabus.ts";
import { fillPrefs, HARD_MAX_LECTURES, PACE_LECTURES } from "./types.ts";
import type {
  GenerateResult,
  PaceId,
  PlanCourseInput,
  PlannerPrefs,
  PlanTask,
  PlaylistMode,
} from "./types.ts";

export const PACE_CARDS: {
  id: PaceId;
  lectures: number;
  label: string;
  hint: string;
  note: string | null;
  caution?: boolean;
}[] = [
  { id: "relaxed", lectures: 2, label: "Relaxed", hint: "2 lectures a day", note: null },
  { id: "steady", lectures: 3, label: "Steady", hint: "3 lectures a day", note: "Recommended" },
  { id: "intense", lectures: 4, label: "Intense", hint: "4 lectures a day", note: "Long sitting", caution: true },
  { id: "custom", lectures: 3, label: "Custom", hint: "1–5 lectures", note: null },
];

export const PLAYLIST_MODES: { id: PlaylistMode; label: string; hint: string }[] = [
  { id: "rotate", label: "Rotate", hint: "Mix subjects each day" },
  { id: "sequential", label: "Sequential", hint: "Finish one course, then the next" },
  { id: "blocks", label: "Blocks", hint: "One course per week" },
];

const SUBJECT_PALETTE = ["#8fbfa8", "#6d9a86", "#b8a99a", "#7eaa94", "#d06a58", "#9aa39a"];

export function subjectColor(subject: string): string {
  let h = 0;
  for (let i = 0; i < subject.length; i += 1) h = (h * 31 + subject.charCodeAt(i)) >>> 0;
  return SUBJECT_PALETTE[h % SUBJECT_PALETTE.length]!;
}

export function formatDayLabel(key: string, pattern = "d MMM"): string {
  return format(parseKey(key), pattern);
}

export function applyPace(prefs: PlannerPrefs, pace: PaceId, customLectures?: number): PlannerPrefs {
  const lectures =
    pace === "custom"
      ? Math.min(HARD_MAX_LECTURES, Math.max(1, customLectures ?? prefs.lecturesPerDay ?? 3))
      : PACE_LECTURES[pace];
  return fillPrefs({ ...prefs, pace, lecturesPerDay: lectures });
}

export function isPastStart(startDate: string, today = todayKey()): boolean {
  return Boolean(startDate) && startDate < today;
}

export function tomorrowKey(today = todayKey()): string {
  return addDaysKey(today, 1);
}

export function moveIndex<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list.slice();
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function orderedCourses(picked: Record<string, PlanCourseInput>, order: string[]): PlanCourseInput[] {
  const seen = new Set<string>();
  const out: PlanCourseInput[] = [];
  for (const id of order) {
    const c = picked[id];
    if (c && !seen.has(id)) {
      out.push(c);
      seen.add(id);
    }
  }
  for (const [id, c] of Object.entries(picked)) {
    if (!seen.has(id)) out.push(c);
  }
  return out;
}

export function playlistBalance(
  courses: PlanCourseInput[],
  speed: number,
): { warning: string | null; stats: { id: string; title: string; playable: number; hours: number }[] } {
  const stats = courses.map((c) => {
    const h = hoursForCourse(c, speed);
    return { id: c.courseId, title: c.title, playable: h.playable, hours: h.hours };
  });
  if (stats.filter((s) => s.playable > 0).length < 2) return { warning: null, stats };
  const longest = stats.reduce((a, b) => (b.playable > a.playable ? b : a));
  const shortest = stats.filter((s) => s.playable > 0).reduce((a, b) => (b.playable < a.playable ? b : a));
  const warning =
    longest.playable > shortest.playable * 2
      ? `${longest.title} has ${longest.playable} lectures vs ${shortest.playable} on ${shortest.title} — it will run much longer.`
      : null;
  return { warning, stats };
}

export function chipMeta(course: PlanCourseInput, speed: number): { playable: number; hours: number; label: string } {
  const { playable, hours } = hoursForCourse(course, speed);
  return {
    playable,
    hours,
    label: `${playable} classes · ${hours}h`,
  };
}

export function selectedTotals(
  courses: PlanCourseInput[],
  speed: number,
): { playable: number; hours: number; courses: number } {
  let playable = 0;
  let hours = 0;
  for (const c of courses) {
    const h = hoursForCourse(c, speed);
    playable += h.playable;
    hours += h.hours;
  }
  return { playable, hours: Math.round(hours * 10) / 10, courses: courses.length };
}

/** Rough hours when we only know lesson count (wizard suggestions). */
export function estimateHours(lessonCount: number, speed: number): number {
  const n = Math.max(0, lessonCount);
  const minutes = (n * 30) / Math.max(1, speed);
  return Math.round((minutes / 60) * 10) / 10;
}

export type SampleDay = {
  date: string;
  label: string;
  lectures: number;
  revisionMin: number;
  items: { title: string; subject: string; type: PlanTask["type"] }[];
};

export function sampleDays(tasks: PlanTask[], n = 7): SampleDay[] {
  const dates = [...new Set(tasks.map((t) => t.date))].sort();
  return dates.slice(0, n).map((date) => {
    const day = tasks.filter((t) => t.date === date).sort((a, b) => a.orderIdx - b.orderIdx);
    return {
      date,
      label: format(parseKey(date), "EEE d"),
      lectures: day.filter((t) => t.type === "lesson").length,
      revisionMin: day.filter((t) => t.type === "revision").reduce((n, t) => n + t.durationMin, 0),
      items: day.map((t) => ({
        title: t.title,
        subject: t.subject || t.teacher || t.type,
        type: t.type,
      })),
    };
  });
}

function mean(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function dailyPreviewCopy(result: GenerateResult, prefs: PlannerPrefs): string {
  const p = fillPrefs(prefs);
  const dates = [...new Set(result.tasks.map((t) => t.date))].sort();
  const lessonDays = dates.filter((d) => result.tasks.some((t) => t.date === d && t.type === "lesson"));
  const perDay = lessonDays.map((d) => {
    const day = result.tasks.filter((t) => t.date === d);
    return {
      lectures: day.filter((t) => t.type === "lesson").length,
      revision: day.filter((t) => t.type === "revision").reduce((n, t) => n + t.durationMin, 0),
      total: day.reduce((n, t) => n + t.durationMin, 0),
    };
  });
  const avgL = Math.round(mean(perDay.map((d) => d.lectures)) * 10) / 10 || p.lecturesPerDay;
  const avgRev = Math.round(mean(perDay.map((d) => d.revision)));
  const avgTotal = Math.round(mean(perDay.map((d) => d.total)));
  const hours = Math.floor(avgTotal / 60);
  const mins = avgTotal % 60;
  const time = hours ? `${hours}h${mins ? ` ${mins}m` : ""}` : `${mins}m`;
  const finish = result.summary.finishDate ? formatDayLabel(result.summary.finishDate) : "—";
  const studyDays = dates.length;
  const revBit = p.includeRevision && avgRev > 0 ? ` + ~${avgRev} min revision` : "";
  return `${avgL} lecture${avgL === 1 ? "" : "s"}${revBit} = ~${time}/day, finishes ${finish} (${studyDays} study day${studyDays === 1 ? "" : "s"})`;
}

export function requiredPaceCopy(required: number, examDate: string): string {
  const n = Math.round(required * 10) / 10;
  return `You need ~${n} lectures/day to finish by ${formatDayLabel(examDate)}`;
}

export function courseForSubject(courses: PlanCourseInput[], subject: string): PlanCourseInput | undefined {
  const key = subject.trim().toLowerCase();
  return courses.find((c) => (c.subject || "").trim().toLowerCase() === key);
}
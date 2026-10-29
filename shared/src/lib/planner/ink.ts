/**
 * Fading Ink: every studied lesson drawn as an ink stroke whose density is an
 * estimate of how much of it you still remember.
 *
 * Model. Retention decays as R(t) = exp(-t / S), where t is days since the
 * lesson was last touched (watched or reviewed) and S is a stability in days.
 * S grows with each review and with how the recall went, using the plan's own
 * revision intervals so the picture agrees with the schedule: at the moment a
 * review falls due, R is ~0.45 (visibly greyed); at twice the gap it is ~0.2
 * (a pencil ghost); right after a touch it is 1 (crisp black).
 *
 * The model is deliberately simple and explained in the UI. It is a lens on
 * the data the planner already keeps, not a claim about neuroscience.
 */
import { addDaysKey, diffDays } from "./dates.ts";
import { isWorkDay, reviewGap } from "./scheduler/days.ts";
import { subjectIdOf, type SubjectId } from "./subjects.ts";
import { asLessons, liveTasks, type CoverageRange, type PlannerPrefs, type PlannerState, type ReviewRating, type StudyPlan, type WatchLog } from "./types.ts";

export type InkItem = {
  lessonId: string;
  title: string;
  courseId: string | null;
  courseTitle: string;
  subject: SubjectId;
  /** Day the lesson was last watched or reviewed (YYYY-MM-DD). */
  lastTouch: string;
  /** Stability in days: the e-folding time of retention. */
  stability: number;
  /** Next review date from the schedule, if any. */
  due: string | null;
  stage: number;
  rating: ReviewRating | null;
  /** Learned per-lesson stability multiplier (1 = the schedule's own estimate). */
  calibration: number;
  /** 0..1 share of the lesson actually watched; 1 when unknown. */
  coverage: number;
  /** First unwatched second, or null when fully covered / unknown. */
  firstGapSec: number | null;
  durationSec: number;
};

export type InkBand = "crisp" | "fading" | "ghost";

export type InkSummary = { crisp: number; fading: number; ghost: number; total: number; mean: number };

export const INK_BANDS: Record<InkBand, { min: number; label: string }> = {
  crisp: { min: 0.7, label: "Crisp" },
  fading: { min: 0.35, label: "Fading" },
  ghost: { min: 0, label: "Ghost" },
};

const DEFAULT_INTERVALS = [1, 3, 7, 21];

/** How much a review schedule gap becomes stability. 1.25 puts R(due) at exp(-0.8) ~= 0.45. */
const STABILITY_PER_GAP = 1.25;

/** Retention in [0, 1] of an item on a given day. Days before lastTouch count as 1. */
export function retentionAt(item: Pick<InkItem, "lastTouch" | "stability">, day: string): number {
  const t = diffDays(day, item.lastTouch);
  if (!Number.isFinite(t) || t <= 0) return 1;
  const s = Math.max(0.5, item.stability);
  return Math.exp(-t / s);
}

export function inkBand(r: number): InkBand {
  if (r >= INK_BANDS.crisp.min) return "crisp";
  if (r >= INK_BANDS.fading.min) return "fading";
  return "ghost";
}

/** The day retention first drops under `threshold` (default: fading). Same day as lastTouch when stability is tiny. */
export function fadesOn(item: Pick<InkItem, "lastTouch" | "stability">, threshold = INK_BANDS.crisp.min): string {
  const s = Math.max(0.5, item.stability);
  const days = Math.max(0, Math.ceil(-Math.log(threshold) * s));
  return addDaysKey(item.lastTouch, days);
}

/** Stability in days for a lesson at a given review stage and last rating, from the plan's intervals, scaled by its learned calibration. */
export function stabilityFor(intervals: number[] | undefined, stage: number, rating: ReviewRating | null, calibration = 1): number {
  const list = intervals?.length ? intervals : DEFAULT_INTERVALS;
  const idx = Math.min(Math.max(0, stage), list.length - 1);
  const gap = list[idx] ?? 7;
  const effective = rating ? reviewGap(gap, rating, Math.max(1, stage)) : gap;
  return Math.max(0.5, effective * STABILITY_PER_GAP * clampCalibration(calibration));
}

export const CALIBRATION_MIN = 0.5;
export const CALIBRATION_MAX = 2;

export function clampCalibration(c: number | undefined | null): number {
  if (c == null || !Number.isFinite(c)) return 1;
  return Math.min(CALIBRATION_MAX, Math.max(CALIBRATION_MIN, c));
}

/**
 * Calibration loop. When a member rates a lesson, compare what the model
 * predicted (retention at that moment) with what they said:
 *
 *   model said crisp (R >= 0.7)  but rating "shaky"  -> the lesson fades faster than scheduled: x0.8
 *   model said ghost (R <  0.35) but rating "solid"  -> it sticks better than scheduled:        x1.25
 *   model said fading, or the rating agrees           -> no change
 *
 * Multiplicative, so repeated surprises compound, bounded to [0.5, 2] so one
 * odd day cannot wreck the picture. Pure: returns the new multiplier.
 */
export function calibrate(prev: number | undefined | null, predictedRetention: number, rating: ReviewRating): number {
  const base = clampCalibration(prev);
  const band = inkBand(predictedRetention);
  if (band === "crisp" && rating === "shaky") return clampCalibration(base * 0.8);
  if (band === "ghost" && rating === "solid") return clampCalibration(base * 1.25);
  if (band === "crisp" && rating === "solid" && base < 1) return clampCalibration(base * 1.1); // slow recovery toward 1 when the model is confirmed
  return base;
}

/** First second not covered by any watched range, or null when the lesson is fully watched or length is unknown. */
export function firstGap(ranges: CoverageRange[] | undefined, durationSec: number): number | null {
  if (!durationSec || durationSec <= 0) return null;
  const sorted = [...(ranges ?? [])].filter((r) => r[1] > r[0]).sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  for (const [from, to] of sorted) {
    if (from > cursor + 2) break;
    cursor = Math.max(cursor, to);
  }
  // Treat the last ~3% as credits: a gap only there is not worth a jump.
  if (cursor >= durationSec * 0.97) return null;
  return Math.max(0, Math.floor(cursor));
}

function coverageOf(log: WatchLog | undefined, durationSec: number): number {
  if (!log || !durationSec) return 1;
  const covered = log.ranges.reduce((n, [a, b]) => n + Math.max(0, b - a), 0);
  return Math.max(0.05, Math.min(1, covered / durationSec));
}

/**
 * Every lesson in the plan that has been touched: watched to completion,
 * reviewed, or has a watch log. One item per lesson. Sorted by subject then
 * by lastTouch so rows read left-to-right as oldest-to-newest.
 */
export function inkItems(plan: StudyPlan, watchLogs: WatchLog[] = []): InkItem[] {
  const meta = new Map<string, { title: string; courseId: string; courseTitle: string; subject: SubjectId; durationSec: number }>();
  for (const c of plan.courses) {
    const subject = subjectIdOf(c.subject || c.title);
    for (const l of asLessons(c.lessons)) {
      meta.set(l.lessonId, { title: l.title, courseId: c.courseId, courseTitle: c.title, subject, durationSec: l.durationSec || 0 });
    }
  }
  const logs = new Map<string, WatchLog>();
  for (const w of watchLogs) {
    const prev = logs.get(w.lessonId);
    if (!prev || w.updatedAt > prev.updatedAt) logs.set(w.lessonId, w);
  }
  const tasks = liveTasks(plan.tasks);
  const lectureDone = new Map<string, { day: string; title: string }>();
  const lastReviewDone = new Map<string, string>();
  for (const t of tasks) {
    if (t.status !== "done") continue;
    const day = (t.completedAt ?? "").slice(0, 10) || t.date;
    if (t.type === "lesson" && t.lessonId) {
      const prev = lectureDone.get(t.lessonId);
      if (!prev || day > prev.day) lectureDone.set(t.lessonId, { day, title: t.title });
    } else if (t.type === "revision") {
      const ids = t.refLessonIds?.length ? t.refLessonIds : t.lessonId ? [t.lessonId] : [];
      for (const id of ids) {
        const prev = lastReviewDone.get(id);
        if (!prev || day > prev) lastReviewDone.set(id, day);
      }
    }
  }
  const reviews = new Map((plan.reviews ?? []).map((r) => [r.lessonId, r] as const));
  const ids = new Set<string>([...lectureDone.keys(), ...reviews.keys(), ...[...logs.keys()].filter((id) => meta.has(id))]);
  const intervals = plan.prefs.revisionIntervals;
  const out: InkItem[] = [];
  for (const lessonId of ids) {
    const m = meta.get(lessonId);
    const r = reviews.get(lessonId);
    const done = lectureDone.get(lessonId);
    const log = logs.get(lessonId);
    const watchedDay = log?.date || log?.updatedAt.slice(0, 10) || "";
    const touches = [done?.day, r?.lectureCompletedOn, lastReviewDone.get(lessonId), watchedDay].filter((d): d is string => Boolean(d));
    if (!touches.length) continue;
    const lastTouch = touches.sort()[touches.length - 1]!;
    const stage = r?.stage ?? 0;
    const rating = r?.lastRating ?? null;
    const calibration = clampCalibration(r?.calibration);
    const durationSec = m?.durationSec ?? 0;
    out.push({
      lessonId,
      title: m?.title || done?.title || lessonId,
      courseId: m?.courseId ?? null,
      courseTitle: m?.courseTitle ?? "",
      subject: m?.subject ?? "other",
      lastTouch,
      stability: stabilityFor(intervals, stage, rating, calibration),
      due: r?.dueDate ?? null,
      stage,
      rating,
      calibration,
      coverage: coverageOf(log, durationSec),
      firstGapSec: firstGap(log?.ranges, durationSec),
      durationSec,
    });
  }
  return out.sort((a, b) => a.subject.localeCompare(b.subject) || a.lastTouch.localeCompare(b.lastTouch) || a.title.localeCompare(b.title));
}

/** Items for the active plan of a planner state. */
export function inkItemsFor(state: PlannerState): InkItem[] {
  const plan = state.plans.find((p) => p.id === state.activePlanId && !p.deletedAt) ?? state.plans.find((p) => !p.deletedAt);
  return plan ? inkItems(plan, state.watchLogs) : [];
}

export function inkSummary(items: InkItem[], day: string): InkSummary {
  const s: InkSummary = { crisp: 0, fading: 0, ghost: 0, total: items.length, mean: 0 };
  let sum = 0;
  for (const it of items) {
    const r = retentionAt(it, day);
    sum += r;
    s[inkBand(r)] += 1;
  }
  s.mean = items.length ? sum / items.length : 0;
  return s;
}

/** Items worth re-inking first on a day: lowest retention, ties broken by earliest due. */
export function reinkQueue(items: InkItem[], day: string, limit = 5): InkItem[] {
  return [...items]
    .map((it) => ({ it, r: retentionAt(it, day) }))
    .filter((x) => x.r < INK_BANDS.crisp.min)
    .sort((a, b) => a.r - b.r || (a.it.due ?? "9999").localeCompare(b.it.due ?? "9999"))
    .slice(0, limit)
    .map((x) => x.it);
}

/** Deterministic 32-bit hash for seeding a stroke shape from a lesson id. */
export function inkSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A handwriting-like stroke path inside a `width` x 16 box. Deterministic for a
 * given seed so the same lesson always has the same shape. Coverage shortens
 * the stroke from the right: a half-watched lesson is a half-length stroke.
 */
export function strokePath(seed: number, width: number, coverage = 1): string {
  let s = seed || 1;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
  const w = Math.max(8, width * Math.max(0.15, Math.min(1, coverage)));
  const segments = Math.max(2, Math.round(w / 14));
  const step = w / segments;
  let d = `M0 ${(8 + (rnd() - 0.5) * 4).toFixed(1)}`;
  let x = 0;
  for (let i = 0; i < segments; i++) {
    const c1x = x + step * 0.35;
    const c1y = 8 + (rnd() - 0.5) * 11;
    const c2x = x + step * 0.65;
    const c2y = 8 + (rnd() - 0.5) * 11;
    x += step;
    const y = 8 + (rnd() - 0.5) * 5;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

/* ---------------- Ink -> Tasks bridge ---------------- */

export type ReinkDraft = {
  lessonId: string;
  title: string;
  courseId: string | null;
  subject: SubjectId;
  /** Day the re-ink is scheduled on (a work day on or after `from`). */
  date: string;
  durationMin: number;
  /** Predicted retention on `until` if nothing is done. */
  retentionAtUntil: number;
};

export type ReinkPlanOptions = {
  /** First day tasks may land (usually today). */
  from: string;
  /** Deadline: pick the lessons that will have faded by this day (usually the exam or end of week). */
  until: string;
  prefs: PlannerPrefs;
  /** How many lessons to schedule. */
  limit?: number;
  /** Minutes per re-ink. Default 15. */
  minutesPerItem?: number;
  /** Minutes of re-ink per day before spilling to the next day. Default: a third of dailyMinutes, at least one item. */
  minutesPerDay?: number;
  /** Lessons already scheduled for review between from and until; skipped. */
  alreadyPlanned?: Iterable<string>;
};

/**
 * Turn the ink board into a plan. Lessons that will be below "crisp" on
 * `until` are taken worst-first and spread over the work days between `from`
 * and `until`, earliest day first, so the most faded is re-inked soonest.
 * Pure: the caller writes the drafts with `scheduleReinks`.
 */
export function planReinks(items: InkItem[], opts: ReinkPlanOptions): ReinkDraft[] {
  const limit = Math.max(0, opts.limit ?? 5);
  if (!limit) return [];
  const minutes = Math.max(5, opts.minutesPerItem ?? 15);
  const perDay = Math.max(minutes, opts.minutesPerDay ?? Math.round((opts.prefs.dailyMinutes || 90) / 3));
  const skip = new Set(opts.alreadyPlanned ?? []);
  const until = opts.until >= opts.from ? opts.until : opts.from;
  const picked = [...items]
    .filter((it) => !skip.has(it.lessonId))
    .map((it) => ({ it, r: retentionAt(it, until) }))
    .filter((x) => x.r < INK_BANDS.crisp.min)
    .sort((a, b) => a.r - b.r || (a.it.due ?? "9999").localeCompare(b.it.due ?? "9999") || a.it.title.localeCompare(b.it.title))
    .slice(0, limit);
  if (!picked.length) return [];
  // Work days in [from, until]; if none (holiday streak), fall back to `from`.
  const days: string[] = [];
  for (let d = opts.from; d <= until && days.length < 60; d = addDaysKey(d, 1)) if (isWorkDay(opts.prefs, d)) days.push(d);
  if (!days.length) days.push(opts.from);
  const out: ReinkDraft[] = [];
  let dayIdx = 0;
  let used = 0;
  for (const { it, r } of picked) {
    if (used + minutes > perDay && dayIdx < days.length - 1) {
      dayIdx += 1;
      used = 0;
    }
    out.push({ lessonId: it.lessonId, title: it.title, courseId: it.courseId, subject: it.subject, date: days[dayIdx]!, durationMin: minutes, retentionAtUntil: r });
    used += minutes;
  }
  return out;
}

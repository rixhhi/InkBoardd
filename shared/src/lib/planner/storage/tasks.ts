import { fillTask, liveTasks, type EventKind, type LessonReviewState, type PlanTask, type ReviewRating, type TaskType, type WatchLog } from "../types.ts";
import { addDaysKey, nowIso, todayKey } from "../dates.ts";
import { nextWorkDay, previewReschedule } from "../scheduler.ts";
import { uid } from "../ids.ts";
import { oldestOverdueIds } from "../daily.ts";
import { addSession, liveSessions, validateManualLog, type ManualLogInput } from "../sessions.ts";
import { reviewGap } from "../scheduler/days.ts";
import { calibrate, retentionAt, stabilityFor, type ReinkDraft } from "../ink.ts";
import { captureUndo, patchPlanner, readPlanner, snapshotUndo, stampPlan } from "./core.ts";
import { activePlan, replacePlanTasks } from "./plans.ts";
import { addWatchMinutes, bumpDay } from "./days.ts";

function watchSecondsFor(logs: WatchLog[] | undefined, lessonId: string | null, date: string): number {
  if (!lessonId) return 0;
  return logs?.find((w) => w.lessonId === lessonId && w.date === date)?.seconds ?? 0;
}

export function setTaskStatus(planId: string, taskId: string, status: PlanTask["status"], minutes?: number) {
  const today = todayKey();
  const at = nowIso();
  return patchPlanner((s) => {
    let minutesDelta = 0;
    let doneDelta = 0;
    const plans = s.plans.map((p) => {
      if (p.id !== planId) return p;
      return stampPlan(
        {
          ...p,
          tasks: p.tasks.map((t) => {
            if (t.id !== taskId || t.deletedAt) return t;
            const wasDone = t.status === "done";
            const nowDone = status === "done";
            if (!wasDone && nowDone) {
              doneDelta = 1;
              const watchToday = watchSecondsFor(s.watchLogs, t.lessonId, today);
              if (t.minutesLogged > 0 || watchToday >= 60) {
                minutesDelta = 0;
              } else {
                minutesDelta = minutes ?? t.durationMin;
              }
              return {
                ...t,
                status,
                completedAt: at,
                minutesLogged: t.minutesLogged > 0 ? t.minutesLogged : minutesDelta,
                updatedAt: at,
              };
            }
            if (wasDone && nowDone === false) {
              doneDelta = -1;
              minutesDelta = -(t.minutesLogged || 0);
              return {
                ...t,
                status,
                completedAt: null,
                minutesLogged: 0,
                updatedAt: at,
              };
            }
            return { ...t, status, updatedAt: at };
          }),
        },
        at,
      );
    });
    return { ...s, plans, days: bumpDay(s.days, today, minutesDelta, doneDelta, at) };
  });
}

export function moveTask(planId: string, taskId: string, date: string) {
  const at = nowIso();
  return patchPlanner((s) => ({
    ...s,
    plans: s.plans.map((p) =>
      p.id !== planId
        ? p
        : stampPlan(
            {
              ...p,
              tasks: p.tasks.map((t) =>
                t.id === taskId && !t.deletedAt
                  ? { ...t, date, rescheduledCount: t.rescheduledCount + 1, updatedAt: at, pinned: true }
                  : t,
              ),
            },
            at,
          ),
    ),
  }));
}

export function moveTasks(planId: string, taskIds: string[], date: string) {
  const s = readPlanner();
  const plan = s.plans.find((p) => p.id === planId);
  captureUndo("move tasks", () => ({
    tasks: plan?.tasks.filter((t) => taskIds.includes(t.id)) ?? [],
  }));
  for (const id of taskIds) moveTask(planId, id, date);
  return readPlanner();
}

export function skipTasks(planId: string, taskIds: string[]) {
  const s = readPlanner();
  const plan = s.plans.find((p) => p.id === planId);
  captureUndo("skip tasks", () => ({
    tasks: plan?.tasks.filter((t) => taskIds.includes(t.id)) ?? [],
    days: s.days,
  }));
  for (const id of taskIds) setTaskStatus(planId, id, "skipped");
  return readPlanner();
}

export function pinTask(planId: string, taskId: string, pinned = true) {
  const at = nowIso();
  return patchPlanner((s) => ({
    ...s,
    plans: s.plans.map((p) =>
      p.id !== planId
        ? p
        : stampPlan(
            { ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, pinned, updatedAt: at } : t)) },
            at,
          ),
    ),
  }));
}

export function patchTask(planId: string, taskId: string, over: Partial<PlanTask>) {
  const at = nowIso();
  captureUndo("edit task", (s) => ({
    tasks: s.plans.find((p) => p.id === planId)?.tasks.filter((t) => t.id === taskId) ?? [],
  }));
  return patchPlanner((s) => ({
    ...s,
    plans: s.plans.map((p) =>
      p.id !== planId
        ? p
        : stampPlan(
            {
              ...p,
              tasks: p.tasks.map((t) =>
                t.id === taskId && !t.deletedAt
                  ? {
                      ...t,
                      ...over,
                      id: t.id,
                      updatedAt: at,
                      durationMin: over.durationMin != null ? Math.max(1, Math.round(over.durationMin)) : t.durationMin,
                    }
                  : t,
              ),
            },
            at,
          ),
    ),
  }));
}

export function rateRevision(planId: string, taskId: string, rating: ReviewRating) {
  const at = nowIso();
  const today = todayKey();
  return patchPlanner((s) => ({
    ...s,
    plans: s.plans.map((p) => {
      if (p.id !== planId) return p;
      const task = p.tasks.find((t) => t.id === taskId);
      const ids = task?.refLessonIds?.length ? task.refLessonIds : task?.lessonId ? [task.lessonId] : [];
      const intervals = p.prefs.revisionIntervals?.length ? p.prefs.revisionIntervals : [1, 3, 7, 21];
      const reviews = [...(p.reviews ?? [])];
      for (const lessonId of ids) {
        const existing = reviews.find((r) => r.lessonId === lessonId);
        const stage = existing ? existing.stage + 1 : 1;
        const interval = reviewGap(intervals[Math.min(stage - 1, intervals.length - 1)] ?? 7, rating, stage);
        const due = addDaysKey(today, interval);
        if (existing) {
          existing.calibration = calibrateReview(existing, intervals, today, rating);
          existing.stage = stage;
          existing.lastRating = rating;
          existing.dueDate = due;
          existing.lectureCompletedOn = existing.lectureCompletedOn ?? today;
        } else {
          reviews.push({
            lessonId,
            stage,
            dueDate: due,
            lastRating: rating,
            lectureDate: task?.plannedDate || task?.date || today,
            lectureCompletedOn: today,
          });
        }
      }
      const tasks = p.tasks.map((t) =>
        t.id === taskId
          ? { ...t, status: "done" as const, completedAt: t.completedAt ?? at, updatedAt: at, note: rating }
          : t,
      );
      return stampPlan({ ...p, tasks, reviews }, at);
    }),
  }));
}

export function reorderDay(planId: string, date: string, orderedIds: string[]) {
  const at = nowIso();
  const s = readPlanner();
  const plan = s.plans.find((p) => p.id === planId);
  captureUndo("reorder", () => ({
    tasks: plan?.tasks.filter((t) => t.date === date) ?? [],
  }));
  return patchPlanner((cur) => ({
    ...cur,
    plans: cur.plans.map((p) => {
      if (p.id !== planId) return p;
      const index = new Map(orderedIds.map((id, i) => [id, i]));
      return stampPlan(
        {
          ...p,
          tasks: p.tasks.map((t) =>
            t.date === date && index.has(t.id) && !t.deletedAt ? { ...t, orderIdx: index.get(t.id)!, updatedAt: at } : t,
          ),
        },
        at,
      );
    }),
  }));
}

export function addCustomTask(
  planId: string,
  input: {
    title: string;
    date: string;
    durationMin: number;
    type?: TaskType;
    lessonId?: string | null;
    courseId?: string | null;
    teacher?: string;
    notesUrl?: string | null;
    dppUrl?: string | null;
    eventKind?: EventKind;
    note?: string;
  },
) {
  const at = nowIso();
  const task = fillTask({
    id: uid("tsk"),
    title: input.title,
    date: input.date,
    plannedDate: input.date,
    durationMin: input.durationMin,
    type: input.type ?? "custom",
    lessonId: input.lessonId ?? null,
    courseId: input.courseId ?? null,
    teacher: input.teacher ?? "",
    notesUrl: input.notesUrl ?? null,
    dppUrl: input.dppUrl ?? null,
    eventKind: input.eventKind,
    note: input.note ?? "",
    updatedAt: at,
  });
  return patchPlanner((s) => ({
    ...s,
    plans: s.plans.map((p) => {
      if (p.id !== planId) return p;
      const orderIdx = liveTasks(p.tasks).filter((t) => t.date === input.date).length;
      return stampPlan({ ...p, tasks: [...p.tasks, { ...task, orderIdx }] }, at);
    }),
  }));
}

export function carryForward(planId: string, taskId: string, today = todayKey()) {
  const s = readPlanner();
  const plan = s.plans.find((p) => p.id === planId);
  const task = plan?.tasks.find((t) => t.id === taskId && !t.deletedAt);
  if (!plan || !task) return s;
  const dest = task.date < today ? today : nextWorkDay(plan.prefs, addDaysKey(today, 1), true);
  captureUndo("carry forward", () => ({ tasks: [task] }));
  return moveTask(planId, taskId, dest);
}

export function logManualStudy(input: ManualLogInput) {
  const result = validateManualLog(input, liveSessions());
  if (!result.ok) return result;
  addSession(result.session);
  addWatchMinutes(result.session.date, result.session.durationMin);
  return result;
}

export function completeLessonInPlan(
  lessonId: string,
  source: "manual" | "auto" | "focus" = "manual",
  notes = "",
): { planId: string; task: PlanTask } | null {
  const state = readPlanner();
  const plan = activePlan(state);
  if (!plan) return null;
  const task = liveTasks(plan.tasks).find((t) => t.lessonId === lessonId && t.status === "pending");
  if (!task) return null;
  if (source !== "auto") {
    captureUndo("mark done", (s) => ({
      tasks: [task],
      days: s.days.filter((d) => d.date === todayKey()),
    }));
  }
  const today = todayKey();
  const watched = watchSecondsFor(state.watchLogs, lessonId, today);
  const minutes = source !== "auto" && watched < 60 ? undefined : 0;
  setTaskStatus(plan.id, task.id, "done", minutes);
  const at = nowIso();
  addSession({
    id: uid("ses"),
    date: today,
    startIso: at,
    durationMin: Math.max(1, Math.round((watched || (minutes ?? task.durationMin) * 60) / 60)),
    subject: task.subject || task.teacher || "",
    courseId: task.courseId,
    lessonId,
    taskId: task.id,
    notes,
    source: source === "focus" ? "focus" : source === "manual" ? "manual" : "watch",
    completed: true,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  });
  return { planId: plan.id, task: { ...task, status: "done" } };
}

export function skipOldestOverdue(planId: string, today = todayKey()) {
  const s = readPlanner();
  const plan = s.plans.find((p) => p.id === planId);
  if (!plan) return s;
  const ids = oldestOverdueIds(plan.tasks, today);
  if (!ids.length) return s;
  return skipTasks(planId, ids);
}

export function reschedulePlan(planId: string, strategy: "push" | "spread" | "skip", today = todayKey()) {
  const s = readPlanner();
  const plan = s.plans.find((p) => p.id === planId);
  if (!plan) return { plan: null, diff: { moved: 0, skipped: 0, added: 0, removed: 0, finishBefore: null, finishAfter: null } };
  snapshotUndo();
  const { tasks, diff } = previewReschedule(plan.tasks, plan.prefs, today, strategy);
  replacePlanTasks(planId, tasks, tasks.reduce((a, t) => (t.date > a ? t.date : a), plan.endDate));
  return { plan: readPlanner().plans.find((p) => p.id === planId) ?? null, diff };
}

export function stampTask(task: PlanTask): PlanTask {
  return { ...task, updatedAt: nowIso() };
}

/**
 * Re-ink a lesson straight from the Fading Ink board: record a recall rating
 * without needing a scheduled revision task. Advances the review stage and
 * sets the next due date exactly like rating a revision task would.
 */
export function reinkLesson(planId: string, lessonId: string, rating: ReviewRating, title?: string) {
  const today = todayKey();
  const at = nowIso();
  return patchPlanner((s) => ({
    ...s,
    plans: s.plans.map((p) => {
      if (p.id !== planId) return p;
      const intervals = p.prefs.revisionIntervals?.length ? p.prefs.revisionIntervals : [1, 3, 7, 21];
      const reviews = [...(p.reviews ?? [])];
      const existing = reviews.find((r) => r.lessonId === lessonId);
      const stage = existing ? existing.stage + 1 : 1;
      const interval = reviewGap(intervals[Math.min(stage - 1, intervals.length - 1)] ?? 7, rating, stage);
      const due = addDaysKey(today, interval);
      if (existing) {
        existing.calibration = calibrateReview(existing, intervals, today, rating);
        existing.stage = stage;
        existing.lastRating = rating;
        existing.dueDate = due;
        existing.lectureCompletedOn = existing.lectureCompletedOn ?? today;
      } else {
        const lecture = liveTasks(p.tasks).find((t) => t.type === "lesson" && t.lessonId === lessonId);
        reviews.push({ lessonId, stage, dueDate: due, lastRating: rating, lectureDate: lecture?.plannedDate || lecture?.date || today, lectureCompletedOn: today });
      }
      // Also close any pending revision task for this lesson that is due today or overdue.
      const tasks = p.tasks.map((t) =>
        t.type === "revision" && t.status === "pending" && t.date <= today && (t.refLessonIds?.includes(lessonId) || t.lessonId === lessonId)
          ? { ...t, status: "done" as const, completedAt: at, updatedAt: at, note: rating, title: t.title || title || "Review" }
          : t,
      );
      return stampPlan({ ...p, tasks, reviews }, at);
    }),
  }));
}

/**
 * What the ink model predicted for this lesson right now, fed back as a
 * calibration update. Last touch is the later of the lecture completion and
 * the last review (approximated by dueDate minus the stage gap when no
 * explicit touch is kept), which is the same signal `inkItems` uses.
 */
function calibrateReview(existing: LessonReviewState, intervals: number[], today: string, rating: ReviewRating): number {
  const gap = intervals[Math.min(Math.max(0, existing.stage - 1), intervals.length - 1)] ?? 7;
  const lastTouch = existing.dueDate ? addDaysKey(existing.dueDate, -gap) : (existing.lectureCompletedOn ?? today);
  const stability = stabilityFor(intervals, existing.stage, existing.lastRating, existing.calibration);
  const predicted = retentionAt({ lastTouch: lastTouch > today ? today : lastTouch, stability }, today);
  return calibrate(existing.calibration, predicted, rating);
}

/**
 * Ink -> Tasks bridge. Writes the drafts from `planReinks` as revision tasks
 * (one per lesson, on the chosen day) so they show up on Today, the calendar
 * and the pace meter like any other review. Skips lessons that already have a
 * pending revision on that day. Returns how many were added. Undoable.
 */
export function scheduleReinks(planId: string, drafts: ReinkDraft[]): number {
  if (!drafts.length) return 0;
  const at = nowIso();
  const current = readPlanner().plans.find((p) => p.id === planId);
  if (!current) return 0;
  const live = liveTasks(current.tasks);
  const perDay = new Map<string, number>();
  for (const t of live) perDay.set(t.date, (perDay.get(t.date) ?? 0) + 1);
  const fresh: PlanTask[] = [];
  for (const d of drafts) {
    const dup =
      live.some((t) => t.type === "revision" && t.status === "pending" && t.date === d.date && (t.lessonId === d.lessonId || t.refLessonIds?.includes(d.lessonId))) ||
      fresh.some((t) => t.lessonId === d.lessonId);
    if (dup) continue;
    const orderIdx = perDay.get(d.date) ?? 0;
    perDay.set(d.date, orderIdx + 1);
    fresh.push(
      fillTask({
        id: uid("tsk"),
        title: `Re-ink: ${d.title}`,
        date: d.date,
        plannedDate: d.date,
        durationMin: d.durationMin,
        type: "revision",
        lessonId: d.lessonId,
        courseId: d.courseId,
        refLessonIds: [d.lessonId],
        subject: d.subject,
        note: "from Ink",
        orderIdx,
        updatedAt: at,
      }),
    );
  }
  if (!fresh.length) return 0; // nothing to do: no undo entry either, so Undo still points at the last real change
  snapshotUndo();
  patchPlanner((s) => ({
    ...s,
    plans: s.plans.map((p) => {
      if (p.id !== planId) return p;
      const tasks = [...p.tasks, ...fresh];
      const endDate = tasks.reduce((a, t) => (t.date > a ? t.date : a), p.endDate);
      return stampPlan({ ...p, tasks, endDate }, at);
    }),
  }));
  return fresh.length;
}

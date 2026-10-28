import { liveTasks } from "../types.ts";
import { todayKey } from "../dates.ts";
import { applyWatchTick, AUTO_COMPLETE_RATIO, uniqueRatio } from "../watch.ts";
import { flushWatchLogs, readWatchLogs, upsertWatchLog } from "../watch-store.ts";
import { captureUndo, readPlanner } from "./core.ts";
import { activePlan } from "./plans.ts";
import { addWatchMinutes } from "./days.ts";
import { completeLessonInPlan } from "./tasks.ts";

export function recordWatchTick(
  lessonId: string,
  prevSec: number,
  nextSec: number,
  hidden: boolean,
  durationSec: number,
): { nextPrev: number; autoCompleted: boolean; creditedSec: number } {
  const today = todayKey();
  const state = readPlanner();
  const existing = (state.watchLogs ?? []).find((w) => w.lessonId === lessonId && w.date === today);
  const applied = applyWatchTick(existing, lessonId, today, prevSec, nextSec, hidden);
  if (applied.creditSec > 0) {
    upsertWatchLog(applied.log, false);
  }
  let autoCompleted = false;
  if (uniqueRatio(applied.log.ranges, durationSec) >= AUTO_COMPLETE_RATIO) {
    const plan = activePlan(readPlanner());
    const task = plan ? liveTasks(plan.tasks).find((t) => t.lessonId === lessonId && t.status === "pending") : null;
    if (task && plan) {
      autoCompleted = true;
      captureUndo("auto complete", (s) => ({
        tasks: s.plans.find((p) => p.id === plan.id)?.tasks.filter((t) => t.id === task.id) ?? [],
        days: s.days.filter((d) => d.date === today),
      }));
      completeLessonInPlan(lessonId, "auto");
    }
  }
  return { nextPrev: applied.nextPrev, autoCompleted, creditedSec: applied.creditSec };
}

export function flushPlannerWatch() {
  flushWatchLogs();
  const logs = readWatchLogs();
  const today = todayKey();
  const secs = logs.filter((w) => w.date === today).reduce((n, w) => n + w.seconds, 0);
  const mins = Math.floor(secs / 60);
  const state = readPlanner();
  const cur = state.days.find((d) => d.date === today)?.minutesStudied ?? 0;
  if (mins > cur) addWatchMinutes(today, mins - cur);
}

import { EPOCH_ISO, type StudyDayLog } from "../types.ts";
import { keysInRange, nowIso } from "../dates.ts";
import { patchPlanner, readPlanner, stampPlan } from "./core.ts";
import { activePlan } from "./plans.ts";

export function bumpDay(days: StudyDayLog[], date: string, minutes: number, tasksDoneDelta: number, at = nowIso()) {
  const rest = days.filter((d) => d.date !== date);
  const cur = days.find((d) => d.date === date) ?? { date, minutesStudied: 0, tasksDone: 0, updatedAt: EPOCH_ISO };
  rest.push({
    date,
    minutesStudied: Math.max(0, cur.minutesStudied + minutes),
    tasksDone: Math.max(0, cur.tasksDone + tasksDoneDelta),
    updatedAt: at,
  });
  return rest.sort((a, b) => a.date.localeCompare(b.date));
}

export function addWatchMinutes(date: string, minutes: number) {
  if (minutes <= 0) return readPlanner();
  return patchPlanner((s) => ({ ...s, days: bumpDay(s.days, date, Math.round(minutes), 0) }));
}

export function mergeFreezeWeeks(weeks: string[]) {
  const extra = weeks.filter(Boolean);
  if (!extra.length) return readPlanner();
  const s = readPlanner();
  const set = new Set([...s.freezeWeeks, ...extra]);
  if (set.size === s.freezeWeeks.length) return s;
  return patchPlanner((cur) => ({ ...cur, freezeWeeks: [...new Set([...cur.freezeWeeks, ...extra])] }));
}

export function setHolidays(planId: string, holidays: string[]) {
  const at = nowIso();
  return patchPlanner((s) => ({
    ...s,
    plans: s.plans.map((p) =>
      p.id === planId ? stampPlan({ ...p, prefs: { ...p.prefs, holidays: [...new Set(holidays)].sort() } }, at) : p,
    ),
  }));
}

export function addVacation(planId: string, from: string, until: string) {
  const extra = keysInRange(from, until);
  const plan = activePlan() || readPlanner().plans.find((p) => p.id === planId);
  const holidays = [...new Set([...(plan?.prefs.holidays ?? []), ...extra])];
  return setHolidays(planId, holidays);
}

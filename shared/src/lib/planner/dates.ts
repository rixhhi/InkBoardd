/**
 * Date keys are always the device's local calendar day (`yyyy-MM-dd`).
 * Inkboard is India-first, but we never store UTC midnight Date objects —
 * `parseKey("2026-03-08")` is 8 Mar 2026 00:00 in the local timezone.
 * Midnight IST vs UTC: a clock at 00:15 local stays on that local day.
 */
import { addDays, addMonths, addWeeks, format, getISOWeek, getISOWeekYear } from "date-fns";
import { DATE_FMT } from "./types.ts";

let nowFn: () => Date = () => new Date();

/** Test-only clock. Pass null to restore the system clock. */
export function setPlannerNow(date: Date | null) {
  nowFn = date ? () => new Date(date.getTime()) : () => new Date();
}

export function nowDate(): Date {
  return nowFn();
}

/** Parse a yyyy-MM-dd key as a local calendar date (never UTC midnight). */
export function parseKey(key: string): Date {
  const parts = key.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d);
}

export function keyOf(date: Date): string {
  return format(date, DATE_FMT);
}

export function todayKey(now: Date = nowFn()): string {
  return keyOf(now);
}

/** Milliseconds until 00:00:01 local tomorrow — for midnight rollover timers. */
export function msUntilNextLocalMidnight(now: Date = nowFn()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return Math.max(250, next.getTime() - now.getTime());
}

export function nowIso(now: Date = nowFn()): string {
  return now.toISOString();
}

export function addDaysKey(key: string, n: number): string {
  return keyOf(addDays(parseKey(key), n));
}

export function addMonthsKey(key: string, n: number): string {
  return keyOf(addMonths(parseKey(key), n));
}

export function addWeeksKey(key: string, n: number): string {
  return keyOf(addWeeks(parseKey(key), n));
}

export function weekdayOf(key: string): number {
  return parseKey(key).getDay();
}

export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function diffDays(a: string, b: string): number {
  const ms = parseKey(a).getTime() - parseKey(b).getTime();
  return Math.round(ms / 86_400_000);
}

export function compareIso(a: string | null | undefined, b: string | null | undefined): number {
  const aa = a || "";
  const bb = b || "";
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}

export function maxIso(a: string | null | undefined, b: string | null | undefined): string {
  return compareIso(a, b) >= 0 ? a || "" : b || "";
}

/** ISO week id used for streak-freeze bookkeeping, e.g. 2026-W39. */
export function weekId(key: string): string {
  const d = parseKey(key);
  const week = String(getISOWeek(d)).padStart(2, "0");
  return `${getISOWeekYear(d)}-W${week}`;
}

export function isStudyWeekday(key: string, studyDays: number[]): boolean {
  return studyDays.includes(weekdayOf(key));
}

export function nextStudyDay(from: string, studyDays: number[], inclusive = true): string {
  const days = studyDays.length ? studyDays : [1, 2, 3, 4, 5];
  let key = inclusive ? from : addDaysKey(from, 1);
  for (let i = 0; i < 14; i += 1) {
    if (isStudyWeekday(key, days)) return key;
    key = addDaysKey(key, 1);
  }
  return key;
}

export function studyDaysUntil(from: string, until: string, studyDays: number[]): string[] {
  const out: string[] = [];
  if (compareKeys(until, from) < 0) return out;
  let key = from;
  for (let i = 0; i < 800; i += 1) {
    if (isStudyWeekday(key, studyDays)) out.push(key);
    if (key === until) break;
    key = addDaysKey(key, 1);
  }
  return out;
}

export function keysInRange(from: string, until: string): string[] {
  const out: string[] = [];
  if (compareKeys(until, from) < 0) return out;
  let key = from;
  for (let i = 0; i < 800; i += 1) {
    out.push(key);
    if (key === until) break;
    key = addDaysKey(key, 1);
  }
  return out;
}

export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const keys: string[] = [];
  for (let i = 0; i < 42; i += 1) keys.push(keyOf(addDays(start, i)));
  return keys;
}

export function weekKeys(anchor: string): string[] {
  const d = parseKey(anchor);
  const monday = addDays(d, -((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => keyOf(addDays(monday, i)));
}

export function formatDay(key: string, pattern = "d MMM"): string {
  return format(parseKey(key), pattern);
}

export function hourOfSlot(slot: "morning" | "afternoon" | "evening" | "night"): number {
  if (slot === "morning") return 7;
  if (slot === "afternoon") return 13;
  if (slot === "night") return 22;
  return 19;
}

/**
 * Device-local calendar dates. A "day" is whatever the user's clock says,
 * which in India is IST. Never treat a yyyy-MM-dd key as UTC midnight.
 */
export const DATE_TZ_RULE =
  "Inkboard planner dates are device-local calendar days (yyyy-MM-dd), not UTC instants.";

/** Date-only values as YYYY-MM-DD without UTC shifting a local midnight. */
export function calendarDate(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const iso = v.toISOString();
    if (iso.endsWith("T00:00:00.000Z")) return iso.slice(0, 10);
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

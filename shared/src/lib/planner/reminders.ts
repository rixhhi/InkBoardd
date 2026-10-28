import { hourOfSlot, parseKey, todayKey } from "./dates.ts";
import { slotCopy } from "./scheduler.ts";
import type { PlannerPrefs, PlanTask } from "./types.ts";

export function reminderSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestReminderPermission(): Promise<boolean> {
  if (!reminderSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const res = await Notification.requestPermission();
  return res === "granted";
}

/** Quiet hours wrap midnight: 22→7 means 10pm–7am. Equal start/end means off. */
export function inQuietHours(hour: number, start: number | null, end: number | null): boolean {
  if (start == null || end == null) return false;
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export function reminderHourOf(prefs: PlannerPrefs): number {
  if (prefs.reminderHour != null) return prefs.reminderHour;
  return hourOfSlot(prefs.timeSlot);
}

export function scheduleInAppBanner(prefs: PlannerPrefs, todayTasks: PlanTask[], now = new Date()): string | null {
  if (!prefs.reminders) return null;
  if (inQuietHours(now.getHours(), prefs.quietStart, prefs.quietEnd)) return null;
  const pending = todayTasks.filter((t) => t.status === "pending");
  if (!pending.length) return null;
  return `${slotCopy(prefs.timeSlot)} · ${pending.length} class${pending.length === 1 ? "" : "es"} left today`;
}

export function maybeNotify(prefs: PlannerPrefs, todayTasks: PlanTask[], now = new Date()) {
  if (!prefs.reminders || !reminderSupported() || Notification.permission !== "granted") return;
  if (inQuietHours(now.getHours(), prefs.quietStart, prefs.quietEnd)) return;
  const pending = todayTasks.filter((t) => t.status === "pending");
  if (!pending.length) return;
  const hour = reminderHourOf(prefs);
  if (now.getHours() !== hour || now.getMinutes() > 5) return;
  const key = `inkboard.reminded.${todayKey(now)}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
  new Notification("Inkboard study time", {
    body: `${pending.length} class${pending.length === 1 ? "" : "es"} · ${pending[0]!.title}`,
  });
}

export function nextSlotDate(prefs: PlannerPrefs, from = new Date()): Date {
  const hour = reminderHourOf(prefs);
  const d = parseKey(todayKey(from));
  d.setHours(hour, 0, 0, 0);
  if (d <= from) d.setDate(d.getDate() + 1);
  return d;
}

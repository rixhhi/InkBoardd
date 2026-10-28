import { hourOfSlot, parseKey } from "./dates.ts";
import type { StudyPlan, TimeSlot } from "./types.ts";

function icsEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function utcStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function localStamp(date: string, hour: number): string {
  const d = parseKey(date);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hour)}0000`;
}

export function planToIcs(plan: StudyPlan, now: Date = new Date()): string {
  const hour = hourOfSlot((plan.prefs.timeSlot || "evening") as TimeSlot);
  const stampNow = utcStamp(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Inkboard//Study Planner//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsEscape(plan.name)}`,
  ];
  for (const task of plan.tasks) {
    if (task.status === "skipped") continue;
    const start = localStamp(task.date, hour);
    const endHour = Math.min(23, hour + Math.max(1, Math.ceil(task.durationMin / 60)));
    const end = localStamp(task.date, endHour);
    const play = task.lessonId ? `/play/${task.lessonId}` : "";
    const desc = [task.teacher, `${task.durationMin} min`, play ? `Play ${play}` : ""].filter(Boolean).join(" · ");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${task.id}@inkboard`,
      `DTSTAMP:${stampNow}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${icsEscape(task.title)}`,
      `DESCRIPTION:${icsEscape(desc)}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT15M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape(task.title)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcs(plan: StudyPlan) {
  const blob = new Blob([planToIcs(plan)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${plan.name.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "inkboard-plan"}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

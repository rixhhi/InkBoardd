import { addDaysKey, todayKey } from "./dates.ts";
import { liveSessions, type SessionSource, type StudySession } from "./sessions.ts";
import { liveTasks, type StudyPlan } from "./types.ts";

export type HistoryRange = "today" | "7d" | "30d" | "90d" | "custom";
export type HistoryOutcome = "completed" | "partial" | "skipped" | "";
export type HistorySort = "newest" | "oldest";

export type HistoryFilter = {
  range: HistoryRange;
  from: string;
  to: string;
  subject: string;
  teacher: string;
  courseId: string;
  outcome: HistoryOutcome;
  source: SessionSource | "";
  hasNotes: boolean;
  query: string;
  sort: HistorySort;
};

export type HistoryRow = StudySession & {
  teacher: string;
  lecture: string;
  plannedDate: string | null;
  late: boolean;
};

export function defaultHistoryFilter(today = todayKey()): HistoryFilter {
  return {
    range: "30d",
    from: addDaysKey(today, -29),
    to: today,
    subject: "",
    teacher: "",
    courseId: "",
    outcome: "",
    source: "",
    hasNotes: false,
    query: "",
    sort: "newest",
  };
}

export function rangeBounds(range: HistoryRange, today = todayKey(), custom?: { from: string; to: string }) {
  if (range === "today") return { from: today, to: today };
  if (range === "7d") return { from: addDaysKey(today, -6), to: today };
  if (range === "30d") return { from: addDaysKey(today, -29), to: today };
  if (range === "90d") return { from: addDaysKey(today, -89), to: today };
  return { from: custom?.from || addDaysKey(today, -29), to: custom?.to || today };
}

export function previousPeriod(from: string, to: string): { from: string; to: string } {
  let days = 0;
  for (let d = from; d <= to && days < 400; d = addDaysKey(d, 1)) days += 1;
  return { from: addDaysKey(from, -days), to: addDaysKey(from, -1) };
}

export function enrichSession(session: StudySession, plan: StudyPlan | null): HistoryRow {
  const task = plan ? liveTasks(plan.tasks).find((t) => t.id === session.taskId || t.lessonId === session.lessonId) : undefined;
  const lecture = session.lessonId ? (task?.title ?? "") : "";
  const teacher = task?.teacher ?? "";
  const plannedDate = task?.plannedDate || task?.date || null;
  const late = Boolean(plannedDate && session.date > plannedDate);
  return {
    ...session,
    teacher,
    lecture: lecture || session.subject,
    plannedDate,
    late,
  };
}

export function filterHistory(rows: HistoryRow[], filter: HistoryFilter): HistoryRow[] {
  const q = filter.query.trim().toLowerCase();
  const list = rows.filter((s) => {
    if (s.deletedAt) return false;
    if (s.date < filter.from || s.date > filter.to) return false;
    if (filter.subject && !s.subject.toLowerCase().includes(filter.subject.toLowerCase())) return false;
    if (filter.teacher && !s.teacher.toLowerCase().includes(filter.teacher.toLowerCase())) return false;
    if (filter.courseId && s.courseId !== filter.courseId) return false;
    if (filter.source && s.source !== filter.source) return false;
    if (filter.hasNotes && !s.notes.trim()) return false;
    if (filter.outcome === "completed" && !s.completed) return false;
    if (filter.outcome === "partial" && s.completed) return false;
    if (filter.outcome === "skipped") return false;
    if (q) {
      const hay = `${s.lecture} ${s.notes} ${s.subject} ${s.teacher}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  list.sort((a, b) => (filter.sort === "oldest" ? a.startIso.localeCompare(b.startIso) : b.startIso.localeCompare(a.startIso)));
  return list;
}

export function dailyTotals(rows: HistoryRow[]): { date: string; minutes: number; count: number }[] {
  const map = new Map<string, { minutes: number; count: number }>();
  for (const s of rows) {
    const cur = map.get(s.date) ?? { minutes: 0, count: 0 };
    cur.minutes += s.durationMin;
    cur.count += 1;
    map.set(s.date, cur);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, ...v }));
}

export function sessionsToCsv(rows: HistoryRow[]): string {
  const header = ["date", "start", "end", "subject", "teacher", "lecture", "minutes", "completed", "source", "notes"];
  const lines = [header.join(",")];
  for (const s of rows) {
    const end = new Date(Date.parse(s.startIso) + s.durationMin * 60_000).toISOString();
    const cells = [
      s.date,
      s.startIso,
      end,
      s.subject,
      s.teacher,
      s.lecture,
      String(s.durationMin),
      s.completed ? "yes" : "no",
      s.source,
      s.notes,
    ].map(csvCell);
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

export function csvFilename(filter: Pick<HistoryFilter, "subject" | "query" | "range">): string {
  const bits = ["inkboard-history"];
  if (filter.range && filter.range !== "30d") bits.push(filter.range);
  if (filter.subject.trim()) bits.push(filter.subject.trim().toLowerCase().replace(/[^\w]+/g, "-").slice(0, 24));
  if (filter.query.trim()) bits.push(filter.query.trim().toLowerCase().replace(/[^\w]+/g, "-").slice(0, 24));
  return `${bits.join("-")}.csv`;
}

export function historyCsvExport(rows: HistoryRow[], filter: Pick<HistoryFilter, "subject" | "query" | "range">) {
  return { csv: sessionsToCsv(rows), filename: csvFilename(filter) };
}

function csvCell(value: string): string {
  const v = value.replace(/"/g, '""');
  return /[",\n]/.test(v) ? `"${v}"` : v;
}

export function allHistoryRows(plan: StudyPlan | null, sessions = liveSessions()): HistoryRow[] {
  return sessions.map((s) => enrichSession(s, plan));
}

export function windowedRows<T>(rows: T[], page: number, pageSize: number) {
  const size = Math.max(1, pageSize);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const safePage = Math.min(Math.max(0, page), pages - 1);
  const start = safePage * size;
  return { slice: rows.slice(start, start + size), start, page: safePage, pageSize: size, total: rows.length, pages };
}

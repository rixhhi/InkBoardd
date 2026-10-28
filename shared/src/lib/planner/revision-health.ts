import { asLessons, liveTasks, type LessonReviewState, type PlanTask, type StudyPlan } from "./types.ts";

export type RevisionBucket = {
  due: PlanTask[];
  overdue: PlanTask[];
  shaky: LessonReviewState[];
  solid: number;
  ok: number;
  total: number;
};

export type LectureChip = { id: string; title: string; date: string | null };

export function lectureTitlesFor(plan: StudyPlan, ids: string[]): LectureChip[] {
  const map = new Map<string, LectureChip>();
  for (const t of liveTasks(plan.tasks)) {
    if (!t.lessonId) continue;
    const prev = map.get(t.lessonId);
    if (!prev || t.type === "lesson") {
      map.set(t.lessonId, { id: t.lessonId, title: t.title, date: t.plannedDate || t.date });
    }
  }
  for (const c of plan.courses) {
    for (const l of asLessons(c.lessons)) {
      if (!map.has(l.lessonId)) map.set(l.lessonId, { id: l.lessonId, title: l.title, date: null });
    }
  }
  return ids.map((id) => map.get(id) ?? { id, title: id, date: null });
}

export function lectureChipLabel(chip: LectureChip): string {
  return chip.date ? `${chip.title} · ${chip.date.slice(5)}` : chip.title;
}

export function revisionHealth(plan: StudyPlan, today: string): RevisionBucket {
  const live = liveTasks(plan.tasks).filter((t) => t.type === "revision");
  const pending = live.filter((t) => t.status === "pending");
  const due = pending.filter((t) => t.date === today);
  const overdue = pending.filter((t) => t.date < today);
  const reviews = plan.reviews ?? [];
  const shaky = reviews.filter((r) => r.lastRating === "shaky");
  return {
    due,
    overdue,
    shaky,
    solid: reviews.filter((r) => r.lastRating === "solid").length,
    ok: reviews.filter((r) => r.lastRating === "ok").length,
    total: live.length,
  };
}

export function nextReviewDate(currentDue: string | null, intervalDays: number, from: string): string {
  const base = currentDue && currentDue > from ? currentDue : from;
  const parts = base.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const date = new Date(y, m - 1, d + Math.max(1, intervalDays));
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

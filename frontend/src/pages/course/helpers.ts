import type { UaLesson } from "@/lib/unacademy";

export function fmtWhen(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function groupLessons(lessons: UaLesson[]) {
  if (!lessons.some((l) => l.week != null)) return [{ week: null as number | null, lessons }];
  const map = new Map<number, UaLesson[]>();
  const rest: UaLesson[] = [];
  for (const lesson of lessons) {
    if (lesson.week == null) rest.push(lesson);
    else {
      const list = map.get(lesson.week) ?? [];
      list.push(lesson);
      map.set(lesson.week, list);
    }
  }
  const groups = [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, rows]) => ({ week: week as number | null, lessons: rows }));
  if (rest.length) groups.push({ week: null, lessons: rest });
  return groups;
}

export function mergeUid(prev: UaLesson[], next: UaLesson[]) {
  const map = new Map(prev.map((l) => [l.uid, l]));
  for (const l of next) {
    const old = map.get(l.uid);
    map.set(
      l.uid,
      old
        ? {
            ...old,
            ...l,
            replayId: l.replayId || old.replayId,
            similar: l.replayId || old.replayId ? null : l.similar || old.similar || null,
          }
        : l,
    );
  }
  return [...map.values()].sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
}

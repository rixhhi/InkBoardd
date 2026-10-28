import { extractLessonId } from "./catalog.ts";
import { extractReplayId } from "./unacademy-ids.ts";

export type JumpHref =
  | { kind: "exam"; id: string }
  | { kind: "teacher"; slug: string }
  | { kind: "search"; q: string }
  | { kind: "play"; lessonId: string; title: string; teacher?: string; course?: string }
  | { kind: "path"; to: string; search?: Record<string, string | number | undefined> }
  | { kind: "course"; uid: string; slug?: string; teacher?: string }
  | { kind: "action"; name: "recovery" | "csv" | "share" };

export type JumpItem = {
  group: "Resume" | "Watch later" | "Saved teachers" | "Classes" | "Courses" | "Teachers" | "Exams" | "Planner";
  id: string;
  label: string;
  hint?: string;
  avatar?: string;
  href: JumpHref;
};

export function parseAtUser(raw: string) {
  const t = raw.trim();
  const m = t.match(/^@([A-Za-z][A-Za-z0-9._-]{1,39})$/);
  return m?.[1] ?? "";
}

export function extractPlayId(raw: string): string | null {
  return extractLessonId(raw) || extractReplayId(raw);
}

export function jumpGroupCopy(group: JumpItem["group"]) {
  if (group === "Watch later") return "Folded";
  if (group === "Resume") return "On the board";
  if (group === "Planner") return "Plan";
  return group;
}

export function rankJumps(query: string, items: JumpItem[]): JumpItem[] {
  const q = query.trim().toLowerCase().replace(/^@+/, "");
  if (!q) return items;
  const scored = items
    .map((item) => {
      const hay = `${item.label} ${item.hint ?? ""} ${item.id}`.toLowerCase();
      let score = 0;
      if (item.label.toLowerCase() === q || item.id.toLowerCase() === q) score = 4;
      else if (item.label.toLowerCase().startsWith(q) || hay.startsWith(q)) score = 3;
      else if (hay.includes(q)) score = 1;
      return { item, score };
    })
    .filter((row) => row.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.map((row) => row.item);
}

export function itemsFromHub(hub: {
  teachers?: { username?: string; name?: string }[];
  courses?: { uid?: string; name?: string; slug?: string; authorUsername?: string }[];
  playlists?: { uid?: string; name?: string; authorUsername?: string }[];
}): JumpItem[] {
  const out: JumpItem[] = [];
  for (const t of hub.teachers ?? []) {
    if (!t.username) continue;
    out.push({
      group: "Teachers",
      id: t.username,
      label: t.name || t.username,
      hint: `@${t.username}`,
      href: { kind: "teacher", slug: t.username },
    });
  }
  for (const c of hub.courses ?? []) {
    if (!c.uid || !c.name) continue;
    out.push({
      group: "Courses",
      id: c.uid,
      label: c.name,
      hint: c.authorUsername,
      href: { kind: "course", uid: c.uid, slug: c.slug, teacher: c.authorUsername },
    });
  }
  return out;
}

export function itemsFromCourse(page: {
  course?: { uid?: string; name?: string; slug?: string; authorUsername?: string };
  lessons?: { uid?: string; title?: string; replayId?: string | null }[];
}): JumpItem[] {
  const out: JumpItem[] = [];
  if (page.course?.uid && page.course.name) {
    out.push({
      group: "Courses",
      id: page.course.uid,
      label: page.course.name,
      href: { kind: "course", uid: page.course.uid, slug: page.course.slug, teacher: page.course.authorUsername },
    });
  }
  for (const lesson of page.lessons ?? []) {
    if (!lesson.replayId || !lesson.title) continue;
    out.push({
      group: "Classes",
      id: lesson.replayId,
      label: lesson.title,
      href: { kind: "play", lessonId: lesson.replayId, title: lesson.title, course: page.course?.uid },
    });
  }
  return out;
}

export function itemsFromEducator(edu: {
  username?: string;
  name?: string;
  courses?: { uid?: string; name?: string; slug?: string }[];
}): JumpItem[] {
  const out: JumpItem[] = [];
  if (edu.username) {
    out.push({
      group: "Teachers",
      id: edu.username,
      label: edu.name || edu.username,
      hint: `@${edu.username}`,
      href: { kind: "teacher", slug: edu.username },
    });
  }
  for (const c of edu.courses ?? []) {
    if (!c.uid || !c.name) continue;
    out.push({
      group: "Courses",
      id: c.uid,
      label: c.name,
      href: { kind: "course", uid: c.uid, slug: c.slug, teacher: edu.username },
    });
  }
  return out;
}

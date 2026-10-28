import type { SavedChapterLecture } from "./chapter.ts";
import type { SavedCourse, SavedCourseChapter } from "./course.ts";

export type FolderKind = "course" | "chapter" | "lecture" | "unknown";

export function detectFolderKind(names: string[]): FolderKind {
  const n = names.map((p) => p.replace(/\\/g, "/").replace(/^\.\//, ""));
  if (n.some((p) => p === "course.json" || p.endsWith("/course.json"))) return "course";
  if (n.some((p) => p === "chapter.json" || p.endsWith("/chapter.json"))) return "chapter";
  if (n.some((p) => p === "manifest.json" || p.endsWith("/manifest.json"))) return "lecture";
  return "unknown";
}

export function jsonDirPrefix(names: string[], file: string): string {
  const hit = names
    .map((p) => p.replace(/\\/g, "/").replace(/^\.\//, ""))
    .find((p) => p === file || p.endsWith(`/${file}`));
  if (!hit) return "";
  const i = hit.lastIndexOf("/");
  return i >= 0 ? hit.slice(0, i) : "";
}

export function chapterLecturePath(dir: string, file: string): string {
  return `${dir.replace(/\/$/, "")}/${file.replace(/^\//, "")}`;
}

export function nextSavedLecture(
  lectures: SavedChapterLecture[],
  currentId: string,
): SavedChapterLecture | null {
  const i = lectures.findIndex((l) => l.lessonId === currentId);
  if (i < 0) return null;
  return lectures.slice(i + 1).find((l) => l.status === "done") ?? null;
}

export function prevSavedLecture(
  lectures: SavedChapterLecture[],
  currentId: string,
): SavedChapterLecture | null {
  const i = lectures.findIndex((l) => l.lessonId === currentId);
  if (i <= 0) return null;
  return lectures.slice(0, i).reverse().find((l) => l.status === "done") ?? null;
}

/** First saved lecture that is not within 5s of the end. */
export function continueLecture(
  lectures: SavedChapterLecture[],
  posSec: (id: string) => number,
): SavedChapterLecture | null {
  const done = lectures.filter((l) => l.status === "done");
  if (!done.length) return null;
  const open = done.find((l) => {
    const dur = l.durationMs / 1000;
    const t = posSec(l.lessonId);
    return dur <= 0 || t < dur - 5;
  });
  return open ?? done[0] ?? null;
}

export function flattenCourseLectures(course: SavedCourse): SavedChapterLecture[] {
  const rows: SavedChapterLecture[] = [];
  for (const ch of course.chapters) {
    for (const l of ch.lectures) {
      rows.push({
        ...l,
        dir: ch.dir ? `${ch.dir}/${l.dir}` : l.dir,
      });
    }
  }
  return rows;
}

export function courseProgress(course: SavedCourse): { saved: number; total: number } {
  const all = course.chapters.flatMap((c) => c.lectures);
  return { saved: all.filter((l) => l.status === "done").length, total: all.length };
}

export function continueCourseLecture(
  course: SavedCourse,
  posSec: (id: string) => number,
): { chapter: SavedCourseChapter; lecture: SavedChapterLecture } | null {
  for (const ch of course.chapters) {
    const hit = continueLecture(ch.lectures, posSec);
    if (hit) return { chapter: ch, lecture: hit };
  }
  return null;
}

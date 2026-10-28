import { nowIso } from "./dates.ts";
import { uid } from "./ids.ts";

export const BOOKMARK_KEY = "inkboard.planner.bookmarks.v1";

export type LectureBookmark = {
  id: string;
  lessonId: string;
  title: string;
  seconds: number;
  note: string;
  createdAt: string;
};

function canStore() {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

export function readBookmarks(): LectureBookmark[] {
  if (!canStore()) return [];
  try {
    const raw = localStorage.getItem(BOOKMARK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LectureBookmark[];
    return Array.isArray(parsed) ? parsed.filter((b) => b?.lessonId) : [];
  } catch {
    return [];
  }
}

function writeAll(list: LectureBookmark[]) {
  if (!canStore()) return;
  try {
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify(list.slice(0, 400)));
  } catch {
    /* quota */
  }
}

export function addBookmark(input: { lessonId: string; title: string; seconds: number; note: string }): LectureBookmark {
  const row: LectureBookmark = {
    id: uid("bm"),
    lessonId: input.lessonId,
    title: input.title,
    seconds: Math.max(0, Math.round(input.seconds)),
    note: input.note.trim(),
    createdAt: nowIso(),
  };
  writeAll([row, ...readBookmarks().filter((b) => !(b.lessonId === row.lessonId && b.seconds === row.seconds))]);
  return row;
}

export function removeBookmark(id: string) {
  writeAll(readBookmarks().filter((b) => b.id !== id));
}

export function bookmarksFor(lessonId: string): LectureBookmark[] {
  return readBookmarks()
    .filter((b) => b.lessonId === lessonId)
    .sort((a, b) => a.seconds - b.seconds);
}

export function bookmarksForLessons(lessonIds: string[]): LectureBookmark[] {
  const set = new Set(lessonIds);
  return readBookmarks()
    .filter((b) => set.has(b.lessonId))
    .sort((a, b) => a.seconds - b.seconds);
}

export function formatStamp(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function revisionBookmarkLine(lessonIds: string[]): string {
  const hits = bookmarksForLessons(lessonIds).slice(0, 4);
  if (!hits.length) return "";
  return hits.map((b) => `${formatStamp(b.seconds)}${b.note ? ` ${b.note}` : ""}`).join(" · ");
}

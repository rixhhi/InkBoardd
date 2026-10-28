export type SavedTeacher = {
  username: string;
  name: string;
  avatar: string;
  at: number;
};

export type RecentSearch = {
  q: string;
  at: number;
};

export type LaterItem = {
  lessonId: string;
  title: string;
  teacher?: string;
  course?: string;
  at: number;
};

const SAVED = "inkboard.saved.v1";
const RECENT = "inkboard.recent.v1";
const LATER = "inkboard.later.v1";
const MAX_SAVED = 24;
const MAX_RECENT = 10;
const MAX_LATER = 40;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null") as unknown;
    return raw == null ? fallback : (raw as T);
  } catch {
    return fallback;
  }
}

export function readSaved(): SavedTeacher[] {
  const list = readJson<SavedTeacher[]>(SAVED, []);
  return list.filter((t) => t && typeof t.username === "string").slice(0, MAX_SAVED);
}

export function isSaved(username: string) {
  const u = username.trim().toLowerCase();
  return readSaved().some((t) => t.username.toLowerCase() === u);
}

export function toggleSaved(teacher: Omit<SavedTeacher, "at">): boolean {
  const u = teacher.username.trim();
  if (!u) return false;
  const list = readSaved().filter((t) => t.username.toLowerCase() !== u.toLowerCase());
  const nowSaved = list.length === readSaved().length;
  if (nowSaved) list.unshift({ ...teacher, username: u, at: Date.now() });
  localStorage.setItem(SAVED, JSON.stringify(list.slice(0, MAX_SAVED)));
  return nowSaved;
}

export function readRecents(): RecentSearch[] {
  const list = readJson<RecentSearch[]>(RECENT, []);
  return list.filter((r) => r && typeof r.q === "string" && r.q.trim()).slice(0, MAX_RECENT);
}

export function pushRecent(q: string) {
  const t = q.trim().replace(/^@+/, "");
  if (t.length < 2) return;
  const list = readRecents().filter((r) => r.q.toLowerCase() !== t.toLowerCase());
  list.unshift({ q: t, at: Date.now() });
  localStorage.setItem(RECENT, JSON.stringify(list.slice(0, MAX_RECENT)));
}

export function clearRecents() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(RECENT);
}

export function readLater(): LaterItem[] {
  const list = readJson<LaterItem[]>(LATER, []);
  return list.filter((x) => x && typeof x.lessonId === "string" && x.lessonId.length >= 6).slice(0, MAX_LATER);
}

export function isLater(lessonId: string) {
  return readLater().some((x) => x.lessonId === lessonId);
}

export function toggleLater(item: Omit<LaterItem, "at">): boolean {
  const id = item.lessonId.trim();
  if (!id) return false;
  const list = readLater().filter((x) => x.lessonId !== id);
  const added = list.length === readLater().length;
  if (added) list.unshift({ ...item, lessonId: id, at: Date.now() });
  localStorage.setItem(LATER, JSON.stringify(list.slice(0, MAX_LATER)));
  return added;
}

export function removeLater(lessonId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LATER, JSON.stringify(readLater().filter((x) => x.lessonId !== lessonId)));
}

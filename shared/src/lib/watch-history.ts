export type WatchEntry = {
  lessonId: string;
  title: string;
  teacher?: string;
  course?: string;
  examId?: string;
  examName?: string;
  t: number;
  duration: number;
  at: number;
};

const KEY = "inkboard.watch.v1";
const MAX = 16;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function subscribeHistory(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function readHistory(): WatchEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((row): row is WatchEntry => {
        const r = row as WatchEntry;
        return Boolean(r && typeof r.lessonId === "string" && r.lessonId.length >= 6);
      })
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function writeHistory(list: WatchEntry[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  emit();
}

export function saveProgress(entry: Omit<WatchEntry, "at">) {
  if (typeof localStorage === "undefined") return;
  const list = readHistory().filter((x) => x.lessonId !== entry.lessonId);
  const remaining = entry.duration - entry.t;
  if (!Number.isFinite(entry.t) || entry.t < 8 || !Number.isFinite(entry.duration) || remaining < 12) {
    writeHistory(list);
    return;
  }
  list.unshift({ ...entry, at: Date.now() });
  writeHistory(list);
}

export function peekProgress(lessonId: string) {
  return readHistory().find((x) => x.lessonId === lessonId)?.t ?? 0;
}

export function removeEntry(lessonId: string) {
  if (typeof localStorage === "undefined") return;
  writeHistory(readHistory().filter((x) => x.lessonId !== lessonId));
}

export function clearHistory() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(KEY);
  emit();
}

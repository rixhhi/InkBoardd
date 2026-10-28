/** One Unacademy week group (or the whole shelf if the course has no weeks). */

export const CHAPTER_FORMAT = "inkboard-chapter";
export const CHAPTER_SAVED_FORMAT = "inkboard-chapter-saved";
export const CHAPTER_VERSION = 1;
export const CHAPTER_MAX_LECTURES = 30;
export const LESSON_ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
/** Conservative disk guess: 60 MB per 10 minutes of lecture plus 30 MB overhead. */
export const ESTIMATE_BYTES_PER_10_MIN = 60 * 1024 * 1024;
export const ESTIMATE_BYTES_OVERHEAD = 30 * 1024 * 1024;
export const FOLDER_NAME_MAX = 80;

const WIN_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

export type ChapterLecture = {
  lessonId: string;
  title: string;
  order: number;
  durationMs: number;
};

export type Chapter = {
  format: "inkboard-chapter";
  version: number;
  courseId: string;
  courseTitle: string;
  chapterId: string;
  chapterTitle: string;
  createdAt: string;
  lectures: ChapterLecture[];
};

export type SavedLectureStatus = "done" | "archived" | "failed" | "pending";

export type SavedChapterLecture = ChapterLecture & {
  dir: string;
  status: SavedLectureStatus;
  error?: string;
};

export type SavedChapter = {
  format: "inkboard-chapter-saved";
  version: number;
  courseId: string;
  courseTitle: string;
  chapterId: string;
  chapterTitle: string;
  createdAt: string;
  lectures: SavedChapterLecture[];
};

function fail(msg: string): never {
  throw new Error(msg);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x);
}

function asString(x: unknown, label: string, max = 200): string {
  if (typeof x !== "string" || !x.trim()) fail(`${label} is invalid`);
  if (x.length > max) fail(`${label} is too long`);
  return x.trim();
}

export function asLecture(x: unknown, i: number, seen: Set<string>): ChapterLecture {
  if (!isRecord(x)) fail(`lectures[${i}] is missing`);
  const lessonId = x.lessonId;
  if (typeof lessonId !== "string" || !LESSON_ID_RE.test(lessonId)) fail(`lectures[${i}].lessonId is invalid`);
  if (seen.has(lessonId)) fail(`duplicate lesson id ${lessonId}`);
  seen.add(lessonId);
  const title = asString(x.title, `lectures[${i}].title`, 200);
  const order = x.order;
  if (typeof order !== "number" || !Number.isInteger(order) || order < 1) fail(`lectures[${i}].order is invalid`);
  const durationMs = x.durationMs;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) {
    fail(`lectures[${i}].durationMs is invalid`);
  }
  return { lessonId, title, order, durationMs };
}

export function parseLectures(rows: unknown, max: number, seen = new Set<string>()): ChapterLecture[] {
  if (!Array.isArray(rows)) fail("lectures is missing");
  if (rows.length === 0) fail("lectures is empty");
  if (rows.length > max) {
    fail(`this chapter has ${rows.length} lectures; the saver will not take more than ${max}`);
  }
  return rows.map((row, i) => asLecture(row, i, seen));
}

export function validateChapter(x: unknown, maxLectures = CHAPTER_MAX_LECTURES): Chapter {
  if (!isRecord(x)) fail("chapter is not an object");
  if (x.format !== CHAPTER_FORMAT) fail(`unknown format ${String(x.format)}`);
  if (typeof x.version !== "number" || !Number.isInteger(x.version)) fail("version is invalid");
  if (x.version !== CHAPTER_VERSION) fail(`unsupported chapter version ${x.version}`);
  const courseId = asString(x.courseId, "courseId", 40);
  const courseTitle = asString(x.courseTitle, "courseTitle", 200);
  const chapterId = asString(x.chapterId, "chapterId", 80);
  const chapterTitle = asString(x.chapterTitle, "chapterTitle", 200);
  if (typeof x.createdAt !== "string" || Number.isNaN(Date.parse(x.createdAt))) fail("createdAt is invalid");
  const lectures = parseLectures(x.lectures, maxLectures);
  return {
    format: CHAPTER_FORMAT,
    version: x.version,
    courseId,
    courseTitle,
    chapterId,
    chapterTitle,
    createdAt: x.createdAt,
    lectures,
  };
}

const STATUSES: SavedLectureStatus[] = ["done", "archived", "failed", "pending"];

export function isSafeFolderName(name: string): boolean {
  if (typeof name !== "string" || !name) return false;
  if (name.length > FOLDER_NAME_MAX) return false;
  if (name === "." || name === "..") return false;
  if (name.startsWith(".") || name.endsWith(".") || name.startsWith(" ") || name.endsWith(" ")) return false;
  if (/[/\\:*?"<>|]/.test(name)) return false;
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) < 32) return false;
  }
  if (WIN_RESERVED.test(name)) return false;
  return true;
}

export function validateSavedChapter(x: unknown): SavedChapter {
  if (!isRecord(x)) fail("saved chapter is not an object");
  if (x.format !== CHAPTER_SAVED_FORMAT) fail(`unknown format ${String(x.format)}`);
  const base = validateChapter({ ...x, format: CHAPTER_FORMAT }, 400);
  const lectures = (x.lectures as unknown[]).map((row, i) => {
    if (!isRecord(row)) fail(`lectures[${i}] is missing`);
    const lecture = base.lectures[i]!;
    const dir = row.dir;
    if (typeof dir !== "string" || !isSafeFolderName(dir)) fail(`lectures[${i}].dir is invalid`);
    const status = row.status;
    if (typeof status !== "string" || !STATUSES.includes(status as SavedLectureStatus)) {
      fail(`lectures[${i}].status is invalid`);
    }
    const error = typeof row.error === "string" ? row.error : undefined;
    return { ...lecture, dir, status: status as SavedLectureStatus, error };
  });
  return { ...base, format: CHAPTER_SAVED_FORMAT, lectures };
}

export function chapterFileSlug(title: string, id: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const fallback = id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16);
  return s || fallback || "chapter";
}

export function lectureDirName(order: number, lessonId: string): string {
  return `${String(order).padStart(3, "0")}-lecture-${lessonId}`;
}

function sanitizeSlug(raw: string, maxLen: number): string {
  let n = raw.replace(/[/\\:*?"<>|]/g, "").replace(/^[\s.]+|[\s.]+$/g, "");
  if (!n) n = "Untitled";
  if (WIN_RESERVED.test(n)) n = `${n}Folder`;
  if (n.length > maxLen) n = n.slice(0, maxLen).replace(/[\s.]+$/g, "");
  if (!n) n = "Untitled";
  return n;
}

/** Unicode-aware PascalCase folder name. Punctuation is dropped; scripts stay. */
export function folderSlug(title: string, maxLen = 60): string {
  const cap = Math.min(Math.max(1, maxLen), FOLDER_NAME_MAX);
  const parts = String(title || "")
    .normalize("NFC")
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
  if (!parts.length) return "Untitled";
  const words = parts.map((w) => w.charAt(0).toLocaleUpperCase() + w.slice(1));
  let out = "";
  for (const w of words) {
    const next = out + w;
    if (next.length > cap) {
      if (!out) return sanitizeSlug(w.slice(0, cap), cap);
      break;
    }
    out = next;
  }
  return sanitizeSlug(out || "Untitled", cap);
}

export function padOrder(order: number, total = 1): string {
  const width = total > 99 ? 3 : 2;
  return String(Math.max(1, order)).padStart(width, "0");
}

export function lectureFolderName(order: number, title: string, total = 1): string {
  return `${padOrder(order, total)}_${folderSlug(title)}`;
}

export function chapterFolderName(index: number, title: string, total = 1): string {
  return `${padOrder(index, total)}_${folderSlug(title)}`;
}

export function courseFolderName(title: string): string {
  return folderSlug(title, FOLDER_NAME_MAX);
}

export function uniqueName(name: string, taken: Set<string>): string {
  const has = (s: string) => {
    const k = s.toLowerCase();
    for (const t of taken) if (t.toLowerCase() === k) return true;
    return false;
  };
  if (!has(name)) return name;
  let i = 2;
  while (has(`${name}_${i}`)) i += 1;
  return `${name}_${i}`;
}

export function estimateLectureBytes(durationMs: number): number {
  const minutes = Math.max(0, Number(durationMs) || 0) / 60_000;
  const blocks = Math.max(1, Math.ceil(minutes / 10));
  return blocks * ESTIMATE_BYTES_PER_10_MIN + ESTIMATE_BYTES_OVERHEAD;
}

export function isOldLectureFolder(name: string): boolean {
  return /^(\d{3}-)?lecture-[A-Za-z0-9_-]{6,40}$/.test(name);
}

export function isOldChapterFolder(name: string): boolean {
  return /^chapter-[A-Za-z0-9._-]+$/.test(name);
}

export function saveChapterCommand(slug: string): string {
  return `npm run save-chapter -- ./chapter-${slug}.json --out ./saved`;
}

export function saveLectureCommand(id: string): string {
  if (!LESSON_ID_RE.test(id)) fail("lesson id is invalid");
  return `npm run save -- ${id} --out ./saved`;
}

export type CatalogLesson = {
  replayId: string | null;
  title: string;
  durationSec: number;
  playable: boolean;
  status: string;
};

/** Replays you can actually open. Live / upcoming / archived stay off the list. */
export function playableReplays(lessons: CatalogLesson[]): CatalogLesson[] {
  return lessons.filter(
    (l) =>
      Boolean(l.playable) &&
      Boolean(l.replayId) &&
      l.status !== "live" &&
      l.status !== "upcoming" &&
      l.status !== "archived",
  );
}

export function buildChapter(input: {
  courseId: string;
  courseTitle: string;
  chapterId: string;
  chapterTitle: string;
  createdAt?: string;
  lessons: CatalogLesson[];
  sortByPart?: boolean;
}): Chapter {
  const playable = playableReplays(input.lessons);
  let lectures: ChapterLecture[] = playable.map((l, i) => ({
    lessonId: l.replayId as string,
    title: l.title.slice(0, 200),
    order: i + 1,
    durationMs: Math.max(0, Math.round((l.durationSec || 0) * 1000)),
  }));
  if (input.sortByPart) lectures = naturalLectureSort(lectures);
  return validateChapter({
    format: CHAPTER_FORMAT,
    version: CHAPTER_VERSION,
    courseId: input.courseId,
    courseTitle: input.courseTitle,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    createdAt: input.createdAt || new Date().toISOString(),
    lectures,
  });
}

export function totalDurationMs(lectures: { durationMs: number }[]): number {
  return lectures.reduce((n, l) => n + (l.durationMs || 0), 0);
}

export function formatChapterDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function lectureStatusLabel(status: SavedLectureStatus): string {
  if (status === "done") return "saved";
  if (status === "pending") return "missing";
  return status;
}

export function assignLectureDirs(lectures: ChapterLecture[]): SavedChapterLecture[] {
  const taken = new Set<string>();
  const total = lectures.length;
  return lectures.map((l) => {
    const dir = uniqueName(lectureFolderName(l.order, l.title, total), taken);
    taken.add(dir);
    return { ...l, dir, status: "pending" as const };
  });
}

const PART_RE = /^(.*?)(?:\s*[-–—:]*\s*)(?:part\s*-?\s*)([ivxlcdm]+|\d+)\s*$/i;

function romanToInt(raw: string): number | null {
  const map: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const t = raw.toLowerCase();
  if (!t || t.length > 12) return null;
  for (const ch of t) if (map[ch] == null) return null;
  let n = 0;
  for (let i = 0; i < t.length; i++) {
    const cur = map[t[i]!]!;
    const next = map[t[i + 1]!] || 0;
    n += cur < next ? -cur : cur;
  }
  return n > 0 ? n : null;
}

export function parseLecturePart(title: string): { prefix: string; num: number | null } {
  const text = String(title || "").trim();
  const m = text.match(PART_RE);
  if (!m) return { prefix: text, num: null };
  const token = m[2]!;
  const num = /^\d+$/.test(token) ? Number.parseInt(token, 10) : romanToInt(token);
  if (num == null) return { prefix: text, num: null };
  const prefix = m[1]!.replace(/[\s\-–—:]+$/g, "").trim();
  return { prefix, num };
}

/** "Random Variable" and "Random Variables" share a group; "Bivariate …" does not. */
export function lectureGroupKey(prefix: string): string {
  return prefix
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z]{3,})s$/i, "$1");
}

/** Groups by first appearance, then Part I/II/03. Numberless rows keep their seats. */
export function naturalLectureSort<T extends { title: string; order: number }>(lectures: T[]): T[] {
  const rows = lectures.map((l, i) => ({ l, i, ...parseLecturePart(l.title) }));
  const groups = new Map<string, typeof rows>();
  const firstAt = new Map<string, number>();
  for (const r of rows) {
    if (r.num == null) continue;
    const key = lectureGroupKey(r.prefix);
    if (!groups.has(key)) {
      groups.set(key, []);
      firstAt.set(key, r.i);
    }
    groups.get(key)!.push(r);
  }
  const sortedNumbered: typeof rows = [];
  for (const key of [...groups.keys()].sort((a, b) => (firstAt.get(a) ?? 0) - (firstAt.get(b) ?? 0))) {
    const g = groups.get(key)!;
    g.sort((a, b) => (a.num ?? 0) - (b.num ?? 0) || a.i - b.i);
    sortedNumbered.push(...g);
  }
  let k = 0;
  const ordered = rows.map((r) => (r.num == null ? r : sortedNumbered[k++]!));
  return ordered.map((row, i) => ({ ...row.l, order: i + 1 }));
}

export function estimatePlanBytes(lectures: { durationMs: number }[]): number {
  return lectures.reduce((n, l) => n + estimateLectureBytes(l.durationMs), 0);
}

export function formatPlanHours(ms: number): string {
  return `${(Math.max(0, ms) / 3_600_000).toFixed(1)} h`;
}

export function lectureNeedsDownload(
  row: { status?: string },
  opts: { retryArchived?: boolean } = {},
): boolean {
  if (row.status === "done") return false;
  if (row.status === "archived" && !opts.retryArchived) return false;
  return true;
}


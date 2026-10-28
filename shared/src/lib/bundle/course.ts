import {
  CHAPTER_FORMAT,
  CHAPTER_VERSION,
  asLecture,
  chapterFileSlug,
  folderSlug,
  isSafeFolderName,
  type CatalogLesson,
  type ChapterLecture,
  type SavedChapterLecture,
  type SavedLectureStatus,
  playableReplays,
  totalDurationMs,
  naturalLectureSort,
} from "./chapter.ts";

export const COURSE_FORMAT = "inkboard-course";
export const COURSE_SAVED_FORMAT = "inkboard-course-saved";
export const COURSE_VERSION = 1;
export const COURSE_MAX_CHAPTERS = 60;
export const COURSE_CHAPTER_MAX_LECTURES = 60;
export const COURSE_MAX_LECTURES = 400;
export const RUN_MAX_LECTURES_DEFAULT = 30;
export const RUN_MAX_LECTURES_HARD = 60;

export type CourseChapter = {
  chapterId: string;
  chapterTitle: string;
  order: number;
  lectures: ChapterLecture[];
};

export type Course = {
  format: "inkboard-course";
  version: number;
  courseId: string;
  courseTitle: string;
  createdAt: string;
  chapters: CourseChapter[];
};

export type SavedCourseChapter = Omit<CourseChapter, "lectures"> & {
  dir: string;
  status: SavedLectureStatus | "limit";
  lectures: SavedChapterLecture[];
};

export type SavedCourse = {
  format: "inkboard-course-saved";
  version: number;
  courseId: string;
  courseTitle: string;
  createdAt: string;
  chapters: SavedCourseChapter[];
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

export function validateCourse(x: unknown): Course {
  if (!isRecord(x)) fail("course is not an object");
  if (x.format !== COURSE_FORMAT) fail(`unknown format ${String(x.format)}`);
  if (typeof x.version !== "number" || !Number.isInteger(x.version)) fail("version is invalid");
  if (x.version !== COURSE_VERSION) fail(`unsupported course version ${x.version}`);
  const courseId = asString(x.courseId, "courseId", 40);
  const courseTitle = asString(x.courseTitle, "courseTitle", 200);
  if (typeof x.createdAt !== "string" || Number.isNaN(Date.parse(x.createdAt))) fail("createdAt is invalid");
  if (!Array.isArray(x.chapters) || x.chapters.length === 0) fail("chapters is empty");
  if (x.chapters.length > COURSE_MAX_CHAPTERS) {
    fail(`this course has ${x.chapters.length} chapters; the saver will not take more than ${COURSE_MAX_CHAPTERS}`);
  }
  const seen = new Set<string>();
  let total = 0;
  const chapters: CourseChapter[] = x.chapters.map((row, i) => {
    if (!isRecord(row)) fail(`chapters[${i}] is missing`);
    const chapterId = asString(row.chapterId, `chapters[${i}].chapterId`, 80);
    const chapterTitle = asString(row.chapterTitle, `chapters[${i}].chapterTitle`, 200);
    const order = row.order;
    if (typeof order !== "number" || !Number.isInteger(order) || order < 1) fail(`chapters[${i}].order is invalid`);
    if (!Array.isArray(row.lectures) || row.lectures.length === 0) fail(`chapters[${i}] lectures is empty`);
    if (row.lectures.length > COURSE_CHAPTER_MAX_LECTURES) {
      fail(`chapters[${i}] has ${row.lectures.length} lectures; a course chapter may hold ${COURSE_CHAPTER_MAX_LECTURES}`);
    }
    const lectures = row.lectures.map((lec, j) => asLecture(lec, j, seen));
    total += lectures.length;
    return { chapterId, chapterTitle, order, lectures };
  });
  if (total > COURSE_MAX_LECTURES) fail(`this course has ${total} lectures; the saver will not take more than ${COURSE_MAX_LECTURES}`);
  return { format: COURSE_FORMAT, version: x.version, courseId, courseTitle, createdAt: x.createdAt, chapters };
}

export function validateSavedCourse(x: unknown): SavedCourse {
  if (!isRecord(x)) fail("saved course is not an object");
  if (x.format !== COURSE_SAVED_FORMAT) fail(`unknown format ${String(x.format)}`);
  const base = validateCourse({ ...x, format: COURSE_FORMAT });
  const chapters: SavedCourseChapter[] = (x.chapters as unknown[]).map((row, i) => {
    if (!isRecord(row)) fail(`chapters[${i}] is missing`);
    const ch = base.chapters[i]!;
    const dir = row.dir;
    if (typeof dir !== "string" || !isSafeFolderName(dir)) fail(`chapters[${i}].dir is invalid`);
    const status = row.status;
    const okStatus = status === "done" || status === "archived" || status === "failed" || status === "pending" || status === "limit";
    if (!okStatus) fail(`chapters[${i}].status is invalid`);
    const lectures = (Array.isArray(row.lectures) ? row.lectures : []).map((lec, j) => {
      if (!isRecord(lec)) fail(`chapters[${i}].lectures[${j}] is missing`);
      const lecture = ch.lectures[j]!;
      const ldir = typeof lec.dir === "string" ? lec.dir : "";
      if (ldir && !isSafeFolderName(ldir)) fail(`chapters[${i}].lectures[${j}].dir is invalid`);
      const st = lec.status;
      if (st !== "done" && st !== "archived" && st !== "failed" && st !== "pending") {
        fail(`chapters[${i}].lectures[${j}].status is invalid`);
      }
      return { ...lecture, dir: ldir, status: st as SavedLectureStatus, error: typeof lec.error === "string" ? lec.error : undefined };
    });
    return { ...ch, dir, status: status as SavedCourseChapter["status"], lectures };
  });
  return { ...base, format: COURSE_SAVED_FORMAT, chapters };
}

export function courseFileSlug(title: string, id: string): string {
  return chapterFileSlug(title, id);
}

export function saveCourseCommand(slug: string): string {
  return `npm run save-course -- ./course-${slug}.json --out ./saved`;
}

export function buildCourse(input: {
  courseId: string;
  courseTitle: string;
  createdAt?: string;
  chapters: { chapterId: string; chapterTitle: string; lessons: CatalogLesson[] }[];
  sortByPart?: boolean;
}): Course {
  const chapters: CourseChapter[] = [];
  let order = 1;
  for (const ch of input.chapters) {
    const playable = playableReplays(ch.lessons);
    if (!playable.length) continue;
    let lectures = playable.map((l, i) => ({
      lessonId: l.replayId as string,
      title: l.title.slice(0, 200),
      order: i + 1,
      durationMs: Math.max(0, Math.round((l.durationSec || 0) * 1000)),
    }));
    if (input.sortByPart) lectures = naturalLectureSort(lectures);
    chapters.push({
      chapterId: ch.chapterId,
      chapterTitle: ch.chapterTitle,
      order,
      lectures,
    });
    order += 1;
  }
  return validateCourse({
    format: COURSE_FORMAT,
    version: COURSE_VERSION,
    courseId: input.courseId,
    courseTitle: input.courseTitle,
    createdAt: input.createdAt || new Date().toISOString(),
    chapters,
  });
}

export function courseLectureCount(course: { chapters: { lectures: unknown[] }[] }): number {
  return course.chapters.reduce((n, ch) => n + ch.lectures.length, 0);
}

export function courseDurationMs(course: { chapters: { lectures: { durationMs: number }[] }[] }): number {
  return course.chapters.reduce((n, ch) => n + totalDurationMs(ch.lectures), 0);
}

export function chapterAsInkboardChapter(
  course: Course,
  chapter: CourseChapter,
): {
  format: typeof CHAPTER_FORMAT;
  version: number;
  courseId: string;
  courseTitle: string;
  chapterId: string;
  chapterTitle: string;
  createdAt: string;
  lectures: ChapterLecture[];
} {
  return {
    format: CHAPTER_FORMAT,
    version: CHAPTER_VERSION,
    courseId: course.courseId,
    courseTitle: course.courseTitle,
    chapterId: chapter.chapterId,
    chapterTitle: chapter.chapterTitle,
    createdAt: course.createdAt,
    lectures: chapter.lectures,
  };
}

export function clampRunBudget(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < 1) return RUN_MAX_LECTURES_DEFAULT;
  return Math.min(RUN_MAX_LECTURES_HARD, Math.floor(v));
}

export { folderSlug };

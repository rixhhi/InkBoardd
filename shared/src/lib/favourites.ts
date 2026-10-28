/** Courses a student keeps, plus per-lecture practice and where they stopped.
 * Stored on this device. The planner can take over once sign-in exists. */

export type LectureChecks = {
  notes: boolean;
  questions: boolean;
  teacherQuestions: boolean;
  revision: boolean;
};

export type FavouriteCourse = {
  courseId: string;
  title: string;
  teacher: string;
  teacherName: string;
  slug: string;
  savedAt: number;
  chaptersDone: string[];
};

export type Place = {
  lessonId: string;
  title: string;
  courseId: string;
  teacher: string;
  t: number;
  duration: number;
  at: number;
};

export type ContinuePick = {
  lessonId: string;
  title: string;
  t: number;
  finished: boolean;
};

type FavFile = {
  courses: FavouriteCourse[];
  lessons: Record<string, LectureChecks>;
};

const FKEY = "inkboard.favourites.v1";
const PKEY = "inkboard.places.v1";
const MAX_COURSES = 80;
const MAX_PLACES = 500;

const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function subscribeFavourites(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emptyChecks(): LectureChecks {
  return { notes: false, questions: false, teacherQuestions: false, revision: false };
}

function blankFile(): FavFile {
  return { courses: [], lessons: {} };
}

function readFile(): FavFile {
  if (typeof localStorage === "undefined") return blankFile();
  try {
    const raw = JSON.parse(localStorage.getItem(FKEY) || "null") as FavFile | null;
    if (!raw || !Array.isArray(raw.courses)) return blankFile();
    return {
      courses: raw.courses.filter((c) => c && typeof c.courseId === "string" && c.courseId.length > 0).slice(0, MAX_COURSES),
      lessons: raw.lessons && typeof raw.lessons === "object" ? raw.lessons : {},
    };
  } catch {
    return blankFile();
  }
}

function writeFile(file: FavFile) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(FKEY, JSON.stringify(file));
  emit();
}

export function readFavourites(): FavouriteCourse[] {
  return readFile().courses;
}

export function isFavourite(courseId: string) {
  return readFile().courses.some((c) => c.courseId === courseId);
}

export function saveFavourite(course: Omit<FavouriteCourse, "savedAt" | "chaptersDone"> & { chaptersDone?: string[] }) {
  const file = readFile();
  const prev = file.courses.find((c) => c.courseId === course.courseId);
  const next: FavouriteCourse = {
    courseId: course.courseId,
    title: course.title.trim() || "Course",
    teacher: course.teacher.trim(),
    teacherName: course.teacherName.trim(),
    slug: course.slug.trim(),
    savedAt: prev?.savedAt ?? Date.now(),
    chaptersDone: course.chaptersDone ?? prev?.chaptersDone ?? [],
  };
  file.courses = [next, ...file.courses.filter((c) => c.courseId !== course.courseId)].slice(0, MAX_COURSES);
  writeFile(file);
  return true;
}

export function removeFavourite(courseId: string) {
  const file = readFile();
  file.courses = file.courses.filter((c) => c.courseId !== courseId);
  writeFile(file);
}

export function toggleFavourite(course: Omit<FavouriteCourse, "savedAt" | "chaptersDone">) {
  if (isFavourite(course.courseId)) {
    removeFavourite(course.courseId);
    return false;
  }
  saveFavourite(course);
  return true;
}

export function setChapterDone(courseId: string, chapterKey: string, done: boolean) {
  const file = readFile();
  const course = file.courses.find((c) => c.courseId === courseId);
  if (!course) return;
  const set = new Set(course.chaptersDone);
  if (done) set.add(chapterKey);
  else set.delete(chapterKey);
  course.chaptersDone = [...set];
  writeFile(file);
}

export function readChecks(lessonId: string): LectureChecks {
  const row = readFile().lessons[lessonId];
  if (!row) return emptyChecks();
  return {
    notes: Boolean(row.notes),
    questions: Boolean(row.questions),
    teacherQuestions: Boolean(row.teacherQuestions),
    revision: Boolean(row.revision),
  };
}

export function readAllChecks(): Record<string, LectureChecks> {
  const out: Record<string, LectureChecks> = {};
  for (const id of Object.keys(readFile().lessons)) out[id] = readChecks(id);
  return out;
}

export function setChecks(lessonId: string, patch: Partial<LectureChecks>) {
  if (!lessonId) return;
  const file = readFile();
  const prev = readChecks(lessonId);
  file.lessons[lessonId] = {
    notes: patch.notes ?? prev.notes,
    questions: patch.questions ?? prev.questions,
    teacherQuestions: patch.teacherQuestions ?? prev.teacherQuestions,
    revision: patch.revision ?? prev.revision,
  };
  writeFile(file);
}

/** 0–1. Notes, questions, the teacher's questions, and a revision are one quarter each. */
export function lectureScore(checks: LectureChecks) {
  const ticks = [checks.notes, checks.questions, checks.teacherQuestions, checks.revision].filter(Boolean).length;
  return ticks / 4;
}

export function combinedScore(rows: LectureChecks[]) {
  if (!rows.length) return 0;
  return rows.reduce((sum, row) => sum + lectureScore(row), 0) / rows.length;
}

export function practiceDone(checks: LectureChecks) {
  return checks.notes && checks.questions && checks.teacherQuestions && checks.revision;
}

export function chapterIsComplete(manual: boolean, lessonIds: string[], checks: Record<string, LectureChecks>) {
  if (manual) return true;
  if (!lessonIds.length) return false;
  return lessonIds.every((id) => practiceDone(checks[id] ?? emptyChecks()));
}

export function readPlaces(): Place[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(PKEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((row): row is Place => {
      const p = row as Place;
      return Boolean(p && typeof p.lessonId === "string" && p.lessonId.length >= 6 && Number.isFinite(p.t));
    });
  } catch {
    return [];
  }
}

function writePlaces(list: Place[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PKEY, JSON.stringify(list.slice(0, MAX_PLACES)));
  emit();
}

/** Last position for any lecture, not the 16-item continue list. */
export function rememberPlace(entry: Omit<Place, "at">) {
  if (typeof localStorage === "undefined") return;
  if (!entry.lessonId || !Number.isFinite(entry.t) || entry.t < 1) return;
  const rest = readPlaces().filter((p) => p.lessonId !== entry.lessonId);
  rest.unshift({ ...entry, at: Date.now() });
  writePlaces(rest);
}

export function placeFor(lessonId: string) {
  return readPlaces().find((p) => p.lessonId === lessonId) ?? null;
}

export function finishedPlace(place: { t: number; duration: number } | null) {
  if (!place || !(place.duration > 0)) return false;
  return place.duration - place.t < 12 || place.t / place.duration >= 0.9;
}

export function continuePick(
  lessons: { id: string; title: string; duration: number; playable: boolean }[],
  places: Place[],
): ContinuePick | null {
  const playable = lessons.filter((l) => l.playable && l.id);
  if (!playable.length) return null;
  const byId = new Map(places.map((p) => [p.lessonId, p]));
  const started = playable
    .map((l) => ({ lesson: l, place: byId.get(l.id) ?? null }))
    .filter((row) => row.place)
    .sort((a, b) => (b.place?.at ?? 0) - (a.place?.at ?? 0));
  const open = started.find((row) => !finishedPlace(row.place));
  if (open?.place) {
    return { lessonId: open.lesson.id, title: open.lesson.title, t: open.place.t, finished: false };
  }
  if (started.length === playable.length && started[0]?.place) {
    return { lessonId: started[0].lesson.id, title: started[0].lesson.title, t: started[0].place.t, finished: true };
  }
  const next = playable.find((l) => !finishedPlace(byId.get(l.id) ?? null));
  if (!next) return null;
  const place = byId.get(next.id);
  return { lessonId: next.id, title: next.title, t: place && !finishedPlace(place) ? place.t : 0, finished: false };
}

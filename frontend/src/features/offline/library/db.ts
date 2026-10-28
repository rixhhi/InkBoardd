export type LectureRow = {
  lessonId: string;
  title: string;
  durationMs: number;
  savedAt: string;
  lastOpened: number;
  kind: "board" | "video";
};

export type ChapterRow = {
  chapterId: string;
  title: string;
  courseTitle: string;
  lectureCount: number;
  savedCount: number;
  savedAt: string;
  lastOpened: number;
};

export type CourseRow = {
  courseId: string;
  title: string;
  lectureCount: number;
  savedCount: number;
  savedAt: string;
  lastOpened: number;
};

const DB_NAME = "inkboard-offline";
const STORE = "lectures";
const HANDLES = "handles";
const CHAPTERS = "chapters";
const CHAPTER_HANDLES = "chapterHandles";

const COURSES = "courses";
const COURSE_HANDLES = "courseHandles";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "lessonId" });
      if (!db.objectStoreNames.contains(HANDLES)) db.createObjectStore(HANDLES, { keyPath: "lessonId" });
      if (!db.objectStoreNames.contains(CHAPTERS)) db.createObjectStore(CHAPTERS, { keyPath: "chapterId" });
      if (!db.objectStoreNames.contains(CHAPTER_HANDLES)) db.createObjectStore(CHAPTER_HANDLES, { keyPath: "chapterId" });
      if (!db.objectStoreNames.contains(COURSES)) db.createObjectStore(COURSES, { keyPath: "courseId" });
      if (!db.objectStoreNames.contains(COURSE_HANDLES)) db.createObjectStore(COURSE_HANDLES, { keyPath: "courseId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listLectures(): Promise<LectureRow[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result as LectureRow[]) || [];
      rows.sort((a, b) => b.lastOpened - a.lastOpened);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listChapters(): Promise<ChapterRow[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(CHAPTERS)) {
      resolve([]);
      return;
    }
    const tx = db.transaction(CHAPTERS, "readonly");
    const req = tx.objectStore(CHAPTERS).getAll();
    req.onsuccess = () => {
      const rows = (req.result as ChapterRow[]) || [];
      rows.sort((a, b) => b.lastOpened - a.lastOpened);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function putLecture(row: LectureRow): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function putChapter(row: ChapterRow): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHAPTERS, "readwrite");
    tx.objectStore(CHAPTERS).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeLecture(lessonId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, HANDLES], "readwrite");
    tx.objectStore(STORE).delete(lessonId);
    tx.objectStore(HANDLES).delete(lessonId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeChapter(chapterId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const stores = [CHAPTERS, CHAPTER_HANDLES].filter((s) => db.objectStoreNames.contains(s));
    const tx = db.transaction(stores, "readwrite");
    if (stores.includes(CHAPTERS)) tx.objectStore(CHAPTERS).delete(chapterId);
    if (stores.includes(CHAPTER_HANDLES)) tx.objectStore(CHAPTER_HANDLES).delete(chapterId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function putHandle(lessonId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLES, "readwrite");
    tx.objectStore(HANDLES).put({ lessonId, handle });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function putChapterHandle(chapterId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHAPTER_HANDLES, "readwrite");
    tx.objectStore(CHAPTER_HANDLES).put({ chapterId, handle });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getChapterHandle(chapterId: string): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(CHAPTER_HANDLES)) {
      resolve(null);
      return;
    }
    const tx = db.transaction(CHAPTER_HANDLES, "readonly");
    const req = tx.objectStore(CHAPTER_HANDLES).get(chapterId);
    req.onsuccess = () => resolve((req.result as { handle?: FileSystemDirectoryHandle } | undefined)?.handle ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function getHandle(lessonId: string): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLES, "readonly");
    const req = tx.objectStore(HANDLES).get(lessonId);
    req.onsuccess = () => resolve((req.result as { handle?: FileSystemDirectoryHandle } | undefined)?.handle ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function listCourses(): Promise<CourseRow[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(COURSES)) {
      resolve([]);
      return;
    }
    const tx = db.transaction(COURSES, "readonly");
    const req = tx.objectStore(COURSES).getAll();
    req.onsuccess = () => {
      const rows = (req.result as CourseRow[]) || [];
      rows.sort((a, b) => b.lastOpened - a.lastOpened);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function putCourse(row: CourseRow): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(COURSES, "readwrite");
    tx.objectStore(COURSES).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeCourse(courseId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const stores = [COURSES, COURSE_HANDLES].filter((s) => db.objectStoreNames.contains(s));
    const tx = db.transaction(stores, "readwrite");
    if (stores.includes(COURSES)) tx.objectStore(COURSES).delete(courseId);
    if (stores.includes(COURSE_HANDLES)) tx.objectStore(COURSE_HANDLES).delete(courseId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function putCourseHandle(courseId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(COURSE_HANDLES, "readwrite");
    tx.objectStore(COURSE_HANDLES).put({ courseId, handle });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCourseHandle(courseId: string): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(COURSE_HANDLES)) {
      resolve(null);
      return;
    }
    const tx = db.transaction(COURSE_HANDLES, "readonly");
    const req = tx.objectStore(COURSE_HANDLES).get(courseId);
    req.onsuccess = () => resolve((req.result as { handle?: FileSystemDirectoryHandle } | undefined)?.handle ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (o: { mode: string }) => Promise<string>;
    requestPermission?: (o: { mode: string }) => Promise<string>;
  };
  try {
    if (typeof h.queryPermission === "function") {
      const q = await h.queryPermission({ mode: "read" });
      if (q === "granted") return true;
    }
    if (typeof h.requestPermission === "function") {
      const r = await h.requestPermission({ mode: "read" });
      return r === "granted";
    }
  } catch {
    return false;
  }
  return true;
}

const POS = "inkboard.offline.pos.";
const AUTO = "inkboard.offline.autoplay";

export function readPos(lessonId: string) {
  try {
    const n = Number(localStorage.getItem(POS + lessonId) || "");
    return Number.isFinite(n) && n > 1 ? n : 0;
  } catch {
    return 0;
  }
}

export function writePos(lessonId: string, t: number) {
  try {
    localStorage.setItem(POS + lessonId, String(Math.floor(t)));
  } catch {
    /* ignore */
  }
}

export function readAutoPlay(): boolean {
  try {
    const v = localStorage.getItem(AUTO);
    return v !== "0";
  } catch {
    return true;
  }
}

export function writeAutoPlay(on: boolean) {
  try {
    localStorage.setItem(AUTO, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

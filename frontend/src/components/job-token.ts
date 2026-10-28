import { ApiError } from "@/lib/api-client";

/** Keep the creator token next to the job id from POST /api/jobs/lectures. */
const TOKEN_PREFIX = "inkboard.job-token.";
const ACTIVE_PREFIX = "inkboard.job-active.";

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function readKey(key: string): string {
  try {
    return storage()?.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeKey(key: string, value: string) {
  try {
    storage()?.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function removeKey(key: string) {
  try {
    storage()?.removeItem(key);
  } catch {
    /* private mode */
  }
}

export function rememberLectureJob(created: { id?: string; token?: string }, lessonId = "") {
  const kept = { id: created.id || "", token: created.token || "" };
  if (kept.id && kept.token) {
    writeKey(TOKEN_PREFIX + kept.id, kept.token);
    if (lessonId) writeKey(ACTIVE_PREFIX + lessonId, kept.id);
  }
  return kept;
}

/** The in-progress job for this class, after the dialog closes or the page reloads. */
export function resumeLectureJob(lessonId: string): { id: string; token: string } | null {
  const id = readKey(ACTIVE_PREFIX + lessonId);
  if (!id) return null;
  const token = readKey(TOKEN_PREFIX + id);
  if (!token) return null;
  return { id, token };
}

export function clearLectureJob(lessonId: string) {
  const id = readKey(ACTIVE_PREFIX + lessonId);
  if (id) removeKey(TOKEN_PREFIX + id);
  removeKey(ACTIVE_PREFIX + lessonId);
}

/** DELETE /api/jobs/:id must present the creator token. */
export function lectureJobDeleteInit(token: string): RequestInit {
  return {
    method: "DELETE",
    headers: { "x-job-token": token },
  };
}

/** 404 and 410 mean this job is gone. Network errors and 5xx do not. */
export function lectureStatusGone(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 410);
}

/** Steady poll is 2s. Each failure doubles it, up to 30s. */
export function lecturePollDelay(failures: number): number {
  if (failures <= 0) return 2_000;
  return Math.min(30_000, 2_000 * 2 ** Math.min(failures - 1, 4));
}

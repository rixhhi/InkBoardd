import { badRequest } from "@inkboard/shared/http-error";

export const LESSON_ID = /^[A-Za-z0-9_-]{6,40}$/;
export const UID = /^[A-Za-z0-9_-]{4,80}$/;

export function requireLessonId(raw: unknown): string {
  const id = String(raw ?? "").trim();
  if (!LESSON_ID.test(id)) throw badRequest("Invalid lesson id");
  return id;
}

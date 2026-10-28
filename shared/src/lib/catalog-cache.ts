import { localGet, localSet } from "./local-cache.ts";

export type CatalogHub = {
  teachers?: unknown[];
  courses?: unknown[];
  playlists?: unknown[];
  live?: unknown[];
  later?: unknown[];
  trending?: unknown[];
};

export function hubHasContent(hub: CatalogHub | null | undefined): boolean {
  if (!hub) return false;
  return (
    (hub.teachers?.length ?? 0) +
      (hub.courses?.length ?? 0) +
      (hub.playlists?.length ?? 0) +
      (hub.live?.length ?? 0) +
      (hub.later?.length ?? 0) +
      (hub.trending?.length ?? 0) >
    0
  );
}

export const hubHasCatalog = hubHasContent;

export function courseHasContent(page: { course?: { uid?: string }; lessons?: unknown[]; total?: number } | null | undefined): boolean {
  if (!page?.course?.uid) return false;
  if ((page.lessons?.length ?? 0) > 0) return true;
  return page.total === 0;
}

export function hubCacheKey(examId: string) {
  return `exam-hub-v8:${examId}`;
}

export function courseCacheKey(uid: string, slug = "", teacher = "") {
  return `course-v10:${uid}:${slug}:${teacher}`;
}

export function eduCacheKey(username: string) {
  return `edu-v8:${username.toLowerCase()}`;
}

/** Persist a hub only when Unacademy actually returned catalog rows. */
export function rememberHub(examId: string, hub: CatalogHub & { partial?: string[] }) {
  if (hub.partial?.length) return false;
  if (!hubHasContent(hub)) return false;
  localSet(hubCacheKey(examId), hub);
  return true;
}

export function readHub<T = CatalogHub>(examId: string) {
  return localGet<T>(hubCacheKey(examId));
}

export function rememberCourse(uid: string, slug: string | undefined, teacher: string | undefined, page: { course?: { uid?: string }; lessons?: unknown[] }) {
  if (!courseHasContent(page)) return false;
  localSet(courseCacheKey(uid, slug ?? "", teacher ?? ""), page);
  return true;
}

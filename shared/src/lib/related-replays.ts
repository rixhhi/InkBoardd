export type RelatedCourse = {
  uid: string;
  name: string;
  itemCount: number;
  slug?: string;
};

const TITLE_STOP = new Set([
  "complete",
  "comprehensive",
  "course",
  "on",
  "for",
  "the",
  "and",
  "of",
  "gate",
  "cs",
  "it",
  "csit",
  "jee",
  "neet",
  "part",
  "plus",
]);

function titleTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 2 && !TITLE_STOP.has(w)),
  );
}

export function relatedCourseName(a: string, b: string): boolean {
  const A = titleTokens(a);
  const B = titleTokens(b);
  let n = 0;
  let longHit = false;
  for (const t of A) {
    if (!B.has(t)) continue;
    n += 1;
    if (t.length >= 8) longHit = true;
  }
  return n >= 2 || (n >= 1 && longHit);
}

/** Prefer a same-series short course (ISRO / LT) over a 100-class comprehensive dump. */
export function relatedCourseScore(courseName: string, otherName: string): number {
  if (!relatedCourseName(courseName, otherName)) return 0;
  const A = titleTokens(courseName);
  const B = titleTokens(otherName);
  let overlap = 0;
  for (const t of A) if (B.has(t)) overlap += 1;
  const extra = Math.abs(A.size - B.size) + Math.abs(otherName.length - courseName.length) / 8;
  let score = overlap * 24 - extra;
  const other = otherName.toLowerCase();
  if (/\bcomprehensive\b|\bpractice\b|\bpyq/.test(other)) score -= 28;
  if (otherName.length < 48 && !/\bcomprehensive\b/.test(other)) score += 12;
  return score;
}

export function rankRelatedCourses<T extends RelatedCourse>(
  courseName: string,
  courses: T[],
  excludeUid = "",
): T[] {
  const seen = new Set<string>();
  return courses
    .filter((c) => {
      if (!c.slug || c.itemCount < 4) return false;
      if (excludeUid && c.uid === excludeUid) return false;
      if (seen.has(c.uid)) return false;
      if (!relatedCourseName(c.name, courseName)) return false;
      seen.add(c.uid);
      return true;
    })
    .sort(
      (a, b) =>
        relatedCourseScore(courseName, b.name) - relatedCourseScore(courseName, a.name) ||
        a.itemCount - b.itemCount,
    )
    .slice(0, 8);
}

/** Unacademy's HTML course list ignores `?offset=`. Page two lives on `fallbackCourses.next` (Sheldon). */
export function sheldonOffsetFromNext(next: unknown): number | null {
  const raw = typeof next === "string" ? next : "";
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (!u.hostname.endsWith("unacademy.com")) return null;
    if (!u.pathname.includes("/sheldon/v1/list/course")) return null;
    const off = Number(u.searchParams.get("offset"));
    return Number.isFinite(off) && off >= 0 ? off : null;
  } catch {
    return null;
  }
}

/** Walk Unacademy's course list `next` until the catalog is done (cap 8 pages). */
export function nextCoursePage(offset: number, pageLen: number, total: number, next: boolean): number | null {
  if (!next || pageLen <= 0) return null;
  const following = offset + pageLen;
  if (total > 0 && following >= total) return null;
  return following;
}


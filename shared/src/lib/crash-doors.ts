/** Short Unacademy batches that hide in the course soup. Catalog only. */

const UID = /^[A-Za-z0-9]{4,16}$/;

export type CrashDoor = {
  uid: string;
  name: string;
  slug: string;
  kind: "batch" | "course";
  authorName: string;
  when: string | null;
};

const CRASH_NAME =
  /\b(crash|one[\s-]?shot|final strike|bootcamp|sprint|revision week|pyq marathon|7[\s-]?day|15[\s-]?day|30[\s-]?day)\b/i;

export function isCrashName(name: string | null | undefined) {
  const n = String(name ?? "").replace(/[?]+/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return false;
  if (/\b(foundation|year long|comprehensive|complete syllabus)\b/i.test(n)) return false;
  return CRASH_NAME.test(n);
}

export function tidyCrashName(name: string) {
  return name
    .replace(/[?]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^crash course\s*[:\-–]?\s*/i, "")
    .trim() || name.trim();
}

/** `/store/batch/slug/UID` or `/batch/slug/UID`. */
export function parseBatchHref(href: string | null | undefined): { slug: string; uid: string } | null {
  const raw = String(href ?? "");
  const m = raw.match(/\/(?:store\/)?batch\/([a-z0-9-]+)\/([A-Za-z0-9]{4,16})(?:[/?#]|$)/i);
  if (!m) return null;
  const uid = m[2]!;
  if (!UID.test(uid)) return null;
  return { slug: m[1]!, uid };
}

export function parseCourseHref(href: string | null | undefined): { slug: string; uid: string } | null {
  const raw = String(href ?? "");
  const m = raw.match(/\/course\/(?:[a-z0-9-]+\/)?([A-Za-z0-9]{4,16})(?:[/?#]|$)/i);
  if (!m) return null;
  const uid = m[1]!;
  if (!UID.test(uid)) return null;
  const slugMatch = raw.match(/\/course\/([a-z0-9-]+)\//i);
  return { slug: slugMatch?.[1] || "", uid };
}

export function parseCrashBanner(raw: {
  title?: string;
  name?: string;
  click_url?: string;
  clickUrl?: string;
  permalink?: string;
}): CrashDoor | null {
  const href = raw.click_url || raw.clickUrl || raw.permalink || "";
  const title = tidyCrashName(raw.title || raw.name || "");
  if (!isCrashName(title) && !isCrashName(href)) return null;
  const batch = parseBatchHref(href);
  if (batch) {
    return { uid: batch.uid, name: title || batch.slug, slug: batch.slug, kind: "batch", authorName: "", when: null };
  }
  const course = parseCourseHref(href);
  if (course && (isCrashName(title) || isCrashName(href))) {
    return { uid: course.uid, name: title || course.slug, slug: course.slug, kind: "course", authorName: "", when: null };
  }
  return null;
}

export function crashFromCourse(c: {
  uid: string;
  name: string;
  slug?: string;
  authorName?: string;
  liveAt?: string | null;
}): CrashDoor | null {
  if (!UID.test(c.uid) || !isCrashName(c.name)) return null;
  return {
    uid: c.uid,
    name: tidyCrashName(c.name),
    slug: c.slug || "",
    kind: "course",
    authorName: c.authorName || "",
    when: c.liveAt || null,
  };
}

export function mergeCrashDoors(rows: (CrashDoor | null | undefined)[]) {
  const seen = new Set<string>();
  const out: CrashDoor[] = [];
  for (const row of rows) {
    if (!row || !UID.test(row.uid)) continue;
    if (seen.has(row.uid)) continue;
    seen.add(row.uid);
    out.push(row);
  }
  return out;
}

export function crashPlateCaption(n: number) {
  if (n <= 0) return "On this wall";
  return n === 1 ? "1 crash" : `${n} crash`;
}

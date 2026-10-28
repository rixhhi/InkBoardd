export function daysToExamLine(days: number | null | undefined, seal: string): string | null {
  if (days == null || !Number.isFinite(days) || !seal) return null;
  const n = Math.trunc(days);
  if (n === 0) return `${seal} is today`;
  if (n < 0) {
    const past = Math.abs(n);
    return `${past} ${past === 1 ? "day" : "days"} past ${seal}`;
  }
  return `${n} ${n === 1 ? "day" : "days"} to ${seal}`;
}

export function plateCaption(counts: { courses?: number; live?: number; playlists?: number }): string {
  const bits: string[] = [];
  const courses = (counts.courses ?? 0) + (counts.playlists ?? 0);
  const live = counts.live ?? 0;
  if (courses > 0) bits.push(`${courses} ${courses === 1 ? "course" : "courses"}`);
  if (live > 0) bits.push(`${live} live`);
  return bits.join(" · ") || "On this wall";
}

/** Quiet count for a stamp. Never a follower heading. */
export function frameCrowd(n: number) {
  if (!(n > 0)) return "";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${Math.round(n / 1000)} thousand`;
  const m = n / 1_000_000;
  const shown = m >= 10 ? String(Math.round(m)) : m.toFixed(1).replace(/\.0$/, "");
  return `${shown} million`;
}

const GENERIC_TOPIC = /^(special class|special classes|specials?|course|general|plus|playlist|live class)$/i;
const JUNK_PLATE = /crash|strategy|college|overview|un-?rated|placement|orientation|mentorship|personality|checkmate|proficiency|interview preparation|^gate\b|^ese\b|^cbse\b|^class \d+|^general studies$/i;

export function isGenericTopic(name: string | null | undefined) {
  const t = String(name ?? "").trim();
  return !t || GENERIC_TOPIC.test(t);
}

/** True subject plates, not catalog leftovers sitting next to Physics. */
export function isPlateSubject(name: string | null | undefined) {
  const t = String(name ?? "").trim();
  if (!t || isGenericTopic(t)) return false;
  return !JUNK_PLATE.test(t);
}

/** Seal for a course line. Skip catalog leftovers like "Special class". */
export function courseSeal(
  topics: { name?: string; level?: number }[] | undefined,
  language?: string | null,
  courseName = "",
) {
  const primary = coursePrimaryTopic(topics, courseName);
  if (primary?.name) return primary.name;
  if (courseName.trim()) {
    const lang = String(language ?? "").trim();
    return lang || "Course";
  }
  const list = topics ?? [];
  const real = list.find((t) => t.level === 15 && t.name && !isGenericTopic(t.name));
  if (real?.name) return real.name;
  const any = list.find((t) => t.name && !isGenericTopic(t.name));
  if (any?.name) return any.name;
  const lang = String(language ?? "").trim();
  return lang || "Course";
}

const TOPIC_WORD = (w: string) => w.length > 3;

const SUBJECT_ALIAS: Record<string, string> = {
  math: "mathematics",
  maths: "mathematics",
  mathematics: "mathematics",
  "engineering mathematics": "mathematics",
  ds: "data structures",
  dsa: "data structures",
  "data structure": "data structures",
  "data structures": "data structures",
  "data structures and algorithms": "data structures",
  os: "operating systems",
  "operating system": "operating systems",
  "operating systems": "operating systems",
  dbms: "databases",
  database: "databases",
  databases: "databases",
  cn: "computer networks",
  "computer network": "computer networks",
  "computer networks": "computer networks",
  toc: "theory of computation",
  "theory of computation": "theory of computation",
};

/** Collapse Unacademy aliases (maths / mathematics, ds / dsa) to one key. */
export function subjectKey(name: string | null | undefined) {
  const c = canonicalTopic(name);
  if (!c) return "";
  if (SUBJECT_ALIAS[c]) return SUBJECT_ALIAS[c];
  for (const [from, to] of Object.entries(SUBJECT_ALIAS)) {
    if (from.length < 4) continue;
    if (c === from || c.startsWith(`${from} `) || c.endsWith(` ${from}`) || c.includes(` ${from} `)) return to;
  }
  for (const w of c.split(" ")) {
    if (SUBJECT_ALIAS[w]) return SUBJECT_ALIAS[w];
  }
  return c;
}

export function isBroadCourseName(name: string | null | undefined) {
  const n = canonicalTopic(name);
  if (!n) return false;
  if (/\b(crash course|one shot|all subjects|entire syllabus)\b/.test(n)) return true;
  return /\b(complete|full)\b/.test(n) && /\b(course|syllabus|gate|jee|neet|batch|foundation)\b/.test(n);
}

/** Significant words in a topic that also appear in a course title. */
export function topicFitsName(topic: string, courseName: string) {
  const t = canonicalTopic(topic);
  const n = canonicalTopic(courseName);
  if (!t || !n) return false;
  if (n.includes(t) || (t.length >= 8 && t.includes(n))) return true;
  const tk = subjectKey(topic);
  const nk = subjectKey(courseName);
  if (tk && (tk === nk || n.includes(tk) || nk.includes(tk))) return true;
  const words = t.split(" ").filter(TOPIC_WORD);
  if (!words.length) return false;
  const nWords = n.split(" ");
  const hits = words.filter((w) => nWords.includes(w));
  return hits.length > 0 && (hits.length >= 2 || words.length === 1);
}

type TopicLike = { uid?: string; name?: string; level?: number; parent?: string; parentUid?: string };

/**
 * The subject a course is actually about — not Unacademy's tag soup.
 * Title wins. One real tag is enough. Many tags with no title match → don't guess.
 */
export function coursePrimaryTopic(
  topics: TopicLike[] | undefined,
  courseName = "",
): { uid: string; name: string } | null {
  const real = (topics ?? []).filter((t) => t.name && isPlateSubject(t.name));
  if (!real.length) return null;
  const pick = (t: TopicLike) => ({ uid: t.uid || canonicalTopic(t.name), name: t.name! });
  if (real.length === 1) {
    const only = real[0]!;
    if (courseName && !topicFitsName(only.name!, courseName)) return null;
    return pick(only);
  }

  const name = canonicalTopic(courseName);
  let best: TopicLike | null = null;
  let bestScore = 0;
  let bestPos = 99;
  for (const t of real) {
    const c = canonicalTopic(t.name);
    let score = 0;
    let pos = 99;
    const i = name.indexOf(c);
    if (c && i >= 0) {
      score = 8 + (t.level === 15 ? 1 : 0);
      pos = i;
    } else if (topicFitsName(t.name!, courseName)) {
      score = 5 + (t.level === 15 ? 1 : 0);
      pos = 50;
    }
    if (score > bestScore || (score === bestScore && score > 0 && pos < bestPos)) {
      best = t;
      bestScore = score;
      bestPos = pos;
    }
  }
  if (best && bestScore >= 5) return pick(best);
  return null;
}

export function courseOnTopic(
  course: { name: string; topics: TopicLike[] },
  topic: { uid?: string; name: string },
) {
  const primary = coursePrimaryTopic(course.topics, course.name);
  if (!primary) return false;
  if (topic.uid && primary.uid === topic.uid) return true;
  return subjectKey(primary.name) === subjectKey(topic.name);
}

/** Topics this teacher actually teaches, one chip per subject, counted from primary. */
export function topicsTaught(courses: { name: string; topics: TopicLike[] }[]) {
  const byKey = new Map<string, { uid: string; name: string; level: number; courseCount: number }>();
  for (const c of courses) {
    const p = coursePrimaryTopic(c.topics, c.name);
    if (!p) continue;
    const key = subjectKey(p.name);
    const row = byKey.get(key);
    if (row) row.courseCount += 1;
    else byKey.set(key, { uid: p.uid, name: p.name, level: 15, courseCount: 1 });
  }
  return [...byKey.values()].sort((a, b) => b.courseCount - a.courseCount || a.name.localeCompare(b.name));
}


export function fmtWhen(iso: string | null, withDay = false) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    ...(withDay ? { weekday: "short", day: "numeric", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function canonicalTopic(name: string | null | undefined) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchesTopic(hay: string | null | undefined, topic: string) {
  if (topic === "all") return true;
  const a = canonicalTopic(hay);
  const b = canonicalTopic(topic);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export const WALL_LEDGER_EVENT = "inkboard:wall-ledger";

export type WallLedgerPayload = {
  faced: boolean;
  examId: string;
  upcomingTitle?: string;
  upcomingWhen?: string;
  upcomingLive?: boolean;
  upcomingClassId?: string;
  upcomingReplayId?: string;
  upcomingSlug?: string;
  lastTeacherName?: string;
  lastTeacherSlug?: string;
} | null;

export function setWallLedger(payload: WallLedgerPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WALL_LEDGER_EVENT, { detail: payload }));
}

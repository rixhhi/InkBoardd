import { extractReplayId } from "./unacademy-ids.ts";
import { rasterThumbUrl } from "./media-cover.ts";

export type LessonStatus = "live" | "replay" | "upcoming" | "unavailable" | "archived";

export type UaLesson = {
  uid: string;
  title: string;
  slug: string;
  durationSec: number;
  liveAt: string | null;
  replayId: string | null;
  playable: boolean;
  rank: number;
  week: number | null;
  status: LessonStatus;
  notesUrl: string | null;
  slidesUrl: string | null;
  dppUrl: string | null;
  dppName: string | null;
  thumbnail: string;
  altReplay?: boolean;
  fromCourse?: string;
};

function asStr(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function asNum(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function asArr(v: unknown) {
  return Array.isArray(v) ? v : [];
}
function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function pickReplayId(live: unknown) {
  const row = asObj(live);
  const nested = asObj(row.liveClass || row.live_class);
  const videoObj = asObj(row.video);
  const urls = [
    row.videoUrl,
    row.video_url,
    row.video,
    row.liveClassUrl,
    row.live_class_url,
    nested.videoUrl,
    nested.video_url,
    nested.video,
    videoObj.url,
    videoObj.videoUrl,
    videoObj.video_url,
  ];
  for (const u of urls) {
    const id = extractReplayId(asStr(u));
    if (id) return id;
  }
  const slides = asObj(row.slidesPdf || row.slides_pdf);
  return (
    extractReplayId(asStr(slides.withAnnotation || slides.with_annotation || slides.noAnnotation || slides.no_annotation)) ??
    null
  );
}

export function pickNotes(live: unknown) {
  const slides = asObj(asObj(live).slidesPdf || asObj(live).slides_pdf);
  const notesUrl = asStr(slides.withAnnotation || slides.with_annotation) || null;
  const slidesUrl = asStr(slides.noAnnotation || slides.no_annotation) || null;
  return { notesUrl: notesUrl || null, slidesUrl: slidesUrl || null };
}

export function pickDpp(value: unknown) {
  const dpp = asObj(asObj(value).dpp);
  return { dppUrl: asStr(dpp.url) || null, dppName: asStr(dpp.name) || null };
}

export function lessonStatus(replayId: unknown, liveAt: unknown, liveState: unknown = 0): LessonStatus {
  if (liveState === 10) return "live";
  if (replayId) return "replay";
  if (liveAt) {
    const t = new Date(typeof liveAt === "number" ? liveAt : asStr(liveAt)).getTime();
    if (Number.isFinite(t) && t > Date.now() + 60_000) return "upcoming";
    if (Number.isFinite(t) && t <= Date.now() && liveState !== 20 && !replayId) {
      if (Date.now() - t < 4 * 60 * 60 * 1000) return "live";
    }
  }
  return "unavailable";
}

export function parseLesson(raw: unknown, index: number): UaLesson | null {
  const row = asObj(raw);
  const value = asObj(row.value || row);
  const live = asObj(value.liveClass || value.live_class);
  const title = asStr(value.title || value.name);
  const uid = asStr(value.uid);
  if (!uid || !title) return null;
  const replayId = pickReplayId(live) || pickReplayId(value);
  const notes = pickNotes(live);
  const dpp = pickDpp(value);
  const liveAt = asStr(live.liveAt || live.live_at || value.liveAt || value.live_at) || null;
  const liveState = asNum(live.state ?? value.state);
  const s3Gone = Boolean(row.isS3Deleted || row.is_s3_deleted || value.isS3Deleted || value.is_s3_deleted);
  let status = lessonStatus(replayId, liveAt, liveState);
  if (s3Gone && replayId) status = "archived";
  else if (s3Gone) status = "unavailable";
  return {
    uid,
    title,
    slug: asStr(value.slug),
    durationSec: asNum(live.videoDuration ?? live.video_duration ?? value.video_duration ?? value.videoDuration),
    liveAt,
    replayId,
    playable: Boolean(replayId) || status === "live",
    rank: asNum(row.rank ?? live.rank ?? value.rank) || index + 1,
    week: (() => {
      const n = asNum(row.week ?? value.week);
      return n > 0 ? n : null;
    })(),
    status,
    notesUrl: notes.notesUrl,
    slidesUrl: notes.slidesUrl,
    dppUrl: dpp.dppUrl,
    dppName: dpp.dppName,
    thumbnail: rasterThumbUrl(asStr(live.post_thumbnail || live.postThumbnail || live.thumbnail || value.thumbnail)),
  };
}

export function mergeLessons(chunks: UaLesson[][]): UaLesson[] {
  const map = new Map<string, UaLesson>();
  for (const chunk of chunks)
    for (const lesson of chunk) {
      const prev = map.get(lesson.uid);
      if (!prev) {
        map.set(lesson.uid, lesson);
        continue;
      }
      const replayId = lesson.replayId || prev.replayId;
      const liveAt = lesson.liveAt || prev.liveAt;
      const status =
        lesson.status === "live" || prev.status === "live" ? "live" : lessonStatus(replayId, liveAt);
      const altReplay = Boolean(replayId) && (lesson.replayId ? Boolean(lesson.altReplay) : Boolean(prev.altReplay));
      map.set(lesson.uid, {
        ...prev,
        ...lesson,
        replayId,
        notesUrl: lesson.notesUrl || prev.notesUrl,
        slidesUrl: lesson.slidesUrl || prev.slidesUrl,
        dppUrl: lesson.dppUrl || prev.dppUrl,
        dppName: lesson.dppName || prev.dppName,
        thumbnail: lesson.thumbnail || prev.thumbnail,
        durationSec: lesson.durationSec || prev.durationSec,
        liveAt,
        week: lesson.week ?? prev.week,
        rank: lesson.rank || prev.rank,
        playable: Boolean(replayId) || status === "live",
        status,
        altReplay,
        fromCourse: altReplay ? lesson.fromCourse || prev.fromCourse : undefined,
      });
    }
  return [...map.values()].sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
}

export function htmlLessonBundle(pageProps: Record<string, unknown>): {
  lessons: UaLesson[];
  total: number;
  complete: boolean;
} {
  const lfd = asObj(pageProps.lessonListFallbackData);
  const demo = asArr(pageProps.demoClasses);
  const lessons = mergeLessons([
    asArr(lfd.results)
      .map((row, i) => parseLesson(row, i))
      .filter((l): l is UaLesson => Boolean(l)),
    demo.map((row, i) => parseLesson(row, i)).filter((l): l is UaLesson => Boolean(l)),
  ]);
  return {
    lessons,
    total: asNum(lfd.count) || lessons.length,
    complete: lessons.length > 0 && !lfd.next,
  };
}

export type RelatedHit = {
  replayId: string;
  notesUrl: string | null;
  slidesUrl: string | null;
  durationSec: number;
  title: string;
  courseName?: string;
};

const ROMAN: Record<string, string> = {
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  x: "10",
  xi: "11",
  xii: "12",
  xiii: "13",
  xiv: "14",
  xv: "15",
  xvi: "16",
  xvii: "17",
  xviii: "18",
  xix: "19",
  xx: "20",
};

export function normLessonTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(
      /part\s*[-:]?\s*(xviii|xvii|xvi|xv|xiv|xiii|xii|xi|viii|vii|vi|iv|ix|iii|ii|xx|x|v|i)\b/g,
      (_: string, r: string) => `part ${ROMAN[r]}`,
    )
    .replace(/part\s*[-:]?\s*/g, "part ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SCORE_STOP = new Set(["of", "to", "the", "and", "on", "for", "in", "a", "an", "by", "with"]);

function partNo(title: string): string | null {
  return title.match(/\bpart (\d+)\b/)?.[1] ?? null;
}

export function titleScore(a: string, b: string): number {
  if (a === b) return 100;
  const pa = partNo(a);
  const pb = partNo(b);
  if (pa && pb && pa !== pb) return 0;
  const ta = a.split(" ").filter((w: string) => w.length > 1 && !SCORE_STOP.has(w));
  const tb = b.split(" ").filter((w: string) => w.length > 1 && !SCORE_STOP.has(w));
  if (ta.length < 2 || tb.length < 2) return 0;
  const sa = new Set(ta);
  const sb = new Set(tb);
  const [short, longSet] = ta.length <= tb.length ? [ta, sb] : [tb, sa];
  let hit = 0;
  for (const t of short) if (longSet.has(t)) hit += 1;
  if (hit < short.length) {
    if (hit / short.length >= 0.8 && hit >= 3) return 72 + (pa && pa === pb ? 8 : 0);
    return 0;
  }
  let score = 86;
  if (pa && pa === pb) score += 8;
  if (short.length >= 3) score += 4;
  return Math.min(99, score);
}

export function applyRelatedReplays(lessons: UaLesson[], pool: RelatedHit[]): UaLesson[] {
  if (!pool.length) return lessons;
  const used = new Set(lessons.map((l) => l.replayId).filter((id): id is string => Boolean(id)));
  return lessons.map((lesson) => {
    if (lesson.replayId || lesson.status === "live" || lesson.status === "upcoming") return lesson;
    const key = normLessonTitle(lesson.title);
    let best: { hit: RelatedHit; score: number } | null = null;
    for (const hit of pool) {
      if (!hit.replayId || used.has(hit.replayId)) continue;
      const score = titleScore(key, normLessonTitle(hit.title));
      if (score > (best?.score ?? 0)) best = { hit, score };
    }
    if (!best || best.score < 80 || !best.hit.replayId) return lesson;
    used.add(best.hit.replayId);
    return {
      ...lesson,
      replayId: best.hit.replayId,
      notesUrl: lesson.notesUrl || best.hit.notesUrl,
      slidesUrl: lesson.slidesUrl || best.hit.slidesUrl,
      durationSec: best.hit.durationSec || lesson.durationSec,
      playable: true,
      status: "replay",
      altReplay: true,
      fromCourse: best.hit.courseName || undefined,
    };
  });
}

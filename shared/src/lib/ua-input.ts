import { z } from "zod";
import { badRequest } from "./http-error.ts";
import { getExam } from "./exams.ts";
import { normalizeUsername } from "./unacademy-ids.ts";

const UID = /^[A-Za-z0-9]{4,16}$/;
const TOPOLOGY = /^[A-Za-z0-9]{4,12}$/;
const USERNAME = /^[A-Za-z0-9._-]{2,40}$/;

function num(v: unknown, lo: number, hi: number) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function str(v: unknown) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function teacherUsername(v: unknown) {
  const username = normalizeUsername(str(v));
  if (!USERNAME.test(username)) throw badRequest("Enter a teacher username");
  return username;
}

function examId(v: unknown) {
  const exam = getExam(str(v));
  if (!exam) throw badRequest("Unknown exam");
  return exam.id;
}

function courseUid(v: unknown, label = "course") {
  const uid = str(v);
  if (!UID.test(uid)) throw badRequest(`Invalid ${label} id`);
  return uid;
}

export const EducatorPageInput = z
  .object({
    username: z.unknown(),
    offset: z.unknown().optional(),
    sort: z.unknown().optional(),
  })
  .transform((d) => ({
    username: teacherUsername(d.username),
    offset: num(d.offset, 0, 500),
    sort: d.sort === "popular" ? ("popular" as const) : ("latest" as const),
  }));

export const SearchEducatorsInput = z
  .object({
    q: z.unknown(),
    goalId: z.unknown().optional(),
  })
  .transform((d) => {
    const q = str(d.q).slice(0, 80);
    if (q.length < 2) throw badRequest("Type at least 2 characters");
    return {
      q,
      goalId: d.goalId ? getExam(str(d.goalId))?.id : undefined,
    };
  });

export const CourseDetailInput = z
  .object({
    uid: z.unknown(),
    slug: z.unknown().optional(),
    teacher: z.unknown().optional(),
  })
  .transform((d) => ({
    uid: courseUid(d.uid),
    slug: str(d.slug) || undefined,
    teacher: str(d.teacher) || undefined,
  }));

export const CourseLessonsInput = z
  .object({
    uid: z.unknown(),
    offset: z.unknown().optional(),
    total: z.unknown().optional(),
    slug: z.unknown().optional(),
  })
  .transform((d) => ({
    uid: courseUid(d.uid),
    offset: num(d.offset, 0, 800),
    total: num(d.total, 0, 800),
    slug: str(d.slug) || undefined,
  }));

export const ExamTeachersInput = z
  .object({
    goalId: z.unknown(),
    offset: z.unknown().optional(),
  })
  .transform((d) => ({
    goalId: examId(d.goalId),
    offset: num(d.offset, 0, 400),
  }));

export const ExamHubInput = z
  .object({ goalId: z.unknown() })
  .transform((d) => ({ goalId: examId(d.goalId) }));

export const ExamSubjectInput = z
  .object({ topologyUid: z.unknown() })
  .transform((d) => {
    const topologyUid = str(d.topologyUid);
    if (!TOPOLOGY.test(topologyUid)) throw badRequest("Unknown subject");
    return { topologyUid };
  });

export const ExamCoursesInput = z
  .object({
    goalId: z.unknown(),
    offset: z.unknown().optional(),
  })
  .transform((d) => ({
    goalId: examId(d.goalId),
    offset: num(d.offset, 0, 800),
  }));

export const TestSeriesItemsInput = z
  .object({
    uid: z.unknown(),
  })
  .transform((d) => ({
    uid: courseUid(d.uid, "test series"),
  }));

export const TeacherOffsetInput = z
  .object({
    username: z.unknown(),
    offset: z.unknown().optional(),
  })
  .transform((d) => ({
    username: teacherUsername(d.username),
    offset: num(d.offset, 0, 800),
  }));

export const TeacherBatchesInput = z
  .object({
    username: z.unknown(),
    offset: z.unknown().optional(),
  })
  .transform((d) => ({
    username: teacherUsername(d.username),
    offset: num(d.offset, 0, 400),
  }));

export const BatchDetailInput = z
  .object({
    uid: z.unknown(),
    slug: z.unknown().optional(),
  })
  .transform((d) => ({
    uid: courseUid(d.uid, "batch"),
    slug: str(d.slug) || undefined,
  }));

export const BatchScheduleInput = z
  .object({
    uid: z.unknown(),
    past: z.unknown().optional(),
    rank: z.unknown().optional(),
  })
  .transform((d) => ({
    uid: courseUid(d.uid, "batch"),
    past: Boolean(d.past),
    rank: typeof d.rank === "number" && Number.isFinite(d.rank) ? d.rank : undefined,
  }));

export const ClassDetailInput = z
  .object({
    uid: z.unknown(),
    slug: z.unknown().optional(),
  })
  .transform((d) => {
    const uid = str(d.uid);
    if (!UID.test(uid)) throw badRequest("Invalid class id");
    return { uid, slug: str(d.slug) || uid.toLowerCase() };
  });

export const LiveSlideInput = z
  .object({
    uid: z.unknown(),
    className: z.unknown().optional(),
    courseName: z.unknown().optional(),
    educatorName: z.unknown().optional(),
    rank: z.unknown().optional(),
    special: z.unknown().optional(),
    theme: z.unknown().optional(),
  })
  .transform((d) => {
    const uid = str(d.uid);
    if (!UID.test(uid)) throw badRequest("Invalid class id");
    const className = str(d.className).slice(0, 160);
    const theme = str(d.theme) === "DARK_THEME" ? ("DARK_THEME" as const) : ("LIGHT_THEME" as const);
    return {
      uid,
      className,
      courseName: str(d.courseName).slice(0, 160) || className,
      educatorName: str(d.educatorName).slice(0, 80),
      rank: str(d.rank).slice(0, 8) || "1",
      special: d.special === true || d.special === "1" || d.special === 1,
      theme,
    };
  });

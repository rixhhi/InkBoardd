import { apiJson, qs } from "./api-client.ts";
import type { Exam } from "@inkboard/shared/exams";
import type { LessonStatus, RelatedHit, UaLesson } from "@inkboard/shared/parse-lesson";
import type { CrashDoor } from "@inkboard/shared/crash-doors";
import type { PracticeLine } from "@inkboard/shared/practice-lines";
import type { TestItem, TestSeries } from "@inkboard/shared/test-series";
import type { LiveSession } from "@inkboard/shared/live-session";

export type { LessonStatus, RelatedHit, UaLesson };
export type { CrashDoor, PracticeLine, TestItem, TestSeries };
export { extractReplayId, isReplayId, normalizeUsername } from "@inkboard/shared/unacademy-ids";
export { applyRelatedReplays, htmlLessonBundle, titleScore } from "@inkboard/shared/parse-lesson";

export type Educator = {
  username: string;
  uid: string;
  name: string;
  bio: string;
  avatar: string;
  followers: number;
  languages: string[];
  designation: string;
  courseCount: number;
};

export type TopicRef = {
  uid: string;
  name: string;
  level: number;
  parent?: string;
  parentUid?: string;
};

export type TopicCovered = TopicRef & { courseCount: number };

export type UaCourse = {
  uid: string;
  name: string;
  slug: string;
  thumbnail: string;
  itemCount: number;
  language: string;
  startsAt: string | null;
  endsAt: string | null;
  viewCount: number;
  topics: TopicRef[];
};

export type CourseDetail = {
  course: UaCourse & { description: string; authorName: string; authorUsername: string };
  lessons: UaLesson[];
  nextOffset: number | null;
  total: number;
};

export type EducatorPage = {
  educator: Educator;
  courses: UaCourse[];
  totalCourses: number;
  nextOffset: number | null;
  topics: TopicCovered[];
  sort: "latest" | "popular";
};

export type EducatorHit = {
  username: string;
  uid: string;
  name: string;
  bio: string;
  avatar: string;
  followers: number;
  courseCount: number;
  inExam?: boolean;
  topics?: string;
};

export type ExamTeacher = {
  username: string;
  uid: string;
  name: string;
  bio: string;
  avatar: string;
  followers: number;
  topics: string;
  rank: number | null;
};

export type ExamPage = {
  exam: Exam;
  teachers: ExamTeacher[];
  total: number;
  nextOffset: number | null;
};

export type ExamPlaylist = {
  uid: string;
  name: string;
  topic: string;
  lessonCount: number;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  thumbnail: string;
  courseUid?: string;
  courseSlug?: string;
};

export type ExamSubject = {
  uid: string;
  name: string;
  icon: string;
};

export type ExamCourse = {
  uid: string;
  name: string;
  slug: string;
  topic: string;
  lessonCount: number;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  thumbnail: string;
  liveAt: string | null;
  classUid: string | null;
  classSlug: string | null;
  replayId: string | null;
  status: LessonStatus;
  goalUid?: string;
  goalName?: string;
};

export type ExamHub = ExamPage & {
  playlists: ExamPlaylist[];
  trending: ExamCourse[];
  subjects: ExamSubject[];
  courses: ExamCourse[];
  coursesTotal: number;
  coursesNext: number | null;
  live: LiveSlot[];
  later: LiveSlot[];
  week: LiveSlot[];
  crash: CrashDoor[];
  partial?: string[];
};

export type UaBatch = {
  uid: string;
  name: string;
  slug: string;
  thumbnail: string;
  startsAt: string | null;
  endsAt: string | null;
  goalName: string;
  goalUid: string;
  syllabusTag: string;
  language: string;
  authors: { name: string; username: string; avatar: string }[];
  state: number;
};

export type BatchSession = {
  uid: string;
  title: string;
  slug: string;
  liveAt: string | null;
  durationSec: number;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  courseUid: string;
  courseSlug: string;
  courseName: string;
  status: LessonStatus;
  rank: number;
  replayId: string | null;
};

export type BatchDetail = {
  batch: UaBatch & {
    description: string;
    lessonsCount: number;
    liveClasses: number;
    mockTests: number;
  };
  sessions: BatchSession[];
  nextPastRank: number | null;
  nextUpcomingRank: number | null;
};

export type SpecialCourse = UaCourse & {
  liveAt: string | null;
  classUid: string | null;
  classSlug: string | null;
  status: LessonStatus;
  replayId: string | null;
};

export type ClassDetail = {
  uid: string;
  title: string;
  slug: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  courseUid: string;
  courseSlug: string;
  courseName: string;
  liveAt: string | null;
  durationSec: number;
  status: LessonStatus;
  replayId: string | null;
  notesUrl: string | null;
  slidesUrl: string | null;
  hlsUrls: string[];
  livePlayer: string;
  attendance: number;
};

export type LiveSlot = {
  classUid: string;
  classSlug: string;
  title: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  cover: string;
  liveAt: string | null;
  status: LessonStatus;
  replayId: string | null;
  attendance: number;
  goalUid?: string;
  goalName?: string;
  plus?: boolean;
};

export type ReplayHit = {
  title: string;
  replayId: string;
};

type Data<T> = { data: T; signal?: AbortSignal };

function apiGet<T>(path: string, signal?: AbortSignal) {
  return apiJson<T>(path, signal ? { signal } : {});
}

export async function loadEducatorPage({ data, signal }: Data<{ username: string; offset?: number; sort?: string }>) {
  return apiGet<EducatorPage>(`/api/educators/${encodeURIComponent(data.username)}${qs({ offset: data.offset, sort: data.sort })}`, signal);
}

export async function searchEducators({ data, signal }: Data<{ q: string; goalId?: string }>) {
  return apiGet<{ exact: Educator | null; hits: EducatorHit[] }>(`/api/search/educators${qs({ q: data.q, goalId: data.goalId })}`, signal);
}

export async function loadCourseDetail({ data, signal }: Data<{ uid: string; slug?: string; teacher?: string }>) {
  return apiGet<CourseDetail>(`/api/courses/${encodeURIComponent(data.uid)}${qs({ slug: data.slug, teacher: data.teacher })}`, signal);
}

export async function loadCourseLessons({ data, signal }: Data<{ uid: string; offset?: number; total?: number; slug?: string }>) {
  return apiGet<{ lessons: UaLesson[]; nextOffset: number | null; total: number }>(
    `/api/courses/${encodeURIComponent(data.uid)}/lessons${qs({ offset: data.offset, total: data.total, slug: data.slug })}`,
    signal,
  );
}

export async function loadExamTeachers({ data, signal }: Data<{ goalId: string; offset?: number }>) {
  return apiGet<ExamPage>(`/api/exams/${encodeURIComponent(data.goalId)}/teachers${qs({ offset: data.offset })}`, signal);
}

export async function loadExamHub({ data, signal }: Data<{ goalId: string }>) {
  return apiGet<ExamHub>(`/api/exams/${encodeURIComponent(data.goalId)}/hub`, signal);
}

export async function loadExamSubjectCourses({ data, signal }: Data<{ topologyUid: string }>) {
  return apiGet<{ courses: ExamCourse[] }>(`/api/exams/_/courses${qs({ subject: data.topologyUid })}`, signal);
}

export async function loadExamCourses({ data, signal }: Data<{ goalId: string; offset?: number }>) {
  return apiGet<{ courses: ExamCourse[]; nextOffset: number | null; total: number }>(
    `/api/exams/${encodeURIComponent(data.goalId)}/courses${qs({ offset: data.offset })}`,
    signal,
  );
}

export async function loadExamTests({ data, signal }: Data<{ goalId: string }>) {
  return apiGet<{ series: TestSeries[] }>(`/api/exams/${encodeURIComponent(data.goalId)}/tests`, signal);
}

export async function loadTestSeriesItems({ data, signal }: Data<{ uid: string }>) {
  return apiGet<{ items: TestItem[]; total: number }>(`/api/test-series/${encodeURIComponent(data.uid)}/items`, signal);
}

export async function loadExamPractice({ data, signal }: Data<{ goalId: string }>) {
  return apiGet<{ lines: PracticeLine[]; locked: boolean }>(`/api/exams/${encodeURIComponent(data.goalId)}/practice`, signal);
}

export async function loadEducatorBatches({ data, signal }: Data<{ username: string; offset?: number }>) {
  return apiGet<{ batches: UaBatch[]; total: number; nextOffset: number | null }>(
    `/api/educators/${encodeURIComponent(data.username)}/batches${qs({ offset: data.offset })}`,
    signal,
  );
}

export async function loadEducatorSpecials({ data, signal }: Data<{ username: string; offset?: number }>) {
  return apiGet<{ courses: SpecialCourse[]; total: number; nextOffset: number | null }>(
    `/api/educators/${encodeURIComponent(data.username)}/specials${qs({ offset: data.offset })}`,
    signal,
  );
}

export async function loadBatchDetail({ data, signal }: Data<{ uid: string; slug?: string }>) {
  return apiGet<BatchDetail>(`/api/batches/${encodeURIComponent(data.uid)}${qs({ slug: data.slug })}`, signal);
}

export async function loadBatchSchedule({ data, signal }: Data<{ uid: string; past?: boolean; rank?: number }>) {
  return apiGet<{ sessions: BatchSession[]; nextRank: number | null }>(
    `/api/batches/${encodeURIComponent(data.uid)}/schedule${qs({ past: data.past ? "1" : undefined, rank: data.rank })}`,
    signal,
  );
}

export async function loadClassDetail({ data, signal }: Data<{ uid: string; slug?: string }>) {
  return apiGet<ClassDetail>(`/api/classes/${encodeURIComponent(data.uid)}${qs({ slug: data.slug })}`, signal);
}

export async function loadLiveSession({ data, signal }: Data<{ uid: string; slug?: string }>) {
  return apiGet<LiveSession>(`/api/live/sessions/${encodeURIComponent(data.uid)}${qs({ slug: data.slug })}`, signal);
}

export async function loadLiveSlide({ data, signal }: Data<{ uid: string; className?: string; courseName?: string; educatorName?: string; rank?: string; special?: boolean; theme?: string }>) {
  return apiGet<{ url: string }>(
    `/api/live/sessions/${encodeURIComponent(data.uid)}/slide${qs({ name: data.className, course: data.courseName, educator: data.educatorName, rank: data.rank, special: data.special ? "1" : undefined, theme: data.theme })}`,
    signal,
  );
}

export async function loadLiveHistory({ data, signal }: Data<{ uid: string; slug?: string }>) {
  return apiGet<{ packed: string }>(`/api/live/sessions/${encodeURIComponent(data.uid)}/history${qs({ slug: data.slug })}`, signal);
}

export async function loadLiveFeed(signal?: AbortSignal) {
  return apiGet<{ live: LiveSlot[]; later: LiveSlot[] }>("/api/live/feed", signal);
}

export function examHubQuery(goalId: string) {
  return {
    queryKey: ["exam-hub", "v8", goalId] as const,
    staleTime: 60_000,
    queryFn: ({ signal }: { signal?: AbortSignal }) => loadExamHub({ data: { goalId }, signal }),
  };
}

export function courseQueryOptions(courseId: string, slug?: string, teacher?: string) {
  return {
    queryKey: ["course", "v10", courseId, slug ?? "", teacher ?? ""] as const,
    staleTime: 60_000,
    queryFn: ({ signal }: { signal?: AbortSignal }) => loadCourseDetail({ data: { uid: courseId, slug, teacher }, signal }),
  };
}

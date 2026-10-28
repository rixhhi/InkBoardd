export { applyRelatedReplays, htmlLessonBundle, titleScore } from "@inkboard/shared/parse-lesson";
export type { LessonStatus, RelatedHit, UaLesson } from "@inkboard/shared/parse-lesson";
export type { TestItem, TestSeries } from "@inkboard/shared/test-series";
export type { CrashDoor } from "@inkboard/shared/crash-doors";
export type { PracticeLine } from "@inkboard/shared/practice-lines";
export { extractReplayId, isReplayId, normalizeUsername } from "@inkboard/shared/unacademy-ids";
export type {
  Educator,
  TopicRef,
  TopicCovered,
  UaCourse,
  CourseDetail,
  EducatorPage,
  EducatorHit,
  ExamTeacher,
  ExamPage,
  ExamPlaylist,
  ExamSubject,
  ExamCourse,
  ExamHub,
  UaBatch,
  BatchSession,
  BatchDetail,
  SpecialCourse,
  ClassDetail,
  LiveSlot,
  ReplayHit,
} from "../integrations/unacademy/types.ts";
export { loadEducatorPage, searchEducators } from "../integrations/unacademy/educator.ts";
export { loadCourseDetail, loadCourseLessons } from "../integrations/unacademy/course.ts";
export {
  loadExamTeachers,
  resolvePlaylist,
  loadExamHub,
  loadExamSubjectCourses,
  loadExamCourses,
  loadExamTests,
  loadTestSeriesItems,
  loadExamPractice,
} from "../integrations/unacademy/exam.ts";
export {
  loadEducatorBatches,
  loadEducatorSpecials,
  loadBatchDetail,
  loadBatchSchedule,
} from "../integrations/unacademy/batch.ts";
export {
  loadClassDetail,
  loadLiveSession,
  loadLiveSlide,
  loadLiveHistory,
  loadLiveFeed,
} from "../integrations/unacademy/live.ts";

import { defineService } from "@/lib/server-fn.ts";
import { parseCrashBanner } from "@inkboard/shared/crash-doors";
import { ClassDetailInput, EducatorPageInput, ExamHubInput } from "@inkboard/shared/ua-input";

export { parseCrashBanner };
/** Crash courses arrive on this Unacademy feed kind. */
export const CRASH_CAROUSEL = "carousel_feed";

export const checkEducatorPage = defineService({ method: "POST" })
  .validator((d: unknown) => EducatorPageInput.parse(d))
  .handler(async ({ data }) => data);
export const checkExamHub = defineService({ method: "POST" })
  .validator((d: unknown) => ExamHubInput.parse(d))
  .handler(async ({ data }) => data);
export const checkClassDetail = defineService({ method: "POST" })
  .validator((d: unknown) => ClassDetailInput.parse(d))
  .handler(async ({ data }) => data);

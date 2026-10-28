import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { EXAMS } from "@inkboard/shared/exams";
import {
  BatchDetailInput,
  BatchScheduleInput,
  ClassDetailInput,
  CourseDetailInput,
  CourseLessonsInput,
  EducatorPageInput,
  ExamCoursesInput,
  ExamHubInput,
  ExamSubjectInput,
  ExamTeachersInput,
  LiveSlideInput,
  SearchEducatorsInput,
  TeacherBatchesInput,
  TeacherOffsetInput,
  TestSeriesItemsInput,
} from "@inkboard/shared/ua-input";
import {
  loadBatchDetail,
  loadBatchSchedule,
  loadClassDetail,
  loadCourseDetail,
  loadCourseLessons,
  loadEducatorBatches,
  loadEducatorPage,
  loadEducatorSpecials,
  loadExamCourses,
  loadExamHub,
  loadExamPractice,
  loadExamSubjectCourses,
  loadExamTeachers,
  loadExamTests,
  loadLiveFeed,
  loadLiveHistory,
  loadLiveSession,
  loadLiveSlide,
  loadTestSeriesItems,
  searchEducators,
} from "@/catalog/source.ts";
import { handleJson, requestIdOf } from "../http.ts";
import { parseInput } from "../dto/validate.ts";
import { withRequestDeadline } from "../lib/deadline.ts";
import type { ZodType } from "zod";

function read<T>(schema: ZodType<T>, value: unknown): T {
  return parseInput(schema, value, "request");
}

function serve<T>(req: FastifyRequest, reply: FastifyReply, fn: () => Promise<T>) {
  return handleJson(reply, requestIdOf(req), () => withRequestDeadline(25_000, fn));
}

export async function registerCatalog(app: FastifyInstance) {
  app.get("/api/exams", async () => ({ exams: EXAMS }));

  app.get("/api/exams/:goalId/hub", async (req, reply) => {
    return serve(req, reply, async () => loadExamHub(read(ExamHubInput, req.params)));
  });

  app.get("/api/exams/:goalId/teachers", async (req, reply) => {
    return serve(req, reply, async () => loadExamTeachers(read(ExamTeachersInput, { ...(req.params as object), ...(req.query as object) })));
  });

  app.get("/api/exams/:goalId/courses", async (req, reply) => {
    return serve(req, reply, async () => {
      const q = req.query as { subject?: string; offset?: string };
      if (q.subject) return loadExamSubjectCourses(read(ExamSubjectInput, { topologyUid: q.subject }));
      return loadExamCourses(read(ExamCoursesInput, { ...(req.params as object), offset: q.offset }));
    });
  });

  app.get("/api/exams/:goalId/tests", async (req, reply) => {
    return serve(req, reply, async () => loadExamTests(read(ExamHubInput, req.params)));
  });

  app.get("/api/exams/:goalId/practice", async (req, reply) => {
    return serve(req, reply, async () => loadExamPractice(read(ExamHubInput, req.params)));
  });

  app.get("/api/test-series/:id/items", async (req, reply) => {
    return serve(req, reply, async () => loadTestSeriesItems(read(TestSeriesItemsInput, { uid: (req.params as { id: string }).id })));
  });

  app.get("/api/educators/:username", async (req, reply) => {
    return serve(req, reply, async () => loadEducatorPage(read(EducatorPageInput, { ...(req.params as object), ...(req.query as object) })));
  });

  app.get("/api/educators/:username/batches", async (req, reply) => {
    return serve(req, reply, async () => loadEducatorBatches(read(TeacherBatchesInput, { ...(req.params as object), ...(req.query as object) })));
  });

  app.get("/api/educators/:username/specials", async (req, reply) => {
    return serve(req, reply, async () => loadEducatorSpecials(read(TeacherOffsetInput, { ...(req.params as object), ...(req.query as object) })));
  });

  app.get("/api/search/educators", async (req, reply) => {
    return serve(req, reply, async () => searchEducators(read(SearchEducatorsInput, req.query)));
  });

  app.get("/api/courses/:uid", async (req, reply) => {
    return serve(req, reply, async () => loadCourseDetail(read(CourseDetailInput, { ...(req.params as object), ...(req.query as object) })));
  });

  app.get("/api/courses/:uid/lessons", async (req, reply) => {
    return serve(req, reply, async () => loadCourseLessons(read(CourseLessonsInput, { ...(req.params as object), ...(req.query as object) })));
  });

  app.get("/api/batches/:uid", async (req, reply) => {
    return serve(req, reply, async () => loadBatchDetail(read(BatchDetailInput, { ...(req.params as object), ...(req.query as object) })));
  });

  app.get("/api/batches/:uid/schedule", async (req, reply) => {
    return serve(req, reply, async () => {
      const q = req.query as { rank?: string; past?: string };
      return loadBatchSchedule(read(BatchScheduleInput, {
        ...(req.params as object),
        past: q.past,
        rank: q.rank ? Number(q.rank) : undefined,
      }));
    });
  });

  app.get("/api/classes/:uid", async (req, reply) => {
    return serve(req, reply, async () => loadClassDetail(read(ClassDetailInput, { ...(req.params as object), ...(req.query as object) })));
  });

  app.get("/api/live/feed", async (req, reply) => serve(req, reply, () => loadLiveFeed()));

  app.get("/api/live/sessions/:uid", async (req, reply) => {
    return serve(req, reply, async () => loadLiveSession(read(ClassDetailInput, { ...(req.params as object), ...(req.query as object) })));
  });

  app.get("/api/live/sessions/:uid/slide", async (req, reply) => {
    return serve(req, reply, async () => {
      const q = req.query as Record<string, string | undefined>;
      return loadLiveSlide(read(LiveSlideInput, {
        ...(req.params as object),
        className: q.name || q.className,
        courseName: q.course || q.courseName,
        educatorName: q.educator || q.educatorName,
        rank: q.rank,
        special: q.special,
        theme: q.theme,
      }));
    });
  });

  app.get("/api/live/sessions/:uid/history", async (req, reply) => {
    return serve(req, reply, async () => loadLiveHistory(read(ClassDetailInput, { ...(req.params as object), ...(req.query as object) })));
  });
}

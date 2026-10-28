import type { FastifyInstance } from "fastify";
import { loadLessonTimeline, probeReplayMedia, resolveLessonNotes } from "@/services/lesson-media.ts";
import { LessonNotesQuery, LessonParams, parseInput, probeIds } from "../dto/validate.ts";
import { handleJson, requestIdOf } from "../http.ts";
import { badRequest } from "@inkboard/shared/http-error";
import { withRequestDeadline } from "../lib/deadline.ts";

export async function registerLessons(app: FastifyInstance) {
  app.get("/api/lessons/:id/timeline", async (req, reply) => {
    return handleJson(reply, requestIdOf(req), () => withRequestDeadline(25_000, async () => {
      const data = parseInput(LessonParams, req.params, "lesson id");
      if (!data.id) throw badRequest("Invalid lesson id");
      return loadLessonTimeline({ id: data.id });
    }));
  });

  app.get("/api/lessons/:id/notes", async (req, reply) => {
    return handleJson(reply, requestIdOf(req), () => withRequestDeadline(25_000, async () => {
      const params = parseInput(LessonParams, req.params, "lesson id");
      const query = parseInput(LessonNotesQuery, req.query ?? {}, "query");
      return resolveLessonNotes({ id: params.id, title: query.title });
    }));
  });

  app.post("/api/lessons/probe", async (req, reply) => {
    return handleJson(reply, requestIdOf(req), () => withRequestDeadline(25_000, async () => {
      return probeReplayMedia({ ids: probeIds(req.body) });
    }));
  });
}

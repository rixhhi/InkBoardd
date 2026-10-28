import type { FastifyInstance } from "fastify";
import { tooMany } from "@inkboard/shared/http-error";
import { handleJson, requestIdOf } from "../http.ts";
import { allowRate } from "../middlewares/rate-limit.ts";
import { normalizeSummaryInput, summarizeClass } from "../services/summary.ts";

export async function registerSummary(app: FastifyInstance) {
  app.post("/api/study/summary", async (req, reply) => {
    const requestId = requestIdOf(req);
    return handleJson(reply, requestId, async () => {
      const ip = req.ip || "local";
      if (!(await allowRate(`summary:${ip}`, 6, 60_000))) {
        throw tooMany("Too many summaries. Wait a minute.");
      }
      const input = normalizeSummaryInput(req.body);
      return summarizeClass(input, { apiKey: process.env.XAI_API_KEY });
    });
  });
}

import type { FastifyInstance } from "fastify";
import { searchDesk } from "@/services/desk-search.ts";
import { DeskSearchInput, parseInput } from "../dto/validate.ts";
import { handleJson, requestIdOf } from "../http.ts";
import { withRequestDeadline } from "../lib/deadline.ts";

export async function registerSearch(app: FastifyInstance) {
  app.get("/api/search/desk", async (req, reply) => {
    return handleJson(reply, requestIdOf(req), () => withRequestDeadline(25_000, async () => {
      const data = parseInput(DeskSearchInput, req.query ?? {}, "query");
      return searchDesk({ q: data.q, goalId: data.goalId });
    }));
  });
}

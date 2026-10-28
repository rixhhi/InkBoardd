import type { FastifyInstance } from "fastify";
import { loadUpstreamHealth } from "@/services/upstream-health.ts";

export async function registerUpstream(app: FastifyInstance) {
  app.get("/api/upstream/health", async () => loadUpstreamHealth());
}

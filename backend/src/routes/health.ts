import type { FastifyInstance } from "fastify";
import { isShuttingDown } from "../lifecycle.ts";
import { pingPostgres } from "../repositories/postgres/client.ts";
import { pingRedis } from "../repositories/redis/client.ts";
import { ffmpegStatus } from "../integrations/ffmpeg/probe.ts";

/** 503 only while shutting down or when Postgres itself failed. Redis can be down. */
export function readyzHttpStatus(postgres: string, _redis: string, shuttingDown: boolean): 200 | 503 {
  if (shuttingDown || postgres === "error") return 503;
  return 200;
}

export const readinessProbes = {
  postgres: pingPostgres,
  redis: pingRedis,
};

export async function registerHealth(app: FastifyInstance) {
  app.get("/healthz", async () => ({ ok: true, service: "inkboard-api" }));

  app.get("/readyz", async (_req, reply) => {
    const [postgres, redis] = await Promise.all([readinessProbes.postgres(), readinessProbes.redis()]);
    const ffmpeg = ffmpegStatus();
    const shuttingDown = isShuttingDown();
    const body = { postgres, redis, ffmpeg, shuttingDown };
    if (readyzHttpStatus(postgres, redis, shuttingDown) === 503) {
      return reply.status(503).send(body);
    }
    return body;
  });
}
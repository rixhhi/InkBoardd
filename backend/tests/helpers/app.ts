import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.ts";

export async function testApp(): Promise<FastifyInstance> {
  process.env.LOG_LEVEL ??= "silent";
  // Catalog/contract tests exercise routes without a session. Auth has its own suite (tests/auth/*).
  process.env.AUTH_DISABLED ??= "1";
  // CI and sandboxes keep JOB_DIR on a small tmpfs; the disk guard has its own test.
  process.env.JOB_MIN_FREE_GB ??= "0";
  return buildApp();
}

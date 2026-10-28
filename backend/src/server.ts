import { buildApp } from "./app.ts";
import { BACKEND_HOST, BACKEND_PORT } from "./config/env.ts";
import { beginShutdown } from "./lifecycle.ts";
import { ensureSchema, pruneExpiredCache } from "./repositories/postgres/schema.ts";
import { pingPostgres } from "./repositories/postgres/client.ts";
import { pingRedis } from "./repositories/redis/client.ts";
import { installHostLookup, lookupHost } from "@inkboard/shared/ssrf";

installHostLookup(lookupHost);

try {
  await ensureSchema();
} catch (err) {
  console.error("[inkboard-api] ⚠ schema setup failed:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) console.error(err.stack);
}

const [postgres, redis] = await Promise.all([pingPostgres(), pingRedis()]);
console.log(`[inkboard-api] stores postgres=${postgres} redis=${redis}`);

const app = await buildApp();
await app.listen({ host: BACKEND_HOST, port: BACKEND_PORT });
console.log(`[inkboard-api] http://${BACKEND_HOST}:${BACKEND_PORT}`);

// Warm the slow upstream pages so the first visitor after a restart doesn't wait 15-30 s.
// Runs in the background, one call at a time, and never blocks startup.
if (process.env.WARM_CACHE !== "0") {
  setTimeout(() => {
    void (async () => {
      const src = await import("./catalog/source.ts");
      const { EXAMS } = await import("@inkboard/shared/exams");
      const goals = (process.env.WARM_EXAMS || "TMUVD,YOTUH,NVLIA,CNFPR,PZSIU").split(",").map((s) => s.trim()).filter((id) => EXAMS.some((e) => e.id === id));
      const started = Date.now();
      await src.loadLiveFeed().catch(() => {});
      for (const goalId of goals) await src.loadExamHub({ goalId }).catch(() => {});
      console.log(`[inkboard-api] cache warmed (${goals.length} exam hubs + live feed) in ${Math.round((Date.now() - started) / 1000)} s`);
    })().catch(() => {});
  }, 1500).unref();
}

pruneExpiredCache().then((n) => { if (n > 0) console.log(`[inkboard-api] pruned ${n} expired cache rows`); }).catch(() => {});
setInterval(() => { pruneExpiredCache().catch(() => {}); }, 60 * 60 * 1000).unref();

let stopping = false;
async function shutdown(signal: string, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  beginShutdown();
  console.log(`[inkboard-api] ${signal}, closing`);
  const timer = setTimeout(() => process.exit(1), 10_000);
  try {
    await app.close();
    const { getPool } = await import("./repositories/postgres/client.ts");
    const { getRedis } = await import("./repositories/redis/client.ts");
    await getPool()?.end().catch(() => {});
    const redis = await getRedis();
    await redis?.quit().catch(() => {});
  } finally {
    clearTimeout(timer);
  }
  process.exit(exitCode);
}

process.on("unhandledRejection", (reason) => {
  console.error("[fatal-ish] unhandled rejection", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaught exception", err);
  void shutdown("uncaughtException", 1).catch((e) => console.error(e));
});

process.once("SIGTERM", () => void shutdown("SIGTERM").catch((err) => console.error(err)));
process.once("SIGINT", () => void shutdown("SIGINT").catch((err) => console.error(err)));


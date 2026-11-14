import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

/**
 * A throwaway real redis-server for integration tests.
 *
 * Uses REDIS_TEST_URL when set (CI points it at its redis service). Otherwise it starts
 * `redis-server` on a free port, and returns null when that binary is not installed so the
 * calling suite can skip instead of fail.
 */
export type TestRedis = { url: string; stop: () => Promise<void> };

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

function haveBinary(): boolean {
  return spawnSync("redis-server", ["--version"], { stdio: "ignore" }).status === 0;
}

async function waitReady(url: string, ms: number): Promise<boolean> {
  const { default: Redis } = await import("ioredis");
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const c = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 0, connectTimeout: 500, retryStrategy: () => null });
    c.on("error", () => undefined);
    try {
      await c.connect();
      const pong = await c.ping();
      c.disconnect();
      if (pong === "PONG") return true;
    } catch {
      c.disconnect();
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

export async function startTestRedis(): Promise<TestRedis | null> {
  const given = process.env.REDIS_TEST_URL?.trim();
  if (given) {
    if (!(await waitReady(given, 5_000))) throw new Error(`REDIS_TEST_URL ${given} is not answering`);
    return { url: given, stop: async () => undefined };
  }
  if (!haveBinary()) return null;
  const port = await freePort();
  const child: ChildProcess = spawn("redis-server", ["--port", String(port), "--bind", "127.0.0.1", "--save", "", "--appendonly", "no"], { stdio: "ignore" });
  const url = `redis://127.0.0.1:${port}`;
  const stop = async () => {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 2_000).unref();
    });
  };
  if (!(await waitReady(url, 8_000))) {
    await stop();
    throw new Error("redis-server did not start");
  }
  return { url, stop };
}

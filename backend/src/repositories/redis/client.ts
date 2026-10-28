import { REDIS_URL } from "../../config/env.ts";

type Status = "ok" | "skip" | "error";

export type RedisLike = {
  ping: () => Promise<string>;
  incr: (key: string) => Promise<number>;
  pexpire: (key: string, ms: number) => Promise<unknown>;
  eval: (script: string, numKeys: number, ...args: string[]) => Promise<unknown>;
  quit: () => Promise<unknown>;
  getBuffer: (key: string) => Promise<Buffer | null>;
  set: (key: string, value: string | Buffer, mode?: "EX", seconds?: number) => Promise<unknown>;
};

const globalRef = globalThis as typeof globalThis & {
  __inkboardRedis__?: RedisLike;
};

/**
 * Managed Redis (Upstash, Redis Cloud, ElastiCache serverless) only accepts TLS.
 * A pasted `redis://` URL for those hosts silently fails with "Connection is
 * closed", so upgrade it to `rediss://`.
 */
export function redisUrlWithTls(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === "redis:" && /(\.upstash\.io|\.redis-cloud\.com|\.redislabs\.com|\.cache\.amazonaws\.com)$/i.test(u.hostname)) {
      u.protocol = "rediss:";
      return u.toString();
    }
  } catch {
    /* not a URL; let ioredis report it */
  }
  return url;
}

export function redisConfigured() {
  return Boolean(REDIS_URL);
}

export async function getRedis(): Promise<RedisLike | null> {
  if (!REDIS_URL) return null;
  if (!globalRef.__inkboardRedis__) {
    const Redis = (await import("ioredis")).default;
    const redis = new Redis(redisUrlWithTls(REDIS_URL), {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: false,
      connectTimeout: 3_000,
      commandTimeout: 8_000,
    });
    redis.on("error", (err: Error) => {
      console.warn("[redis]", err.message);
    });
    globalRef.__inkboardRedis__ = redis as unknown as RedisLike;
  }
  return globalRef.__inkboardRedis__;
}

export async function pingRedis(): Promise<Status> {
  if (!REDIS_URL) return "skip";
  try {
    const redis = await getRedis();
    if (!redis) return "skip";
    const pong = await Promise.race([
      redis.ping(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("redis ping timed out")), 2_000)),
    ]);
    return pong ? "ok" : "error";
  } catch (err) {
    console.warn("[redis] ping failed:", err instanceof Error ? err.message : err);
    return "error";
  }
}

import { allowRate as memoryAllow, PROXY_RATE_LIMIT, PROXY_RATE_WINDOW_MS } from "@inkboard/shared/cdn-proxy";
import { getRedis } from "../repositories/redis/client.ts";

const LUA = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return n
`;

let warnedAt = 0;

export function rateConfig(): { limit: number; windowMs: number } {
  const limit = Number(process.env.RATE_LIMIT);
  const windowMs = Number(process.env.RATE_WINDOW_MS);
  return {
    limit: Number.isFinite(limit) && limit >= 1 && limit <= 10_000 ? Math.floor(limit) : 120,
    windowMs: Number.isFinite(windowMs) && windowMs >= 1_000 && windowMs <= 3_600_000 ? Math.floor(windowMs) : 60_000,
  };
}

function warnOnce(message: string) {
  const now = Date.now();
  if (now - warnedAt < 60_000) return;
  warnedAt = now;
  console.warn(message);
}

export async function allowRate(ip: string, limit = PROXY_RATE_LIMIT, windowMs = PROXY_RATE_WINDOW_MS): Promise<boolean> {
  try {
    const redis = await Promise.race([
      getRedis(),
      new Promise<null>((resolve) => {
        const t = setTimeout(() => resolve(null), 400);
        if (typeof t === "object" && "unref" in t) t.unref();
      }),
    ]);
    if (redis && "eval" in redis && typeof redis.eval === "function") {
      const n = await Promise.race([
        redis.eval(LUA, 1, `rl:${limit}:${windowMs}:${ip}`, String(windowMs)) as Promise<number>,
        new Promise<null>((resolve) => {
          const t = setTimeout(() => resolve(null), 400);
          if (typeof t === "object" && "unref" in t) t.unref();
        }),
      ]);
      if (n == null) {
        warnOnce("[redis] rate limit timed out; using memory");
        return memoryAllow(ip, limit, windowMs);
      }
      return Number(n) <= limit;
    }
  } catch (err) {
    warnOnce(`[redis] rate limit failed: ${err instanceof Error ? err.message : err}`);
  }
  return memoryAllow(ip, limit, windowMs);
}

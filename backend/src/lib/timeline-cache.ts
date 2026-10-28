import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { getRedis, type RedisLike } from "../repositories/redis/client.ts";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const TTL_SEC = 60 * 60 * 24 * 3;
const MAX_GZIP = 24_000_000;

export type TimelineCacheRedis = Pick<RedisLike, "getBuffer" | "set">;

export function timelineCacheKey(version: string, id: string, stamp: string) {
  const safe = stamp.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 180) || "nov";
  return `inkboard:timeline:${version}:${id}:${safe}`;
}

export async function packTimelineCache(value: unknown): Promise<Buffer | null> {
  const gz = await gzipAsync(Buffer.from(JSON.stringify(value)));
  if (gz.length > MAX_GZIP) return null;
  return gz;
}

export async function unpackTimelineCache<T>(buf: Buffer): Promise<T | null> {
  try {
    const raw = await gunzipAsync(buf);
    return JSON.parse(raw.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function isPackedTimeline(value: unknown): value is { id: string; strokes: unknown[]; slides: unknown[] } {
  if (!value || typeof value !== "object") return false;
  const row = value as { id?: unknown; strokes?: unknown; slides?: unknown };
  return typeof row.id === "string" && Array.isArray(row.strokes) && Array.isArray(row.slides);
}

export async function readTimelineCache<T>(key: string, redis?: TimelineCacheRedis | null): Promise<T | null> {
  try {
    const client = redis === undefined ? await getRedis() : redis;
    if (!client) return null;
    const buf = await client.getBuffer(key);
    if (!buf?.length) return null;
    return unpackTimelineCache<T>(buf);
  } catch (err) {
    console.warn("[timeline-cache] read failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function writeTimelineCache(key: string, value: unknown, redis?: TimelineCacheRedis | null): Promise<void> {
  try {
    const client = redis === undefined ? await getRedis() : redis;
    if (!client) return;
    const gz = await packTimelineCache(value);
    if (!gz) return;
    await client.set(key, gz, "EX", TTL_SEC);
  } catch (err) {
    console.warn("[timeline-cache] write failed:", err instanceof Error ? err.message : err);
  }
}

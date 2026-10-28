import { cacheGet, cacheSet } from "../repositories/postgres/cache.ts";
import { getPool, postgresConfigured } from "../repositories/postgres/client.ts";

type Entry = { at: number; data: unknown; gen: number };
type Loader = (key: string, minGen?: number) => Promise<unknown>;

const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX = 400;
let generation = 0;
let loaderIsCustom = false;

function defaultLoader(key: string, minGen?: number) {
  return cacheGet(key, minGen ?? 0);
}

let loadPersistent: Loader = defaultLoader;

export function setPersistentLoader(fn: Loader | null) {
  if (fn) {
    loadPersistent = fn;
    loaderIsCustom = true;
  } else {
    loadPersistent = defaultLoader;
    loaderIsCustom = false;
  }
}

export function escapeLike(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function swrPurgeQuery(prefix: string): { sql: string; params: string[] } {
  if (!prefix) return { sql: "DELETE FROM upstream_cache", params: [] };
  return {
    sql: "DELETE FROM upstream_cache WHERE cache_key LIKE $1 ESCAPE '\\'",
    params: [`${escapeLike(prefix)}%`],
  };
}

function remember(key: string, data: unknown, staleMs?: number, gen = generation) {
  if (gen !== generation) return;
  mem.set(key, { at: Date.now(), data, gen });
  while (mem.size > MAX) {
    const first = mem.keys().next().value;
    if (first == null) break;
    mem.delete(first);
  }
  if (staleMs) {
    void cacheSet(key, data, staleMs, gen).catch((err) => {
      console.warn("[swr] cache write failed", key, err instanceof Error ? err.message : err);
    });
  }
}

function hold(key: string, data: unknown, gen = generation) {
  if (gen !== generation) return;
  mem.set(key, { at: Date.now(), data, gen });
}

function raceTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

function servableFault(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: string }).code) : "";
  const status = "status" in err ? Number((err as { status?: number }).status) : 0;
  return code === "UPSTREAM_BREAKER_OPEN" || code === "UPSTREAM_TIMEOUT" || code === "UPSTREAM" || status >= 500;
}

export function isHollow(data: unknown): boolean {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data !== "object") return false;
  const rec = data as Record<string, unknown>;
  if (Array.isArray(rec.partial) && rec.partial.length > 0) return true;
  const bags = ["teachers", "courses", "playlists", "lessons", "live", "later", "trending", "hits"];
  const present = bags.filter((k) => Array.isArray(rec[k]));
  if (!present.length) return false;
  return present.every((k) => (rec[k] as unknown[]).length === 0);
}

export function swrPeek<T>(key: string): T | undefined {
  const hit = mem.get(key);
  return hit ? (hit.data as T) : undefined;
}

export async function swrInvalidate(prefix = ""): Promise<void> {
  generation += 1;
  for (const key of [...mem.keys()]) {
    if (!prefix || key.startsWith(prefix)) mem.delete(key);
  }
  for (const key of [...inflight.keys()]) {
    if (!prefix || key.startsWith(prefix)) inflight.delete(key);
  }
  if (!postgresConfigured()) return;
  const pool = getPool();
  if (!pool) return;
  const { sql, params } = swrPurgeQuery(prefix);
  try {
    await pool.query(sql, params);
  } catch (err) {
    console.warn("[swr] cache purge failed:", err instanceof Error ? err.message : err);
  }
}

export function swrReset() {
  mem.clear();
  inflight.clear();
  generation = 0;
  loadPersistent = defaultLoader;
  loaderIsCustom = false;
}

export function swr<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  staleMs = ttlMs * 6,
  keep: (data: T) => boolean = (data) => !isHollow(data),
): Promise<T> {
  const now = Date.now();
  let hit = mem.get(key);
  if (hit && hit.gen < generation) {
    mem.delete(key);
    hit = undefined;
  }
  if (hit && now - hit.at < ttlMs) {
    mem.delete(key);
    mem.set(key, hit);
    return Promise.resolve(hit.data as T);
  }

  const pending = inflight.get(key) as Promise<T> | undefined;
  const run = (): Promise<T> => {
    if (pending) return pending;
    const started = generation;
    const p = fn()
      .then((data) => {
        if (started === generation && keep(data)) remember(key, data, staleMs, started);
        return data;
      })
      .catch(async (err) => {
        if (!servableFault(err)) throw err;
        if (started !== generation) throw err;
        const stale = mem.get(key);
        if (stale && stale.gen >= generation) return stale.data as T;
        const cached = await raceTimeout(Promise.resolve(loadPersistent(key, generation)), 800);
        if (started !== generation) throw err;
        if (cached != null && keep(cached as T)) {
          hold(key, cached, started);
          return cached as T;
        }
        throw err;
      })
      .finally(() => {
        if (inflight.get(key) === p) inflight.delete(key);
      });
    inflight.set(key, p);
    return p;
  };

  const refresh = () => {
    void run().catch((err) => {
      console.warn("[swr] background refresh failed", key, err instanceof Error ? err.message : err);
    });
  };

  if (hit && now - hit.at < staleMs) {
    refresh();
    return Promise.resolve(hit.data as T);
  }

  if (!hit && (loaderIsCustom || postgresConfigured())) {
    const seen = generation;
    return raceTimeout(Promise.resolve(loadPersistent(key, seen)), 800).then((cached) => {
      if (seen !== generation || cached == null || !keep(cached as T)) return run();
      remember(key, cached, undefined, seen);
      refresh();
      return cached as T;
    });
  }

  return run();
}

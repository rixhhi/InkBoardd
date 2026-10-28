import { breakerOpen, isUpstreamFault, UpstreamError } from "@inkboard/shared/http-error";

/**
 * Stops calling a dead upstream after repeated real faults (timeouts, 5xx, 429).
 * A 404 or a bad id does not count. After the cool-down, one probe is allowed.
 */
export function createBreaker(opts?: { failures?: number; resetMs?: number; now?: () => number }) {
  const limit = opts?.failures ?? 5;
  const resetMs = opts?.resetMs ?? 30_000;
  const now = opts?.now ?? (() => Date.now());
  let fails = 0;
  let openUntil = 0;
  let halfOpen = false;

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      const t = now();
      if (t < openUntil) {
        throw breakerOpen("Catalog is unavailable. Try again shortly.", Math.max(1, Math.ceil((openUntil - t) / 1000)));
      }
      if (halfOpen) {
        throw breakerOpen("Catalog is unavailable. Try again shortly.", Math.max(1, Math.ceil(resetMs / 1000)));
      }
      const probing = fails >= limit;
      if (probing) halfOpen = true;
      try {
        const value = await fn();
        fails = 0;
        openUntil = 0;
        halfOpen = false;
        return value;
      } catch (err) {
        halfOpen = false;
        if (isUpstreamFault(err) || (err instanceof UpstreamError && err.status >= 500)) {
          fails += 1;
          if (fails >= limit) openUntil = now() + resetMs;
        }
        throw err;
      }
    },
    open(): boolean {
      return now() < openUntil || halfOpen;
    },
    failures(): number {
      return fails;
    },
  };
}

const families = new Map<string, ReturnType<typeof createBreaker>>();

export function familyBreaker(name: string) {
  let hit = families.get(name);
  if (!hit) {
    hit = createBreaker();
    families.set(name, hit);
  }
  return hit;
}

export function resetBreakers() {
  families.clear();
}

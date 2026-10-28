import type { Share, User } from "./types.ts";

/* ---------------- caches ---------------- */

export const sessionCache = new Map<string, { user: User; at: number }>();
export const shareCache = new Map<number, { shares: Share[]; ver: number; at: number }>();
export const settingCache = new Map<string, { value: string; at: number }>();
let shareVer = 0;

/** Bumped on every write that changes who can see what. */
export function shareVersion(): number {
  return shareVer;
}
export const SESSION_TTL = 30_000;
export const SHARE_TTL = 30_000;
export const SETTING_TTL = 30_000;

export function clearCaches() {
  sessionCache.clear();
  shareCache.clear();
  settingCache.clear();
  shareVer += 1;
}

/** Anything that changes who can see what. */
export function bumpShares() {
  shareVer += 1;
  shareCache.clear();
}

export function forgetUserSessions(userId: number) {
  for (const [k, v] of sessionCache) if (v.user.id === userId) sessionCache.delete(k);
}

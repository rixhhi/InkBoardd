import type { SyncStatus } from "./types.ts";

export function nextRetryMs(attempt: number, rand = Math.random()): number {
  const n = Math.max(0, Math.floor(attempt));
  return Math.min(30_000, 800 * 2 ** n) + Math.floor(rand * 250);
}

export function canPushNow(opts: {
  canSync: boolean;
  loadedOk: boolean;
  pushing: boolean;
  dirty: boolean;
  online: boolean;
}): boolean {
  return opts.canSync && opts.loadedOk && !opts.pushing && opts.dirty && opts.online;
}

export function statusAfterPushFail(online: boolean): SyncStatus {
  return online ? "error" : "offline";
}

export function statusAfterLoadOk(): SyncStatus {
  return "synced";
}

export function statusSignedOut(): SyncStatus {
  return "local-only";
}

export function shouldRetryPush(online: boolean, loadedOk: boolean): boolean {
  return online && loadedOk;
}

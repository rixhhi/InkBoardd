import { UpstreamError } from "./http-error.ts";

/** Catalog outage vs empty content. Only a real upstream 5xx counts. */

export type UpstreamFail = {
  at: number;
  scope: string;
  status: number;
};

const WINDOW_MS = 5 * 60_000;
/** A page that just loaded should not grow a banner from a side request. */
const GRACE_MS = 20_000;
let last: UpstreamFail | null = null;
let lastOk = 0;

export function isClientAbort(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as Error & { code?: string }).code || "";
  if (code === "ECONNRESET" || code === "EPIPE") return true;
  return /^request aborted$/i.test(err.message) || /premature close/i.test(err.message);
}

export function isUpstreamOutage(err: unknown): boolean {
  if (isClientAbort(err)) return false;
  return err instanceof UpstreamError && err.status >= 500;
}

export function reportUpstreamFail(scope: string, err: unknown, now = Date.now()): void {
  if (!isUpstreamOutage(err)) return;
  if (lastOk > 0 && now - lastOk < GRACE_MS) return;
  const status = err instanceof UpstreamError ? (err.upstreamStatus ?? err.status) : 0;
  last = { at: now, scope, status };
}

export function noteUpstreamOk(now = Date.now()): void {
  lastOk = now;
  if (last && lastOk > last.at) last = null;
}

export function readUpstreamFail(now = Date.now()): UpstreamFail | null {
  if (!last) return null;
  if (now - last.at > WINDOW_MS) return null;
  if (lastOk > last.at) return null;
  return last;
}

export function clearUpstreamFail(): void {
  last = null;
  lastOk = 0;
}

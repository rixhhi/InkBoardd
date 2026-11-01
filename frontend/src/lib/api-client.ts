import { catalogSignal } from "@inkboard/shared/catalog-signal";
import { setCatalogStatus } from "@/lib/catalog-status";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = "ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function qs(rec: Record<string, unknown>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(rec)) {
    if (v == null || v === "") continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

const RETRYABLE = new Set([0, 408, 425, 502, 503, 504]);

export function shouldRetry(count: number, err: unknown) {
  if (isAbortError(err)) return false;
  if (!(err instanceof ApiError)) return count < 2;
  if (err.status === 400 || err.status === 401 || err.status === 403 || err.status === 404 || err.status === 410) return false;
  if (err.status === 429) return count < 4;
  if (err.status === 500) return count < 1;
  if (RETRYABLE.has(err.status) || err.code === "TIMEOUT" || err.code === "NETWORK" || err.code === "BAD_RESPONSE") return count < 5;
  return count < 1;
}

export function retryDelay(attempt: number, err?: unknown) {
  if (err instanceof ApiError && err.status === 429) return Math.min(8_000, 1_000 * (attempt + 1));
  return Math.min(8_000, 400 * 2 ** attempt);
}

const LEAK = /(?:\/[\w.@+-]+){2,}|[A-Za-z]:\\|node_modules|\bat [\w$.<>]+\s+\(/;

function userBody(err: unknown, fallback: string) {
  const text = err instanceof Error ? err.message : "";
  if (!text || LEAK.test(text) || text.includes("\n") || text.length > 180) return fallback;
  return text;
}

export function describeError(err: unknown): { title: string; body: string; kind: "down" | "notfound" | "ratelimit" | "network" | "other"; retryable: boolean } {
  const status = err instanceof ApiError ? err.status : 0;
  const code = err instanceof ApiError ? err.code : "";
  if (code === "NOT_SHARED") {
    return { title: "Not shared with you yet", body: "Ask your admin to share this exam, teacher or course with you.", kind: "notfound", retryable: false };
  }
  if (code === "FEATURE_OFF") {
    return { title: "Turned off on this account", body: "Your admin has switched this feature off.", kind: "notfound", retryable: false };
  }
  if (status === 401 || code === "AUTH_REQUIRED") {
    return { title: "Sign in to continue", body: "Your session ended.", kind: "other", retryable: false };
  }
  if (status === 404 || status === 410 || code === "NOT_FOUND" || code === "ARCHIVED") {
    return { title: "This page is not there", body: userBody(err, "Not found"), kind: "notfound", retryable: false };
  }
  if (status === 429 || code === "RATE_LIMIT") {
    return { title: "You're going a bit fast", body: "Retrying in a moment.", kind: "ratelimit", retryable: true };
  }
  if (code === "TIMEOUT" || code === "UPSTREAM_TIMEOUT" || status === 504) {
    return { title: "The catalog took too long", body: "The class server is waking up. Try again.", kind: "down", retryable: true };
  }
  if (err instanceof ApiError && (status === 0 || code === "NETWORK")) {
    return { title: "Can't reach the server", body: "Check your connection, then try again.", kind: "network", retryable: true };
  }
  if (status >= 500 || code === "UPSTREAM" || code === "UPSTREAM_BREAKER_OPEN" || code === "BAD_RESPONSE") {
    return { title: "The catalog didn't answer", body: "This is usually a restart. Try again in a few seconds.", kind: "down", retryable: true };
  }
  return { title: "Couldn't load this", body: userBody(err, "Try again."), kind: "other", retryable: true };
}

function errorText(status: number, raw: string, statusText: string) {
  const trimmed = raw.trim();
  const html = trimmed.startsWith("<") || /<!doctype html/i.test(trimmed);
  if (html) {
    if (status === 502 || status === 503 || status === 504) {
      return "The class server is restarting. Wait a few seconds and try again.";
    }
    return statusText || "Request failed";
  }
  return trimmed || statusText || "Request failed";
}

function noteCatalog(path: string, ok: boolean, status: number, code = "") {
  const kind = catalogSignal(path, ok, status, code);
  if (typeof globalThis.window === "undefined") return;
  if (kind === "ok") setCatalogStatus("ok");
  if (kind === "down") setCatalogStatus("down");
}

function isAbortError(err: unknown) {
  return err instanceof Error && err.name === "AbortError";
}

function abortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

export async function apiJson<T>(path: string, init: RequestInit = {}, timeoutMs = 28_000): Promise<T> {
  if (init.signal?.aborted) throw abortError();
  const headers = new Headers(init.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  init.signal?.addEventListener("abort", onAbort, { once: true });
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, signal: ctrl.signal });
  } catch {
    if (init.signal?.aborted) throw abortError();
    if (ctrl.signal.aborted) {
      noteCatalog(path, false, 0, "TIMEOUT");
      throw new ApiError(0, "The catalog took too long to answer.", "TIMEOUT");
    }
    noteCatalog(path, false, 0, "NETWORK");
    throw new ApiError(0, "Can't reach the server. Check your connection.", "NETWORK");
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", onAbort);
  }
  if (res.status === 204) {
    noteCatalog(path, true, res.status);
    return null as T;
  }
  const text = await res.text();
  const type = res.headers.get("content-type") || "";
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
  }
  if (res.ok && text && body == null && !type.includes("json")) {
    noteCatalog(path, false, 502, "BAD_RESPONSE");
    throw new ApiError(502, "The server sent an unexpected response.", "BAD_RESPONSE");
  }
  if (!res.ok) {
    const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const code = typeof rec.code === "string" ? rec.code : "ERROR";
    if (res.status === 401 && code === "AUTH_REQUIRED" && typeof window !== "undefined") {
      window.dispatchEvent(new Event("inkboard:auth-lost"));
    }
    noteCatalog(path, false, res.status, code);
    const msg = typeof rec.error === "string" ? errorText(res.status, rec.error, res.statusText) : res.statusText || "Request failed";
    throw new ApiError(res.status, msg, code);
  }
  noteCatalog(path, true, res.status);
  return body as T;
}

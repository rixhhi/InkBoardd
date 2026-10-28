/** Client-safe failure. 4xx messages are shown. 5xx messages are not, unless this is an upstream fault with a fixed sentence. */
export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

/** A fault from Unacademy or the CDN, not from this app's own code. */
export class UpstreamError extends HttpError {
  upstreamStatus?: number;
  retryAfterSec?: number;

  constructor(status: number, code: string, message: string, upstreamStatus?: number) {
    super(status, code, message);
    this.name = "UpstreamError";
    this.upstreamStatus = upstreamStatus;
  }
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, "BAD_REQUEST", message);
}

export function notFound(message: string): HttpError {
  return new HttpError(404, "NOT_FOUND", message);
}

export function tooMany(message: string): HttpError {
  return new HttpError(429, "RATE_LIMIT", message);
}

export function unavailable(message: string): HttpError {
  return new HttpError(503, "UNAVAILABLE", message);
}

export function upstreamTimeout(message = "The catalog took too long to answer."): UpstreamError {
  return new UpstreamError(504, "UPSTREAM_TIMEOUT", message);
}

export function upstreamBad(status = 502, message = "The catalog didn't answer."): UpstreamError {
  return new UpstreamError(status >= 500 ? 502 : 502, "UPSTREAM", message, status);
}

export function upstreamRateLimited(message = "The catalog is busy. Try again shortly."): UpstreamError {
  return new UpstreamError(503, "UPSTREAM_RATE_LIMIT", message, 429);
}

export function upstreamNotFound(message = "Not found"): UpstreamError {
  return new UpstreamError(404, "NOT_FOUND", message, 404);
}

export function breakerOpen(message: string, retryAfterSec: number): UpstreamError {
  const err = new UpstreamError(503, "UPSTREAM_BREAKER_OPEN", message);
  err.retryAfterSec = retryAfterSec;
  return err;
}

export function isUpstreamFault(err: unknown): boolean {
  if (err instanceof UpstreamError) {
    const status = err.upstreamStatus ?? err.status;
    return err.code === "UPSTREAM_TIMEOUT" || status === 429 || status >= 500;
  }
  return transportFault(err) != null;
}

/** Turn a socket/timeout failure into a typed upstream error. Null if it is not one. */
export function transportFault(err: unknown): UpstreamError | null {
  if (err instanceof UpstreamError || err instanceof HttpError) return null;
  if (!(err instanceof Error)) return null;
  const cause = (err as Error & { cause?: { code?: string } }).cause;
  const code = (err as Error & { code?: string }).code || cause?.code || "";
  if (
    err.name === "TimeoutError" ||
    err.name === "AbortError" ||
    err.message === "Request timed out" ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    code === "UND_ERR_BODY_TIMEOUT"
  ) {
    return upstreamTimeout();
  }
  if (
    code === "ECONNRESET" ||
    code === "UND_ERR_SOCKET" ||
    code === "EAI_AGAIN" ||
    (err.name === "TypeError" && /fetch failed/i.test(err.message))
  ) {
    return upstreamBad(502);
  }
  return null;
}

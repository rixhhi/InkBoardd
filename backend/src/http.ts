import type { Writable } from "node:stream";
import type { FastifyReply, FastifyRequest } from "fastify";
import { COPY } from "@inkboard/shared/copy";
import { HttpError, UpstreamError } from "@inkboard/shared/http-error";
import { isClientAbort, reportUpstreamFail } from "@inkboard/shared/upstream";

export function toWebRequest(req: FastifyRequest, signal: AbortSignal): Request {
  const rawHost = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "127.0.0.1");
  const host = /^[\w.-]+(:\d+)?$/.test(rawHost) ? rawHost : "127.0.0.1";
  const rawProto = String(req.headers["x-forwarded-proto"] ?? "http").split(",")[0]!.trim().toLowerCase();
  const proto = rawProto === "https" ? "https" : "http";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, String(value));
    }
  }
  return new Request(`${proto}://${host}${req.url}`, { method: req.method, headers, signal });
}

/** Settles on drain, error, or the client hanging up. Listeners are removed once. */
function waitForDrain(stream: Writable): Promise<void> {
  if (stream.destroyed || stream.closed || stream.writableEnded) {
    return Promise.reject(Object.assign(new Error("client closed"), { code: "CLIENT_CLOSED" }));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      stream.removeListener("drain", onDrain);
      stream.removeListener("error", onError);
      stream.removeListener("close", onClose);
    };
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };
    const onDrain = () => finish(() => resolve());
    const onError = (err: Error) => finish(() => reject(err));
    const onClose = () =>
      finish(() => reject(Object.assign(new Error("client closed"), { code: "CLIENT_CLOSED" })));
    stream.on("drain", onDrain);
    stream.on("error", onError);
    stream.on("close", onClose);
  });
}

export async function sendWebResponse(reply: FastifyReply, res: Response): Promise<void> {
  reply.hijack();
  const encoded = res.headers.has("content-encoding");
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "content-encoding") return;
    if (encoded && (lower === "content-length" || lower === "transfer-encoding")) return;
    headers[key] = value;
  });
  // Copy CORS / security headers that Fastify plugins already set on reply
  const replyHeaders = reply.getHeaders();
  for (const [k, v] of Object.entries(replyHeaders)) {
    const lower = k.toLowerCase();
    if (encoded && (lower === "content-encoding" || lower === "content-length" || lower === "transfer-encoding")) continue;
    if (v != null && !(k in headers)) {
      headers[k] = String(v);
    }
  }
  reply.raw.writeHead(res.status, headers);
  if (!res.body) {
    reply.raw.end();
    return;
  }
  const reader = res.body.getReader();
  let closed = false;
  const onClose = () => {
    closed = true;
    void reader.cancel().catch(() => {});
  };
  reply.raw.on("close", onClose);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || closed) break;
      const ok = reply.raw.write(value);
      if (!ok && !closed) {
        try {
          await waitForDrain(reply.raw);
        } catch (err) {
          closed = true;
          try {
            await reader.cancel();
          } catch {
            /* closed */
          }
          throw err;
        }
        if (closed) {
          try {
            await reader.cancel();
          } catch {
            /* closed */
          }
          break;
        }
      }
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      /* closed */
    }
    try {
      reply.raw.destroy();
    } catch {
      /* closed */
    }
    return;
  } finally {
    reply.raw.removeListener("close", onClose);
    if (closed) {
      try { await reader.cancel(); } catch { /* closed */ }
    }
  }
  try {
    reply.raw.end();
  } catch {
    /* closed */
  }
}

export function jsonError(status: number, error: string, code: string, requestId?: string) {
  return { error, code, requestId };
}

const CLIENT_EXACT: Record<string, { status: number; code: string }> = {
  "Unknown exam": { status: 400, code: "BAD_REQUEST" },
  "Unknown subject": { status: 400, code: "BAD_REQUEST" },
  "Invalid lesson id": { status: 400, code: "BAD_REQUEST" },
  "Invalid class id": { status: 400, code: "BAD_REQUEST" },
  "Invalid params": { status: 400, code: "BAD_REQUEST" },
  "Invalid query": { status: 400, code: "BAD_REQUEST" },
  "Invalid body": { status: 400, code: "BAD_REQUEST" },
  "Invalid request": { status: 400, code: "BAD_REQUEST" },
  "Enter a teacher username": { status: 400, code: "BAD_REQUEST" },
  "Type at least 2 characters": { status: 400, code: "BAD_REQUEST" },
  "A chapter or a pin is required": { status: 400, code: "BAD_REQUEST" },
  "invalid summary": { status: 400, code: "BAD_REQUEST" },
};

const UPSTREAM_EXACT = new Set([
  "This wall did not load",
  "This shelf did not load",
  "Notes too large",
  "Unexpected notes format",
  "Summary is unavailable right now",
  "Unacademy published that as a playlist, not a course — open the teacher instead.",
]);

function flattenMessage(err: unknown): string {
  if (err instanceof Error) {
    const issues = (err as Error & { issues?: Array<{ message?: string }> }).issues;
    if (err.name === "ZodError" && Array.isArray(issues) && issues[0]?.message) return "Bad request";
    return err.message;
  }
  return "failed";
}

function upstreamFromMessage(msg: string): { status: number; code: string; error: string } | null {
  if (msg === COPY.notesDidNotLoad || msg === "Couldn't load these notes") {
    return { status: 502, code: "UPSTREAM", error: msg };
  }
  const status = Number(/^Unacademy (?:request|page) failed \((\d{3})\)$/.exec(msg)?.[1] ?? 0);
  if (status === 404 || status === 400) return { status: 404, code: "NOT_FOUND", error: "Not found" };
  if (status === 429) return { status: 503, code: "UPSTREAM_RATE_LIMIT", error: "The catalog is busy. Try again shortly." };
  if (status >= 500) return { status: 502, code: "UPSTREAM", error: msg };
  if (UPSTREAM_EXACT.has(msg)) return { status: 502, code: "UPSTREAM", error: msg };
  if (/unexpected token|json/i.test(msg) && /unacademy|upstream/i.test(msg)) {
    return { status: 502, code: "UPSTREAM", error: "The catalog didn't answer." };
  }
  return null;
}

/** Map a thrown value to a client-safe body. Unknown failures stay generic. */
export function publicError(err: unknown): { status: number; code: string; error: string; log: boolean } {
  if (err instanceof UpstreamError) {
    return { status: err.status, code: err.code, error: err.message, log: err.status >= 500 };
  }
  if (err instanceof HttpError) {
    const status = err.status;
    return {
      status,
      code: err.code,
      error: status >= 500 && status !== 503 ? "Something went wrong" : err.message,
      log: status >= 500,
    };
  }
  if (err instanceof Error && err.name === "ZodError") {
    const exact = CLIENT_EXACT[err.message];
    if (exact) return { ...exact, error: err.message, log: false };
    if (/unknown exam/i.test(err.message)) return { status: 400, code: "BAD_REQUEST", error: "Unknown exam", log: false };
    return { status: 400, code: "BAD_REQUEST", error: "Bad request", log: false };
  }
  const msg = flattenMessage(err);
  if (msg.startsWith("ARCHIVED:") || /cold storage/i.test(msg)) {
    return { status: 410, code: "ARCHIVED", error: "This class is in cold storage", log: false };
  }
  const exact = CLIENT_EXACT[msg];
  if (exact) return { ...exact, error: msg === "invalid summary" ? "Bad request" : msg, log: false };
  if (/^Invalid [\w ]+ id$/.test(msg)) return { status: 400, code: "BAD_REQUEST", error: msg, log: false };
  if (msg === "No Unacademy teacher with that username") {
    return { status: 404, code: "NOT_FOUND", error: msg, log: false };
  }
  const upstream = upstreamFromMessage(msg);
  if (upstream) return { ...upstream, log: upstream.status >= 500 };
  const statusCode =
    typeof err === "object" && err && "statusCode" in err ? Number((err as { statusCode: number }).statusCode) : 0;
  if (statusCode === 413) {
    return { status: 413, code: "PAYLOAD_TOO_LARGE", error: "Request body is too large", log: false };
  }
  if (statusCode >= 400 && statusCode < 500) {
    const safe = msg.length > 0 && msg.length < 160 && !msg.includes("\n") && !msg.includes("/") ? msg : "Bad request";
    return {
      status: statusCode,
      code: statusCode === 404 ? "NOT_FOUND" : statusCode === 429 ? "RATE_LIMIT" : "BAD_REQUEST",
      error: safe,
      log: false,
    };
  }
  return { status: 500, code: "INTERNAL", error: "Something went wrong", log: true };
}

export function statusForMessage(msg: string): { status: number; code: string } {
  const mapped = publicError(new Error(msg));
  return { status: mapped.status, code: mapped.code };
}

export async function handleJson<T>(
  reply: FastifyReply,
  requestId: string,
  run: () => Promise<T>,
): Promise<T | FastifyReply> {
  try {
    const value = await run();
    return value;
  } catch (err) {
    const mapped = publicError(err);
    const path = reply.request?.url || "";
    if (!isClientAbort(err) && mapped.status >= 500) reportUpstreamFail(path, err);
    if (mapped.log) reply.log.error({ err, requestId }, "request failed");
    if (err instanceof UpstreamError && err.retryAfterSec) {
      reply.header("retry-after", String(err.retryAfterSec));
    }
    return reply.status(mapped.status).send(jsonError(mapped.status, mapped.error, mapped.code, requestId));
  }
}

export function requestIdOf(req: FastifyRequest): string {
  return String(req.headers["x-request-id"] || req.id || "");
}

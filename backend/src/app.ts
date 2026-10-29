import { timingSafeEqual } from "node:crypto";
import { constants as zlibConstants } from "node:zlib";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import compress from "@fastify/compress";
import { registerHealth } from "./routes/health.ts";
import { registerCatalog } from "./routes/catalog.ts";
import { registerLessons } from "./routes/lessons.ts";
import { registerMedia } from "./routes/media.ts";
import { registerLive } from "./routes/live.ts";
import { registerSearch } from "./routes/search.ts";
import { registerJobs } from "./routes/jobs.ts";
import { registerSummary } from "./routes/summary.ts";
import { registerUpstream } from "./routes/upstream.ts";
import { registerAuth } from "./routes/auth.ts";
import { installAuth } from "./auth/guard.ts";
import { jsonError, publicError } from "./http.ts";
import { allowRate, rateConfig } from "./middlewares/rate-limit.ts";
import { isUpstreamOutage, reportUpstreamFail, isClientAbort } from "@inkboard/shared/upstream";

const DEFAULT_ORIGINS = [
  "http://127.0.0.1:8080",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://localhost:3000",
];

function allowedOrigins(): Set<string> {
  const extra = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...extra]);
}

function longRequest(url: string): boolean {
  const path = url.split("?")[0] || "";
  return path.startsWith("/api/live-board") || path.includes("/artifacts/") || path.endsWith("/clips");
}

function rateBucket(method: string, path: string): "skip" | "media" | "expensive" | "catalog" | "generous" {
  const verb = method.toUpperCase();
  if (path === "/healthz" || path === "/readyz" || path.startsWith("/api/upstream")) return "skip";
  if (path === "/api/auth/login" || path === "/api/auth/setup" || path === "/api/auth/reset-request") return "expensive";
  if (path.startsWith("/api/auth") || path.startsWith("/api/me") || path.startsWith("/api/admin") || path === "/api/activity") return "generous";
  if (path.startsWith("/api/live-board")) return "generous";
  if (/^\/api\/(slide|notes|live-slide)\b/.test(path)) return "media";
  if (path.startsWith("/api/jobs")) {
    if (verb === "POST" && (path === "/api/jobs/lectures" || /^\/api\/jobs\/[^/]+\/clips$/.test(path))) return "expensive";
    if (verb === "DELETE" && /^\/api\/jobs\/[^/]+$/.test(path)) return "expensive";
    if (verb === "GET" && /^\/api\/jobs\/[^/]+\/artifacts\//.test(path)) return "media";
    if (verb === "GET" && /^\/api\/jobs\/[^/]+$/.test(path)) return "generous";
    return "catalog";
  }
  if (path.startsWith("/api/study")) return "generous";
  if (path.startsWith("/api/")) return "catalog";
  return "skip";
}

/** Hop count from TRUST_PROXY. "1" is 1, "2" is 2. Anything else does not trust the header. */
export function trustProxyHops(raw = process.env.TRUST_PROXY): number | false {
  if (raw == null || !/^[1-9]\d*$/.test(raw)) return false;
  return Number(raw);
}

/** Header the Vercel middleware sets. A direct caller does not have the secret. */
export const PROXY_SECRET_HEADER = "x-inkboard-proxy-secret";

/** Constant-time match against INKBOARD_PROXY_SECRET. Missing or unequal is false. */
export function proxySecretMatches(presented: unknown, expected = process.env.INKBOARD_PROXY_SECRET || ""): boolean {
  if (!expected || typeof presented !== "string") {
    if (expected) timingSafeEqual(Buffer.from(expected), Buffer.from(expected));
    return false;
  }
  const got = Buffer.from(presented);
  const want = Buffer.from(expected);
  if (got.length !== want.length) {
    timingSafeEqual(want, want);
    return false;
  }
  return timingSafeEqual(got, want);
}

/**
 * A configured count above 1 trusts that many proxies from the right only when
 * the Vercel secret matches. Otherwise X-Forwarded-For is removed so req.ip
 * is the socket address. A forged entry is not a rate-limit bucket.
 */
export function collapseUntrustedForwarding(req: FastifyRequest, configured = trustProxyHops()): void {
  if (configured === false || configured <= 1) return;
  if (proxySecretMatches(req.headers[PROXY_SECRET_HEADER])) return;
  delete req.headers["x-forwarded-for"];
}

/** True for loopback, RFC1918, link-local, and IPv6 unique-local addresses. */
export function isPrivateSocket(address: string | undefined): boolean {
  if (!address) return true;
  let ip = address.trim().toLowerCase();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || /^fe[89ab]/.test(ip)) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!v4) return false;
  const a = Number(v4[1]);
  const b = Number(v4[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

let warnedMissingProxySecret = false;

export function resetProxySecretWarning(): void {
  warnedMissingProxySecret = false;
}

/**
 * On Render, with a proxy secret configured, log once when /api is hit
 * without that header from a public socket. A wrong secret is not "without it".
 */
export function noteMissingProxySecret(req: FastifyRequest): void {
  if (warnedMissingProxySecret) return;
  if (!process.env.RENDER || !process.env.INKBOARD_PROXY_SECRET) return;
  const path = req.url.split("?")[0] || "";
  if (!path.startsWith("/api")) return;
  const header = req.headers[PROXY_SECRET_HEADER];
  const presented = Array.isArray(header) ? header[0] : header;
  if (typeof presented === "string" && presented.length > 0) return;
  const socket = req.socket?.remoteAddress;
  if (isPrivateSocket(socket)) return;
  warnedMissingProxySecret = true;
  console.warn(
    "[inkboard-api] /api request reached Render without INKBOARD_PROXY_SECRET from a public socket. X-Forwarded-For is not trusted.",
  );
}

let loggedTrust = false;

export async function buildApp(): Promise<FastifyInstance> {
  const origins = allowedOrigins();
  const hops = trustProxyHops();
  if (hops === false && (process.env.NODE_ENV === "production" || process.env.RENDER)) {
    console.warn("[inkboard-api] TRUST_PROXY is unset. Behind Vercel and Render every visitor shares one rate-limit bucket. Set TRUST_PROXY=2 and INKBOARD_PROXY_SECRET.");
  }
  if (hops !== false && hops > 1 && !process.env.INKBOARD_PROXY_SECRET) {
    console.warn("[inkboard-api] TRUST_PROXY is above 1 but INKBOARD_PROXY_SECRET is unset. Extra hops are ignored.");
  }
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      redact: ["req.headers.authorization", "req.headers.cookie", `req.headers.${PROXY_SECRET_HEADER}`],
    },
    // Hop count from the right. For 1, req.ip is the last X-Forwarded-For entry.
    // Fastify 5.12 fail-closes a numeric trustProxy, so this predicate is that count.
    // collapseUntrustedForwarding deletes the header unless the proxy secret matches.
    trustProxy: hops === false ? false : (_address: string, hop: number) => hop < hops,
    bodyLimit: 1_048_576,
    requestIdHeader: "x-request-id",
    genReqId: (req) => {
      const raw = req.headers["x-request-id"];
      const header = Array.isArray(raw) ? raw[0] : raw;
      if (header && /^[\w-]{1,64}$/.test(header)) return header;
      return crypto.randomUUID();
    },
    requestTimeout: 60_000,
    connectionTimeout: 0,
    keepAliveTimeout: 72_000,
  });

  await app.register(cors, {
    origin(origin, cb) {
      if (!origin || origins.has(origin)) cb(null, true);
      else cb(null, false);
    },
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "no-referrer" },
  });

  // Timeline JSON for a 1-hour board class is ~4.5 MB raw and ~0.5 MB gzipped; first play on a
  // phone was waiting on that. Streams the edge passes through untouched (SSE live board, zip
  // bundles, range-served media artifacts) are not compressible and are left alone.
  await app.register(compress, {
    global: true,
    encodings: ["br", "gzip", "deflate"],
    threshold: 1024,
    brotliOptions: { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } },
    zlibOptions: { level: 6 },
  });

  app.addHook("onRequest", async (req, reply) => {
    collapseUntrustedForwarding(req);
    noteMissingProxySecret(req);
    if (process.env.LOG_TRUST === "1" && !loggedTrust) {
      loggedTrust = true;
      req.log.info({ ip: req.ip, ips: req.ips }, "trust proxy chain");
    }
    reply.header("x-request-id", req.id);
    if (longRequest(req.url) && typeof req.raw.setTimeout === "function") req.raw.setTimeout(0);
    const path = req.url.split("?")[0] || "";
    const bucket = rateBucket(req.method, path);
    if (bucket === "skip") return;
    const { limit, windowMs } = rateConfig();
    const cap = bucket === "generous" ? Math.max(limit, 300) : bucket === "media" ? Math.max(limit, 600) : bucket === "expensive" ? Math.min(limit, 30) : limit;
    const ip = req.ip || "local";
    if (!(await allowRate(`${bucket}:${ip}`, cap, windowMs))) {
      return reply
        .header("retry-after", String(Math.ceil(windowMs / 1000)))
        .status(429)
        .send(jsonError(429, "Too many requests. Wait a minute.", "RATE_LIMIT", req.id));
    }
  });

  app.setNotFoundHandler((req, reply) => {
    reply
      .status(404)
      .type("application/json; charset=utf-8")
      .send(jsonError(404, "Not found", "NOT_FOUND", req.id));
  });

  app.setErrorHandler((err, req, reply) => {
    const mapped = publicError(err);
    const path = req.url.split("?")[0] || "";
    const sideRequest = /\/probe$|\/slide$|\/notes$|\/artifacts\//.test(path);
    if (!sideRequest && !isClientAbort(err) && isUpstreamOutage(err)) {
      reportUpstreamFail(req.url, err);
    }
    if (mapped.log) req.log.error({ err }, "request failed");
    reply.status(mapped.status).send(jsonError(mapped.status, mapped.error, mapped.code, req.id));
  });

  // Accounts gate every /api route except health and sign-in (see auth/guard.ts).
  // AUTH_DISABLED=1 keeps the old open behaviour for the existing contract tests only.
  if (process.env.AUTH_DISABLED !== "1") installAuth(app);
  await registerHealth(app);
  if (process.env.AUTH_DISABLED !== "1") await registerAuth(app);
  await registerCatalog(app);
  await registerLessons(app);
  await registerMedia(app);
  await registerLive(app);
  await registerSearch(app);
  await registerJobs(app);
  await registerSummary(app);
  await registerUpstream(app);

  return app;
}

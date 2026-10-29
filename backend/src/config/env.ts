export function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

function safePort(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 65535 ? Math.floor(n) : fallback;
}

/** Render, Railway, Fly and friends inject PORT and expect the process to bind every interface. */
const PAAS = Boolean(env("PORT") || env("RENDER") || env("RAILWAY_ENVIRONMENT") || env("FLY_APP_NAME"));
export const BACKEND_PORT = safePort(env("BACKEND_PORT") ?? env("PORT"), 8787);
export const BACKEND_HOST = env("BACKEND_HOST") || (PAAS ? "0.0.0.0" : "127.0.0.1");
export const DATABASE_URL = env("DATABASE_URL");
export const REDIS_URL = env("REDIS_URL");
export const JOB_DIR = env("JOB_DIR") || "/tmp/inkboard-jobs";
export const FFMPEG_PATH = env("FFMPEG_PATH");
export const LOG_LEVEL = env("LOG_LEVEL") || "info";
export const RATE_LIMIT = Number(env("RATE_LIMIT") || 120);
export const RATE_WINDOW_MS = Number(env("RATE_WINDOW_MS") || 60_000);

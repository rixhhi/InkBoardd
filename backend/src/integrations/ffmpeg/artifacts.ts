import { resolve, sep } from "node:path";
import { isAllowedArtifact } from "./plan.ts";

const TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
};

export function artifactType(rel: string): string {
  const dot = rel.lastIndexOf(".");
  const ext = dot >= 0 ? rel.slice(dot).toLowerCase() : "";
  return TYPES[ext] || "application/octet-stream";
}

/** Absolute path inside `root`, or null when the relative name is not on the allowlist. */
export function safeArtifactPath(root: string, rel: string): string | null {
  const cleaned = rel.replace(/^\/+/, "");
  if (!isAllowedArtifact(cleaned)) return null;
  const rootAbs = resolve(root);
  const abs = resolve(rootAbs, cleaned);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) return null;
  return abs;
}

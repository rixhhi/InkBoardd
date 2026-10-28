import { existsSync } from "node:fs";
import { FFMPEG_PATH } from "../../config/env.ts";

const CANDIDATES = [FFMPEG_PATH, "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"].filter(Boolean) as string[];

export function ffmpegBinary(): string | null {
  for (const bin of CANDIDATES) {
    if (existsSync(bin)) return bin;
  }
  return null;
}

export function ffmpegStatus(): "ok" | "missing" {
  return ffmpegBinary() ? "ok" : "missing";
}

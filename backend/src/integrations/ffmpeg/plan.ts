/** Pure ffmpeg plans. Spawn happens in `run.ts`. No shell, no delogo. */

export const SPRITE_INTERVAL_SEC = 10;
export const SPRITE_CELL_W = 160;
export const SPRITE_CELL_H = 90;

export const HLS_LADDER = [
  { name: "360", height: 360, bandwidth: 450_000, width: 640 },
  { name: "480", height: 480, bandwidth: 800_000, width: 854 },
  { name: "720", height: 720, bandwidth: 1_400_000, width: 1280 },
] as const;

const ARTIFACT_RE =
  /^(sprites\.webp|sprites\.json|poster\.jpg|audio\.m4a|thumb\.webp|enhance\.json|silence\.json|waveform\.png|clips\/clip-\d{1,9}-\d{1,9}\.mp4|hls\/master\.m3u8|hls\/(360|480|720)\/index\.m3u8|hls\/(360|480|720)\/seg\d{1,5}\.ts)$/;

export type SpriteGrid = {
  interval: number;
  count: number;
  columns: number;
  rows: number;
  cellW: number;
  cellH: number;
};

export type ProbeInfo = {
  duration: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
};

export type LoudnormMeasured = {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
};

export function spriteGrid(durationSec: number): SpriteGrid {
  const safe = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : SPRITE_INTERVAL_SEC;
  const count = Math.max(1, Math.ceil(safe / SPRITE_INTERVAL_SEC));
  const columns = Math.min(10, count);
  const rows = Math.ceil(count / columns);
  return {
    interval: SPRITE_INTERVAL_SEC,
    count,
    columns,
    rows,
    cellW: SPRITE_CELL_W,
    cellH: SPRITE_CELL_H,
  };
}

export function posterSec(durationSec: number, firstInkSec?: number | null): number {
  const dur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  if (firstInkSec != null && Number.isFinite(firstInkSec) && firstInkSec >= 0 && (dur === 0 || firstInkSec < dur)) {
    return Math.min(firstInkSec, Math.max(0, dur - 0.05));
  }
  if (dur <= 0) return 0;
  return Math.min(dur * 0.1, Math.max(0, dur - 0.05));
}

export function spriteFilter(grid: SpriteGrid): string {
  return [
    `select='eq(n\\,0)+gte(t-prev_selected_t\\,${grid.interval})'`,
    `scale=${grid.cellW}:${grid.cellH}:force_original_aspect_ratio=decrease`,
    `pad=${grid.cellW}:${grid.cellH}:(ow-iw)/2:(oh-ih)/2`,
    `tile=${grid.columns}x${grid.rows}`,
  ].join(",");
}

export function spriteArgs(input: string, outFile: string, grid: SpriteGrid): string[] {
  return [
    "-y",
    "-hide_banner",
    "-i",
    input,
    "-vf",
    spriteFilter(grid),
    "-fps_mode",
    "vfr",
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-q:v",
    "70",
    outFile,
  ];
}

export function posterArgs(input: string, outFile: string, atSec: number): string[] {
  return ["-y", "-hide_banner", "-ss", atSec.toFixed(3), "-i", input, "-frames:v", "1", "-update", "1", "-q:v", "3", outFile];
}

export function thumbArgs(poster: string, outFile: string): string[] {
  return ["-y", "-hide_banner", "-i", poster, "-vf", "scale=480:-2", "-frames:v", "1", "-update", "1", "-c:v", "libwebp", "-q:v", "75", outFile];
}

export function loudnormMeasureArgs(input: string): string[] {
  return ["-hide_banner", "-i", input, "-vn", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"];
}

export function parseLoudnorm(stderr: string): LoudnormMeasured | null {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(stderr.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const pick = (key: string) => (typeof raw[key] === "string" ? raw[key] : "");
  const measured: LoudnormMeasured = {
    input_i: pick("input_i"),
    input_tp: pick("input_tp"),
    input_lra: pick("input_lra"),
    input_thresh: pick("input_thresh"),
    target_offset: pick("target_offset"),
  };
  if (!measured.input_i || !Number.isFinite(Number(measured.input_i))) return null;
  return measured;
}

export function loudnormApplyArgs(input: string, outFile: string, measured: LoudnormMeasured): string[] {
  const af = [
    "loudnorm=I=-16:TP=-1.5:LRA=11",
    `measured_I=${measured.input_i}`,
    `measured_TP=${measured.input_tp}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    "linear=true",
  ].join(":");
  return ["-y", "-hide_banner", "-i", input, "-vn", "-af", af, "-c:a", "aac", "-b:a", "96k", outFile];
}

export function audioExtractArgs(input: string, outFile: string): string[] {
  return ["-y", "-hide_banner", "-i", input, "-vn", "-c:a", "aac", "-b:a", "96k", outFile];
}

export function silenceArgs(input: string): string[] {
  return ["-hide_banner", "-i", input, "-vn", "-af", "silencedetect=noise=-35dB:d=1.2", "-f", "null", "-"];
}

/** Mono waveform strip. Drawn under the seek bar; not a video frame. */
export function waveformArgs(input: string, outFile: string): string[] {
  return [
    "-y",
    "-hide_banner",
    "-i",
    input,
    "-filter_complex",
    "aformat=channel_layouts=mono,showwavespic=s=1000x64:colors=0xE7E1D6",
    "-frames:v",
    "1",
    outFile,
  ];
}

export type SilenceRange = { start: number; end: number };

/** Pull silence_start / silence_end pairs out of ffmpeg stderr. */
export function parseSilence(stderr: string): SilenceRange[] {
  const ranges: SilenceRange[] = [];
  let open: number | null = null;
  for (const line of stderr.split("\n")) {
    const start = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/);
    if (start) {
      open = Number(start[1]);
      continue;
    }
    const end = line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/);
    if (!end || open == null) continue;
    const stop = Number(end[1]);
    if (stop > open) ranges.push({ start: Math.max(0, open), end: stop });
    open = null;
  }
  return ranges;
}

const CLIP_MIN_SEC = 1;
const CLIP_MAX_SEC = 20 * 60;

export function clipWindow(start: number, end: number, duration?: number | null): SilenceRange | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const a = Math.max(0, Math.min(start, end));
  let b = Math.max(start, end);
  if (duration != null && Number.isFinite(duration) && duration > 0) b = Math.min(b, duration);
  if (b - a < CLIP_MIN_SEC || b - a > CLIP_MAX_SEC) return null;
  return { start: a, end: b };
}

export function clipFileName(start: number, end: number): string {
  return `clips/clip-${Math.round(start * 1000)}-${Math.round(end * 1000)}.mp4`;
}

export function clipArgs(input: string, outFile: string, start: number, end: number): string[] {
  return [
    "-y",
    "-hide_banner",
    "-ss",
    start.toFixed(3),
    "-i",
    input,
    "-t",
    Math.max(0.1, end - start).toFixed(3),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-movflags",
    "+faststart",
    outFile,
  ];
}

export function hlsVariantArgs(
  input: string,
  height: number,
  playlist: string,
  segmentPattern: string,
  opts: { preset?: string; hasAudio: boolean },
): string[] {
  const args = [
    "-y",
    "-hide_banner",
    "-i",
    input,
    "-vf",
    `scale=-2:${height}`,
    "-c:v",
    "libx264",
    "-preset",
    opts.preset || "veryfast",
    "-crf",
    "23",
  ];
  if (opts.hasAudio) args.push("-c:a", "aac", "-b:a", "96k", "-ac", "2");
  else args.push("-an");
  args.push("-hls_time", "4", "-hls_playlist_type", "vod", "-hls_segment_filename", segmentPattern, playlist);
  return args;
}

export function masterPlaylist(): string {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
  for (const rung of HLS_LADDER) {
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${rung.bandwidth},RESOLUTION=${rung.width}x${rung.height}`);
    lines.push(`${rung.name}/index.m3u8`);
  }
  lines.push("");
  return lines.join("\n");
}

export function parseProbe(stderr: string): ProbeInfo {
  const match = stderr.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  const duration = match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null;
  return {
    duration: duration != null && Number.isFinite(duration) ? duration : null,
    hasAudio: /Audio:/.test(stderr),
    hasVideo: /Video:/.test(stderr),
  };
}

/** Reject watermark-stripping filters. Skip values that follow -i / segment paths. */
export function assertNoDelogo(args: string[]): void {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "-i" || arg === "-hls_segment_filename") {
      i += 1;
      continue;
    }
    if (/delogo/i.test(arg)) throw new Error("delogo is forbidden");
  }
}

export function isAllowedArtifact(rel: string): boolean {
  if (!rel || rel.includes("\0") || rel.includes("\\") || rel.includes("..")) return false;
  return ARTIFACT_RE.test(rel.replace(/^\/+/, ""));
}

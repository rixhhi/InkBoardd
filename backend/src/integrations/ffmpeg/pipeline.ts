import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ffmpegBinary } from "./probe.ts";
import {
  HLS_LADDER,
  audioExtractArgs,
  hlsVariantArgs,
  loudnormApplyArgs,
  loudnormMeasureArgs,
  masterPlaylist,
  parseLoudnorm,
  parseProbe,
  parseSilence,
  posterArgs,
  posterSec,
  silenceArgs,
  spriteArgs,
  spriteGrid,
  thumbArgs,
  waveformArgs,
  type ProbeInfo,
} from "./plan.ts";
import { FfmpegError, runFfmpeg } from "./run.ts";

export type EnhanceStep = { name: string; ok: boolean; detail?: string };
export type EnhanceReport = { skipped?: string; duration?: number; steps: EnhanceStep[] };

type Runner = typeof runFfmpeg;

let active = 0;
const waiters: Array<() => void> = [];

export function enhanceInflight(): number {
  return active;
}

/** One enhance at a time unless FFMPEG_CONCURRENCY says otherwise (1–4). */
export function enhanceConcurrency(): number {
  const n = Number(process.env.FFMPEG_CONCURRENCY);
  if (Number.isFinite(n) && n >= 1 && n <= 4) return Math.floor(n);
  return 1;
}

/** Caps ffmpeg work so a burst of jobs cannot all encode at once. */
export function enqueueEnhance<T>(fn: () => Promise<T>): Promise<T> {
  const cap = enhanceConcurrency();
  return new Promise((resolve, reject) => {
    const start = () => {
      active += 1;
      fn()
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          waiters.shift()?.();
        });
    };
    if (active < cap) start();
    else waiters.push(start);
  });
}

async function probe(bin: string, input: string, run: Runner): Promise<ProbeInfo> {
  try {
    const { stderr } = await run(bin, ["-hide_banner", "-i", input], { timeoutMs: 30_000 });
    return parseProbe(stderr);
  } catch (err) {
    const stderr = err instanceof FfmpegError ? err.stderr : "";
    const parsed = parseProbe(stderr);
    if (parsed.duration == null && !parsed.hasVideo) throw err;
    return parsed;
  }
}

export async function enhanceMedia(opts: {
  input: string;
  outDir: string;
  bin?: string | null;
  firstInkSec?: number | null;
  preset?: string;
  run?: Runner;
  signal?: AbortSignal;
}): Promise<EnhanceReport> {
  const bin = opts.bin === undefined ? ffmpegBinary() : opts.bin;
  if (!bin) return { skipped: "ffmpeg-missing", steps: [] };
  const run = opts.run || runFfmpeg;
  const steps: EnhanceStep[] = [];
  const note = (name: string, ok: boolean, detail?: string) => steps.push({ name, ok, detail });

  mkdirSync(opts.outDir, { recursive: true });
  const finish = (report: EnhanceReport): EnhanceReport => {
    try {
      writeFileSync(join(opts.outDir, "enhance.json"), `${JSON.stringify(report, null, 2)}\n`);
    } catch {
      /* the player still works without the report */
    }
    return report;
  };
  let info: ProbeInfo;
  try {
    info = await probe(bin, opts.input, run);
  } catch (err) {
    note("probe", false, err instanceof Error ? err.message : String(err));
    return finish({ steps });
  }
  if (info.duration == null) {
    note("probe", false, "no duration");
    return finish({ steps });
  }
  note("probe", true, `${info.duration.toFixed(1)}s`);
  const duration = info.duration;
  const grid = spriteGrid(duration);

  try {
    const webp = join(opts.outDir, "sprites.webp");
    await run(bin, spriteArgs(opts.input, webp, grid), { timeoutMs: 8 * 60_000, signal: opts.signal });
    writeFileSync(
      join(opts.outDir, "sprites.json"),
      `${JSON.stringify({ ...grid, url: "sprites.webp", duration }, null, 2)}\n`,
    );
    note("sprites", true, `${grid.columns}x${grid.rows}`);
  } catch (err) {
    note("sprites", false, err instanceof Error ? err.message : String(err));
  }

  const at = posterSec(duration, opts.firstInkSec);
  const poster = join(opts.outDir, "poster.jpg");
  try {
    await run(bin, posterArgs(opts.input, poster, at), { timeoutMs: 60_000, signal: opts.signal });
    note("poster", true, `${at.toFixed(2)}s`);
    try {
      await run(bin, thumbArgs(poster, join(opts.outDir, "thumb.webp")), { timeoutMs: 60_000, signal: opts.signal });
      note("thumb", true);
    } catch (err) {
      note("thumb", false, err instanceof Error ? err.message : String(err));
    }
  } catch (err) {
    note("poster", false, err instanceof Error ? err.message : String(err));
  }

  if (info.hasAudio) {
    try {
      const measured = await run(bin, loudnormMeasureArgs(opts.input), { timeoutMs: 10 * 60_000, signal: opts.signal });
      const stats = parseLoudnorm(measured.stderr);
      const out = join(opts.outDir, "audio.m4a");
      if (stats) {
        await run(bin, loudnormApplyArgs(opts.input, out, stats), { timeoutMs: 10 * 60_000, signal: opts.signal });
        note("loudnorm", true, stats.input_i);
      } else {
        await run(bin, audioExtractArgs(opts.input, out), { timeoutMs: 10 * 60_000, signal: opts.signal });
        note("audio", true, "plain");
      }
    } catch (err) {
      try {
        await run(bin, audioExtractArgs(opts.input, join(opts.outDir, "audio.m4a")), { timeoutMs: 10 * 60_000, signal: opts.signal });
        note("audio", true, "fallback");
      } catch (inner) {
        note("audio", false, inner instanceof Error ? inner.message : String(err));
      }
    }
  } else {
    note("audio", false, "no audio stream");
  }

  if (info.hasAudio) {
    try {
      const detected = await run(bin, silenceArgs(opts.input), { timeoutMs: 10 * 60_000, signal: opts.signal });
      const ranges = parseSilence(detected.stderr);
      writeFileSync(join(opts.outDir, "silence.json"), `${JSON.stringify(ranges)}\n`);
      note("silence", true, String(ranges.length));
    } catch (err) {
      note("silence", false, err instanceof Error ? err.message : String(err));
    }
    try {
      await run(bin, waveformArgs(opts.input, join(opts.outDir, "waveform.png")), {
        timeoutMs: 8 * 60_000,
        signal: opts.signal,
      });
      note("waveform", true);
    } catch (err) {
      note("waveform", false, err instanceof Error ? err.message : String(err));
    }
  } else {
    note("silence", false, "no audio stream");
    note("waveform", false, "no audio stream");
  }

  try {
    mkdirSync(join(opts.outDir, "hls"), { recursive: true });
    for (const rung of HLS_LADDER) {
      const dir = join(opts.outDir, "hls", rung.name);
      mkdirSync(dir, { recursive: true });
      await run(
        bin,
        hlsVariantArgs(opts.input, rung.height, join(dir, "index.m3u8"), join(dir, "seg%03d.ts"), {
          preset: opts.preset || "veryfast",
          hasAudio: info.hasAudio,
        }),
        { timeoutMs: 30 * 60_000, signal: opts.signal },
      );
      note(`hls-${rung.name}`, true);
    }
    writeFileSync(join(opts.outDir, "hls", "master.m3u8"), masterPlaylist());
    note("hls-master", true);
  } catch (err) {
    note("hls", false, err instanceof Error ? err.message : String(err));
  }

  return finish({ duration, steps });
}

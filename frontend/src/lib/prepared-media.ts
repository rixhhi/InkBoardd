import type { PreparedMedia, SpriteSheet } from "@/lib/sprite-sheet";

const KEY = "inkboard.prepared.v1";

function readAll(): Record<string, PreparedMedia> {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, PreparedMedia>) : {};
  } catch {
    return {};
  }
}

function sheetOk(sheet: SpriteSheet | null | undefined): sheet is SpriteSheet {
  return Boolean(sheet && sheet.interval > 0 && sheet.count > 0 && sheet.url);
}

/** Remember sprites, loudnorm audio, and the HLS ladder for a lesson on this device. */
export function readPrepared(lessonId: string): PreparedMedia | null {
  const row = readAll()[lessonId];
  if (!row) return null;
  return {
    sprites: sheetOk(row.sprites) ? row.sprites : null,
    audioUrl: typeof row.audioUrl === "string" && row.audioUrl ? row.audioUrl : null,
    hlsUrl: typeof row.hlsUrl === "string" && row.hlsUrl ? row.hlsUrl : null,
    silence: Array.isArray(row.silence) ? row.silence : null,
    waveformUrl: typeof row.waveformUrl === "string" && row.waveformUrl ? row.waveformUrl : null,
    jobId: typeof row.jobId === "string" && row.jobId ? row.jobId : null,
  };
}

export function writePrepared(lessonId: string, pack: PreparedMedia) {
  if (!lessonId) return;
  const all = readAll();
  const prev = all[lessonId];
  all[lessonId] = {
    sprites: pack.sprites || prev?.sprites || null,
    audioUrl: pack.audioUrl || prev?.audioUrl || null,
    hlsUrl: pack.hlsUrl || prev?.hlsUrl || null,
    silence: pack.silence ?? prev?.silence ?? null,
    waveformUrl: pack.waveformUrl || prev?.waveformUrl || null,
    jobId: pack.jobId || prev?.jobId || null,
  };
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode — the session still has the URLs */
  }
}

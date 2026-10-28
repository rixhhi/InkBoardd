import { parseInkJson, readManifestBytes, remapSlideUrls, isGzipMagic } from "@inkboard/shared/bundle/load";
import type { Manifest } from "@inkboard/shared/bundle/manifest";
import { unproxySlideUrl, type Timeline } from "@inkboard/shared/dcn";
import { parseSpriteSheet, type SpriteSheet } from "@/lib/sprite-sheet";
import { parseSilenceFile, type SilenceRange } from "@/lib/study";
import { sha256Hex } from "./hash.ts";

export type GetFile = (path: string) => Promise<File>;

function rasterMime(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "application/octet-stream";
}

export type LoadedBundle = {
  manifest: Manifest;
  timeline: Timeline;
  blobUrls: string[];
  mismatches: string[];
  sprites: SpriteSheet | null;
  audioUrl: string;
  notesUrl: string;
  silence: SilenceRange[];
  revoke: () => void;
};

async function gunzipToText(bytes: Uint8Array): Promise<string> {
  if (!isGzipMagic(bytes)) return new TextDecoder().decode(bytes);
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(ds);
  return await new Response(stream).text();
}

const HASH_CAP = 64 * 1024 * 1024;

export async function loadBundleFromGetFile(
  getFile: GetFile,
  opts: { skipChecksum?: boolean } = {},
): Promise<LoadedBundle> {
  const manFile = await getFile("manifest.json");
  const manBytes = new Uint8Array(await manFile.arrayBuffer());
  const manifest = readManifestBytes(manBytes);
  const mismatches: string[] = [];

  async function checkFile(path: string, expected?: { bytes: number; sha256: string }, asBlob = false) {
    const file = await getFile(path);
    if (expected && expected.bytes > 0 && file.size !== expected.bytes) mismatches.push(`${path} size`);
    if (expected && !opts.skipChecksum && file.size <= HASH_CAP) {
      const buf = new Uint8Array(await file.arrayBuffer());
      const hex = await sha256Hex(buf);
      if (hex !== expected.sha256) mismatches.push(`${path} sha256`);
      return { file, buf };
    }
    if (asBlob) return { file, buf: null as Uint8Array | null };
    const buf = new Uint8Array(await file.arrayBuffer());
    return { file, buf };
  }

  const ink = await checkFile(manifest.files.ink.path, manifest.files.ink);
  if (!ink.buf) throw new Error("ink.json.gz missing");
  const jsonText = await gunzipToText(ink.buf);
  let timeline = parseInkJson(manifest.lessonId, jsonText);
  timeline = {
    ...timeline,
    title: manifest.title,
    kind: manifest.kind,
    durationMs: manifest.durationMs || timeline.durationMs,
  };

  const blobUrls: string[] = [];
  const blobBySrc = new Map<string, string>();
  for (const slide of manifest.slides) {
    try {
      const hit = await checkFile(slide.path, { bytes: 0, sha256: slide.sha256 });
      const bytes = hit.buf ?? new Uint8Array();
      const url = URL.createObjectURL(new Blob([bytes.slice()], { type: rasterMime(bytes) }));
      blobUrls.push(url);
      blobBySrc.set(slide.src, url);
      blobBySrc.set(unproxySlideUrl(slide.src), url);
    } catch {
      /* viewer copes with a missing slide */
    }
  }
  timeline = remapSlideUrls(timeline, blobBySrc);

  try {
    const media = await checkFile(manifest.files.media.path, manifest.files.media, true);
    if (!media.file.size) mismatches.push("media.webm missing");
    const url = URL.createObjectURL(media.file);
    blobUrls.push(url);
    timeline = { ...timeline, videoUrl: url };
  } catch {
    timeline = { ...timeline, videoUrl: "" };
    mismatches.push("media.webm missing");
  }

  let sprites: SpriteSheet | null = null;
  try {
    const meta = await getFile("sprites.json");
    const image = await getFile("sprites.webp");
    if (image.size) {
      const raw = JSON.parse(await meta.text()) as unknown;
      const url = URL.createObjectURL(image);
      blobUrls.push(url);
      sprites = parseSpriteSheet(raw, url);
    }
  } catch {
    sprites = null;
  }

  let audioUrl = "";
  try {
    const audio = await getFile("audio.m4a");
    if (audio.size) {
      audioUrl = URL.createObjectURL(audio);
      blobUrls.push(audioUrl);
    }
  } catch {
    audioUrl = "";
  }

  let notesUrl = "";
  if (manifest.files.notes) {
    try {
      const notes = await getFile(manifest.files.notes.path);
      if (notes.size) {
        notesUrl = URL.createObjectURL(notes);
        blobUrls.push(notesUrl);
      }
    } catch {
      notesUrl = "";
    }
  }

  let silence: SilenceRange[] = [];
  try {
    const file = await getFile("silence.json");
    if (file.size) silence = parseSilenceFile(JSON.parse(await file.text()) as unknown);
  } catch {
    silence = [];
  }

  return {
    manifest,
    timeline,
    blobUrls,
    mismatches,
    sprites,
    audioUrl,
    notesUrl,
    silence,
    revoke: () => {
      for (const u of blobUrls) URL.revokeObjectURL(u);
    },
  };
}

import { compactEvents, unproxySlideUrl, type Timeline } from "../dcn.ts";
import { validateManifest, type Manifest } from "./manifest.ts";

export function remapSlideUrls(timeline: Timeline, blobBySrc: Map<string, string>): Timeline {
  const blobs = [...new Set(blobBySrc.values())];
  let n = 0;
  return {
    ...timeline,
    slides: timeline.slides.map((s) => {
      if (!s.url) return s;
      const orig = unproxySlideUrl(s.url);
      let decoded = orig;
      try {
        decoded = decodeURIComponent(orig);
      } catch {
        /* keep orig */
      }
      const blob = blobBySrc.get(orig) || blobBySrc.get(s.url) || blobBySrc.get(decoded) || blobs[n];
      n += 1;
      return blob ? { ...s, url: blob } : { ...s, url: undefined };
    }),
  };
}

export function parseInkJson(id: string, jsonText: string): Timeline {
  const parsed = JSON.parse(jsonText) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Unexpected notes format");
  return compactEvents(id, parsed as Parameters<typeof compactEvents>[1]);
}

export function readManifestBytes(bytes: Uint8Array): Manifest {
  const text = new TextDecoder().decode(bytes);
  return validateManifest(JSON.parse(text));
}

export function isGzipMagic(bytes: Uint8Array) {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** Bundle format v1. Keep in lockstep with CACHE_VER in lesson-api.ts. */
export const BUNDLE_FORMAT = "inkboard-bundle";
export const BUNDLE_VERSION = 1;
export const PARSER_VERSION = "v19";

export type ManifestFile = {
  path: string;
  bytes: number;
  sha256: string;
};

export type ManifestSlide = {
  src: string;
  path: string;
  sha256: string;
};

export type Manifest = {
  format: "inkboard-bundle";
  version: number;
  lessonId: string;
  title: string;
  kind: "board" | "video";
  durationMs: number;
  savedAt: string;
  parserVersion: string;
  files: {
    ink: ManifestFile;
    media: ManifestFile;
    notes?: ManifestFile;
  };
  slides: ManifestSlide[];
};

function fail(msg: string): never {
  throw new Error(msg);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x);
}

const SHA = /^[a-f0-9]{64}$/;
const REL_PATH = /^(?![./])(?!.*\.\.)[A-Za-z0-9._/-]+$/;

function asFile(x: unknown, label: string): ManifestFile {
  if (!isRecord(x)) fail(`${label} is missing`);
  const path = x.path;
  const bytes = x.bytes;
  const sha256 = x.sha256;
  if (typeof path !== "string" || !REL_PATH.test(path)) fail(`${label}.path is invalid`);
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0 || !Number.isInteger(bytes)) {
    fail(`${label}.bytes is invalid`);
  }
  if (typeof sha256 !== "string" || !SHA.test(sha256)) fail(`${label}.sha256 is invalid`);
  return { path, bytes, sha256 };
}

function asSlide(x: unknown, i: number): ManifestSlide {
  if (!isRecord(x)) fail(`slides[${i}] is missing`);
  const src = x.src;
  const path = x.path;
  const sha256 = x.sha256;
  if (typeof src !== "string" || !src.trim()) fail(`slides[${i}].src is invalid`);
  if (typeof path !== "string" || !REL_PATH.test(path)) fail(`slides[${i}].path is invalid`);
  if (typeof sha256 !== "string" || !SHA.test(sha256)) fail(`slides[${i}].sha256 is invalid`);
  return { src, path, sha256 };
}

export function validateManifest(x: unknown): Manifest {
  if (!isRecord(x)) fail("manifest is not an object");
  if (x.format !== BUNDLE_FORMAT) fail(`unknown format ${String(x.format)}`);
  if (typeof x.version !== "number" || !Number.isInteger(x.version)) fail("version is invalid");
  if (x.version !== BUNDLE_VERSION) fail(`unsupported bundle version ${x.version}`);
  if (typeof x.lessonId !== "string" || !/^[A-Za-z0-9_-]{6,40}$/.test(x.lessonId)) {
    fail("lessonId is invalid");
  }
  if (typeof x.title !== "string") fail("title is missing");
  if (x.kind !== "board" && x.kind !== "video") fail("kind is invalid");
  if (typeof x.durationMs !== "number" || !Number.isFinite(x.durationMs) || x.durationMs < 0) {
    fail("durationMs is invalid");
  }
  if (typeof x.savedAt !== "string" || Number.isNaN(Date.parse(x.savedAt))) fail("savedAt is invalid");
  if (typeof x.parserVersion !== "string" || !x.parserVersion) fail("parserVersion is missing");
  if (!isRecord(x.files)) fail("files is missing");
  const ink = asFile(x.files.ink, "files.ink");
  const media = asFile(x.files.media, "files.media");
  const notes = x.files.notes === undefined ? undefined : asFile(x.files.notes, "files.notes");
  if (!Array.isArray(x.slides)) fail("slides is missing");
  const slides = x.slides.map((s, i) => asSlide(s, i));
  return {
    format: BUNDLE_FORMAT,
    version: x.version,
    lessonId: x.lessonId,
    title: x.title,
    kind: x.kind,
    durationMs: x.durationMs,
    savedAt: x.savedAt,
    parserVersion: x.parserVersion,
    files: notes ? { ink, media, notes } : { ink, media },
    slides,
  };
}

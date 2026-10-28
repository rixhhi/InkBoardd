import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUNDLE_FORMAT, BUNDLE_VERSION, validateManifest } from "@inkboard/shared/bundle/manifest";

const SHA = "a".repeat(64);

function good(over: Record<string, unknown> = {}) {
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    lessonId: "LESSON1",
    title: "Counting",
    kind: "board",
    durationMs: 1000,
    savedAt: "2026-10-04T00:00:00.000Z",
    parserVersion: "v14",
    files: {
      ink: { path: "ink.json.gz", bytes: 12, sha256: SHA },
      media: { path: "media.webm", bytes: 40, sha256: SHA },
    },
    slides: [{ src: "https://static.uacdn.net/s0.jpg", path: "slides/000.jpg", sha256: SHA }],
    ...over,
  };
}

describe("validateManifest", () => {
  it("accepts a valid v1 manifest", () => {
    const m = validateManifest(good());
    assert.equal(m.lessonId, "LESSON1");
    assert.equal(m.files.ink.path, "ink.json.gz");
    assert.equal(m.slides.length, 1);
  });

  it("rejects a missing field", () => {
    const raw = good();
    delete (raw as { files?: unknown }).files;
    assert.throws(() => validateManifest(raw), /files is missing/);
  });

  it("rejects an unknown version", () => {
    assert.throws(() => validateManifest(good({ version: 2 })), /unsupported bundle version 2/);
  });

  it("rejects a bad hash", () => {
    const raw = good();
    (raw.files as { ink: { sha256: string } }).ink.sha256 = "nope";
    assert.throws(() => validateManifest(raw), /sha256 is invalid/);
  });

  it("allows optional notes", () => {
    const raw = good();
    (raw.files as { notes?: unknown }).notes = { path: "notes.pdf", bytes: 8, sha256: SHA };
    assert.equal(validateManifest(raw).files.notes?.path, "notes.pdf");
  });
});

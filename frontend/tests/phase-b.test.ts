import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readPrepared, writePrepared } from "../src/lib/prepared-media.ts";
import { parseSpriteSheet, spriteCell, resolveSpriteUrl, type SpriteSheet } from "../src/lib/sprite-sheet.ts";

const sheet: SpriteSheet = {
  interval: 10,
  count: 25,
  columns: 10,
  rows: 3,
  cellW: 160,
  cellH: 90,
  url: "sprites.webp",
};

describe("phase B seek sprites and notes", () => {
  it("maps a timestamp onto the sprite cell", () => {
    const first = spriteCell(0, sheet);
    assert.equal(first.index, 0);
    assert.equal(first.x, 0);
    assert.equal(first.y, 0);
    const mid = spriteCell(105, sheet);
    assert.equal(mid.index, 10);
    assert.equal(mid.col, 0);
    assert.equal(mid.row, 1);
    assert.equal(mid.x, 0);
    assert.equal(mid.y, -90);
    const last = spriteCell(9999, sheet);
    assert.equal(last.index, 24);
    assert.equal(resolveSpriteUrl(sheet, "/api/jobs/abc/artifacts"), "/api/jobs/abc/artifacts/sprites.webp");
    assert.equal(resolveSpriteUrl({ ...sheet, url: "/cdn/sprites.webp" }), "/cdn/sprites.webp");
    const parsed = parseSpriteSheet(sheet, "/api/jobs/abc/artifacts/sprites.webp");
    assert.equal(parsed?.url, "/api/jobs/abc/artifacts/sprites.webp");
    assert.equal(parsed?.count, 25);
    assert.equal(parseSpriteSheet({ interval: 0 }, "/x.webp"), null);
  });

  it("opens notes inside the player and previews the seek bar", () => {
    const player = [
      "../src/components/class-player.tsx",
      "../src/components/player-transport.tsx",
      "../src/components/player/use-class-core.ts",
    ]
      .map((f) => readFileSync(new URL(f, import.meta.url), "utf8"))
      .join("\n");
    const reader = readFileSync(new URL("../src/components/notes-reader.tsx", import.meta.url), "utf8");
    const hover = readFileSync(new URL("../src/components/seek-hover.tsx", import.meta.url), "utf8");
    const save = readFileSync(new URL("../src/components/save-chapter.tsx", import.meta.url), "utf8");
    const offline = readFileSync(new URL("../src/features/offline/player/offline-player.tsx", import.meta.url), "utf8");
    assert.match(player, /NotesReader/);
    assert.match(player, /SeekHover/);
    assert.match(player, /setNotesOpen/);
    assert.match(player, /COPY\.listen/);
    assert.match(player, /slideUrl=/);
    assert.match(player, /dataSaver/);
    assert.match(reader, /pdfjs-dist/);
    assert.match(reader, /notes-reader/);
    assert.match(hover, /seek-hover-frame/);
    assert.match(hover, /seek-hover-slide/);
    assert.match(hover, /spriteCell/);
    assert.match(save, /enhance: true/);
    assert.match(save, /prepareMedia/);
    assert.match(offline, /audioUrl/);
    assert.match(player, /readPrepared/);
    assert.match(player, /writePrepared/);
    assert.match(player, /audioUrl \?/);
    assert.match(offline, /NotesReader/);
  });

  it("remembers prepared media for a lesson on this device", () => {
    const mem = new Map<string, string>();
    const prev = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: (key) => mem.get(key) ?? null,
      setItem: (key, value) => {
        mem.set(key, value);
      },
      removeItem: (key) => {
        mem.delete(key);
      },
      clear: () => mem.clear(),
      key: (i) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    };
    try {
      assert.equal(readPrepared("lesson1"), null);
      writePrepared("lesson1", {
        sprites: sheet,
        audioUrl: "/api/jobs/a/artifacts/audio.m4a",
        hlsUrl: "/api/jobs/a/artifacts/hls/master.m3u8",
      });
      writePrepared("lesson1", { sprites: null, audioUrl: null, hlsUrl: null });
      const kept = readPrepared("lesson1");
      assert.equal(kept?.audioUrl, "/api/jobs/a/artifacts/audio.m4a");
      assert.equal(kept?.sprites?.count, 25);
      writePrepared("missing", { sprites: null, audioUrl: null, hlsUrl: null });
      assert.equal(readPrepared("missing")?.audioUrl, null);
    } finally {
      globalThis.localStorage = prev;
    }
  });
});

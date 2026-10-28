import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertNoDelogo,
  audioExtractArgs,
  hlsVariantArgs,
  isAllowedArtifact,
  loudnormApplyArgs,
  loudnormMeasureArgs,
  masterPlaylist,
  parseLoudnorm,
  parseProbe,
  parseSilence,
  posterArgs,
  posterSec,
  clipArgs,
  clipFileName,
  clipWindow,
  spriteArgs,
  spriteGrid,
  waveformArgs,
} from "../../src/integrations/ffmpeg/plan.ts";
import { safeArtifactPath } from "../../src/integrations/ffmpeg/artifacts.ts";
import { lectureJobPayload } from "../../src/routes/jobs.ts";

const LOUDNORM = `
[Parsed_loudnorm_0 @ 0x1]
{
	"input_i" : "-21.76",
	"input_tp" : "-11.35",
	"input_lra" : "0.20",
	"input_thresh" : "-31.76",
	"output_i" : "-16.02",
	"output_tp" : "-5.58",
	"output_lra" : "0.10",
	"output_thresh" : "-26.02",
	"normalization_type" : "dynamic",
	"target_offset" : "0.02"
}
`;

describe("phase B media plan", () => {
  it("tiles one frame per 10 seconds, at least one cell", () => {
    const tiny = spriteGrid(2);
    assert.equal(tiny.count, 1);
    assert.equal(tiny.columns, 1);
    assert.equal(tiny.rows, 1);
    assert.equal(tiny.interval, 10);
    assert.equal(tiny.cellW, 160);
    const grid = spriteGrid(95);
    assert.equal(grid.count, 10);
    assert.equal(grid.columns, 10);
    assert.equal(grid.rows, 1);
    const wide = spriteGrid(250);
    assert.equal(wide.count, 25);
    assert.equal(wide.columns, 10);
    assert.equal(wide.rows, 3);
  });

  it("puts the poster on the first ink second, else 10%", () => {
    assert.equal(posterSec(100, 27.4), 27.4);
    assert.equal(posterSec(100, null), 10);
    assert.equal(posterSec(100, 400), 10);
    assert.equal(posterSec(0, null), 0);
  });

  it("refuses delogo and never puts it in generated args", () => {
    assert.throws(() => assertNoDelogo(["-vf", "delogo=x=1:y=1:w=10:h=10"]), /delogo/);
    const bags = [
      spriteArgs("in.mp4", "sprites.webp", spriteGrid(30)),
      posterArgs("in.mp4", "poster.jpg", 3),
      loudnormMeasureArgs("in.mp4"),
      loudnormApplyArgs("in.mp4", "audio.m4a", {
        input_i: "-21.76",
        input_tp: "-11.35",
        input_lra: "0.20",
        input_thresh: "-31.76",
        target_offset: "0.02",
      }),
      audioExtractArgs("in.mp4", "audio.m4a"),
      hlsVariantArgs("in.mp4", 360, "hls/360/index.m3u8", "hls/360/seg%03d.ts", { hasAudio: true, preset: "ultrafast" }),
    ];
    for (const args of bags) {
      assert.equal(args.includes("-i") || args[0] === "-y" || args[0] === "-hide_banner", true);
      assert.doesNotMatch(args.filter((a, i) => args[i - 1] !== "-i").join(" "), /delogo/i);
      assertNoDelogo(args);
    }
  });

  it("parses loudnorm JSON and duration from ffmpeg stderr", () => {
    const measured = parseLoudnorm(LOUDNORM);
    assert.ok(measured);
    assert.equal(measured.input_i, "-21.76");
    assert.equal(measured.target_offset, "0.02");
    assert.equal(parseLoudnorm("no json"), null);
    assert.equal(parseLoudnorm('{"input_i":"-inf"}'), null);
    const probe = parseProbe("Duration: 01:02:03.50, start: 0.000000\nStream #0:0: Video: h264\nStream #0:1: Audio: aac\n");
    assert.equal(probe.duration, 3723.5);
    assert.equal(probe.hasVideo, true);
    assert.equal(probe.hasAudio, true);
  });

  it("writes an HLS master with 360, 480, and 720", () => {
    const text = masterPlaylist();
    assert.match(text, /^#EXTM3U/);
    assert.match(text, /360\/index\.m3u8/);
    assert.match(text, /480\/index\.m3u8/);
    assert.match(text, /720\/index\.m3u8/);
    assert.match(text, /BANDWIDTH=450000/);
  });

  it("allowlists artifacts and rejects path traversal", () => {
    const root = mkdtempSync(join(tmpdir(), "ink-art-"));
    writeFileSync(join(root, "sprites.json"), "{}\n");
    assert.equal(isAllowedArtifact("sprites.json"), true);
    assert.equal(isAllowedArtifact("enhance.json"), true);
    assert.equal(isAllowedArtifact("audio.m4a"), true);
    assert.equal(isAllowedArtifact("hls/360/seg000.ts"), true);
    assert.equal(isAllowedArtifact("hls/720/index.m3u8"), true);
    assert.equal(isAllowedArtifact("../etc/passwd"), false);
    assert.equal(isAllowedArtifact("hls/360/../../sprites.json"), false);
    assert.equal(isAllowedArtifact("silence.json"), true);
    assert.equal(isAllowedArtifact("waveform.png"), true);
    assert.equal(isAllowedArtifact("clips/clip-12000-45000.mp4"), true);
    assert.equal(isAllowedArtifact("clips/clip-1.mp4"), false);
    assert.ok(safeArtifactPath(root, "sprites.json")?.endsWith("sprites.json"));
    assert.equal(safeArtifactPath(root, "../sprites.json"), null);
    assert.equal(safeArtifactPath(root, "notes.pdf"), null);
  });

  it("parses silence ranges and refuses clips outside 1s–20min", () => {
    const ranges = parseSilence("silence_start: 1.5\nsilence_end: 8.25\nsilence_start: 40\n");
    assert.deepEqual(ranges, [{ start: 1.5, end: 8.25 }]);
    assert.equal(clipWindow(0, 0.2), null);
    assert.equal(clipWindow(0, 21 * 60), null);
    const window = clipWindow(12.2, 40, 100);
    assert.ok(window);
    assert.equal(clipFileName(window.start, window.end), "clips/clip-12200-40000.mp4");
    const args = clipArgs("in.mp4", "clips/clip-12200-40000.mp4", window.start, window.end);
    assert.equal(args.includes("delogo"), false);
    assert.ok(args.includes("libx264"));
    const wave = waveformArgs("in.mp4", "waveform.png");
    assert.match(wave.join(" "), /showwavespic/);
    assert.equal(wave.includes("delogo"), false);
  });

  it("accepts an enhance flag only with a real lesson id", () => {
    const ok = lectureJobPayload({ id: "WY106R57G6SA54R3JCHR", enhance: true, remux: true });
    assert.ok(ok);
    assert.equal(ok.enhance, true);
    assert.equal(ok.remux, true);
    assert.equal(lectureJobPayload({ id: "short", enhance: true }), null);
    assert.equal(lectureJobPayload({ enhance: true }), null);
  });
});

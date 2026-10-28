import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ffmpegBinary } from "../../src/integrations/ffmpeg/probe.ts";
import { enhanceMedia } from "../../src/integrations/ffmpeg/pipeline.ts";
import { runFfmpeg } from "../../src/integrations/ffmpeg/run.ts";

describe("phase B ffmpeg pipeline", () => {
  it("builds sprites, poster, loudnorm audio, and an HLS ladder from a short clip", async () => {
    const bin = ffmpegBinary();
    if (!bin) return;
    const dir = mkdtempSync(join(tmpdir(), "ink-ffmpeg-"));
    const input = join(dir, "in.mp4");
    await runFfmpeg(bin, [
      "-y",
      "-hide_banner",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=320x180:rate=10:duration=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=44100:duration=2",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      input,
    ]);
    const report = await enhanceMedia({ input, outDir: dir, bin, preset: "ultrafast", firstInkSec: 0.4 });
    assert.equal(report.skipped, undefined);
    const failed = report.steps.filter((s) => !s.ok).map((s) => `${s.name}:${s.detail || ""}`);
    assert.deepEqual(failed, [], failed.join("; "));
    const manifest = JSON.parse(readFileSync(join(dir, "sprites.json"), "utf8")) as {
      columns: number;
      rows: number;
      interval: number;
      url: string;
    };
    assert.equal(manifest.columns, 1);
    assert.equal(manifest.rows, 1);
    assert.equal(manifest.interval, 10);
    assert.equal(manifest.url, "sprites.webp");
    for (const name of ["sprites.webp", "poster.jpg", "thumb.webp", "audio.m4a", "enhance.json", "hls/master.m3u8", "hls/360/index.m3u8", "hls/480/index.m3u8", "hls/720/index.m3u8"]) {
      assert.ok(existsSync(join(dir, name)), name);
    }
    const master = readFileSync(join(dir, "hls/master.m3u8"), "utf8");
    assert.match(master, /360\/index\.m3u8/);
    assert.match(readFileSync(join(dir, "hls/360/index.m3u8"), "utf8"), /#EXTM3U/);
    assert.ok(readFileSync(join(dir, "audio.m4a")).length > 100);
  });
});

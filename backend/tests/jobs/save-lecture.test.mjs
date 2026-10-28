import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, it } from "node:test";
import { compactEvents, visibleStrokes } from "@inkboard/shared/dcn";
import { validateManifest } from "@inkboard/shared/bundle/manifest";
import { EXIT, gzipInk, parseSaveArgs, quickVerifyBundle, saveLecture, sha256Buf, sha256File, verifyBundle } from "../../src/cli/lib/save-lecture-core.mjs";
import { main } from "../../src/cli/save-lecture.mjs";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9, 0x00, 0x01, 0x02, 0x03]);
const WEBM = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, ...Array.from({ length: 40 }, (_, i) => i)]);
const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);

function ev(plugin, p_time, data) {
  return { plugin, p_time, data };
}

function inkEvents(slideCount = 5) {
  const events = [];
  for (let i = 1; i <= slideCount; i++) {
    events.push(
      ev("dcn", (i - 1) * 1_000_000, {
        e: "as",
        i,
        uid: `s${i - 1}`,
        u: `https://static.uacdn.net/s${i - 1}.pdf?page=${i}`,
      }),
      ev("dcn", (i - 1) * 1_000_000 + 200_000, { e: "sc", s: i }),
    );
  }
  events.push(
    ev("cw", 500_000, { id: 1, data: { e: "d", p: { x: 0.1, y: 0.1, oid: "a" } } }),
    ev("cw", 700_000, { id: 1, data: { e: "u", p: { x: 0.2, y: 0.2 } } }),
  );
  return [events];
}

function silentLog() {
  const lines = [];
  return {
    lines,
    info: (m) => lines.push(String(m)),
    warn: (m) => lines.push(`W ${m}`),
    error: (m) => lines.push(`E ${m}`),
    progress: () => {},
    newline: () => {},
  };
}

function makeFetch(spec) {
  return async (url, init = {}) => {
    const u = String(url);
    const range = init.headers?.Range || init.headers?.range;
    for (const row of spec) {
      if (typeof row.match === "function" ? !row.match(u, init) : !u.includes(row.match)) continue;
      if (row.once) {
        if (row._used) continue;
        row._used = true;
      }
      if (typeof row.res === "function") return row.res(u, init, range);
      const headers = new Headers(row.headers || {});
      if (row.archive) headers.set("x-amz-archive-status", "ARCHIVE_ACCESS_TIER");
      const payload = row.body ?? "";
      const status = row.status ?? 200;
      if (range && row.rangeBody) {
        const start = Number(String(range).replace(/bytes=/, "").split("-")[0] || 0);
        const slice = row.rangeBody.slice(start);
        headers.set("content-length", String(slice.byteLength ?? slice.length));
        return new Response(slice, { status: start > 0 ? 206 : 200, headers });
      }
      return new Response(payload, { status, headers });
    }
    return new Response("no", { status: 404 });
  };
}

function defaultSpec(over = []) {
  const ink = JSON.stringify(inkEvents(5));
  return [
    { match: "/lesson-raw/TESTLESSON1/data.json", body: ink },
    { match: "static.uacdn.net/s", body: JPEG, headers: { "content-type": "image/jpeg" } },
    { match: "/lesson-raw/TESTLESSON1/output.webm", body: WEBM, headers: { "content-type": "video/webm" } },
    { match: "_with_anno.pdf", body: PDF, headers: { "content-type": "application/pdf" } },
    ...over,
  ];
}

describe("saveLecture", () => {
  it("writes a complete verifiable bundle (happy path)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-save-"));
    const log = silentLog();
    let mediaHits = 0;
    const counting = async (url, init) => {
      if (String(url).includes("output.webm")) mediaHits += 1;
      return makeFetch(defaultSpec())(url, init);
    };
    const result = await saveLecture({
      id: "TESTLESSON1",
      outDir: dir,
      fetch: counting,
      log,
      opts: { title: "Counting Techniques - Part I", now: () => new Date("2026-10-04T00:00:00.000Z") },
    });
    assert.ok(existsSync(join(result.dir, "manifest.json")));
    const manifest = validateManifest(JSON.parse(readFileSync(join(result.dir, "manifest.json"), "utf8")));
    assert.equal(manifest.lessonId, "TESTLESSON1");
    assert.equal(manifest.kind, "board");
    assert.equal(manifest.slides.length, 5);
    assert.ok(manifest.files.notes);
    const inkBytes = readFileSync(join(result.dir, "ink.json.gz"));
    assert.equal(inkBytes[0], 0x1f);
    assert.equal(inkBytes[1], 0x8b);
    const verified = await verifyBundle(result.dir, silentLog());
    assert.equal(verified.ok, true);
    assert.ok(mediaHits >= 1);
    const after = mediaHits;
    const again = await saveLecture({
      id: "TESTLESSON1",
      outDir: dir,
      fetch: counting,
      log: silentLog(),
      opts: { title: "Counting Techniques - Part I" },
    });
    assert.equal(again.dir, result.dir);
    assert.equal(again.resumed, true);
    assert.equal(mediaHits, after);
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts an ink log larger than the old 8 MB cap", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-save-"));
    const fat = JSON.stringify(inkEvents(1)).replace(/]$/, `${" ".repeat(9 * 1024 * 1024)}]`);
    assert.ok(fat.length > 8 * 1024 * 1024);
    const result = await saveLecture({
      id: "TESTLESSON1",
      outDir: dir,
      fetch: makeFetch([
        { match: "/lesson-raw/TESTLESSON1/data.json", body: fat },
        { match: "static.uacdn.net/s", body: JPEG },
        { match: "output.webm", body: WEBM },
      ]),
      log: silentLog(),
      opts: { noNotes: true },
    });
    assert.equal(result.manifest.kind, "board");
    rmSync(dir, { recursive: true, force: true });
  });

  it("gzips ink that arrived uncompressed", async () => {
    const raw = new TextEncoder().encode(JSON.stringify(inkEvents(1)));
    assert.equal(raw[0], 0x5b);
    const gz = gzipInk(raw);
    assert.equal(gz[0], 0x1f);
    assert.equal(gz[1], 0x8b);
    const already = gzipSync(raw);
    assert.equal(gzipInk(already), already);
  });

  it("accepts gzipped ink from the CDN", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-save-"));
    const gz = gzipSync(JSON.stringify(inkEvents(1)));
    const result = await saveLecture({
      id: "TESTLESSON1",
      outDir: dir,
      fetch: makeFetch([
        { match: "/lesson-raw/TESTLESSON1/data.json", body: gz, headers: { "content-type": "application/gzip" } },
        { match: "static.uacdn.net/s", body: JPEG },
        { match: "output.webm", body: WEBM },
      ]),
      log: silentLog(),
      opts: { noNotes: true },
    });
    assert.equal(result.manifest.slides.length, 1);
    const ink = readFileSync(join(result.dir, "ink.json.gz"));
    assert.equal(ink[0], 0x1f);
    rmSync(dir, { recursive: true, force: true });
  });

  it("resumes a partial media download on 206 Range", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-save-"));
    const partial = join(dir, "lecture-TESTLESSON1.partial");
    mkdirSync(join(partial, "slides"), { recursive: true });
    const first = WEBM.slice(0, 10);
    writeFileSync(join(partial, "media.webm.part"), first);
    let sawRange = false;
    const fetchImpl = makeFetch([
      { match: "/lesson-raw/TESTLESSON1/data.json", body: JSON.stringify(inkEvents(1)) },
      { match: "static.uacdn.net/s", body: JPEG },
      {
        match: "output.webm",
        res: (_u, init) => {
          const range = init.headers?.Range;
          if (range === "bytes=10-") {
            sawRange = true;
            return new Response(WEBM.slice(10), {
              status: 206,
              headers: { "content-length": String(WEBM.length - 10), "content-range": `bytes 10-${WEBM.length - 1}/${WEBM.length}` },
            });
          }
          return new Response(WEBM, { status: 200 });
        },
      },
    ]);
    const result = await saveLecture({
      id: "TESTLESSON1",
      outDir: dir,
      fetch: fetchImpl,
      log: silentLog(),
      opts: { noNotes: true },
    });
    assert.equal(sawRange, true);
    assert.equal(statSync(join(result.dir, "media.webm")).size, WEBM.length);
    rmSync(dir, { recursive: true, force: true });
  });

  it("treats 416 as already complete", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-save-"));
    const partial = join(dir, "lecture-TESTLESSON1.partial");
    mkdirSync(join(partial, "slides"), { recursive: true });
    writeFileSync(join(partial, "media.webm.part"), Buffer.from(WEBM));
    const fetchImpl = makeFetch([
      { match: "/lesson-raw/TESTLESSON1/data.json", body: JSON.stringify(inkEvents(1)) },
      { match: "static.uacdn.net/s", body: JPEG },
      { match: "output.webm", status: 416, body: "" },
    ]);
    const result = await saveLecture({
      id: "TESTLESSON1",
      outDir: dir,
      fetch: fetchImpl,
      log: silentLog(),
      opts: { noNotes: true },
    });
    assert.equal(statSync(join(result.dir, "media.webm")).size, WEBM.length);
    rmSync(dir, { recursive: true, force: true });
  });

  it("exits 3 when the CDN says archived", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-save-"));
    await assert.rejects(
      () =>
        saveLecture({
          id: "TESTLESSON1",
          outDir: dir,
          fetch: makeFetch([{ match: "data.json", status: 403, archive: true, body: "" }]),
          log: silentLog(),
        }),
      (err) => {
        assert.equal(err.code, EXIT.archived);
        assert.match(err.message, /ARCHIVED, cannot be saved/);
        return true;
      },
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("exits 4 on 429", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-save-"));
    await assert.rejects(
      () =>
        saveLecture({
          id: "TESTLESSON1",
          outDir: dir,
          fetch: makeFetch([{ match: "data.json", status: 429, body: "slow" }]),
          log: silentLog(),
        }),
      (err) => err.code === EXIT.forbidden,
    );
    const code = await main(["TESTLESSON1", "--out", dir], {
      fetch: makeFetch([{ match: "data.json", status: 403, body: "" }]),
      log: silentLog(),
      error: () => {},
    });
    assert.equal(code, EXIT.forbidden);
    rmSync(dir, { recursive: true, force: true });
  });

  it("tolerates a missing slide under 20%", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-save-"));
    const fetchImpl = async (url, init) => {
      if (String(url).includes("s3.pdf")) return new Response("no", { status: 404 });
      return makeFetch(defaultSpec())(url, init);
    };
    const result = await saveLecture({
      id: "TESTLESSON1",
      outDir: dir,
      fetch: fetchImpl,
      log: silentLog(),
      opts: { noNotes: true, noMedia: true },
    });
    assert.equal(result.manifest.slides.length, 4);
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails when more than 20% of slides are missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-save-"));
    const fetchImpl = async (url, init) => {
      const u = String(url);
      if (u.includes("s1.pdf") || u.includes("s2.pdf")) return new Response("no", { status: 404 });
      return makeFetch(defaultSpec())(url, init);
    };
    await assert.rejects(
      () =>
        saveLecture({
          id: "TESTLESSON1",
          outDir: dir,
          fetch: fetchImpl,
          log: silentLog(),
          opts: { noNotes: true, noMedia: true },
        }),
      /Too many missing slides/,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("skips a 403 notes PDF and still writes the bundle", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-save-"));
    const log = silentLog();
    const result = await saveLecture({
      id: "TESTLESSON1",
      outDir: dir,
      fetch: makeFetch([
        { match: "/lesson-raw/TESTLESSON1/data.json", body: JSON.stringify(inkEvents(1)) },
        { match: "static.uacdn.net/s", body: JPEG },
        { match: "output.webm", body: WEBM },
        { match: "_with_anno.pdf", status: 403, body: "" },
        { match: "_no_anno.pdf", status: 403, body: "" },
      ]),
      log,
      opts: { title: "Counting Techniques - Part I" },
    });
    assert.ok(existsSync(join(result.dir, "manifest.json")));
    assert.ok(existsSync(join(result.dir, "media.webm")));
    assert.equal(result.manifest.files.notes, undefined);
    assert.match(log.lines.join("\n"), /notes skipped \(HTTP 403\)/);
    const verified = await verifyBundle(result.dir, silentLog());
    assert.equal(verified.ok, true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("verify explains an incomplete .partial folder", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-save-"));
    const partial = join(dir, "lecture-TESTLESSON1.partial");
    mkdirSync(partial, { recursive: true });
    writeFileSync(join(partial, "media.webm"), WEBM);
    const log = silentLog();
    const result = await verifyBundle(join(dir, "lecture-TESTLESSON1"), log);
    assert.equal(result.ok, false);
    assert.match(log.lines.join("\n"), /incomplete/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("verify passes on a fresh bundle and fails when a slide byte changes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-save-"));
    const result = await saveLecture({
      id: "TESTLESSON1",
      outDir: dir,
      fetch: makeFetch(defaultSpec()),
      log: silentLog(),
      opts: { noNotes: true },
    });
    const ok = await verifyBundle(result.dir, silentLog());
    assert.equal(ok.ok, true);
    const slide = join(result.dir, result.manifest.slides[0].path);
    const buf = Buffer.from(readFileSync(slide));
    buf[buf.length - 1] = buf[buf.length - 1] ^ 0xff;
    writeFileSync(slide, buf);
    const bad = await verifyBundle(result.dir, silentLog());
    assert.equal(bad.ok, false);
    const cli = await main(["--verify", result.dir], { log: silentLog(), error: () => {} });
    assert.equal(cli, EXIT.error);
    rmSync(dir, { recursive: true, force: true });
  });

  it("quick verify accepts a finished bundle by size only and rejects truncated media", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-quick-"));
    const bundle = join(dir, "lecture-TESTLESSON1");
    mkdirSync(bundle, { recursive: true });
    const ink = Buffer.alloc(10, 1);
    const media = Buffer.alloc(40, 2);
    writeFileSync(join(bundle, "ink.json.gz"), ink);
    writeFileSync(join(bundle, "media.webm"), media);
    const manifest = {
      format: "inkboard-bundle",
      version: 1,
      lessonId: "TESTLESSON1",
      title: "T",
      kind: "video",
      durationMs: 1000,
      savedAt: "2026-10-04T00:00:00.000Z",
      parserVersion: "v14",
      files: {
        ink: { path: "ink.json.gz", bytes: 10, sha256: "a".repeat(64) },
        media: { path: "media.webm", bytes: 40, sha256: "b".repeat(64) },
      },
      slides: [],
    };
    writeFileSync(join(bundle, "manifest.json"), `${JSON.stringify(manifest)}\n`);
    const quick = await quickVerifyBundle(bundle, silentLog());
    assert.equal(quick.ok, true);
    const full = await verifyBundle(bundle, silentLog());
    assert.equal(full.ok, false, "fake sha256 still fails a full verify — quick did not hash media.webm");
    writeFileSync(join(bundle, "media.webm"), Buffer.alloc(10, 2));
    const truncated = await quickVerifyBundle(bundle, silentLog());
    assert.equal(truncated.ok, false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("parses args and verify", () => {
    assert.equal(parseSaveArgs([]).code, EXIT.args);
    assert.equal(parseSaveArgs(["TESTLESSON1", "--out", "./saved"]).id, "TESTLESSON1");
    assert.equal(parseSaveArgs(["--verify", "./saved/lecture-X"]).verify, "./saved/lecture-X");
    assert.equal(parseSaveArgs(["TESTLESSON1", "--remux"]).remux, true);
    const pasted = parseSaveArgs([
      "WY106R57G6SA54R3JCHR",
      "[--out",
      "./saved]",
      "[--no-media]",
      "[--no-notes]",
      "[--remux]",
    ]);
    assert.equal(pasted.id, "WY106R57G6SA54R3JCHR");
    assert.equal(pasted.out, "./saved");
    assert.equal(pasted.noMedia, true);
    assert.equal(pasted.noNotes, true);
    assert.equal(pasted.remux, true);
    assert.equal(parseSaveArgs(["--nope"]).code, EXIT.args);
  });

  it("remuxes with injectable ffmpeg when --remux", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-save-"));
    let called = null;
    await saveLecture({
      id: "TESTLESSON1",
      outDir: dir,
      fetch: makeFetch(defaultSpec()),
      log: silentLog(),
      opts: {
        noNotes: true,
        remux: true,
        whichFfmpeg: () => "/usr/bin/ffmpeg",
        ffmpeg: async (args) => {
          called = args;
          const out = args[args.length - 1];
          writeFileSync(out, WEBM);
        },
      },
    });
    assert.ok(called);
    assert.ok(called.includes("-c"));
    assert.ok(called.includes("copy"));
    rmSync(dir, { recursive: true, force: true });
  });

  it("visibleStrokes match after save gzip viewer-load", async () => {
    const raw = inkEvents(1);
    const tl = compactEvents("GOLDEN1", raw);
    const gz = gzipInk(new TextEncoder().encode(JSON.stringify(raw)));
    const { gunzipSync } = await import("node:zlib");
    const text = gunzipSync(gz).toString("utf8");
    const loaded = compactEvents("GOLDEN1", JSON.parse(text));
    const t = 2000;
    const uid = "s0";
    assert.deepEqual(visibleStrokes(loaded, t, uid), visibleStrokes(tl, t, uid));
  });
});

void sha256Buf;
void sha256File;

describe("saveLecture robustness", () => {
  // Overrides must come BEFORE the defaults: makeFetch uses the first matching row.
  const specWith = (over) => [...over, ...defaultSpec()];
  const SHORT = new Uint8Array(400).fill(7);
  const FULL = new Uint8Array(1000).fill(7);

  it("rejects a media download that ends before content-length and keeps the .part for resume", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-short-"));
    const fetchShort = makeFetch(
      specWith([
        {
          match: "output.webm",
          res: () => new Response(SHORT, { status: 200, headers: { "content-length": "1000", "content-type": "video/webm" } }),
        },
      ]),
    );
    await assert.rejects(
      saveLecture({
        id: "TESTLESSON1",
        outDir: dir,
        fetch: fetchShort,
        log: silentLog(),
        opts: { title: "T", noNotes: true, mediaAttempts: 2, mediaRetryDelayMs: 1 },
      }),
      /cut short/,
    );
    assert.ok(!existsSync(join(dir, "lecture-TESTLESSON1")), "no finished bundle");
    assert.ok(existsSync(join(dir, "lecture-TESTLESSON1.partial", "media.webm.part")), ".part kept");
  });

  it("auto-resumes a dropped connection and finishes with a matching hash", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-resume-"));
    let calls = 0;
    const flaky = makeFetch(
      specWith([
        {
          match: "output.webm",
          res: (_u, _i, range) => {
            calls += 1;
            const start = range ? Number(String(range).replace(/bytes=/, "").split("-")[0] || 0) : 0;
            if (calls === 1) {
              return new Response(SHORT, { status: 200, headers: { "content-length": "1000", "content-type": "video/webm" } });
            }
            const rest = FULL.slice(start);
            return new Response(rest, {
              status: start > 0 ? 206 : 200,
              headers: { "content-length": String(rest.byteLength), "content-type": "video/webm" },
            });
          },
        },
      ]),
    );
    const result = await saveLecture({
      id: "TESTLESSON1",
      outDir: dir,
      fetch: flaky,
      log: silentLog(),
      opts: { title: "T", noNotes: true, mediaRetryDelayMs: 1 },
    });
    assert.equal(calls, 2, "one retry");
    assert.equal(statSync(join(result.dir, "media.webm")).size, 1000);
    const v = await verifyBundle(result.dir, silentLog());
    assert.ok(v.ok);
  });

  it("does not retry on 429", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-429-"));
    let calls = 0;
    const limited = makeFetch(
      specWith([{ match: "output.webm", res: () => { calls += 1; return new Response("slow down", { status: 429 }); } }]),
    );
    await assert.rejects(
      saveLecture({ id: "TESTLESSON1", outDir: dir, fetch: limited, log: silentLog(), opts: { title: "T", noNotes: true, mediaRetryDelayMs: 1 } }),
      (err) => err.code === EXIT.forbidden,
    );
    assert.equal(calls, 1);
  });

  it("skips the notes PDF when no --title is given (placeholder title would 404)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-notitle-"));
    const log = silentLog();
    let notesHits = 0;
    const f = async (url, init) => {
      if (String(url).includes("slides_pdf")) notesHits += 1;
      return makeFetch(defaultSpec())(url, init);
    };
    const result = await saveLecture({ id: "TESTLESSON1", outDir: dir, fetch: f, log, opts: {} });
    assert.equal(notesHits, 0);
    assert.ok(!result.manifest.files.notes);
    assert.ok(log.lines.some((l) => /No --title given/.test(l)));
  });

  it("sha256File streams and matches sha256Buf", () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-hash-"));
    const big = Buffer.alloc(3 * 1024 * 1024 + 17, 9);
    const p = join(dir, "big.bin");
    writeFileSync(p, big);
    assert.equal(sha256File(p), sha256Buf(big));
  });

  it("aborts an in-flight media download and keeps the .part file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ink-abort-"));
    const ac = new AbortController();
    const hang = makeFetch(
      specWith([
        {
          match: "output.webm",
          res: (_u, init) =>
            new Promise((resolve, reject) => {
              const t = setTimeout(() => resolve(new Response(WEBM, { status: 200 })), 8_000);
              init?.signal?.addEventListener("abort", () => {
                clearTimeout(t);
                ac.abort();
                reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
              });
              setTimeout(() => ac.abort(), 20);
            }),
        },
      ]),
    );
    await assert.rejects(
      saveLecture({
        id: "TESTLESSON1",
        outDir: dir,
        fetch: hang,
        log: silentLog(),
        opts: { title: "T", noNotes: true, signal: ac.signal, mediaRetryDelayMs: 1 },
      }),
      (err) => Boolean(err.aborted || /Stopped|abort/i.test(err.message)),
    );
    const part = join(dir, "lecture-TESTLESSON1.partial", "media.webm.part");
    const alt = join(dir, "lecture-TESTLESSON1.partial", "media.webm");
    assert.ok(existsSync(join(dir, "lecture-TESTLESSON1.partial")));
    assert.ok(existsSync(part) || existsSync(alt) || existsSync(join(dir, "lecture-TESTLESSON1.partial", "ink.json.gz")));
  });
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, after } from "node:test";
import { crc32 } from "node:zlib";
import { listZipEntries, zipStoreChunks, zipTotalSize } from "./zip-store.ts";

const root = mkdtempSync(join(tmpdir(), "zip-store-"));
mkdirSync(join(root, "slides"), { recursive: true });
writeFileSync(join(root, "manifest.json"), '{"format":"inkboard-lecture"}\n');
writeFileSync(join(root, "slides", "000.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
writeFileSync(join(root, "media.webm"), Buffer.alloc(70_000, 7));
writeFileSync(join(root, "manifest.json.tmp"), "partial");
writeFileSync(join(root, "media.webm.part"), "partial");

after(() => rmSync(root, { recursive: true, force: true }));

async function collect(it: AsyncIterable<Buffer>) {
  const parts: Buffer[] = [];
  for await (const chunk of it) parts.push(chunk);
  return Buffer.concat(parts);
}

/** Minimal zip32 reader: walks the central directory and returns each entry's bytes (STORE only). */
function readZip(buf: Buffer): Map<string, Buffer> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, "end-of-central-directory record present");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, "central header signature");
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    assert.equal(method, 0, `${name} is STORE`);
    assert.equal(buf.readUInt32LE(local), 0x04034b50, "local header signature");
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + size);
    assert.equal(crc32(data) >>> 0, crc, `${name} crc matches`);
    out.set(name, Buffer.from(data));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

describe("zip-store", () => {
  it("lists regular files with forward-slash names and skips .tmp/.part leftovers", async () => {
    const entries = await listZipEntries(root);
    assert.deepEqual(
      entries.map((e) => e.name),
      ["manifest.json", "media.webm", "slides/000.jpg"],
    );
  });

  it("streams a STORE zip that reads back byte-for-byte, with a size that matches the predicted Content-Length", async () => {
    const entries = await listZipEntries(root);
    const bytes = await collect(zipStoreChunks(entries));
    assert.equal(bytes.length, zipTotalSize(entries), "Content-Length prediction must be exact");
    const files = readZip(bytes);
    assert.deepEqual([...files.keys()].sort(), ["manifest.json", "media.webm", "slides/000.jpg"]);
    assert.equal(files.get("manifest.json")!.toString("utf8"), '{"format":"inkboard-lecture"}\n');
    const media = files.get("media.webm")!;
    assert.equal(media.length, 70_000);
    assert.ok(media.every((b) => b === 7));
    assert.deepEqual([...files.get("slides/000.jpg")!], [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  });

  it("passes the system unzip integrity check when unzip is installed", async () => {
    const entries = await listZipEntries(root);
    const bytes = await collect(zipStoreChunks(entries));
    const file = join(root, "..", `zip-store-check-${process.pid}.zip`);
    writeFileSync(file, bytes);
    try {
      let out = "";
      try {
        out = execFileSync("unzip", ["-t", file], { encoding: "utf8" });
      } catch (err) {
        if ((err as { code?: string }).code === "ENOENT") return; // no unzip on this box — the reader above already verified
        throw err;
      }
      assert.match(out, /No errors detected/);
    } finally {
      rmSync(file, { force: true });
    }
  });

  it("stops early when the request is aborted", async () => {
    const entries = await listZipEntries(root);
    const ctrl = new AbortController();
    ctrl.abort();
    const bytes = await collect(zipStoreChunks(entries, ctrl.signal));
    assert.equal(bytes.length, 0);
  });
});

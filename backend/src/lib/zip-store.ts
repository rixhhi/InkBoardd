import { createReadStream } from "node:fs";
import { readdir, stat, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { Readable } from "node:stream";
import { crc32 } from "node:zlib";

/**
 * Minimal streaming ZIP writer, STORE method only (no deflate).
 * Lecture bundles are webm + jpg + pdf + gz — already compressed — so STORE costs nothing and
 * lets us stream straight from disk without buffering a 1 GB archive in memory.
 * Plain zip32: callers must refuse archives past ZIP32_LIMIT.
 */

export type ZipEntry = { name: string; abs: string; size: number; mtime: Date };

export const ZIP32_LIMIT = 0xffff_ffff;
const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;
const VERSION = 20;
const FLAG_UTF8 = 0x0800;

function dosTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const year = Math.max(1980, d.getFullYear());
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/** Walks `root` and lists every regular file with a forward-slash relative name. */
export async function listZipEntries(root: string): Promise<ZipEntry[]> {
  const out: ZipEntry[] = [];
  async function walk(dir: string) {
    const names = (await readdir(dir)).sort();
    for (const name of names) {
      const abs = join(dir, name);
      const st = await stat(abs);
      if (st.isDirectory()) await walk(abs);
      else if (st.isFile()) {
        const rel = relative(root, abs).split(sep).join("/");
        if (rel.endsWith(".tmp") || rel.endsWith(".part")) continue;
        out.push({ name: rel, abs, size: st.size, mtime: st.mtime });
      }
    }
  }
  await walk(root);
  return out;
}

export function zipTotalSize(entries: ZipEntry[]) {
  // local header (30 + name) + data + central header (46 + name) + end record (22)
  return entries.reduce((n, e) => n + 30 + 46 + 2 * Buffer.byteLength(e.name) + e.size, 22);
}

function localHeader(e: ZipEntry, crc: number) {
  const name = Buffer.from(e.name, "utf8");
  const buf = Buffer.alloc(30 + name.length);
  const { time, date } = dosTime(e.mtime);
  buf.writeUInt32LE(LOCAL_SIG, 0);
  buf.writeUInt16LE(VERSION, 4);
  buf.writeUInt16LE(FLAG_UTF8, 6);
  buf.writeUInt16LE(0, 8); // STORE
  buf.writeUInt16LE(time, 10);
  buf.writeUInt16LE(date, 12);
  buf.writeUInt32LE(crc >>> 0, 14);
  buf.writeUInt32LE(e.size, 18);
  buf.writeUInt32LE(e.size, 22);
  buf.writeUInt16LE(name.length, 26);
  buf.writeUInt16LE(0, 28);
  name.copy(buf, 30);
  return buf;
}

function centralHeader(e: ZipEntry, crc: number, offset: number) {
  const name = Buffer.from(e.name, "utf8");
  const buf = Buffer.alloc(46 + name.length);
  const { time, date } = dosTime(e.mtime);
  buf.writeUInt32LE(CENTRAL_SIG, 0);
  buf.writeUInt16LE(VERSION, 4);
  buf.writeUInt16LE(VERSION, 6);
  buf.writeUInt16LE(FLAG_UTF8, 8);
  buf.writeUInt16LE(0, 10);
  buf.writeUInt16LE(time, 12);
  buf.writeUInt16LE(date, 14);
  buf.writeUInt32LE(crc >>> 0, 16);
  buf.writeUInt32LE(e.size, 20);
  buf.writeUInt32LE(e.size, 24);
  buf.writeUInt16LE(name.length, 28);
  buf.writeUInt16LE(0, 30);
  buf.writeUInt16LE(0, 32);
  buf.writeUInt16LE(0, 34);
  buf.writeUInt16LE(0, 36);
  buf.writeUInt32LE(0, 38);
  buf.writeUInt32LE(offset, 42);
  name.copy(buf, 46);
  return buf;
}

function endRecord(count: number, centralSize: number, centralOffset: number) {
  const buf = Buffer.alloc(22);
  buf.writeUInt32LE(END_SIG, 0);
  buf.writeUInt16LE(0, 4);
  buf.writeUInt16LE(0, 6);
  buf.writeUInt16LE(count, 8);
  buf.writeUInt16LE(count, 10);
  buf.writeUInt32LE(centralSize, 12);
  buf.writeUInt32LE(centralOffset, 16);
  buf.writeUInt16LE(0, 20);
  return buf;
}

async function fileCrc(abs: string, size: number): Promise<number> {
  // Small files: one read. Large files: stream so a 1 GB webm never sits in memory.
  if (size <= 8 * 1024 * 1024) return crc32(await readFile(abs));
  let crc = 0;
  for await (const chunk of createReadStream(abs)) crc = crc32(chunk as Buffer, crc);
  return crc;
}

/**
 * Async generator of zip bytes. CRCs are computed per file just before its header is written
 * (STORE needs the CRC up front), so each file is read twice — once for the CRC, once to stream.
 * That is a fair trade for never buffering media in memory.
 */
export async function* zipStoreChunks(entries: ZipEntry[], signal?: AbortSignal): AsyncGenerator<Buffer> {
  let offset = 0;
  const central: Buffer[] = [];
  for (const e of entries) {
    if (signal?.aborted) return;
    const crc = await fileCrc(e.abs, e.size);
    const head = localHeader(e, crc);
    central.push(centralHeader(e, crc, offset));
    yield head;
    offset += head.length;
    if (e.size > 0) {
      for await (const chunk of createReadStream(e.abs)) {
        if (signal?.aborted) return;
        yield chunk as Buffer;
      }
      offset += e.size;
    }
  }
  const centralOffset = offset;
  let centralSize = 0;
  for (const c of central) {
    yield c;
    centralSize += c.length;
  }
  yield endRecord(entries.length, centralSize, centralOffset);
}

export function zipStoreStream(entries: ZipEntry[], signal?: AbortSignal): Readable {
  return Readable.from(zipStoreChunks(entries, signal));
}

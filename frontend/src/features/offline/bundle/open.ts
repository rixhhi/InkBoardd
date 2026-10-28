import JSZip from "jszip";
import { validateSavedChapter, type SavedChapter } from "@inkboard/shared/bundle/chapter";
import { detectFolderKind, jsonDirPrefix } from "@inkboard/shared/bundle/chapter-nav";
import { validateSavedCourse, type SavedCourse } from "@inkboard/shared/bundle/course";
import type { GetFile } from "./load-bundle.ts";

export type BundleSource =
  | { kind: "dir"; handle: FileSystemDirectoryHandle; name: string }
  | { kind: "files"; files: Map<string, File>; name: string }
  | { kind: "zip"; zip: JSZip; name: string; warn?: string; root?: string };

export type Opened =
  | { type: "lecture"; source: BundleSource }
  | { type: "chapter"; source: BundleSource; saved: SavedChapter }
  | { type: "course"; source: BundleSource; saved: SavedCourse };

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function rebase(path: string, prefix: string) {
  const n = normalizePath(path);
  if (!prefix) return n;
  if (n === prefix) return "";
  if (n.startsWith(`${prefix}/`)) return n.slice(prefix.length + 1);
  return n;
}

export async function getFileFromSource(src: BundleSource, path: string): Promise<File> {
  const rel = path.replace(/^\.\//, "");
  const rooted = src.kind === "zip" && src.root ? `${src.root.replace(/\/$/, "")}/${rel}` : rel;
  if (src.kind === "dir") {
    const parts = rel.split("/").filter(Boolean);
    let dir = src.handle;
    for (const p of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(p);
    }
    const fh = await dir.getFileHandle(parts[parts.length - 1]!);
    return fh.getFile();
  }
  if (src.kind === "files") {
    const hit = src.files.get(rel) || src.files.get(rel.split("/").pop() || rel);
    if (!hit) throw new Error(`Missing ${rel}`);
    return hit;
  }
  const entry = src.zip.file(rooted) || src.zip.file(rel) || src.zip.file(rel.split("/").pop() || rel);
  if (!entry) throw new Error(`Missing ${rel}`);
  const blob = await entry.async("blob");
  return new File([blob], rel.split("/").pop() || rel);
}

export function makeGetFile(src: BundleSource): GetFile {
  return (path) => getFileFromSource(src, path);
}

export function prefixedGetFile(src: BundleSource, prefix: string): GetFile {
  const base = prefix.replace(/\/$/, "");
  return (path) => getFileFromSource(src, base ? `${base}/${path.replace(/^\//, "")}` : path.replace(/^\//, ""));
}

function entriesOf(handle: FileSystemDirectoryHandle): AsyncIterable<[string, FileSystemHandle]> {
  const h = handle as FileSystemDirectoryHandle & {
    entries?: () => AsyncIterable<[string, FileSystemHandle]>;
  };
  if (typeof h.entries === "function") return h.entries();
  return {
    async *[Symbol.asyncIterator]() {
      /* Chromium File System Access; older DOM typings omit entries() */
    },
  };
}

async function readSavedChapter(src: BundleSource): Promise<SavedChapter> {
  const file = await getFileFromSource(src, "chapter.json");
  return validateSavedChapter(JSON.parse(await file.text()));
}

async function readSavedCourse(src: BundleSource): Promise<SavedCourse> {
  const file = await getFileFromSource(src, "course.json");
  return validateSavedCourse(JSON.parse(await file.text()));
}

export async function openBundleFromDirectory(handle: FileSystemDirectoryHandle): Promise<BundleSource> {
  try {
    await handle.getFileHandle("manifest.json");
    return { kind: "dir", handle, name: handle.name };
  } catch {
    /* nested lecture folder */
  }
  for await (const [, entry] of entriesOf(handle)) {
    if (entry.kind !== "directory") continue;
    const nested = entry as FileSystemDirectoryHandle;
    try {
      await nested.getFileHandle("manifest.json");
      return { kind: "dir", handle: nested, name: nested.name };
    } catch {
      /* keep looking */
    }
  }
  throw new Error("incomplete bundle (no manifest)");
}

export async function openFromDirectory(handle: FileSystemDirectoryHandle): Promise<Opened> {
  try {
    await handle.getFileHandle("course.json");
    const source: BundleSource = { kind: "dir", handle, name: handle.name };
    return { type: "course", source, saved: await readSavedCourse(source) };
  } catch {
    /* not a course */
  }
  try {
    await handle.getFileHandle("chapter.json");
    const source: BundleSource = { kind: "dir", handle, name: handle.name };
    return { type: "chapter", source, saved: await readSavedChapter(source) };
  } catch {
    /* lecture folder */
  }
  return { type: "lecture", source: await openBundleFromDirectory(handle) };
}

export async function pickDirectory(): Promise<Opened> {
  if (typeof window.showDirectoryPicker !== "function") {
    throw new Error("unsupported browser");
  }
  const handle = await window.showDirectoryPicker({ mode: "read" });
  return openFromDirectory(handle);
}

function sourceFromNames(names: string[], files: Map<string, File>, zip?: JSZip, zipName?: string, warn?: string): Opened | Promise<Opened> {
  const kind = detectFolderKind(names);
  const file =
    kind === "course" ? "course.json" : kind === "chapter" ? "chapter.json" : kind === "lecture" ? "manifest.json" : "";
  const prefix = file ? jsonDirPrefix(names, file) : "";
  const remapped = new Map<string, File>();
  for (const [k, v] of files) remapped.set(rebase(k, prefix) || k, v);
  const name = prefix.split("/")[0] || zipName || "bundle";
  if (zip) {
    const source: BundleSource = { kind: "zip", zip, name, warn, root: prefix || undefined };
    if (kind === "course") return readSavedCourse(source).then((saved) => ({ type: "course" as const, source, saved }));
    if (kind === "chapter") return readSavedChapter(source).then((saved) => ({ type: "chapter" as const, source, saved }));
    if (kind !== "lecture") throw new Error("incomplete bundle (no manifest)");
    return { type: "lecture", source };
  }
  const source: BundleSource = { kind: "files", files: remapped, name };
  if (kind === "course") return readSavedCourse(source).then((saved) => ({ type: "course" as const, source, saved }));
  if (kind === "chapter") return readSavedChapter(source).then((saved) => ({ type: "chapter" as const, source, saved }));
  if (kind !== "lecture") throw new Error("incomplete bundle (no manifest)");
  return { type: "lecture", source };
}

export async function filesFromListAsync(list: FileList | File[]): Promise<Opened> {
  const files = new Map<string, File>();
  const arr = Array.from(list);
  const names: string[] = [];
  for (const f of arr) {
    const rel = normalizePath((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
    files.set(rel, f);
    files.set(f.name, f);
    names.push(rel);
  }
  return sourceFromNames(names, files);
}

export async function openZipFile(file: File): Promise<Opened> {
  const zip = await JSZip.loadAsync(file);
  const names = Object.keys(zip.files).map((n) => n.replace(/\\/g, "/"));
  const files = new Map<string, File>();
  const warn = file.size > 1_000_000_000 ? "This zip is over 1 GB. A folder is faster and safer." : undefined;
  return sourceFromNames(names, files, zip, file.name, warn);
}

declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  }
}

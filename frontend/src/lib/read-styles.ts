import fs from "node:fs";
import { fileURLToPath } from "node:url";

const LAYERS = ["tokens.css", "base.css", "layout.css", "components.css", "pages.css", "utilities.css", "player.css"];

const original = fs.readFileSync;

function asPath(file: fs.PathOrFileDescriptor): string {
  if (typeof file === "string") return file;
  if (file instanceof URL) return fileURLToPath(file);
  return "";
}

function layered(entryPath: string): string {
  const dir = entryPath.replace(/styles\.css$/, "styles/");
  const head = original.call(fs, entryPath, "utf8");
  const body = LAYERS.map((name) => original.call(fs, dir + name, "utf8"));
  return [head, ...body].join("\n");
}

function isEntry(file: string) {
  return file.replaceAll("\\", "/").endsWith("/frontend/src/styles.css");
}

let installed = false;

/** Tests that read the entry file get the layered sheets as well. */
export function installStylesRead() {
  if (installed) return;
  installed = true;
  fs.readFileSync = ((file: fs.PathOrFileDescriptor, options?: unknown) => {
    const path = asPath(file);
    if (!path || !isEntry(path)) return original.call(fs, file, options as never);
    const text = layered(path);
    if (
      options == null ||
      options === "utf8" ||
      options === "utf-8" ||
      (typeof options === "object" && options !== null && "encoding" in options && (options as { encoding?: string }).encoding === "utf8")
    ) {
      return text;
    }
    return Buffer.from(text);
  }) as typeof fs.readFileSync;
}

/** Entry file plus the layered sheets it imports. */
export function readStyles(entry: URL): string {
  return layered(fileURLToPath(entry));
}

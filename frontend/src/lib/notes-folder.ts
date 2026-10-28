import type { NotesZipSaved } from "@inkboard/shared/notes-zip";

type WritableHandle = FileSystemDirectoryHandle;

/** True when the browser can hand us a folder to write into (Chromium desktop). */
export function canSaveToFolder(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

/** Asks for a folder with write access; null when the user dismissed the picker. */
export async function pickNotesFolder(): Promise<WritableHandle | null> {
  if (!canSaveToFolder()) return null;
  try {
    return await window.showDirectoryPicker!({ mode: "readwrite" });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return null;
    throw err;
  }
}

/** Resolves `a/b/c.pdf` under `root`, creating folders as needed, and returns the leaf directory plus file name. */
async function resolveDir(root: WritableHandle, path: string): Promise<{ dir: WritableHandle; name: string }> {
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop() || "notes.pdf";
  let dir = root;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
  return { dir, name };
}

/** Writes one fetched PDF straight into the chosen folder. */
export async function writeNoteFile(root: WritableHandle, file: NotesZipSaved): Promise<void> {
  const { dir, name } = await resolveDir(root, file.path);
  const handle = await dir.getFileHandle(name, { create: true });
  const stream = await handle.createWritable();
  try {
    // A view over a plain ArrayBuffer satisfies FileSystemWriteChunkType (the fetched bytes may be typed ArrayBufferLike).
    const bytes = new Uint8Array(file.bytes.byteLength);
    bytes.set(file.bytes);
    await stream.write(bytes);
  } finally {
    await stream.close();
  }
}

/** Drops a plain-text report beside the PDFs. */
export async function writeNoteReport(root: WritableHandle, text: string): Promise<void> {
  const handle = await root.getFileHandle("_report.txt", { create: true });
  const stream = await handle.createWritable();
  try {
    await stream.write(new TextEncoder().encode(text));
  } finally {
    await stream.close();
  }
}

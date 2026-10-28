import { resourceLinks } from "./notes.ts";
import type { UaLesson } from "./parse-lesson.ts";

// Pacing between CDN requests: with fetch time added this stays under 60 requests a minute.
export const NOTES_GAP_MIN_MS = 1000;
export const NOTES_GAP_MAX_MS = 1300;
export const NOTES_TIMEOUT_MS = 20_000;
export const NOTES_RETRY_BACKOFF_MS = 1_500;
export const NOTES_REVOKE_MS = 30_000;
export const NOTES_ZIP_MAX_BYTES = 400 * 1024 * 1024;
export const NOTES_WARN_COUNT = 100;
export const NOTES_RETRY_STATUSES = new Set([500, 502, 503, 504]);

export type NotesZipLesson = Pick<
  UaLesson,
  "uid" | "title" | "rank" | "week" | "notesUrl" | "slidesUrl" | "dppUrl" | "dppName" | "replayId"
>;

export type NotesZipSource = "known" | "guessed";

export type NotesZipFile = {
  key: string;
  lesson: string;
  label: string;
  href: string;
  zipPath: string;
  source: NotesZipSource;
};

export type NotesZipSaved = { path: string; bytes: Uint8Array };
export type NotesZipMissing = { path: string; reason: string; guessed?: boolean };
export type NotesZipStopped = { status: 403 | 429; retryAfter?: string };

export type FetchNotesResult = {
  saved: NotesZipSaved[];
  missing: NotesZipMissing[];
  stopped: NotesZipStopped | null;
  cancelled: boolean;
  splitByWeek: boolean;
  totalBytes: number;
};

export type FetchNotesOpts = {
  fetch: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  timeoutMs?: number;
  retryBackoffMs?: number;
  gapMinMs?: number;
  gapMaxMs?: number;
  maxBytes?: number;
  signal?: AbortSignal;
  onProgress?: (info: { index: number; total: number; name: string }) => void;
  /**
   * Streaming sink. When set, each PDF is handed over as soon as it arrives and its bytes are released
   * instead of being held for a zip at the end — the folder-save path uses this to write files one by one.
   */
  onSaved?: (file: NotesZipSaved) => Promise<void> | void;
};

type Kind = "notes" | "class" | "dpp";

function isPdfMagic(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

export function windowsSafeName(raw: string) {
  const cleaned = raw
    .replace(/[<>:"/\\|?*]/g, " ")
    .split("")
    .map((ch) => (ch.charCodeAt(0) < 32 ? " " : ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
  return cleaned || "notes";
}

export function weekFolderName(week: number | null | undefined) {
  return week != null && Number.isFinite(week) ? `Week ${week}` : "All classes";
}

export function uniquePath(path: string, taken: Set<string>) {
  const key = path.toLowerCase();
  if (!taken.has(key)) {
    taken.add(key);
    return path;
  }
  const dot = path.lastIndexOf(".");
  const stem = dot > 0 ? path.slice(0, dot) : path;
  const ext = dot > 0 ? path.slice(dot) : "";
  let n = 2;
  let next = `${stem} (${n})${ext}`;
  while (taken.has(next.toLowerCase())) {
    n += 1;
    next = `${stem} (${n})${ext}`;
  }
  taken.add(next.toLowerCase());
  return next;
}

export function notesFileCounts(files: { source: NotesZipSource }[]) {
  let known = 0;
  let guessed = 0;
  for (const file of files) {
    if (file.source === "guessed") guessed += 1;
    else known += 1;
  }
  return { known, guessed, total: known + guessed };
}

export function downloadNotesCopy(known: number, guessed = 0) {
  const n = known + guessed;
  if (n <= 0) return "";
  if (!guessed) return n === 1 ? "Download all notes (1 file)" : `Download all notes (${n} files)`;
  return `Download all notes (${known} known + ${guessed} possible)`;
}

export function groupSavedByWeek(saved: NotesZipSaved[]) {
  const map = new Map<string, NotesZipSaved[]>();
  for (const file of saved) {
    const slash = file.path.indexOf("/");
    const week = slash >= 0 ? file.path.slice(0, slash) : "All classes";
    const list = map.get(week) ?? [];
    list.push(file);
    map.set(week, list);
  }
  return [...map.entries()].map(([week, files]) => ({ week, files }));
}

export function shouldSplitByWeek(totalBytes: number, nextBytes: number, cap = NOTES_ZIP_MAX_BYTES) {
  return totalBytes > 0 && totalBytes + nextBytes > cap;
}

function padIndex(n: number) {
  return String(Math.max(1, n)).padStart(n > 99 ? 3 : 2, "0");
}

function groupLessons(lessons: NotesZipLesson[]) {
  if (!lessons.some((l) => l.week != null)) return [{ week: null as number | null, lessons }];
  const map = new Map<number, NotesZipLesson[]>();
  const rest: NotesZipLesson[] = [];
  for (const lesson of lessons) {
    if (lesson.week == null) rest.push(lesson);
    else {
      const list = map.get(lesson.week) ?? [];
      list.push(lesson);
      map.set(lesson.week, list);
    }
  }
  const groups = [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, rows]) => ({ week: week as number | null, lessons: rows }));
  if (rest.length) groups.push({ week: null, lessons: rest });
  return groups;
}

function kindLabel(kind: Kind, dppName?: string | null) {
  if (kind === "notes") return "Notes";
  if (kind === "class") return "Class PDF";
  return dppName || "DPP";
}

function kindSuffix(kind: Kind) {
  if (kind === "notes") return "notes.pdf";
  if (kind === "class") return "class.pdf";
  return "dpp.pdf";
}

export function collectNotesFiles(lessons: NotesZipLesson[]): NotesZipFile[] {
  const taken = new Set<string>();
  const files: NotesZipFile[] = [];
  for (const group of groupLessons(lessons)) {
    const folder = windowsSafeName(weekFolderName(group.week));
    group.lessons.forEach((lesson, i) => {
      const links = resourceLinks(lesson as UaLesson);
      const n = lesson.rank && lesson.rank > 0 ? lesson.rank : i + 1;
      const base = `${padIndex(n)} ${windowsSafeName(lesson.title)}`;
      const rows: { kind: Kind; href: string; source: NotesZipSource }[] = [];
      if (links.notes) {
        rows.push({
          kind: "notes",
          href: links.notes,
          source: lesson.notesUrl ? "known" : "guessed",
        });
      }
      if (links.slides) {
        rows.push({
          kind: "class",
          href: links.slides,
          source: lesson.slidesUrl ? "known" : "guessed",
        });
      }
      if (links.dppPdf) {
        rows.push({ kind: "dpp", href: links.dppPdf, source: "known" });
      }
      for (const row of rows) {
        const zipPath = uniquePath(`${folder}/${base} - ${kindSuffix(row.kind)}`, taken);
        files.push({
          key: `${lesson.uid}-${row.kind}`,
          lesson: lesson.title,
          label: kindLabel(row.kind, lesson.dppName),
          href: row.href,
          zipPath,
          source: row.source,
        });
      }
    });
  }
  return files;
}

export function notesZipSummary(saved: number, missing: number) {
  const a = saved === 1 ? "Saved 1 file" : `Saved ${saved} files`;
  if (!missing) return a;
  const b = missing === 1 ? "1 not available" : `${missing} not available`;
  return `${a}, ${b}`;
}

export function notesZipReport(result: FetchNotesResult) {
  const lines: string[] = [];
  lines.push(notesZipSummary(result.saved.length, result.missing.length));
  lines.push("");
  if (result.saved.length) {
    lines.push("Saved");
    for (const row of result.saved) lines.push(row.path);
    lines.push("");
  }
  if (result.missing.length) {
    lines.push("Not available");
    for (const row of result.missing) {
      const tag = row.guessed ? "not on the CDN" : row.reason;
      lines.push(`${row.path}  ${tag}`);
    }
    lines.push("");
  }
  if (result.stopped) {
    const wait = result.stopped.retryAfter ? ` Retry-After: ${result.stopped.retryAfter}` : "";
    lines.push(`Stopped: HTTP ${result.stopped.status}.${wait}`);
  }
  if (result.cancelled) lines.push("Cancelled.");
  if (result.splitByWeek) lines.push("Split into one zip per week (over 400 MB together).");
  return `${lines.join("\n").trim()}\n`;
}

function sleepMs(ms: number, sleep?: (n: number) => Promise<void>, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
  if (!sleep) {
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        },
        { once: true },
      );
    });
  }
  return sleep(ms);
}

async function fetchOne(
  href: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    return await fetchFn(href, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function isAbort(err: unknown) {
  return (
    (err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message))) ||
    (typeof err === "object" && err != null && (err as { name?: string }).name === "AbortError")
  );
}

export async function fetchNotesZip(files: NotesZipFile[], opts: FetchNotesOpts): Promise<FetchNotesResult> {
  const saved: NotesZipSaved[] = [];
  const missing: NotesZipMissing[] = [];
  let stopped: NotesZipStopped | null = null;
  let cancelled = false;
  let splitByWeek = false;
  let totalBytes = 0;
  const timeoutMs = opts.timeoutMs ?? NOTES_TIMEOUT_MS;
  const backoff = opts.retryBackoffMs ?? NOTES_RETRY_BACKOFF_MS;
  const gapMin = opts.gapMinMs ?? NOTES_GAP_MIN_MS;
  const gapMax = opts.gapMaxMs ?? NOTES_GAP_MAX_MS;
  const maxBytes = opts.maxBytes ?? NOTES_ZIP_MAX_BYTES;
  const rnd = opts.random ?? Math.random;

  for (let i = 0; i < files.length; i++) {
    if (opts.signal?.aborted) {
      cancelled = true;
      break;
    }
    const file = files[i]!;
    opts.onProgress?.({ index: i + 1, total: files.length, name: file.zipPath });
    let res: Response | null = null;
    let networkErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await fetchOne(file.href, opts.fetch, timeoutMs, opts.signal);
        networkErr = null;
      } catch (err) {
        if (opts.signal?.aborted || isAbort(err)) {
          cancelled = true;
          break;
        }
        networkErr = err;
        res = null;
        if (attempt === 0) {
          try {
            await sleepMs(backoff, opts.sleep, opts.signal);
            continue;
          } catch {
            cancelled = true;
            break;
          }
        }
        break;
      }
      if (!res) break;
      if (res.status === 404) break;
      if (res.status === 403 || res.status === 429) break;
      if (NOTES_RETRY_STATUSES.has(res.status) && attempt === 0) {
        try {
          await sleepMs(backoff, opts.sleep, opts.signal);
          continue;
        } catch {
          cancelled = true;
          break;
        }
      }
      break;
    }
    if (cancelled) break;
    if (!res) {
      missing.push({
        path: file.zipPath,
        reason: networkErr instanceof Error ? networkErr.message : "network error",
        guessed: file.source === "guessed",
      });
    } else if (res.status === 403 || res.status === 429) {
      stopped = {
        status: res.status,
        retryAfter: res.headers.get("Retry-After") || undefined,
      };
      break;
    } else if (res.status === 404) {
      missing.push({
        path: file.zipPath,
        reason: file.source === "guessed" ? "not on the CDN" : "HTTP 404",
        guessed: file.source === "guessed",
      });
    } else if (!res.ok) {
      missing.push({ path: file.zipPath, reason: `HTTP ${res.status}`, guessed: file.source === "guessed" });
    } else {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (!isPdfMagic(buf)) missing.push({ path: file.zipPath, reason: "not a PDF", guessed: file.source === "guessed" });
      else {
        if (!opts.onSaved && shouldSplitByWeek(totalBytes, buf.length, maxBytes)) splitByWeek = true;
        const row: NotesZipSaved = { path: file.zipPath, bytes: buf };
        if (opts.onSaved) {
          try {
            await opts.onSaved(row);
            saved.push({ path: file.zipPath, bytes: new Uint8Array(0) });
          } catch (err) {
            if (opts.signal?.aborted || isAbort(err)) {
              cancelled = true;
              break;
            }
            missing.push({ path: file.zipPath, reason: err instanceof Error ? err.message : "could not write", guessed: file.source === "guessed" });
          }
        } else {
          saved.push(row);
        }
        totalBytes += buf.length;
      }
    }
    const more = i < files.length - 1 && !stopped && !cancelled;
    if (more) {
      const span = Math.max(0, gapMax - gapMin);
      const gap = gapMin + rnd() * span;
      try {
        await sleepMs(gap, opts.sleep, opts.signal);
      } catch {
        cancelled = true;
        break;
      }
    }
  }

  if (!opts.onSaved && !splitByWeek && totalBytes > maxBytes) splitByWeek = true;

  return { saved, missing, stopped, cancelled, splitByWeek, totalBytes };
}

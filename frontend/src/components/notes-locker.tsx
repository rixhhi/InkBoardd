import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileDown, FolderDown, Package } from "lucide-react";
import { TAKE_SHEETS_EVENT } from "@inkboard/shared/shelf";
import { COPY } from "@inkboard/shared/copy";
import type { UaLesson } from "@/lib/unacademy";
import {
  NOTES_REVOKE_MS,
  NOTES_WARN_COUNT,
  collectNotesFiles,
  downloadNotesCopy,
  fetchNotesZip,
  groupSavedByWeek,
  notesFileCounts,
  notesZipReport,
  notesZipSummary,
  windowsSafeName,
  type FetchNotesResult,
  type NotesZipSaved,
} from "@inkboard/shared/notes-zip";
import { Button, Dialog, Progress } from "@/components/ui";
import { canSaveToFolder, pickNotesFolder, writeNoteFile, writeNoteReport } from "@/lib/notes-folder";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), NOTES_REVOKE_MS);
}

function releaseBytes(files: NotesZipSaved[]) {
  for (const file of files) file.bytes = new Uint8Array(0);
}

async function zipFiles(filename: string, files: NotesZipSaved[], result: FetchNotesResult) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const file of files) zip.file(file.path, file.bytes);
  zip.file("_report.txt", notesZipReport(result));
  const blob = await zip.generateAsync({ type: "blob" });
  releaseBytes(files);
  triggerDownload(blob, filename);
}

async function zipResult(courseName: string, result: FetchNotesResult) {
  await zipFiles(`${windowsSafeName(courseName)} notes.zip`, result.saved, result);
}

async function zipWeeks(courseName: string, result: FetchNotesResult) {
  const groups = groupSavedByWeek(result.saved);
  for (const group of groups) {
    const name = `${windowsSafeName(courseName)} ${windowsSafeName(group.week)} notes.zip`;
    await zipFiles(name, group.files, result);
  }
}

type Mode = "folder" | "zip";

/**
 * "Download all notes" for a course.
 * Folder mode (Chromium desktop): pick a folder once, then every PDF is written the moment it arrives —
 * nothing is held in memory and you can open files while the rest are still coming.
 * Zip mode (everything else): fetch all, then hand over one zip (or one per week past 400 MB).
 */
export function NotesLocker({ lessons, courseName }: { lessons: UaLesson[]; courseName: string }) {
  const files = useMemo(() => collectNotesFiles(lessons), [lessons]);
  const counts = useMemo(() => notesFileCounts(files), [files]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("zip");
  const [done, setDone] = useState(0);
  const [current, setCurrent] = useState("");
  const [result, setResult] = useState<FetchNotesResult | null>(null);
  const [err, setErr] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const folderOk = canSaveToFolder();

  useEffect(() => {
    if (folderOk) setMode("folder");
  }, [folderOk]);

  const close = useCallback(() => {
    if (busy) return;
    setOpen(false);
  }, [busy]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  async function run(which: Mode) {
    if (busy || !files.length) return;
    let folder: Awaited<ReturnType<typeof pickNotesFolder>> = null;
    if (which === "folder") {
      try {
        folder = await pickNotesFolder();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not open that folder.");
        return;
      }
      if (!folder) return; // picker dismissed — nothing to do
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setErr("");
    setResult(null);
    setDone(0);
    setCurrent("");
    setBusy(true);
    try {
      const next = await fetchNotesZip(files, {
        fetch,
        signal: ctrl.signal,
        onProgress: ({ index, name }) => {
          setDone(index - 1);
          setCurrent(name);
        },
        ...(folder ? { onSaved: (file: NotesZipSaved) => writeNoteFile(folder!, file) } : {}),
      });
      setDone(files.length);
      setResult(next);
      if (folder) {
        await writeNoteReport(folder, notesZipReport(next)).catch(() => {});
      } else if (!next.cancelled && !next.stopped && next.saved.length && !next.splitByWeek) {
        await zipResult(courseName, next);
      }
      if (!next.saved.length && !next.stopped && !next.cancelled) {
        setErr("None of the PDFs were available.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "These notes did not come through.");
    } finally {
      setBusy(false);
      setCurrent("");
    }
  }

  function openSheet() {
    if (busy || !files.length) return;
    setResult(null);
    setErr("");
    setOpen(true);
  }

  async function downloadPartial() {
    if (!result?.saved.length) return;
    if (result.splitByWeek) await zipWeeks(courseName, result);
    else await zipResult(courseName, result);
  }

  async function downloadPerWeek() {
    if (!result?.saved.length) return;
    await zipWeeks(courseName, result);
  }

  useEffect(() => {
    const onTake = () => openSheet();
    window.addEventListener(TAKE_SHEETS_EVENT, onTake);
    return () => window.removeEventListener(TAKE_SHEETS_EVENT, onTake);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, busy]);

  if (files.length === 0 && !err && !open) return null;

  const label = downloadNotesCopy(counts.known, counts.guessed);
  const stoppedWait = result?.stopped?.retryAfter ? `Try again later (${result.stopped.retryAfter}s)` : "Try again later";
  const guessedMissing = result?.missing.filter((row) => row.guessed) ?? [];
  const knownMissing = result?.missing.filter((row) => !row.guessed) ?? [];
  const pct = files.length ? Math.round((done / files.length) * 100) : 0;
  const zipKept = result && mode === "zip" && result.saved.some((row) => row.bytes.length > 0);

  const footer = busy ? (
    <Button variant="secondary" onClick={cancel}>Cancel</Button>
  ) : result ? (
    <>
      {zipKept && result.splitByWeek ? (
        <Button icon={Package} onClick={() => void downloadPerWeek()}>Zip per week</Button>
      ) : null}
      {zipKept && (result.stopped || result.cancelled) && !result.splitByWeek ? (
        <Button icon={Package} onClick={() => void downloadPartial()}>Zip what we have</Button>
      ) : null}
      <Button variant="secondary" onClick={close}>{result.stopped ? stoppedWait : "Done"}</Button>
    </>
  ) : (
    <>
      {folderOk ? (
        <Button icon={FolderDown} onClick={() => { setMode("folder"); void run("folder"); }}>
          Save into a folder
        </Button>
      ) : null}
      <Button variant={folderOk ? "secondary" : "primary"} icon={Package} onClick={() => { setMode("zip"); void run("zip"); }}>
        {folderOk ? "One zip instead" : "Start the zip"}
      </Button>
      <Button variant="ghost" onClick={close}>Close</Button>
    </>
  );

  return (
    <>
      {label ? (
        <Button variant="secondary" size="sm" icon={FileDown} aria-label={label} disabled={busy} loading={busy} onClick={openSheet}>
          {label}
        </Button>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : close())}
        title="Download all notes"
        kicker={courseName}
        description={COPY.notesArePdfs}
        dismissable={!busy}
        footer={footer}
      >
        <p className="sr-only" aria-live="polite">
          {busy ? `${done} of ${files.length}` : result ? notesZipSummary(result.saved.length, result.missing.length) : err}
        </p>

        {!busy && !result ? (
          <div className="space-y-2 text-sm text-fg-muted">
            <p>
              {files.length} {files.length === 1 ? "file" : "files"}
              {counts.guessed ? ` · ${counts.guessed} ${counts.guessed === 1 ? "is" : "are"} a best guess and may not exist` : ""}.
            </p>
            {folderOk ? (
              <p>
                <strong className="font-medium text-fg">Save into a folder</strong> writes each PDF the moment it arrives — open the first ones while the rest come in. Nothing waits for a giant zip.
              </p>
            ) : (
              <p>Everything is fetched first, then handed over as one zip. Keep this tab open.</p>
            )}
            {files.length > NOTES_WARN_COUNT ? (
              <p>Pacing stays under 60 requests a minute, so {files.length} files take about {Math.ceil(files.length / 50)} minutes.</p>
            ) : null}
          </div>
        ) : null}

        {busy ? (
          <div className="space-y-2">
            <Progress value={pct} label={`${done} of ${files.length} fetched`} />
            <p className="flex items-center justify-between gap-3 text-sm text-fg-muted">
              <span className="truncate">{current || "Starting"}</span>
              <span className="shrink-0 font-mono text-xs tabular-nums">{done} / {files.length}</span>
            </p>
          </div>
        ) : null}

        {result && !busy ? (
          <div className="space-y-2 text-sm">
            <p className="text-fg">{notesZipSummary(result.saved.length, result.missing.length)}</p>
            {mode === "folder" && result.saved.length ? (
              <p className="text-fg-muted">They are in the folder you chose, grouped by week, with a _report.txt beside them.</p>
            ) : null}
            {zipKept && result.splitByWeek ? <p className="text-fg-muted">Over 400 MB together — one zip per week is safer.</p> : null}
            {result.stopped ? (
              <p className="text-fg-muted">
                Stopped at HTTP {result.stopped.status}
                {result.stopped.retryAfter ? ` · Retry-After ${result.stopped.retryAfter}` : ""}.
              </p>
            ) : null}
            {result.cancelled ? <p className="text-fg-muted">Cancelled.</p> : null}
            {knownMissing.length ? (
              <ul className="max-h-32 overflow-y-auto text-xs text-fg-muted">
                {knownMissing.map((row) => (
                  <li key={row.path}>
                    {row.path} · {row.reason}
                  </li>
                ))}
              </ul>
            ) : null}
            {guessedMissing.length ? (
              <div>
                <p className="text-xs text-fg-subtle">Not on the CDN</p>
                <ul className="mt-1 max-h-32 overflow-y-auto text-xs text-fg-subtle">
                  {guessedMissing.map((row) => (
                    <li key={row.path}>{row.path}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {err ? <p className="mt-3 text-sm text-danger">{err}</p> : null}
      </Dialog>
    </>
  );
}

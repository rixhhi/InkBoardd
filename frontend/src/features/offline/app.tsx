import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { catalogMetaClass, catalogTitleClass } from "@/components/catalog-row";
import { Button, EmptyState, Input } from "@/components/ui";
import { ConfirmDialog } from "@/components/planner/confirm-dialog";
import { friendlyBundleError } from "@inkboard/shared/bundle/errors";
import { lectureStatusLabel, type SavedChapter, type SavedChapterLecture } from "@inkboard/shared/bundle/chapter";
import {
  continueCourseLecture,
  continueLecture,
  courseProgress,
  flattenCourseLectures,
} from "@inkboard/shared/bundle/chapter-nav";
import type { SavedCourse } from "@inkboard/shared/bundle/course";
import {
  filesFromListAsync,
  makeGetFile,
  openFromDirectory,
  openZipFile,
  pickDirectory,
  prefixedGetFile,
  type BundleSource,
  type Opened,
} from "./bundle/open.ts";
import { loadBundleFromGetFile, type LoadedBundle } from "./bundle/load-bundle.ts";
import {
  ensurePermission,
  getChapterHandle,
  getCourseHandle,
  getHandle,
  listChapters,
  listCourses,
  listLectures,
  putChapter,
  putChapterHandle,
  putCourse,
  putCourseHandle,
  putHandle,
  putLecture,
  readPos,
  removeChapter,
  removeCourse,
  removeLecture,
  type ChapterRow,
  type CourseRow,
  type LectureRow,
} from "./library/db.ts";
import { OfflinePlayer } from "./player/offline-player.tsx";

type Screen =
  | { kind: "library" }
  | { kind: "error"; title: string; body: string }
  | { kind: "grant"; row: { title: string } }
  | { kind: "checksum"; bundle: LoadedBundle; source: BundleSource; chapter?: SavedChapter }
  | { kind: "course"; source: BundleSource; saved: SavedCourse }
  | { kind: "chapter"; source: BundleSource; saved: SavedChapter }
  | {
      kind: "play";
      bundle: LoadedBundle;
      title: string;
      lectures: SavedChapterLecture[];
      index: number;
      source: BundleSource;
    };

function lectureDir(row: SavedChapterLecture) {
  return row.dir.replace(/\/$/, "");
}

export function OfflineApp({ embedded: _embedded = false }: { embedded?: boolean }) {
  const [screen, setScreen] = useState<Screen>({ kind: "library" });
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [lectures, setLectures] = useState<LectureRow[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [drop, setDrop] = useState<null | { kind: "course" | "chapter" | "lecture"; id: string; title: string }>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const live = useRef<LoadedBundle | null>(null);

  async function refresh() {
    const [a, b, c] = await Promise.all([listCourses(), listChapters(), listLectures()]);
    setCourses(a);
    setChapters(b);
    setLectures(c);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot mount load; refresh closes over setters only
  useEffect(() => {
    void refresh();
  }, []);

  function remember(opened: Opened) {
    if (opened.type === "course") {
      const saved = opened.saved;
      void putCourse({
        courseId: saved.courseId,
        title: saved.courseTitle,
        lectureCount: saved.chapters.reduce((n, ch) => n + ch.lectures.length, 0),
        savedCount: saved.chapters.reduce((n, ch) => n + ch.lectures.filter((l) => l.status === "done").length, 0),
        savedAt: saved.createdAt,
        lastOpened: Date.now(),
      });
      if (opened.source.kind === "dir") void putCourseHandle(saved.courseId, opened.source.handle);
      setScreen({ kind: "course", source: opened.source, saved });
      return;
    }
    if (opened.type === "chapter") {
      const saved = opened.saved;
      void putChapter({
        chapterId: saved.chapterId,
        title: saved.chapterTitle,
        courseTitle: saved.courseTitle,
        lectureCount: saved.lectures.length,
        savedCount: saved.lectures.filter((l) => l.status === "done").length,
        savedAt: saved.createdAt,
        lastOpened: Date.now(),
      });
      if (opened.source.kind === "dir") void putChapterHandle(saved.chapterId, opened.source.handle);
      setScreen({ kind: "chapter", source: opened.source, saved });
      return;
    }
    void loadLecture(opened.source, false);
  }

  function openOpened(opened: Opened) {
    remember(opened);
    void refresh();
  }

  async function openFolder() {
    setBusy(true);
    try {
      openOpened(await pickDirectory());
    } catch (err) {
      const f = friendlyBundleError(err);
      setScreen({ kind: "error", title: f.title, body: f.body });
    } finally {
      setBusy(false);
    }
  }

  async function loadLecture(source: BundleSource, skipChecksum: boolean, chapter?: SavedChapter, dir = "") {
    setBusy(true);
    try {
      const getFile = dir ? prefixedGetFile(source, dir) : makeGetFile(source);
      const bundle = await loadBundleFromGetFile(getFile, { skipChecksum });
      if (bundle.mismatches.length && !skipChecksum) {
        setScreen({ kind: "checksum", bundle, source, chapter });
        return;
      }
      live.current?.revoke();
      live.current = bundle;
      const row = bundle.manifest;
      void putLecture({
        lessonId: row.lessonId,
        title: row.title,
        durationMs: row.durationMs,
        savedAt: new Date().toISOString(),
        lastOpened: Date.now(),
        kind: row.kind,
      });
      if (source.kind === "dir" && !dir) void putHandle(row.lessonId, source.handle);
      const list = chapter?.lectures.filter((l) => l.status === "done") ?? [];
      const index = Math.max(0, list.findIndex((l) => l.lessonId === row.lessonId));
      setScreen({
        kind: "play",
        bundle,
        title: row.title,
        lectures: list,
        index,
        source,
      });
      void refresh();
    } catch (err) {
      const f = friendlyBundleError(err);
      setScreen({ kind: "error", title: f.title, body: f.body });
    } finally {
      setBusy(false);
    }
  }

  async function playChapterLecture(
    saved: SavedChapter | SavedCourse,
    source: BundleSource,
    lecture: SavedChapterLecture,
  ) {
    const lectures = "lectures" in saved ? saved.lectures : flattenCourseLectures(saved);
    const chapter = "lectures" in saved ? (saved as SavedChapter) : undefined;
    await loadLecture(source, false, chapter ? { ...chapter, lectures } : { ...({} as SavedChapter), lectures }, lectureDir(lecture));
  }

  async function reopen(row: LectureRow) {
    const handle = await getHandle(row.lessonId);
    if (!handle) {
      setScreen({ kind: "grant", row: { title: row.title } });
      return;
    }
    if (!(await ensurePermission(handle))) {
      setScreen({ kind: "grant", row: { title: row.title } });
      return;
    }
    try {
      const opened = await openFromDirectory(handle);
      if (opened.type !== "lecture") {
        openOpened(opened);
        return;
      }
      await loadLecture(opened.source, false);
    } catch (err) {
      const f = friendlyBundleError(err);
      setScreen({ kind: "error", title: f.title, body: f.body });
    }
  }

  async function reopenChapter(row: ChapterRow) {
    const handle = await getChapterHandle(row.chapterId);
    if (!handle || !(await ensurePermission(handle))) {
      setScreen({ kind: "grant", row: { title: row.title } });
      return;
    }
    try {
      openOpened(await openFromDirectory(handle));
    } catch (err) {
      const f = friendlyBundleError(err);
      setScreen({ kind: "error", title: f.title, body: f.body });
    }
  }

  async function reopenCourse(row: CourseRow) {
    const handle = await getCourseHandle(row.courseId);
    if (!handle || !(await ensurePermission(handle))) {
      setScreen({ kind: "grant", row: { title: row.title } });
      return;
    }
    try {
      openOpened(await openFromDirectory(handle));
    } catch (err) {
      const f = friendlyBundleError(err);
      setScreen({ kind: "error", title: f.title, body: f.body });
    }
  }

  const needle = q.trim().toLowerCase();
  const shownCourses = useMemo(
    () => courses.filter((row) => !needle || row.title.toLowerCase().includes(needle)),
    [courses, needle],
  );
  const shownChapters = useMemo(
    () => chapters.filter((row) => !needle || `${row.title} ${row.courseTitle}`.toLowerCase().includes(needle)),
    [chapters, needle],
  );
  const shown = useMemo(
    () => lectures.filter((row) => !needle || row.title.toLowerCase().includes(needle)),
    [lectures, needle],
  );

  if (screen.kind === "play") {
    const list = screen.lectures;
    const next = list[screen.index + 1];
    const prev = list[screen.index - 1];
    return (
      <OfflinePlayer
        timeline={screen.bundle.timeline}
        title={screen.title}
        sprites={screen.bundle.sprites}
        audioUrl={screen.bundle.audioUrl}
        notesUrl={screen.bundle.notesUrl}
        silence={screen.bundle.silence}
        hasNext={Boolean(next)}
        hasPrev={Boolean(prev)}
        onClose={() => {
          screen.bundle.revoke();
          live.current = null;
          setScreen({ kind: "library" });
        }}
        onNext={next ? () => void playChapterLecture({ lectures: list } as SavedChapter, screen.source, next) : undefined}
        onPrev={prev ? () => void playChapterLecture({ lectures: list } as SavedChapter, screen.source, prev) : undefined}
      />
    );
  }

  if (screen.kind === "course") {
    const prog = courseProgress(screen.saved);
    const cont = continueCourseLecture(screen.saved, readPos);
    const flat = flattenCourseLectures(screen.saved);
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
          <button type="button" className="h-11 text-sm text-fg-muted" onClick={() => setScreen({ kind: "library" })}>
            Saved classes
          </button>
          <p className="mt-4 text-xs text-fg-muted">Course</p>
          <h1 className="mt-1 font-serif text-3xl">{screen.saved.courseTitle}</h1>
          <p className="mt-2 text-sm text-fg-muted">{prog.saved} of {prog.total} saved</p>
          {cont ? (
            <Button className="mt-4" onClick={() => void playChapterLecture({ lectures: flat } as SavedChapter, screen.source, { ...cont.lecture, dir: `${cont.chapter.dir}/${cont.lecture.dir}` })}>
              Continue
            </Button>
          ) : null}
          <div className="mt-8 space-y-8">
            {screen.saved.chapters.map((ch) => (
              <section key={ch.chapterId}>
                <h2 className="text-sm text-fg-muted">{ch.chapterTitle}</h2>
                <ul className="mt-2 overflow-hidden rounded-xl border border-[var(--color-line)]">
                  {ch.lectures.map((row) => {
                    const t = readPos(row.lessonId);
                    const watched = row.durationMs > 0 && t >= row.durationMs / 1000 - 5;
                    const lecture = { ...row, dir: ch.dir ? `${ch.dir}/${row.dir}` : row.dir };
                    return (
                      <li key={row.lessonId} className="border-b border-[var(--color-line)] last:border-b-0">
                        <button
                          type="button"
                          className="flex min-h-11 w-full items-center px-3 py-3 text-left disabled:opacity-40"
                          disabled={row.status !== "done"}
                          onClick={() => void playChapterLecture({ lectures: flat } as SavedChapter, screen.source, lecture)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className={catalogTitleClass}>{row.order}. {row.title}</span>
                            <span className={catalogMetaClass}>
                              {Math.round(row.durationMs / 60000)} min · {lectureStatusLabel(row.status)}
                              {watched ? " · watched" : t > 1 ? " · resume" : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  if (screen.kind === "chapter") {
    const cont = continueLecture(screen.saved.lectures, readPos);
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
          <button type="button" className="h-11 text-sm text-fg-muted" onClick={() => setScreen({ kind: "library" })}>
            Saved classes
          </button>
          <p className="mt-4 text-xs text-fg-muted">{screen.saved.courseTitle}</p>
          <h1 className="mt-1 font-serif text-3xl">{screen.saved.chapterTitle}</h1>
          {cont ? (
            <Button className="mt-4" onClick={() => void playChapterLecture(screen.saved, screen.source, cont)}>
              Continue
            </Button>
          ) : null}
          <ul className="mt-6 overflow-hidden rounded-xl border border-[var(--color-line)]">
            {screen.saved.lectures.map((row) => {
              const t = readPos(row.lessonId);
              const watched = row.durationMs > 0 && t >= row.durationMs / 1000 - 5;
              return (
                <li key={row.lessonId} className="border-b border-[var(--color-line)] last:border-b-0">
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center px-3 py-3 text-left disabled:opacity-40"
                    disabled={row.status !== "done"}
                    onClick={() => void playChapterLecture(screen.saved, screen.source, row)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={catalogTitleClass}>{row.order}. {row.title}</span>
                      <span className={catalogMetaClass}>
                        {Math.round(row.durationMs / 60000)} min · {lectureStatusLabel(row.status)}
                        {watched ? " · watched" : t > 1 ? " · resume" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop is a pointer convenience; the file pickers below are the accessible path */}
      <div
        className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = [...e.dataTransfer.files].find((f) => f.name.endsWith(".zip"));
          if (file) void openZipFile(file).then(openOpened);
        }}
      >
        <header className="border-b border-[var(--color-line)] pb-6">
          <p className="text-xs text-fg-muted">On this device</p>
          <h1 className="mt-1 font-serif text-3xl">Saves</h1>
          <p className="mt-2 max-w-xl text-sm text-fg-muted">Open a folder or a zip of classes you saved. You can also drop a zip here.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void openFolder()} disabled={busy}>Open folder</Button>
            <Button quiet onClick={() => zipRef.current?.click()} disabled={busy}>Open zip</Button>
          </div>
        </header>
        <input
          ref={dirRef}
          type="file"
          className="hidden"
          // @ts-expect-error webkitdirectory is non-standard
          webkitdirectory=""
          multiple
          onChange={(e) => {
            const list = e.target.files;
            e.target.value = "";
            if (!list?.length) return;
            void filesFromListAsync(list).then(openOpened, (err) => {
              const f = friendlyBundleError(err);
              setScreen({ kind: "error", title: f.title, body: f.body });
            });
          }}
        />
        <input
          ref={zipRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            void openZipFile(file).then(openOpened, (err) => {
              const f = friendlyBundleError(err);
              setScreen({ kind: "error", title: f.title, body: f.body });
            });
          }}
        />
        {screen.kind === "error" ? (
          <div className="mt-6" role="alert">
            <EmptyState title={screen.title} body={screen.body} action={<Button onClick={() => setScreen({ kind: "library" })}>Back</Button>} />
          </div>
        ) : null}
        {screen.kind === "checksum" ? (
          <div className="mt-6" role="alert">
            <EmptyState
              title="This class does not match its checksum"
              body={screen.bundle.mismatches.join(" · ")}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    onClick={() => {
                      screen.bundle.revoke();
                      live.current = null;
                      void loadLecture(screen.source, true, screen.chapter);
                    }}
                  >
                    Continue anyway
                  </Button>
                  <Button
                    quiet
                    onClick={() => {
                      screen.bundle.revoke();
                      live.current = null;
                      setScreen({ kind: "library" });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              }
            />
          </div>
        ) : null}
        {screen.kind === "grant" ? (
          <div className="mt-6" role="status">
            <EmptyState
              title="Grant access to this folder"
              body={`The browser forgot permission for ${screen.row.title}. Open the folder again.`}
              action={<Button onClick={() => void openFolder()}>Open folder</Button>}
            />
          </div>
        ) : null}
        <label className="mt-6 block max-w-md text-sm text-fg-muted">
          Search
          <Input value={q} onChange={(e) => setQ(e.target.value)} className="mt-1" placeholder="Search saved classes" />
        </label>
        {shownCourses.length === 0 && shownChapters.length === 0 && shown.length === 0 ? (
          <div className="mt-8">
            <EmptyState title="No saved classes yet" body="Open a folder or a zip. You can also drop a zip on this page." />
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {shownCourses.length > 0 ? (
              <section>
                <h2 className="text-sm text-fg-muted">Courses</h2>
                <ul className="mt-2 overflow-hidden rounded-xl border border-[var(--color-line)]">
                  {shownCourses.map((row) => (
                    <li key={row.courseId} className="flex items-center gap-3 border-b border-[var(--color-line)] px-3 last:border-b-0">
                      <button type="button" className="min-h-11 min-w-0 flex-1 py-3 text-left" onClick={() => void reopenCourse(row)}>
                        <span className={catalogTitleClass}>{row.title}</span>
                        <span className={catalogMetaClass}>{row.savedCount} of {row.lectureCount} saved</span>
                      </button>
                      <button
                        type="button"
                        className="h-11 shrink-0 text-sm text-fg-muted"
                        onClick={() => setDrop({ kind: "course", id: row.courseId, title: row.title })}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {shownChapters.length > 0 ? (
              <section>
                <h2 className="text-sm text-fg-muted">Weeks</h2>
                <ul className="mt-2 overflow-hidden rounded-xl border border-[var(--color-line)]">
                  {shownChapters.map((row) => (
                    <li key={row.chapterId} className="flex items-center gap-3 border-b border-[var(--color-line)] px-3 last:border-b-0">
                      <button type="button" className="min-h-11 min-w-0 flex-1 py-3 text-left" onClick={() => void reopenChapter(row)}>
                        <span className={catalogTitleClass}>{row.title}</span>
                        <span className={catalogMetaClass}>{row.savedCount} of {row.lectureCount} · {row.courseTitle}</span>
                      </button>
                      <button
                        type="button"
                        className="h-11 shrink-0 text-sm text-fg-muted"
                        onClick={() => setDrop({ kind: "chapter", id: row.chapterId, title: row.title })}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {shown.length > 0 ? (
              <section>
                <h2 className="text-sm text-fg-muted">Classes</h2>
                <ul className="mt-2 overflow-hidden rounded-xl border border-[var(--color-line)]">
                  {shown.map((row) => (
                    <li key={row.lessonId} className="flex items-center gap-3 border-b border-[var(--color-line)] px-3 last:border-b-0">
                      <button type="button" className="min-h-11 min-w-0 flex-1 py-3 text-left" onClick={() => void reopen(row)}>
                        <span className={catalogTitleClass}>{row.title}</span>
                        <span className={catalogMetaClass}>{Math.round(row.durationMs / 60000)} min · {row.kind}</span>
                      </button>
                      <button
                        type="button"
                        className="h-11 shrink-0 text-sm text-fg-muted"
                        onClick={() => setDrop({ kind: "lecture", id: row.lessonId, title: row.title })}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
        <ConfirmDialog
          open={drop != null}
          title="Remove this save?"
          body={drop ? `“${drop.title}” leaves this device. The folder on disk is not deleted.` : "It leaves this device."}
          confirmLabel="Remove"
          onConfirm={() => {
            if (!drop) return;
            const job =
              drop.kind === "course"
                ? removeCourse(drop.id)
                : drop.kind === "chapter"
                  ? removeChapter(drop.id)
                  : removeLecture(drop.id);
            setDrop(null);
            void job.then(refresh);
          }}
          onClose={() => setDrop(null)}
        />
      </div>
    </AppShell>
  );
}

import { ChevronLeft, ChevronRight, Download, ExternalLink, Minus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { COPY } from "@inkboard/shared/copy";
import { IconButton } from "@/components/ui";

type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => {
    promise: Promise<void>;
    cancel?: () => void;
  };
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy?: () => Promise<void> };

/** The proxy serves `attachment` by default (so "Download" saves a file). Viewing in a frame needs `inline`. */
export function inlineNotesUrl(url: string): string {
  try {
    const u = new URL(url, typeof location !== "undefined" ? location.origin : "http://localhost");
    u.searchParams.set("view", "1");
    return u.pathname + u.search;
  } catch {
    return url.includes("?") ? `${url}&view=1` : `${url}?view=1`;
  }
}

const ZOOMS = [0.75, 1, 1.25, 1.5, 2];

/**
 * Reads the class notes (a PDF) beside the board.
 *
 * Renders every page onto its own canvas in a scrolling column (one page at a time
 * made people hunt for Prev/Next); pinch/zoom buttons rescale; the page counter
 * follows the scroll. If pdf.js cannot open the file the panel falls back to the
 * browser's own viewer in an iframe, with the proxy told to serve it inline.
 */
export function NotesReader({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [pages, setPages] = useState(0);
  const [current, setCurrent] = useState(1);
  const [zoomIdx, setZoomIdx] = useState(1);
  const [state, setState] = useState<"loading" | "pdf" | "frame">("loading");
  const viewUrl = inlineNotesUrl(url);

  // Open the document once per URL.
  useEffect(() => {
    let dead = false;
    let opened: PdfDoc | null = null;
    setState("loading");
    setDoc(null);
    setPages(0);
    setCurrent(1);
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        }
        const task = pdfjs.getDocument({ url: viewUrl, withCredentials: true });
        opened = (await task.promise) as unknown as PdfDoc;
        if (dead) {
          await opened.destroy?.();
          return;
        }
        setDoc(opened);
        setPages(opened.numPages);
        setState("pdf");
      } catch {
        if (!dead) setState("frame");
      }
    })();
    return () => {
      dead = true;
      void opened?.destroy?.();
    };
  }, [viewUrl]);

  // Track which page is mostly in view so the counter is honest.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || state !== "pdf") return;
    const onScroll = () => {
      const cells = stage.querySelectorAll<HTMLElement>("[data-page]");
      const mid = stage.scrollTop + stage.clientHeight / 2;
      let best = 1;
      for (const cell of cells) {
        if (cell.offsetTop <= mid) best = Number(cell.dataset.page) || best;
      }
      setCurrent(best);
    };
    stage.addEventListener("scroll", onScroll, { passive: true });
    return () => stage.removeEventListener("scroll", onScroll);
  }, [state, pages]);

  const goTo = (n: number) => {
    const target = Math.max(1, Math.min(pages, n));
    stageRef.current?.querySelector<HTMLElement>(`[data-page="${target}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    setCurrent(target);
  };

  return (
    <aside className="notes-reader" role="dialog" aria-label={title || COPY.notes}>
      <header className="notes-reader-bar">
        <p className="min-w-0 flex-1 truncate text-sm text-fg">{title || COPY.notes}</p>
        {state === "pdf" && pages > 0 ? (
          <div className="flex items-center gap-0.5">
            <IconButton label="Previous page" icon={ChevronLeft} size="sm" onClick={() => goTo(current - 1)} disabled={current <= 1} />
            <span className="min-w-[4ch] text-center text-xs text-fg-muted tabular-nums" aria-live="polite">
              {current}/{pages}
            </span>
            <IconButton label="Next page" icon={ChevronRight} size="sm" onClick={() => goTo(current + 1)} disabled={current >= pages} />
            <span aria-hidden="true" className="mx-1 h-4 w-px bg-line" />
            <IconButton label="Zoom out" icon={Minus} size="sm" onClick={() => setZoomIdx((i) => Math.max(0, i - 1))} disabled={zoomIdx === 0} />
            <IconButton label="Zoom in" icon={Plus} size="sm" onClick={() => setZoomIdx((i) => Math.min(ZOOMS.length - 1, i + 1))} disabled={zoomIdx === ZOOMS.length - 1} />
          </div>
        ) : null}
        <IconButton label={COPY.takeTheSheets} icon={Download} size="sm" onClick={() => window.open(url, "_blank", "noreferrer")} />
        <IconButton label="Open in a new tab" icon={ExternalLink} size="sm" onClick={() => window.open(viewUrl, "_blank", "noreferrer")} className="hidden sm:inline-flex" />
        <IconButton label={COPY.closeNotes} icon={X} size="sm" onClick={onClose} />
      </header>

      {state === "frame" ? (
        <iframe title={title || COPY.notes} src={viewUrl} className="notes-reader-frame" />
      ) : (
        <div ref={stageRef} className="notes-reader-stage">
          {state === "loading" ? (
            <div role="status" className="grid gap-3 p-3">
              <div className="aspect-[1/1.3] w-full animate-pulse rounded-sm bg-black/5" />
              <span className="sr-only">Loading notes</span>
            </div>
          ) : null}
          {doc && pages > 0
            ? Array.from({ length: pages }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the page number is the page's identity
                <NotesPage key={`${viewUrl}#${i + 1}`} doc={doc} n={i + 1} zoom={ZOOMS[zoomIdx] ?? 1} />
              ))
            : null}
        </div>
      )}
    </aside>
  );
}

/** One PDF page on its own canvas, rendered when it scrolls near the viewport and re-rendered on zoom. */
function NotesPage({ doc, n, zoom }: { doc: PdfDoc; n: number; zoom: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(n <= 2);

  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { root: el.closest(".notes-reader-stage"), rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !near) return;
    let dead = false;
    let task: ReturnType<PdfPage["render"]> | null = null;
    (async () => {
      try {
        const page = await doc.getPage(n);
        if (dead) return;
        const base = page.getViewport({ scale: 1 });
        const width = (canvas.parentElement?.clientWidth || 400) - 24;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const scale = (width / base.width) * zoom;
        const viewport = page.getViewport({ scale: scale * dpr });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        // pdf.js 6 wants the canvas itself; canvasContext alone throws "canvas is required".
        task = page.render({ canvas, canvasContext: ctx, viewport });
        await task.promise;
      } catch {
        /* a cancelled render on zoom change is expected */
      }
    })();
    return () => {
      dead = true;
      task?.cancel?.();
    };
  }, [doc, n, zoom, near]);

  return (
    <div data-page={n} className="notes-reader-page">
      <canvas ref={ref} aria-label={`Page ${n}`} />
    </div>
  );
}

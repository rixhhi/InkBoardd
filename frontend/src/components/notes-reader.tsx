import { useEffect, useRef, useState } from "react";
import { COPY } from "@inkboard/shared/copy";

type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (opts: { scale: number }) => { width: number; height: number };
    render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel?: () => void };
  }>;
  destroy?: () => Promise<void>;
};

export function NotesReader({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<"pdf" | "frame">("pdf");
  const [err, setErr] = useState("");

  useEffect(() => {
    let dead = false;
    let doc: PdfDoc | null = null;
    let renderTask: { cancel?: () => void } | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        }
        const loading = pdfjs.getDocument({ url, withCredentials: true });
        doc = (await loading.promise) as unknown as PdfDoc;
        if (dead) {
          await doc.destroy?.();
          return;
        }
        setPages(doc.numPages);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const pdfPage = await doc.getPage(page);
        const base = pdfPage.getViewport({ scale: 1 });
        const width = canvas.parentElement?.clientWidth || 420;
        const viewport = pdfPage.getViewport({ scale: Math.min(2, width / base.width) });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const task = pdfPage.render({ canvasContext: ctx, viewport });
        renderTask = task;
        await task.promise;
      } catch (error) {
        if (dead) return;
        setErr(error instanceof Error ? error.message : COPY.notesDidNotLoad);
        setMode("frame");
      }
    })();
    return () => {
      dead = true;
      renderTask?.cancel?.();
      void doc?.destroy?.();
    };
  }, [url, page]);

  return (
    <aside className="notes-reader" role="dialog" aria-label={title || COPY.notes}>
      <header className="notes-reader-bar">
        <p className="truncate text-sm">{title || COPY.notes}</p>
        <div className="flex items-center gap-2">
          {mode === "pdf" && pages > 1 ? (
            <>
              <button type="button" className="ink-underline text-sm" onClick={() => setPage((n) => Math.max(1, n - 1))} disabled={page <= 1}>
                Prev
              </button>
              <span className="text-xs tabular">
                {page}/{pages}
              </span>
              <button type="button" className="ink-underline text-sm" onClick={() => setPage((n) => Math.min(pages, n + 1))} disabled={page >= pages}>
                Next
              </button>
            </>
          ) : null}
          <a href={url} className="ink-underline text-sm" download>
            Download
          </a>
          <button type="button" className="ink-underline text-sm" onClick={onClose}>
            {COPY.closeNotes}
          </button>
        </div>
      </header>
      {mode === "pdf" ? (
        <div className="notes-reader-stage">
          <canvas ref={canvasRef} aria-label={title || COPY.notes} />
          {err ? <p className="text-xs text-fg-muted">{COPY.notesDidNotLoad}</p> : null}
        </div>
      ) : (
        <iframe title={title || COPY.notes} src={url} className="notes-reader-frame" />
      )}
    </aside>
  );
}

import { useEffect, useRef, useState, type RefObject } from "react";
import { slideAt, visibleImages, type Timeline } from "@inkboard/shared/dcn";
import { loadSlideImage } from "@inkboard/shared/slide-image";
import { canvasNeedsResize, fit16x9, heldSlideImage, keepLiveRaster, inkPaintMs, paintInk, paintSlide, shouldSwapLiveBitmap, slideFill } from "@/components/whiteboard-paint";

export function Whiteboard({
  timeline,
  videoRef,
  clockMs,
  preferClock = false,
  liveBackdrop,
}: {
  timeline: Timeline;
  videoRef: RefObject<HTMLVideoElement | null>;
  clockMs?: number;
  preferClock?: boolean;
  liveBackdrop?: string;
}) {
  const slideRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const urlRef = useRef<string | undefined>(undefined);
  const stickyImgRef = useRef<HTMLImageElement | null>(null);
  const objImgsRef = useRef(new Map<string, HTMLImageElement>());
  const tlRef = useRef(timeline);
  tlRef.current = timeline;
  const clockRef = useRef(clockMs);
  clockRef.current = clockMs;
  const backdropRef = useRef(liveBackdrop);
  backdropRef.current = liveBackdrop;
  const [slideNote, setSlideNote] = useState<string | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const slide = slideRef.current;
    const ink = inkRef.current;
    if (!wrap || !slide || !ink) return;
    let raf = 0;
    let lastPaint = -1;
    const onSeeked = () => {
      lastPaint = -1;
    };
    let bound: HTMLVideoElement | null = null;
    const bind = (el: HTMLVideoElement | null) => {
      if (bound === el) return;
      bound?.removeEventListener("seeked", onSeeked);
      bound = el;
      bound?.addEventListener("seeked", onSeeked);
    };

    const sizeToWrap = () => {
      const rect = wrap.getBoundingClientRect();
      const fit = fit16x9(rect.width, rect.height);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const bw = Math.max(320, fit.w);
      const bh = Math.max(180, fit.h);
      const pw = Math.floor(bw * dpr);
      const ph = Math.floor(bh * dpr);
      for (const canvas of [slide, ink]) {
        if (!canvasNeedsResize(canvas, pw, ph)) continue;
        canvas.width = pw;
        canvas.height = ph;
        canvas.style.width = `${bw}px`;
        canvas.style.height = `${bh}px`;
      }
    };

    let wantedUrl: string | undefined = urlRef.current;
    const syncSlide = (timeMs: number) => {
      const s = slideAt(tlRef.current, timeMs);
      const url = s.url || backdropRef.current;
      if (url === wantedUrl) return;
      wantedUrl = url;
      if (!url) {
        urlRef.current = undefined;
        imgRef.current = null;
        stickyImgRef.current = null;
        const canvas = slideRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = slideFill(s);
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
        }
        return;
      }
      const fetchUrl = url;
      loadSlideImage(fetchUrl)
        .then((img) => {
          if (wantedUrl !== url) return;
          if (!shouldSwapLiveBitmap({ prev: imgRef.current, next: img })) return;
          const same = urlRef.current === url && imgRef.current;
          urlRef.current = url;
          imgRef.current = img;
          stickyImgRef.current = img;
          setSlideNote(null);
          if (!same) lastPaint = -1;
        })
        .catch(() => {
          if (wantedUrl !== url) return;
          if (urlRef.current !== url) {
            imgRef.current = null;
            stickyImgRef.current = null;
          } else {
            imgRef.current = keepLiveRaster(imgRef.current, null);
            stickyImgRef.current = keepLiveRaster(stickyImgRef.current, imgRef.current);
          }
          urlRef.current = url;
          if (!stickyImgRef.current) {
            setSlideNote("Couldn't load this slide. Handwriting still plays.");
          }
        });
    };

    const tick = () => {
      const v = videoRef.current;
      bind(v);
      const mediaSec = v && Number.isFinite(v.currentTime) ? v.currentTime : Number.NaN;
      const next = inkPaintMs({
        mediaSec,
        seeking: Boolean(v?.seeking),
        frozenMs: null,
        lastPaintMs: lastPaint,
        fallbackMs: clockRef.current ?? 0,
        preferClock,
      });
      const timeMs = next.paintMs;
      syncSlide(timeMs);
      if (Math.abs(timeMs - lastPaint) > 8 || lastPaint < 0) {
        lastPaint = timeMs;
        const s = slideAt(tlRef.current, timeMs);
        const currentUrl = s.url || backdropRef.current;
        const img = heldSlideImage({
          currentUrl,
          loadedUrl: urlRef.current,
          loaded: imgRef.current,
          sticky: stickyImgRef.current,
        });
        paintSlide(slide, tlRef.current, timeMs, img);
        const objs = visibleImages(tlRef.current, timeMs, s.uid);
        for (const im of objs) {
          if (objImgsRef.current.has(im.url)) continue;
          const fetchUrl = im.url;
          objImgsRef.current.set(fetchUrl, new Image());
          loadSlideImage(fetchUrl)
            .then((got) => {
              objImgsRef.current.set(fetchUrl, got);
              lastPaint = -1;
            })
            .catch(() => {
              objImgsRef.current.delete(fetchUrl);
            });
        }
        // Full repaint. Eraser holes are recomputed for this time, not kept from the last frame.
        paintInk(ink, tlRef.current, timeMs, objImgsRef.current);
      }
      raf = requestAnimationFrame(tick);
    };

    sizeToWrap();
    const ro = new ResizeObserver(() => {
      sizeToWrap();
      lastPaint = -1;
    });
    ro.observe(wrap);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      bind(null);
    };
  }, [videoRef, timeline.id, preferClock]);

  return (
    <div ref={wrapRef} className="relative grid h-full w-full place-items-center overflow-hidden bg-transparent">
      <div className="relative" style={{ colorScheme: "light" }}>
        <canvas ref={slideRef} className="block bg-board" style={{ colorScheme: "light" }} />
        <canvas ref={inkRef} className="pointer-events-none absolute inset-0 block" style={{ colorScheme: "light" }} />
        {slideNote ? (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 z-10 px-3 text-center text-xs text-fg-muted">
            {slideNote}
          </p>
        ) : null}
      </div>
    </div>
  );
}

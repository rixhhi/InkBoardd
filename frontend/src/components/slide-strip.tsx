import { useEffect, useRef, useState } from "react";
import type { PackedSlide } from "@inkboard/shared/dcn";
import { loadSlideImage } from "@inkboard/shared/slide-image";

function SlideThumb({
  url,
  label,
  on,
  eager,
  pinned,
  onClick,
}: {
  url: string;
  label: number;
  on: boolean;
  eager: boolean;
  pinned?: boolean;
  onClick: () => void;
}) {
  const nodeRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(eager);
  const [src, setSrc] = useState<string | null>(null);
  const [fail, setFail] = useState(false);

  useEffect(() => {
    if (eager) {
      setVisible(true);
      return;
    }
    const node = nodeRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: "200px", threshold: 0.01 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [eager]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setFail(false);
    loadSlideImage(url)
      .then((img) => {
        if (cancelled) return;
        setSrc(img.src);
      })
      .catch(() => {
        if (!cancelled) setFail(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url, visible]);

  return (
    <button
      ref={nodeRef}
      type="button"
      data-slide-thumb={label}
      onClick={onClick}
      className={`film-cell${on ? " is-on" : ""}`}
      aria-label={`Jump to slide ${label}${pinned ? ", pinned" : ""}`}
      aria-current={on ? "true" : undefined}
    >
      <span className="sprocket sprocket-l" aria-hidden="true" />
      <span className="sprocket sprocket-r" aria-hidden="true" />
      {src ? (
        <img src={src} alt="" draggable={false} />
      ) : (
        <span className="film-blank" />
      )}
      {fail ? (
        <span className="absolute inset-0 grid place-items-center bg-paper text-xs text-paper-ink">
          Slide {label}
        </span>
      ) : null}
      {pinned ? <span className="pin-tick" aria-hidden="true" /> : null}
      <span className="film-no tabular">{label}</span>
    </button>
  );
}

export function SlideStrip({
  slides,
  currentUid,
  onJump,
  vertical = false,
  pins,
}: {
  slides: PackedSlide[];
  currentUid: string;
  onJump: (uid: string) => void;
  vertical?: boolean;
  pins?: Set<string>;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const thumbs = slides.filter((s) => s.url);

  useEffect(() => {
    const root = stripRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-slide="${CSS.escape(currentUid)}"]`);
    if (!(el instanceof HTMLElement)) return;
    const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    root.scrollTo({ top: Math.max(0, top - root.clientHeight / 2 + el.offsetHeight / 2), behavior: "smooth" });
  }, [currentUid]);

  if (!thumbs.length) return null;

  return (
    <div
      ref={stripRef}
      className={`film-rebate${vertical ? " is-vert" : ""}`}
      style={{ colorScheme: "light" }}
    >
      {thumbs.map((th, i) => (
        <div key={th.uid} data-slide={th.uid} className={vertical ? "shrink-0" : undefined}>
          <SlideThumb
            url={th.url!}
            label={i + 1}
            on={th.uid === currentUid}
            eager={th.uid === currentUid || i < 6}
            pinned={pins?.has(th.uid)}
            onClick={() => onJump(th.uid)}
          />
        </div>
      ))}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { COPY } from "@inkboard/shared/copy";
import { choosePlaybackSource } from "@/components/player/engine";

export function LiveVideo({
  src,
  onFatal,
}: {
  src: string;
  onFatal?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fatalRef = useRef(onFatal);
  fatalRef.current = onFatal;
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [err, setErr] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const video = ref.current;
    if (!video || !src) return;

    let hls: { destroy: () => void; startLoad: () => void; recoverMediaError: () => void } | null = null;
    let cancelled = false;
    let recovers = 0;

    const fail = () => {
      if (cancelled) return;
      setErr(true);
      fatalRef.current?.();
    };

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.muted = true;

    const source = choosePlaybackSource({
      hlsUrl: src,
      listen: false,
      canPlayNativeHls: video.canPlayType("application/vnd.apple.mpegurl") !== "",
      hlsJsSupported: true,
    });
    if (source?.kind === "native-hls") {
      video.src = src;
      void video.play().catch(() => setPlaying(false));
      video.addEventListener("error", fail);
      return () => {
        cancelled = true;
        video.removeEventListener("error", fail);
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
      };
    }

    void import("hls.js")
      .then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          fail();
          return;
        }
        const instance = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
        });
        hls = instance;
        instance.on(Hls.Events.ERROR, (_e, data) => {
          if (!data?.fatal) return;
          if (recovers < 2 && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            recovers += 1;
            instance.startLoad();
            return;
          }
          if (recovers < 2 && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            recovers += 1;
            instance.recoverMediaError();
            return;
          }
          fail();
        });
        instance.loadSource(src);
        instance.attachMedia(video);
        void video.play().catch(() => setPlaying(false));
      })
      .catch(fail);

    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies(retry): retry is the remount trigger
  }, [src, retry]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = muted;
    v.volume = volume;
  }, [muted, volume]);

  function toggleFs() {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  }

  if (err) {
    return (
      <div className="grid h-full place-items-center bg-bg p-6 text-center">
        <p className="font-serif text-base font-semibold">{COPY.doorDidNotOpen}</p>
        <button
          type="button"
          className="ink-underline mt-3 text-sm text-fg-muted"
          onClick={() => {
            setErr(false);
            setRetry((n) => n + 1);
          }}
        >
          {COPY.tryAgain}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full bg-bg"
      role="button"
      tabIndex={0}
      aria-label="Play or pause"
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        const v = ref.current;
        if (!v) return;
        if (v.paused) void v.play();
        else v.pause();
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, input")) return;
        const v = ref.current;
        if (!v) return;
        if (v.paused) void v.play();
        else v.pause();
      }}
    >
      <video ref={ref} className="h-full w-full bg-bg object-contain" controls={false} playsInline muted>
        <track kind="captions" srcLang="en" label="Captions" />
      </video>
      {playing ? null : (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-fg" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M8 6v12l11-6Z" />
          </svg>
        </span>
      )}
      <div className="live-rail">
        {muted ? (
          <button
            type="button"
            className="rail-btn"
            aria-label={COPY.soundOn}
            title={COPY.soundOn}
            onClick={() => setMuted(false)}
          >
            {COPY.soundOn}
          </button>
        ) : (
          <button
            type="button"
            className="rail-btn"
            aria-label={COPY.mute}
            title={COPY.mute}
            onClick={() => setMuted(true)}
          >
            {COPY.mute}
          </button>
        )}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          aria-label={COPY.volume}
          className="live-vol"
          onChange={(e) => {
            const next = Number(e.target.value);
            setVolume(next);
            setMuted(next === 0);
          }}
        />
        <button type="button" className="rail-btn" aria-label={COPY.fullscreen} title={COPY.fullscreen} onClick={toggleFs}>
          {COPY.fullscreen}
        </button>
      </div>
    </div>
  );
}

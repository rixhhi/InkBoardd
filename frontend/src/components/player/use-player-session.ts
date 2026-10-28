import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { choosePlaybackSource } from "@/components/player/engine";
import type { SilenceRange } from "@/lib/study";
import type { SpriteSheet } from "@/lib/sprite-sheet";

/** Late player state: clips, summaries, prepared media, and the HLS attach. */
export function usePlayerSession(
  lessonId: string,
  sprites: SpriteSheet | null | undefined,
  videoRef: RefObject<HTMLVideoElement | null>,
) {
  const [ended, setEnded] = useState(false);
  const [advanceLeft, setAdvanceLeft] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [seekingUi, setSeekingUi] = useState(false);
  const [canPlay, setCanPlay] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [keepOpen, setKeepOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [sheet, setSheet] = useState<SpriteSheet | null>(sprites ?? null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [listen, setListen] = useState(false);
  const [saver, setSaver] = useState(false);
  const [silence, setSilence] = useState<SilenceRange[]>([]);
  const [silenceOn, setSilenceOn] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [waveform, setWaveform] = useState<string | null>(null);
  const [chapterTrack, setChapterTrack] = useState("");
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [chapterQuery, setChapterQuery] = useState("");
  const [summary, setSummary] = useState<{ source: "board" | "model"; bullets: string[] } | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryNote, setSummaryNote] = useState("");
  const [clipIn, setClipIn] = useState<number | null>(null);
  const [clipOut, setClipOut] = useState<number | null>(null);
  const [clipBusy, setClipBusy] = useState(false);
  const [clipHref, setClipHref] = useState("");
  const [clipNote, setClipNote] = useState("");
  const silenceRef = useRef<SilenceRange[]>([]);
  const silenceOnRef = useRef(false);
  silenceRef.current = silence;
  silenceOnRef.current = silenceOn;
  const bufferTimer = useRef(0);
  const resumeAt = useRef<{ t: number; play: boolean } | null>(null);

  useEffect(() => {
    if (sprites) setSheet(sprites);
  }, [sprites]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !saver || !hlsUrl || (listen && audioUrl)) return;
    let dead = false;
    let player: { destroy: () => void } | null = null;
    const choice = choosePlaybackSource({
      hlsUrl,
      listen: false,
      canPlayNativeHls: video.canPlayType("application/vnd.apple.mpegurl") !== "",
      hlsJsSupported: true,
    });
    if (choice?.kind === "native-hls") {
      video.src = choice.url;
      return () => {
        dead = true;
        video.removeAttribute("src");
      };
    }
    if (choice?.kind !== "hls.js") return;
    void import("hls.js").then(({ default: Hls }) => {
      if (dead || !Hls.isSupported()) return;
      const instance = new Hls({ enableWorker: true, backBufferLength: 30 });
      player = instance;
      instance.loadSource(choice.url);
      instance.attachMedia(video);
    });
    return () => {
      dead = true;
      player?.destroy();
    };
  }, [saver, hlsUrl, listen, audioUrl, videoRef]);

  return {
    ended, setEnded, advanceLeft, setAdvanceLeft, buffering, setBuffering, seekingUi, setSeekingUi,
    canPlay, setCanPlay, moreOpen, setMoreOpen, keepOpen, setKeepOpen, notesOpen, setNotesOpen,
    sheet, setSheet, audioUrl, setAudioUrl, hlsUrl, setHlsUrl, listen, setListen, saver, setSaver,
    silence, setSilence, silenceOn, setSilenceOn, jobId, setJobId, waveform, setWaveform,
    chapterTrack, setChapterTrack, chaptersOpen, setChaptersOpen, chapterQuery, setChapterQuery,
    summary, setSummary, summaryBusy, setSummaryBusy, summaryNote, setSummaryNote,
    clipIn, setClipIn, clipOut, setClipOut, clipBusy, setClipBusy, clipHref, setClipHref, clipNote, setClipNote,
    silenceRef, silenceOnRef, bufferTimer, resumeAt,
  };
}

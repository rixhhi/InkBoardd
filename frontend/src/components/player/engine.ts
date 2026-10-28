/** Shared playback decisions for the class player, live player, and saved lectures. */

export type PlaybackSource =
  | { kind: "audio"; url: string }
  | { kind: "native-hls"; url: string }
  | { kind: "hls.js"; url: string }
  | { kind: "file"; url: string };

export function choosePlaybackSource(input: {
  hlsUrl?: string | null;
  fileUrl?: string | null;
  audioUrl?: string | null;
  listen: boolean;
  canPlayNativeHls: boolean;
  hlsJsSupported: boolean;
}): PlaybackSource | null {
  if (input.listen && input.audioUrl) return { kind: "audio", url: input.audioUrl };
  if (input.hlsUrl) {
    if (input.canPlayNativeHls) return { kind: "native-hls", url: input.hlsUrl };
    if (input.hlsJsSupported) return { kind: "hls.js", url: input.hlsUrl };
  }
  if (input.fileUrl) return { kind: "file", url: input.fileUrl };
  if (input.audioUrl) return { kind: "audio", url: input.audioUrl };
  return null;
}

/** Plain text for a media element error. Unknown codes stay generic. */
export function mediaErrorMessage(code: number | null | undefined): string {
  if (code === 1) return "Playback was stopped.";
  if (code === 2) return "The network dropped. Try again.";
  if (code === 3) return "This file could not be decoded.";
  if (code === 4) return "This browser cannot play this file.";
  return "Something went wrong";
}

type PitchVideo = {
  playbackRate: number;
  preservesPitch?: boolean;
  mozPreservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
};

/** Keep the teacher's voice at the same pitch when the speed changes. */
export function lockPitch(video: PitchVideo, rate: number) {
  video.preservesPitch = true;
  video.mozPreservesPitch = true;
  video.webkitPreservesPitch = true;
  video.playbackRate = rate;
}

/** A newly loaded lecture resets playbackRate to 1. Put the chosen speed back. */
export function shouldReapplyRate(wanted: number, actual: number) {
  return Number.isFinite(wanted) && wanted > 0 && Math.abs(actual - wanted) > 0.01;
}

/** Another tab started this lecture. This tab should pause. */
export function otherTabStarted(message: unknown, selfId: string): boolean {
  if (!message || typeof message !== "object") return false;
  const row = message as { type?: unknown; id?: unknown };
  return row.type === "inkboard-play" && typeof row.id === "string" && row.id !== "" && row.id !== selfId;
}

type PipVideo = {
  requestPictureInPicture?: () => Promise<unknown>;
};

type PipDocument = {
  pictureInPictureElement?: unknown;
  pictureInPictureEnabled?: boolean;
  exitPictureInPicture?: () => Promise<void>;
};

/** Whether this browser can float the lecture in a small window. */
export function canPictureInPicture(video: PipVideo, doc: PipDocument = {}) {
  return typeof video.requestPictureInPicture === "function" && doc.pictureInPictureEnabled !== false;
}

/** Enter or leave picture-in-picture. Returns true while the lecture is floating. */
export async function togglePictureInPicture(video: PipVideo, doc: PipDocument): Promise<boolean> {
  if (!canPictureInPicture(video, doc) || !video.requestPictureInPicture) return false;
  if (doc.pictureInPictureElement === video) {
    await doc.exitPictureInPicture?.();
    return false;
  }
  await video.requestPictureInPicture();
  return true;
}

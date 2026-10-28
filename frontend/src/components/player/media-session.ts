/** Lock-screen controls. The handlers are plain so a test can press them without a browser. */
export function sessionHandlers(video: { play: () => void; pause: () => void }) {
  return {
    play: () => video.play(),
    pause: () => video.pause(),
  };
}

export function bindMediaSession(
  video: HTMLVideoElement,
  meta: { title: string; artist?: string },
): () => void {
  const session = navigator.mediaSession;
  if (!session?.setActionHandler) return () => {};
  const actions = sessionHandlers(video);
  try {
    session.metadata = new MediaMetadata({ title: meta.title, artist: meta.artist });
    session.setActionHandler("play", actions.play);
    session.setActionHandler("pause", actions.pause);
  } catch {
    return () => {};
  }
  return () => {
    session.setActionHandler("play", null);
    session.setActionHandler("pause", null);
  };
}

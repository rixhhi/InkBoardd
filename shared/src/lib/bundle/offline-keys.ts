function isTypingTarget(target: { tagName?: string; isContentEditable?: boolean; type?: string } | null) {
  if (!target) return false;
  const tag = target.tagName;
  return (
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    Boolean(target.isContentEditable) ||
    (tag === "INPUT" && target.type !== "range")
  );
}

export type OfflineHotkey =
  | { type: "togglePlay"; preventDefault: true }
  | { type: "seekBy"; seconds: number }
  | { type: "speed"; dir: -1 | 1 }
  | { type: "toggleCam" }
  | { type: "fullscreen" }
  | { type: "toggleMute" }
  | { type: "next" }
  | { type: "prev" };

/** Offline player keys. Arrows are 5s; J/L are 10s. Does not change the streaming player. */
export function offlineHotkey(
  e: {
    key: string;
    code: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    defaultPrevented?: boolean;
  },
  target: { tagName?: string; isContentEditable?: boolean; type?: string } | null,
  opts: { hasNext?: boolean; hasPrev?: boolean } = {},
): OfflineHotkey | null {
  if (e.defaultPrevented) return null;
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (isTypingTarget(target)) return null;
  const key = e.key.toLowerCase();
  if (e.code === "Space" || key === "k") return { type: "togglePlay", preventDefault: true };
  if (key === "l") return { type: "seekBy", seconds: 10 };
  if (key === "j") return { type: "seekBy", seconds: -10 };
  if (e.code === "ArrowRight") return { type: "seekBy", seconds: 5 };
  if (e.code === "ArrowLeft") return { type: "seekBy", seconds: -5 };
  if (e.key === "[") return { type: "speed", dir: -1 };
  if (e.key === "]") return { type: "speed", dir: 1 };
  if (key === "c") return { type: "toggleCam" };
  if (key === "f") return { type: "fullscreen" };
  if (key === "m") return { type: "toggleMute" };
  if (key === "n") return opts.hasNext ? { type: "next" } : null;
  if (key === "p") return opts.hasPrev ? { type: "prev" } : null;
  return null;
}

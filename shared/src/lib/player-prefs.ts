export type PlayerPrefs = {
  speed: number;
  volume: number;
  muted: boolean;
  camOff: boolean;
  layout: "pip" | "side";
};

const KEY = "inkboard.player.v1";
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const DEFAULTS: PlayerPrefs = {
  speed: 1,
  volume: 1,
  muted: false,
  camOff: false,
  layout: "pip",
};

export function readPlayerPrefs(): PlayerPrefs {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<PlayerPrefs> | null;
    if (!raw || typeof raw !== "object") return { ...DEFAULTS };
    return {
      speed: SPEEDS.includes(raw.speed as number) ? (raw.speed as number) : 1,
      volume: typeof raw.volume === "number" ? Math.min(1, Math.max(0, raw.volume)) : 1,
      muted: Boolean(raw.muted),
      camOff: Boolean(raw.camOff),
      layout: raw.layout === "side" ? "side" : "pip",
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writePlayerPrefs(patch: Partial<PlayerPrefs>) {
  if (typeof window === "undefined") return;
  const next = { ...readPlayerPrefs(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
}

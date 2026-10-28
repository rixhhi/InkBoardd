export const PROFILE_KEY = "inkboard.planner.profile.v1";

export type StreakMode = "any" | "goal";
export type DailyGoalMode = "minutes" | "lectures";
export type FontScale = 100 | 112 | 125;

export type MilestoneGoal = {
  id: string;
  subject: string;
  by: string;
};

export type PlannerProfile = {
  name: string;
  streakMode: StreakMode;
  weeklyMinutes: number;
  dailyGoalMode: DailyGoalMode;
  fontScale: FontScale;
  reduceMotion: boolean;
  highContrast: boolean;
  weekStartsOn: 0 | 1;
  hour12: boolean;
  milestones: MilestoneGoal[];
};

export const DEFAULT_PROFILE: PlannerProfile = {
  name: "",
  streakMode: "any",
  weeklyMinutes: 450,
  dailyGoalMode: "minutes",
  fontScale: 100,
  reduceMotion: false,
  highContrast: false,
  weekStartsOn: 1,
  hour12: true,
  milestones: [],
};

function canStore() {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function clampScale(n: unknown): FontScale {
  if (n === 112 || n === 125) return n;
  return 100;
}

export function readProfile(): PlannerProfile {
  if (!canStore()) return { ...DEFAULT_PROFILE, milestones: [] };
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE, milestones: [] };
    const parsed = JSON.parse(raw) as Partial<PlannerProfile>;
    const milestones = Array.isArray(parsed.milestones)
      ? parsed.milestones.filter((m) => m && typeof m.subject === "string" && typeof m.by === "string")
      : [];
    return {
      name: typeof parsed.name === "string" ? parsed.name : "",
      streakMode: parsed.streakMode === "goal" ? "goal" : "any",
      weeklyMinutes: Number(parsed.weeklyMinutes) > 0 ? Number(parsed.weeklyMinutes) : 450,
      dailyGoalMode: parsed.dailyGoalMode === "lectures" ? "lectures" : "minutes",
      fontScale: clampScale(parsed.fontScale),
      reduceMotion: Boolean(parsed.reduceMotion),
      highContrast: Boolean(parsed.highContrast),
      weekStartsOn: parsed.weekStartsOn === 0 ? 0 : 1,
      hour12: parsed.hour12 !== false,
      milestones,
    };
  } catch {
    return { ...DEFAULT_PROFILE, milestones: [] };
  }
}

export function writeProfile(over: Partial<PlannerProfile>): PlannerProfile {
  const next = { ...readProfile(), ...over };
  if (over.milestones) next.milestones = over.milestones;
  if (canStore()) {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    } catch {
      /* quota */
    }
  }
  return next;
}

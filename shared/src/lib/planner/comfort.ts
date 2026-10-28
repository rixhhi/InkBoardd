import { DEFAULT_PROFILE, readProfile, type PlannerProfile } from "./profile.ts";

export function applyComfort(profile: PlannerProfile = readProfile()) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.font = String(profile.fontScale);
  root.dataset.motion = profile.reduceMotion ? "reduce" : "ok";
  root.dataset.contrast = profile.highContrast ? "high" : "ok";
  root.dataset.weekstart = String(profile.weekStartsOn);
  root.dataset.hour12 = profile.hour12 ? "1" : "0";
  root.style.fontSize = `${profile.fontScale}%`;
}

export const COMFORT_BOOTSTRAP = `(function(){try{var r=JSON.parse(localStorage.getItem("inkboard.planner.profile.v1")||"{}");var s=Number(r.fontScale)||100;document.documentElement.style.fontSize=s+"%";if(r.reduceMotion)document.documentElement.setAttribute("data-motion","reduce");if(r.highContrast)document.documentElement.setAttribute("data-contrast","high");}catch(e){}})();`;

export function comfortDefaults(): Pick<PlannerProfile, "fontScale" | "reduceMotion" | "highContrast" | "weekStartsOn" | "hour12" | "dailyGoalMode"> {
  return {
    fontScale: DEFAULT_PROFILE.fontScale,
    reduceMotion: DEFAULT_PROFILE.reduceMotion,
    highContrast: DEFAULT_PROFILE.highContrast,
    weekStartsOn: DEFAULT_PROFILE.weekStartsOn,
    hour12: DEFAULT_PROFILE.hour12,
    dailyGoalMode: DEFAULT_PROFILE.dailyGoalMode,
  };
}

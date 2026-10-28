export type ThemeMode = "system" | "dark" | "light";

export const THEME_KEY = "inkboard.theme";

const MODES: ThemeMode[] = ["system", "dark", "light"];

export function isThemeMode(v: unknown): v is ThemeMode {
  return typeof v === "string" && MODES.includes(v as ThemeMode);
}

export function readThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return isThemeMode(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

export function writeThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* quota */
  }
  applyTheme(mode);
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  if (mode === "system") return "dark";
  if (mode === "dark") return "light";
  return "system";
}

export function resolvedTheme(mode: ThemeMode, systemDark = true): "dark" | "light" {
  if (mode === "dark" || mode === "light") return mode;
  return systemDark ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode = readThemeMode()) {
  if (typeof document === "undefined") return;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const next = resolvedTheme(mode, systemDark);
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
}

export const THEME_BOOTSTRAP = `(function(){try{var m=localStorage.getItem("${THEME_KEY}")||"system";var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var r=m==="light"?"light":m==="dark"?"dark":d?"dark":"light";document.documentElement.setAttribute("data-theme",r);document.documentElement.style.colorScheme=r;}catch(e){}})();`;

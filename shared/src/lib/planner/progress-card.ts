import type { StudyPlan } from "./types.ts";
import { liveTasks } from "./types.ts";
import { readThemeMode, resolvedTheme, type ThemeMode } from "../theme.ts";

export type ProgressCardStats = {
  name: string;
  exam: string;
  streak: number;
  hours: number;
  lecturesDone: number;
  lecturesTotal: number;
};

export type ProgressCardPalette = {
  bg: string;
  fg: string;
  muted: string;
  faint: string;
  surface: string;
  primary: string;
};

export type ShareProgressResult =
  | { ok: false; via: null }
  | { ok: true; via: "share" | "download" | "cancel" };

export function progressCardPalette(theme: "dark" | "light"): ProgressCardPalette {
  if (theme === "light") {
    return {
      bg: "#f3f0e8",
      fg: "#1a1c1a",
      muted: "#4a524c",
      faint: "#5c6460",
      surface: "#fffdf8",
      primary: "#2f6b52",
    };
  }
  return {
    bg: "#0c0e0d",
    fg: "#e6e1d6",
    muted: "#9aa39a",
    faint: "#808a82",
    surface: "#141816",
    primary: "#8fbfa8",
  };
}

export function progressCardStats(plan: StudyPlan | null, streak: number, minutesTotal: number): ProgressCardStats {
  const lessons = plan ? liveTasks(plan.tasks).filter((t) => t.type === "lesson") : [];
  return {
    name: plan?.name || "Inkboard",
    exam: plan?.examName || "Study plan",
    streak,
    hours: Math.round((minutesTotal / 60) * 10) / 10,
    lecturesDone: lessons.filter((t) => t.status === "done").length,
    lecturesTotal: lessons.length,
  };
}

export function resolveProgressTheme(mode?: ThemeMode, systemDark = true): "dark" | "light" {
  return resolvedTheme(mode ?? (typeof localStorage === "undefined" ? "system" : readThemeMode()), systemDark);
}

/** Theme currently painted on the page — matches the PNG to light/dark. */
export function liveProgressTheme(): "dark" | "light" {
  if (typeof document !== "undefined") {
    const fromDom = document.documentElement.dataset.theme;
    if (fromDom === "light" || fromDom === "dark") return fromDom;
  }
  const systemDark = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : true;
  return resolveProgressTheme(undefined, systemDark);
}

export function progressCardFilename(name: string): string {
  return `${name.replace(/[^\w]+/g, "-") || "inkboard"}-progress.png`;
}

/** Draw a 720×400 PNG progress card. Returns a data URL. */
export function drawProgressCard(stats: ProgressCardStats, theme: "dark" | "light" = "dark"): string {
  const pal = progressCardPalette(theme);
  const w = 720;
  const h = 400;
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = pal.primary;
  ctx.fillRect(0, 0, 8, h);
  ctx.fillStyle = pal.faint;
  ctx.font = "500 16px IBM Plex Sans, sans-serif";
  ctx.fillText("INKBOARD", 36, 48);
  ctx.fillStyle = pal.fg;
  ctx.font = "600 32px Source Serif 4, Georgia, serif";
  ctx.fillText(stats.name.slice(0, 36), 36, 96);
  ctx.fillStyle = pal.muted;
  ctx.font = "400 16px IBM Plex Sans, sans-serif";
  ctx.fillText(stats.exam.slice(0, 48), 36, 124);

  const tiles: { label: string; value: string }[] = [
    { label: "Streak", value: `${stats.streak}d` },
    { label: "Hours", value: String(stats.hours) },
    { label: "Lectures", value: `${stats.lecturesDone}/${stats.lecturesTotal || 0}` },
  ];
  tiles.forEach((tile, i) => {
    const x = 36 + i * 220;
    ctx.fillStyle = pal.surface;
    roundRect(ctx, x, 180, 200, 120, 16);
    ctx.fill();
    ctx.fillStyle = pal.faint;
    ctx.font = "500 12px IBM Plex Sans, sans-serif";
    ctx.fillText(tile.label.toUpperCase(), x + 20, 212);
    ctx.fillStyle = pal.primary;
    ctx.font = "600 36px IBM Plex Sans, sans-serif";
    ctx.fillText(tile.value, x + 20, 262);
  });
  ctx.fillStyle = pal.faint;
  ctx.font = "400 12px IBM Plex Sans, sans-serif";
  ctx.fillText("Keep the streak. Device-local calendar.", 36, 360);
  return canvas.toDataURL("image/png");
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function dataUrlToBlob(url: string): Blob | null {
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  const meta = url.slice(0, comma);
  const data = url.slice(comma + 1);
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? "image/png";
  try {
    const bin = atob(data);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  } catch {
    return null;
  }
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

/** Render + download (or native share). Theme follows the live page unless overridden. */
export async function shareProgressCard(stats: ProgressCardStats, theme?: "dark" | "light"): Promise<ShareProgressResult> {
  const resolved = theme ?? liveProgressTheme();
  const url = drawProgressCard(stats, resolved);
  if (!url) return { ok: false, via: null };
  const filename = progressCardFilename(stats.name);
  const blob = dataUrlToBlob(url);
  const file = blob ? new File([blob], filename, { type: "image/png" }) : null;
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (file && nav && typeof nav.share === "function" && (!nav.canShare || nav.canShare({ files: [file] }))) {
    try {
      await nav.share({ files: [file], title: stats.name, text: `${stats.exam} · ${stats.streak}d streak` });
      return { ok: true, via: "share" };
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return { ok: true, via: "cancel" };
    }
  }
  triggerDownload(url, filename);
  return { ok: true, via: "download" };
}

export function downloadProgressCard(stats: ProgressCardStats, theme?: "dark" | "light") {
  const resolved = theme ?? liveProgressTheme();
  const url = drawProgressCard(stats, resolved);
  if (!url) return false;
  triggerDownload(url, progressCardFilename(stats.name));
  return true;
}
